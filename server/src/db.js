import pg from 'pg';
import { config } from './config.js';

// Return BIGINT ids and COUNT(*) as JS numbers (safe for our ranges).
pg.types.setTypeParser(20, (v) => Number(v));

export function createPool(connectionString = config.databaseUrl) {
  return new pg.Pool({ connectionString, max: 10 });
}

/** Run `fn(client)` inside BEGIN/COMMIT, rolling back on error. */
export async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
