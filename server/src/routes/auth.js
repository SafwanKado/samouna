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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Optional email: blank -> null, otherwise must look like an address. */
function parseEmail(input) {
  const email = String(input ?? '').trim().toLowerCase();
  if (!email) return null;
  if (email.length > 254 || !EMAIL_RE.test(email)) throw badRequest('invalid_email');
  return email;
}

/**
 * Customer app has separate Login and Register screens.
 * login    -> the number must already have an account
 * register -> the number must not have one yet
 * (no intent keeps the older "log in or create" behaviour)
 */
async function checkIntent(db, e164, intent) {
  if (intent !== 'login' && intent !== 'register') return;
  const exists = (await db.query('SELECT 1 FROM users WHERE phone_number = $1', [e164])).rowCount > 0;
  if (intent === 'login' && !exists) throw new HttpError(404, 'no_account', 'No account for this number');
  if (intent === 'register' && exists) throw new HttpError(409, 'account_exists', 'Number already registered');
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
    if (app === 'customer') await checkIntent(pool, toE164(phone), req.body.intent);

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

    // All input checks run before the code is consumed, so the user can fix and retry.
    const email = parseEmail(req.body.email);
    await checkIntent(pool, e164, req.body.intent);
    const existing = (await pool.query('SELECT * FROM users WHERE phone_number = $1', [e164])).rows[0];
    if (!existing && fullName.length < 2) throw badRequest('name_required');
    await verifyOtp(pool, phone, req.body.code);

    const { rows } = await pool.query(
      `INSERT INTO users (full_name, phone_number, preferred_language, email)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (phone_number) DO UPDATE
         SET full_name = CASE WHEN length($1) >= 2 THEN $1 ELSE users.full_name END,
             email = COALESCE($4, users.email)
       RETURNING *`,
      [fullName, e164, lang, email],
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
    // email: undefined = keep, "" = remove, otherwise validate
    const emailGiven = req.body.email !== undefined;
    const email = emailGiven ? parseEmail(req.body.email) : null;
    const { rows } = await pool.query(
      `UPDATE users SET full_name = COALESCE($2, full_name), preferred_language = COALESCE($3, preferred_language),
              email = CASE WHEN $4 THEN $5 ELSE email END
        WHERE user_id = $1 RETURNING *`,
      [req.user.id, fullName, lang, emailGiven, email],
    );
    res.json({ user: serializeUser(rows[0]) });
  }));

  return r;
}
