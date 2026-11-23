import { Router } from 'express';
import { CITIES } from '@samouna/shared/orders';
import { ah, notFound } from '../errors.js';
import { serializeProduct, serializeStore } from '../serializers.js';

// Public storefront: no login needed to browse.
export function storeRoutes(pool) {
  const r = Router();

  r.get('/', ah(async (req, res) => {
    const city = CITIES.includes(req.query.city) ? req.query.city : null;
    const { rows } = await pool.query(
      `SELECT * FROM stores WHERE ($1::text IS NULL OR city = $1)
        ORDER BY is_active DESC, store_name`,
      [city],
    );
    res.json({ stores: rows.map(serializeStore) });
  }));

  r.get('/:id', ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw notFound();
    const store = (await pool.query('SELECT * FROM stores WHERE store_id = $1', [id])).rows[0];
    if (!store) throw notFound();
    const { rows } = await pool.query(
      'SELECT * FROM products WHERE store_id = $1 ORDER BY sort_order, product_id',
      [id],
    );
    res.json({ store: serializeStore(store), products: rows.map(serializeProduct) });
  }));

  return r;
}
