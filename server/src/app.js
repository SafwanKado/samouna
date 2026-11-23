import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { HttpError } from './errors.js';
import { authRoutes } from './routes/auth.js';
import { bakeryRoutes } from './routes/bakery.js';
import { orderRoutes } from './routes/orders.js';
import { storeRoutes } from './routes/stores.js';

export function createApp(pool, { otpOptions, corsOrigins = config.corsOrigins, log = console } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(cors({ origin: corsOrigins, maxAge: 86400 }));
  app.use(express.json({ limit: '32kb' }));

  app.get('/api/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  });

  app.use('/api/auth', authRoutes(pool, { otpOptions }));
  app.use('/api/stores', storeRoutes(pool));
  app.use('/api/orders', orderRoutes(pool));
  app.use('/api/bakery', bakeryRoutes(pool));

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'not_found', 'Unknown endpoint')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') err = new HttpError(400, 'validation', 'Invalid JSON');
    if (!(err instanceof HttpError)) {
      log.error?.(err);
      err = new HttpError(500, 'generic', 'Internal error');
    }
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  });

  return app;
}
