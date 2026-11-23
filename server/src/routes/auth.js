import { Router } from 'express';
import { normalizeIraqiMobile, toE164 } from '@samouna/shared/phone';
import { signToken, requireAuth } from '../auth.js';
import { ah, badRequest, HttpError } from '../errors.js';
import { requestOtp, verifyOtp } from '../otp.js';
import { serializeUser, serializeStore } from '../serializers.js';

const LANGS = ['ku', 'ar', 'en'];
const APPS = ['customer', 'bakery'];

/** Coarse per-IP limit so one client can't burn the WhatsApp balance across many numbers. */
function ipLimiter({ max, windowMs }) {
  const hits = new Map();
  return (req, _res, next) => {
    const now = Date.now();
    const entry = hits.get(req.ip);
    if (!entry || entry.reset < now) {
      hits.set(req.ip, { count: 1, reset: now + windowMs });
      if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
      return next();
    }
    if (++entry.count > max) {
      return next(new HttpError(429, 'otp_rate_limited', 'Too many requests', {
        minutes: Math.ceil((entry.reset - now) / 60_000),
      }));
    }
    next();
  };
}

function parsePhone(input) {
  const meta = normalizeIraqiMobile(input);
  if (!meta) throw badRequest('invalid_phone');
  return meta;
}

async function findBakeryOwner(db, e164) {
  const { rows } = await db.query(
    `SELECT u.*, s.store_id FROM users u JOIN stores s ON s.owner_id = u.user_id
      WHERE u.phone_number = $1 AND u.role = 'bakery_owner'`,
    [e164],
  );
  return rows[0] || null;
}

export function authRoutes(pool, { otpOptions } = {}) {
  const r = Router();

  r.post('/otp/request', ipLimiter({ max: 20, windowMs: 3600_000 }), ah(async (req, res) => {
    const phone = parsePhone(req.body.phone);
    const app = APPS.includes(req.body.app) ? req.body.app : 'customer';
    const lang = LANGS.includes(req.body.lang) ? req.body.lang : 'ku';

    // Don't spend WhatsApp credit on numbers that can't log into the bakery app.
    if (app === 'bakery' && !(await findBakeryOwner(pool, toE164(phone)))) {
      throw new HttpError(403, 'not_bakery', 'Not a registered bakery number');
    }

    const result = await requestOtp(pool, phone, lang, otpOptions);
    res.json({ sent: true, phone: toE164(phone), ...result });
  }));

  r.post('/otp/verify', ah(async (req, res) => {
    const phone = parsePhone(req.body.phone);
    const app = APPS.includes(req.body.app) ? req.body.app : 'customer';
    const lang = LANGS.includes(req.body.lang) ? req.body.lang : 'ku';
    const fullName = String(req.body.fullName || '').trim().slice(0, 100);
    const e164 = toE164(phone);

    if (app === 'bakery') {
      const owner = await findBakeryOwner(pool, e164);
      if (!owner) throw new HttpError(403, 'not_bakery', 'Not a registered bakery number');
      await verifyOtp(pool, phone, req.body.code);
      const { rows } = await pool.query('SELECT * FROM stores WHERE store_id = $1', [owner.store_id]);
      return res.json({
        token: signToken({ userId: owner.user_id, role: owner.role, storeId: owner.store_id, app }),
        user: serializeUser(owner),
        store: serializeStore(rows[0]),
      });
    }

    const existing = (await pool.query('SELECT * FROM users WHERE phone_number = $1', [e164])).rows[0];
    // Check before consuming the code so the user can add their name and retry.
    if (!existing && fullName.length < 2) throw badRequest('name_required');
    await verifyOtp(pool, phone, req.body.code);

    const { rows } = await pool.query(
      `INSERT INTO users (full_name, phone_number, preferred_language)
       VALUES ($1, $2, $3)
       ON CONFLICT (phone_number) DO UPDATE
         SET full_name = CASE WHEN length($1) >= 2 THEN $1 ELSE users.full_name END
       RETURNING *`,
      [fullName, e164, lang],
    );
    const user = rows[0];
    res.json({ token: signToken({ userId: user.user_id, role: user.role, app }), user: serializeUser(user) });
  }));

  r.get('/me', requireAuth(), ah(async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM users WHERE user_id = $1', [req.user.id]);
    if (!rows[0]) throw new HttpError(401, 'unauthorized');
    res.json({ user: serializeUser(rows[0]) });
  }));

  r.patch('/me', requireAuth(), ah(async (req, res) => {
    const fullName = req.body.fullName === undefined ? null : String(req.body.fullName).trim().slice(0, 100);
    const lang = LANGS.includes(req.body.preferredLanguage) ? req.body.preferredLanguage : null;
    if (fullName !== null && fullName.length < 2) throw badRequest('name_required');
    const { rows } = await pool.query(
      `UPDATE users SET full_name = COALESCE($2, full_name), preferred_language = COALESCE($3, preferred_language)
        WHERE user_id = $1 RETURNING *`,
      [req.user.id, fullName, lang],
    );
    res.json({ user: serializeUser(rows[0]) });
  }));

  return r;
}
