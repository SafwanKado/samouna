import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createPool } from './db.js';

export async function migrate(pool) {
  const sql = await readFile(fileURLToPath(new URL('./schema.sql', import.meta.url)), 'utf8');
  await pool.query(sql);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = createPool();
  await migrate(pool);
  await pool.end();
  console.log('Database schema is up to date.');
}
