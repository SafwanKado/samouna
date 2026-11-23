import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { HttpError } from './errors.js';

// `aud` separates the two PWAs: a customer token can never call bakery routes.
export function signToken({ userId, role, storeId = null, app }) {
  return jwt.sign({ role, storeId }, config.jwtSecret, {
    subject: String(userId),
    audience: app,
    expiresIn: app === 'bakery' ? '30d' : '90d',
  });
}

export function verifyToken(token, app) {
  const p = jwt.verify(token, config.jwtSecret, app ? { audience: app } : undefined);
  return { id: Number(p.sub), role: p.role, storeId: p.storeId ?? null, app: p.aud };
}

export function requireAuth(app) {
  return (req, _res, next) => {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return next(new HttpError(401, 'unauthorized', 'Login required'));
    try {
      req.user = verifyToken(token, app);
    } catch {
      return next(new HttpError(401, 'unauthorized', 'Invalid or expired session'));
    }
    if (app === 'bakery' && (req.user.role !== 'bakery_owner' || !req.user.storeId)) {
      return next(new HttpError(403, 'not_bakery', 'Bakery account required'));
    }
    next();
  };
}
