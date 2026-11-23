import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { withTransaction } from '../db.js';
import { ah, badRequest, conflict, notFound } from '../errors.js';
import { publish } from '../events.js';
import { ORDER_COLUMNS, loadOrder, withItems } from '../serializers.js';

const str = (v, max) => String(v ?? '').trim().slice(0, max);

function parseOrderBody(body) {
  const storeId = Number(body.storeId);
  if (!Number.isInteger(storeId)) throw badRequest('validation', 'storeId is required');

  const deliveryAddress = str(body.deliveryAddress, 300);
  if (deliveryAddress.length < 5) throw badRequest('validation', 'deliveryAddress is too short');

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length < 1 || items.length > 30) throw badRequest('validation', 'items must have 1-30 entries');
  const merged = new Map();
  for (const it of items) {
    const productId = Number(it?.productId);
    const quantity = Number(it?.quantity);
    if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw badRequest('validation', 'invalid item');
    }
    merged.set(productId, Math.min(99, (merged.get(productId) || 0) + quantity));
  }

  return {
    storeId,
    deliveryAddress,
    fullName: str(body.fullName, 100),
    notes: str(body.notes, 300) || null,
    clientRequestId: str(body.clientRequestId, 64) || null,
    items: [...merged].map(([productId, quantity]) => ({ productId, quantity })),
  };
}

export function orderRoutes(pool) {
  const r = Router();
  r.use(requireAuth('customer'));

  r.post('/', ah(async (req, res) => {
    const input = parseOrderBody(req.body);
    const customerId = req.user.id;

    // Idempotency: a retried submit on a flaky connection returns the same order.
    if (input.clientRequestId) {
      const { rows } = await pool.query(
        'SELECT order_id FROM orders WHERE customer_id = $1 AND client_request_id = $2',
        [customerId, input.clientRequestId],
      );
      if (rows[0]) return res.status(200).json({ order: await loadOrder(pool, rows[0].order_id) });
    }

    const orderId = await withTransaction(pool, async (db) => {
      const store = (await db.query('SELECT * FROM stores WHERE store_id = $1 FOR SHARE', [input.storeId])).rows[0];
      if (!store) throw notFound('Store not found');
      if (!store.is_active) throw conflict('store_closed', 'Store is closed');

      // Prices always come from the database, never from the client.
      const { rows: products } = await db.query(
        'SELECT product_id, price, is_available FROM products WHERE store_id = $1 AND product_id = ANY($2) FOR SHARE',
        [store.store_id, input.items.map((i) => i.productId)],
      );
      const byId = new Map(products.map((p) => [p.product_id, p]));
      const unavailable = input.items.filter((i) => !byId.get(i.productId)?.is_available).map((i) => i.productId);
      if (unavailable.length) {
        const err = conflict('product_unavailable', 'Some items are sold out');
        err.details = { productIds: unavailable };
        throw err;
      }

      const user = (await db.query('SELECT * FROM users WHERE user_id = $1', [customerId])).rows[0];
      if (!user) throw notFound('User not found');
      const customerName = input.fullName.length >= 2 ? input.fullName : user.full_name;
      if (customerName !== user.full_name) {
        await db.query('UPDATE users SET full_name = $2 WHERE user_id = $1', [customerId, customerName]);
      }

      const subtotal = input.items.reduce((sum, i) => sum + byId.get(i.productId).price * i.quantity, 0);
      const fee = store.delivery_fee_iqd;

      const { rows } = await db.query(
        `INSERT INTO orders (customer_id, store_id, client_request_id, customer_name, customer_phone,
                             delivery_address, delivery_city, notes, subtotal_amount, delivery_fee, total_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (customer_id, client_request_id) WHERE client_request_id IS NOT NULL DO NOTHING
         RETURNING order_id`,
        [customerId, store.store_id, input.clientRequestId, customerName, user.phone_number,
          input.deliveryAddress, store.city, input.notes, subtotal, fee, subtotal + fee],
      );
      if (!rows[0]) return null; // lost an idempotency race; the other request created it
      const id = rows[0].order_id;

      await db.query(
        `INSERT INTO order_items (order_id, product_id, quantity, price)
         SELECT $1, x.product_id, x.quantity, p.price
           FROM jsonb_to_recordset($2::jsonb) AS x(product_id bigint, quantity int)
           JOIN products p USING (product_id)`,
        [id, JSON.stringify(input.items.map((i) => ({ product_id: i.productId, quantity: i.quantity })))],
      );
      return id;
    });

    if (orderId === null) {
      const { rows } = await pool.query(
        'SELECT order_id FROM orders WHERE customer_id = $1 AND client_request_id = $2',
        [customerId, input.clientRequestId],
      );
      return res.json({ order: await loadOrder(pool, rows[0].order_id) });
    }

    const order = await loadOrder(pool, orderId);
    publish(`store:${order.storeId}`, { type: 'order.created', order });
    publish(`customer:${customerId}`, { type: 'order.updated', order });
    res.status(201).json({ order });
  }));

  r.get('/', ah(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ${ORDER_COLUMNS} FROM orders o JOIN stores s USING (store_id)
        WHERE o.customer_id = $1 ORDER BY o.created_at DESC LIMIT 50`,
      [req.user.id],
    );
    res.json({ orders: await withItems(pool, rows), serverTime: new Date() });
  }));

  r.get('/:id', ah(async (req, res) => {
    const order = await loadOrder(pool, Number(req.params.id) || 0);
    if (!order || order.customerId !== req.user.id) throw notFound();
    res.json({ order, serverTime: new Date() });
  }));

  // The 5-minute rule is enforced atomically in SQL, so a cancel can never
  // win against a bakery "Accept" that already committed, or vice versa.
  r.post('/:id/cancel', ah(async (req, res) => {
    const id = Number(req.params.id) || 0;
    const { rowCount } = await pool.query(
      `UPDATE orders
          SET status = 'cancelled', cancelled_by = 'customer', cancelled_at = now(), updated_at = now(),
              cancellation_reason = $3
        WHERE order_id = $1 AND customer_id = $2
          AND status = 'pending' AND created_at > now() - interval '5 minutes'`,
      [id, req.user.id, str(req.body.reason, 200) || null],
    );
    const order = await loadOrder(pool, id);
    if (!order || order.customerId !== req.user.id) throw notFound();
    if (!rowCount) throw conflict('cancel_window_closed', 'Order can no longer be cancelled');

    publish(`store:${order.storeId}`, { type: 'order.updated', order });
    publish(`customer:${order.customerId}`, { type: 'order.updated', order });
    res.json({ order });
  }));

  return r;
}
