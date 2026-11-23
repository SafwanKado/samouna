import http from 'node:http';
import { createApp } from './app.js';
import { assertProductionConfig, config } from './config.js';
import { createPool } from './db.js';
import { migrate } from './migrate.js';
import { attachRealtime } from './realtime.js';

assertProductionConfig();

const pool = createPool();
await migrate(pool);

const server = http.createServer(createApp(pool));
const realtime = attachRealtime(server);

server.listen(config.port, () => {
  console.log(`Samouna API listening on :${config.port}`);
  if (config.otpDevMode) console.log('OTP dev mode: codes are printed here, not sent to WhatsApp.');
});

function shutdown() {
  realtime.close();
  server.close(() => pool.end().then(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
