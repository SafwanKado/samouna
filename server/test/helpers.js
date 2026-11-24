import http from 'node:http';
import WebSocket from 'ws';
import { createApp } from '../src/app.js';
import { createPool } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { attachRealtime } from '../src/realtime.js';
import { onboard } from '../scripts/onboard.js';

const TEST_DB = process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/samouna_test';
const quiet = { info() {}, error() {} };

export async function startTestServer() {
  const pool = createPool(TEST_DB);
  await pool.query('DROP TABLE IF EXISTS transactions, order_items, orders, products, stores, otp_codes, users CASCADE');
  await migrate(pool);

  const server = http.createServer(createApp(pool, { otpOptions: { log: quiet }, log: quiet }));
  const realtime = attachRealtime(server);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function api(method, path, body, token) {
    const res = await fetch(`${base}/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  }

  async function login(phone, app = 'customer', fullName = 'Test Customer') {
    const req = await api('POST', '/auth/otp/request', { phone, app });
    if (req.status !== 200) throw new Error(`otp request failed: ${JSON.stringify(req.body)}`);
    const ver = await api('POST', '/auth/otp/verify', { phone, app, code: req.body.devCode, fullName });
    if (ver.status !== 200) throw new Error(`otp verify failed: ${JSON.stringify(ver.body)}`);
    return ver.body;
  }

  /** Open a socket, authenticate, and collect events. */
  async function socket(token) {
    const ws = new WebSocket(`${base.replace('http', 'ws')}/ws`);
    const events = [];
    const waiters = [];
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      events.push(msg);
      for (const w of [...waiters]) if (w.pred(msg)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(msg); }
    });
    const next = (pred, ms = 2000) => {
      const hit = events.find(pred);
      if (hit) { events.splice(events.indexOf(hit), 1); return Promise.resolve(hit); }
      return new Promise((resolve, reject) => {
        const w = { pred, resolve: (m) => { clearTimeout(t); events.splice(events.indexOf(m), 1); resolve(m); } };
        const t = setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); reject(new Error('timed out waiting for ws event')); }, ms);
        waiters.push(w);
      });
    };
    await new Promise((r) => ws.on('open', r));
    ws.send(JSON.stringify({ type: 'auth', token }));
    const ready = await next((m) => m.type === 'ready');
    return { ws, next, events, channels: ready.channels, close: () => ws.close() };
  }

  async function seedBakery(overrides = {}) {
    const [r] = await onboard(pool, [{
      ownerName: 'Owner', ownerPhone: '0750 111 0001', storeName: 'Test Bakery', address: 'Malta',
      city: 'sharya', deliveryFee: 1000, isActive: true,
      products: [
        { ku: 'سەموون', ar: 'صمون', en: 'Samoun', price: 250 },
        { ku: 'کولێرە', ar: 'كليچة', en: 'Klecha', price: 1500 },
      ],
      ...overrides,
    }]);
    const { rows } = await pool.query('SELECT product_id FROM products WHERE store_id = $1 ORDER BY sort_order', [r.storeId]);
    return { storeId: r.storeId, productIds: rows.map((x) => x.product_id), ownerPhone: r.ownerPhone };
  }

  async function stop() {
    realtime.close();
    await new Promise((r) => server.close(r));
    await pool.end();
  }

  return { pool, base, api, login, socket, seedBakery, stop };
}
