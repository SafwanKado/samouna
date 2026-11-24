// Onboard partner bakeries from a JSON file:
//   npm -w server run onboard -- path/to/bakeries.json
// Safe to re-run: owners are matched by phone, products by English name.
import { readFile } from 'node:fs/promises';
import { normalizeIraqiMobile, toE164 } from '@samouna/shared/phone';
import { createPool, withTransaction } from '../src/db.js';
import { migrate } from '../src/migrate.js';

export async function onboard(pool, bakeries) {
  const results = [];
  for (const b of bakeries) {
    const meta = normalizeIraqiMobile(b.ownerPhone);
    if (!meta) throw new Error(`Invalid phone for ${b.storeName}: ${b.ownerPhone}`);
    const phone = toE164(meta);

    const storeId = await withTransaction(pool, async (db) => {
      const { rows: [owner] } = await db.query(
        `INSERT INTO users (full_name, phone_number, role) VALUES ($1, $2, 'bakery_owner')
         ON CONFLICT (phone_number) DO UPDATE SET role = 'bakery_owner', full_name = EXCLUDED.full_name
         RETURNING user_id`,
        [b.ownerName, phone],
      );
      const { rows: [store] } = await db.query(
        `INSERT INTO stores (owner_id, store_name, address, city, delivery_fee_iqd, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (owner_id) DO UPDATE
           SET store_name = EXCLUDED.store_name, address = EXCLUDED.address,
               city = EXCLUDED.city, delivery_fee_iqd = EXCLUDED.delivery_fee_iqd
         RETURNING store_id`,
        [owner.user_id, b.storeName, b.address, b.city, b.deliveryFee ?? 0, b.isActive ?? false],
      );
      for (const [i, p] of (b.products || []).entries()) {
        const { rowCount } = await db.query(
          `UPDATE products SET name_ku = $3, name_ar = $4, price = $5, sort_order = $6, image_url = $7
            WHERE store_id = $1 AND name_en = $2`,
          [store.store_id, p.en, p.ku, p.ar, p.price, i, p.imageUrl ?? null],
        );
        if (!rowCount) {
          await db.query(
            `INSERT INTO products (store_id, name_ku, name_ar, name_en, price, sort_order, image_url)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [store.store_id, p.ku, p.ar, p.en, p.price, i, p.imageUrl ?? null],
          );
        }
      }
      return store.store_id;
    });
    results.push({ storeId, storeName: b.storeName, ownerPhone: phone });
  }
  return results;
}

if (process.argv[1]?.endsWith('onboard.js')) {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: npm -w server run onboard -- <bakeries.json>');
    process.exit(1);
  }
  const pool = createPool();
  await migrate(pool);
  const results = await onboard(pool, JSON.parse(await readFile(file, 'utf8')));
  console.table(results);
  await pool.end();
}
