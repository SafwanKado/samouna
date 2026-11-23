import crypto from 'node:crypto';
import { config } from './config.js';
import { withTransaction } from './db.js';
import { HttpError, badRequest } from './errors.js';
import { sendOtpMessage } from './whatsapp.js';

function hashCode(phone, code) {
  return crypto.createHmac('sha256', config.jwtSecret).update(`${phone}:${code}`).digest('hex');
}

function safeEqualHex(a, b) {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * Issue and send a code. `phone` is Meta format (9647XXXXXXXXX).
 * Enforces max 3 requests per number per rolling hour.
 * Options let tests inject a sender.
 */
export async function requestOtp(pool, phone, lang, { send = sendOtpMessage, log = console } = {}) {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

  await withTransaction(pool, async (db) => {
    // Serialize requests for the same number so the hourly count can't be raced.
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [phone]);
    const { rows } = await db.query(
      `SELECT count(*) AS n, min(created_at) AS oldest
         FROM otp_codes
        WHERE phone_number = $1 AND created_at > now() - interval '1 hour'`,
      [phone],
    );
    if (rows[0].n >= config.otp.maxPerHour) {
      const retryMs = new Date(rows[0].oldest).getTime() + 3600_000 - Date.now();
      throw new HttpError(429, 'otp_rate_limited', 'Too many code requests', {
        minutes: Math.max(1, Math.ceil(retryMs / 60_000)),
      });
    }
    // Only the newest code is valid.
    await db.query(
      'UPDATE otp_codes SET consumed_at = now() WHERE phone_number = $1 AND consumed_at IS NULL',
      [phone],
    );
    await db.query(
      `INSERT INTO otp_codes (phone_number, code_hash, expires_at)
       VALUES ($1, $2, now() + make_interval(secs => $3))`,
      [phone, hashCode(phone, code), config.otp.ttlSeconds],
    );
  });

  if (config.otpDevMode) {
    log.info?.(`[otp:dev] code for +${phone} is ${code}`);
    return { expiresIn: config.otp.ttlSeconds, devCode: code };
  }

  try {
    await send(phone, code, lang);
  } catch (err) {
    // The row is kept, so failed sends still count toward the hourly limit.
    log.error?.('[otp] WhatsApp send failed', err.message);
    throw new HttpError(502, 'otp_send_failed', 'Could not send WhatsApp message');
  }
  return { expiresIn: config.otp.ttlSeconds };
}

/** Verify and consume a code. Throws on failure. */
export async function verifyOtp(pool, phone, code) {
  if (!/^\d{6}$/.test(String(code || ''))) throw badRequest('otp_invalid');

  const outcome = await withTransaction(pool, async (db) => {
    const { rows } = await db.query(
      `SELECT otp_id, code_hash, attempts, expires_at < now() AS expired
         FROM otp_codes
        WHERE phone_number = $1 AND consumed_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE`,
      [phone],
    );
    const row = rows[0];
    if (!row || row.expired) return 'otp_expired';
    if (row.attempts >= config.otp.maxAttempts) return 'otp_locked';

    if (!safeEqualHex(row.code_hash, hashCode(phone, String(code)))) {
      // Committed even though the request fails, so brute force is capped.
      await db.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE otp_id = $1', [row.otp_id]);
      return row.attempts + 1 >= config.otp.maxAttempts ? 'otp_locked' : 'otp_invalid';
    }
    await db.query('UPDATE otp_codes SET consumed_at = now() WHERE otp_id = $1', [row.otp_id]);
    return 'ok';
  });

  if (outcome !== 'ok') throw badRequest(outcome);
}
