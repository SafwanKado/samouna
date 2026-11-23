import { Router } from 'express';
import { NEXT_STATUS, STATUS_TIMESTAMP } from '@samouna/shared/orders';
import { requireAuth } from '../auth.js';
import { ah, badRequest, conflict, notFound } from '../errors.js';
import { publish } from '../events.js';
import { ORDER_COLUMNS, loadOrder, serializeProduct, serializeStore, withItems } from '../serializers.js';

const TZ = 'Asia/Baghdad';

// Every query below is scoped by req.user.storeId, which comes from the
// signed token, never from the request body or URL.
export function bakeryRoutes(pool) {
  const r = Router();
  r.use(requireAuth('bakery'));

  r.get('/store', ah(async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM stores WHERE store_id = $1', [req.user.storeId]);
    res.json({ store: serializeStore(rows[0]) });
  }));

  r.patch('/store', ah(async (req, res) => {
    if (typeof req.body.isActive !== 'boolean') throw badRequest('validation', 'isActive must be boolean');
    const { rows } = await pool.query(
      'UPDATE stores SET is_active = $2 WHERE store_id = $1 RETURNING *',
      [req.user.storeId, req.body.isActive],
    );
    const store = serializeStore(rows[0]);
    publish('public', { type: 'store.updated', store });
    res.json({ store });
  }));

  r.get('/products', ah(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT * FROM products WHERE store_id = $1 ORDER BY sort_order, product_id',
      [req.user.storeId],
    );
    res.json({ products: rows.map(serializeProduct) });
  }));

  r.patch('/products/:id', ah(async (req, res) => {
    if (typeof req.body.isAvailable !== 'boolean') throw badRequest('validation', 'isAvailable must be boolean');
    const { rows } = await pool.query(
      'UPDATE products SET is_available = $3 WHERE product_id = $1 AND store_id = $2 RETURNING *',
      [Number(req.params.id) || 0, req.user.storeId, req.body.isAvailable],
    );
    if (!rows[0]) throw notFound();
    const product = serializeProduct(rows[0]);
    publish('public', { type: 'product.updated', product });
    res.json({ product });
  }));

  // Active pipeline plus recently cancelled tickets (so staff see the red alert).
  r.get('/orders', ah(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ${ORDER_COLUMNS} FROM orders o JOIN stores s USING (store_id)
        WHERE o.store_id = $1
          AND (o.status IN ('pending', 'in_oven', 'ready', 'out_for_delivery')
               OR (o.status IN ('cancelled', 'completed') AND o.updated_at > now() - interval '2 hours'))
        ORDER BY o.created_at ASC`,
      [req.user.storeId],
    );
    res.json({ orders: await withItems(pool, rows), serverTime: new Date() });
  }));

  // Single-tap advance. The client sends the status it saw, so a double tap
  // (or two devices tapping at once) advances exactly one step.
  r.post('/orders/:id/advance', ah(async (req, res) => {
    const from = req.body.from;
    const to = NEXT_STATUS[from];
    if (!to) throw badRequest('validation', 'invalid from status');
    const id = Number(req.params.id) || 0;
    const { rowCount } = await pool.query(
      `UPDATE orders SET status = $4, ${STATUS_TIMESTAMP[to]} = now(), updated_at = now()
        WHERE order_id = $1 AND store_id = $2 AND status = $3`,
      [id, req.user.storeId, from, to],
    );
    const order = await loadOrder(pool, id);
    if (!order || order.storeId !== req.user.storeId) throw notFound();
    if (!rowCount) {
      if (order.status === 'cancelled') throw conflict('cancel_window_closed', 'Order was cancelled');
      throw conflict('invalid_transition', `Order is ${order.status}`);
    }
    publish(`store:${order.storeId}`, { type: 'order.updated', order });
    publish(`customer:${order.customerId}`, { type: 'order.updated', order });
    res.json({ order });
  }));

  r.post('/orders/:id/reject', ah(async (req, res) => {
    const id = Number(req.params.id) || 0;
    const { rowCount } = await pool.query(
      `UPDATE orders SET status = 'cancelled', cancelled_by = 'bakery', cancelled_at = now(), updated_at = now(),
              cancellation_reason = $3
        WHERE order_id = $1 AND store_id = $2 AND status = 'pending'`,
      [id, req.user.storeId, String(req.body.reason || '').slice(0, 200) || null],
    );
    const order = await loadOrder(pool, id);
    if (!order || order.storeId !== req.user.storeId) throw notFound();
    if (!rowCount) throw conflict('invalid_transition', `Order is ${order.status}`);
    publish(`store:${order.storeId}`, { type: 'order.updated', order });
    publish(`customer:${order.customerId}`, { type: 'order.updated', order });
    res.json({ order });
  }));

  // Daily cash counter + 7-day view for weekly settlement.
  r.get('/summary', ah(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ((t.created_at AT TIME ZONE '${TZ}')::date)::text AS day,
              count(*) AS orders, coalesce(sum(t.amount), 0) AS cash
         FROM transactions t
        WHERE t.store_id = $1
          AND t.created_at >= ((now() AT TIME ZONE '${TZ}')::date - 6) AT TIME ZONE '${TZ}'
        GROUP BY 1 ORDER BY 1 DESC`,
      [req.user.storeId],
    );
    const today = (await pool.query(`SELECT ((now() AT TIME ZONE '${TZ}')::date)::text AS d`)).rows[0].d;
    const t = rows.find((r) => r.day === today);
    res.json({
      today: { date: today, orders: t ? t.orders : 0, cash: t ? Number(t.cash) : 0 },
      last7Days: rows.map((r) => ({ date: r.day, orders: r.orders, cash: Number(r.cash) })),
      weekTotal: rows.reduce((s, r) => s + Number(r.cash), 0),
    });
  }));

  return r;
}
