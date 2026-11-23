// Seed the development database with the sample pilot bakeries.
import { readFile } from 'node:fs/promises';
import { createPool } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { onboard } from './onboard.js';

const pool = createPool();
await migrate(pool);
const data = JSON.parse(await readFile(new URL('./sample-bakeries.json', import.meta.url), 'utf8'));
console.table(await onboard(pool, data));
await pool.end();
