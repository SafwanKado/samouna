import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startTestServer } from './helpers.js';

let t, bakery, bakeryToken, customer, other;
before(async () => {
  t = await startTestServer();
  bakery = await t.seedBakery();
  bakeryToken = (await t.login('0750 111 0001', 'bakery')).token;
  customer = await t.login('0751 000 0001', 'customer', 'Customer One');
  other = await t.seedBakery({ ownerPhone: '0750 111 0002', storeName: 'Other Bakery' });
});
after(async () => { await t.stop(); });

const orderBody = (extra = {}) => ({
  storeId: bakery.storeId,
  items: [{ productId: bakery.productIds[0], quantity: 10 }, { productId: bakery.productIds[1], quantity: 1 }],
  deliveryAddress: 'Malta, behind the blue mosque',
  fullName: 'Customer One',
  ...extra,
});

test('full pipeline: order -> bakery sees it live -> advance -> cash logged', async () => {
  const staff = await t.socket(bakeryToken);
  const me = await t.socket(customer.token);
  assert.ok(staff.channels.includes(`store:${bakery.storeId}`));
  assert.ok(me.channels.includes(`customer:${customer.user.id}`));

  const created = await t.api('POST', '/orders', orderBody({ items: [
    { productId: bakery.productIds[0], quantity: 10, price: 1 }, // client price is ignored
    { productId: bakery.productIds[1], quantity: 1 },
  ] }), customer.token);
  assert.equal(created.status, 201);
  const order = created.body.order;
  assert.equal(order.status, 'pending');
  assert.equal(order.subtotal, 10 * 250 + 1500);
  assert.equal(order.deliveryFee, 1000);
  assert.equal(order.total, 5000);
  assert.equal(order.deliveryCity, 'sharya');

  const live = await staff.next((m) => m.type === 'order.created');
  assert.equal(live.order.id, order.id);

  for (const [from, to] of [['pending', 'in_oven'], ['in_oven', 'ready'], ['ready', 'out_for_delivery'], ['out_for_delivery', 'completed']]) {
    const r = await t.api('POST', `/bakery/orders/${order.id}/advance`, { from }, bakeryToken);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.order.status, to);
    const pushed = await me.next((m) => m.type === 'order.updated' && m.order.status === to);
    assert.equal(pushed.order.id, order.id);
  }

  const { rows } = await t.pool.query('SELECT amount, payment_method FROM transactions WHERE order_id = $1', [order.id]);
  assert.deepEqual(rows, [{ amount: 5000, payment_method: 'cash_on_delivery' }]);

  const summary = await t.api('GET', '/bakery/summary', undefined, bakeryToken);
  assert.equal(summary.body.today.cash, 5000);
  assert.equal(summary.body.today.orders, 1);

  staff.close();
  me.close();
});

test('double tap advances only one step', async () => {
  const { body: { order } } = await t.api('POST', '/orders', orderBody(), customer.token);
  const [a, b] = await Promise.all([
    t.api('POST', `/bakery/orders/${order.id}/advance`, { from: 'pending' }, bakeryToken),
    t.api('POST', `/bakery/orders/${order.id}/advance`, { from: 'pending' }, bakeryToken),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
});

test('customer can cancel a pending order within 5 minutes; bakery is alerted', async () => {
  const staff = await t.socket(bakeryToken);
  const { body: { order } } = await t.api('POST', '/orders', orderBody(), customer.token);
  const r = await t.api('POST', `/orders/${order.id}/cancel`, {}, customer.token);
  assert.equal(r.status, 200);
  assert.equal(r.body.order.status, 'cancelled');
  assert.equal(r.body.order.cancelledBy, 'customer');
  const alert = await staff.next((m) => m.type === 'order.updated' && m.order.id === order.id);
  assert.equal(alert.order.status, 'cancelled');

  const accept = await t.api('POST', `/bakery/orders/${order.id}/advance`, { from: 'pending' }, bakeryToken);
  assert.equal(accept.status, 409, 'a cancelled order cannot be accepted');
  staff.close();
});

test('cancel locks once the bakery accepts', async () => {
  const { body: { order } } = await t.api('POST', '/orders', orderBody(), customer.token);
  await t.api('POST', `/bakery/orders/${order.id}/advance`, { from: 'pending' }, bakeryToken);
  const r = await t.api('POST', `/orders/${order.id}/cancel`, {}, customer.token);
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, 'cancel_window_closed');
});

test('cancel locks after 5 minutes even while still pending', async () => {
  const { body: { order } } = await t.api('POST', '/orders', orderBody(), customer.token);
  await t.pool.query("UPDATE orders SET created_at = now() - interval '5 minutes 1 second' WHERE order_id = $1", [order.id]);
  const r = await t.api('POST', `/orders/${order.id}/cancel`, {}, customer.token);
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, 'cancel_window_closed');
});

test('other customers cannot see or cancel my order', async () => {
  const { body: { order } } = await t.api('POST', '/orders', orderBody(), customer.token);
  const intruder = await t.login('0751 000 0002', 'customer', 'Intruder');
  assert.equal((await t.api('GET', `/orders/${order.id}`, undefined, intruder.token)).status, 404);
  assert.equal((await t.api('POST', `/orders/${order.id}/cancel`, {}, intruder.token)).status, 404);
});

test('store isolation: another bakery cannot see or touch my orders', async () => {
  const { body: { order } } = await t.api('POST', '/orders', orderBody(), customer.token);
  const otherToken = (await t.login('0750 111 0002', 'bakery')).token;
  const list = await t.api('GET', '/bakery/orders', undefined, otherToken);
  assert.equal(list.body.orders.length, 0);
  const r = await t.api('POST', `/bakery/orders/${order.id}/advance`, { from: 'pending' }, otherToken);
  assert.equal(r.status, 404);
  const toggle = await t.api('PATCH', `/bakery/products/${bakery.productIds[0]}`, { isAvailable: false }, otherToken);
  assert.equal(toggle.status, 404);
});

test('sold-out toggle broadcasts to storefronts and blocks ordering that item', async () => {
  const shopper = await t.socket(null);
  const off = await t.api('PATCH', `/bakery/products/${bakery.productIds[1]}`, { isAvailable: false }, bakeryToken);
  assert.equal(off.body.product.isAvailable, false);
  const pushed = await shopper.next((m) => m.type === 'product.updated');
  assert.equal(pushed.product.id, bakery.productIds[1]);

  const r = await t.api('POST', '/orders', orderBody(), customer.token);
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, 'product_unavailable');
  assert.deepEqual(r.body.error.details.productIds, [bakery.productIds[1]]);

  await t.api('PATCH', `/bakery/products/${bakery.productIds[1]}`, { isAvailable: true }, bakeryToken);
  shopper.close();
});

test('closed shop rejects orders', async () => {
  await t.api('PATCH', '/bakery/store', { isActive: false }, bakeryToken);
  const r = await t.api('POST', '/orders', orderBody(), customer.token);
  assert.equal(r.body.error.code, 'store_closed');
  await t.api('PATCH', '/bakery/store', { isActive: true }, bakeryToken);
});

test('a retried submit with the same clientRequestId creates one order', async () => {
  const body = orderBody({ clientRequestId: 'abc-123' });
  const [a, b] = await Promise.all([
    t.api('POST', '/orders', body, customer.token),
    t.api('POST', '/orders', body, customer.token),
  ]);
  assert.equal(a.body.order.id, b.body.order.id);
  const { rows } = await t.pool.query("SELECT count(*) AS n FROM orders WHERE client_request_id = 'abc-123'");
  assert.equal(rows[0].n, 1);
});

test('order history lists my orders with items', async () => {
  const r = await t.api('GET', '/orders', undefined, customer.token);
  assert.equal(r.status, 200);
  assert.ok(r.body.orders.length >= 5);
  assert.equal(r.body.orders[0].items[0].name.en, 'Samoun');
  assert.ok(r.body.orders.every((o) => o.customerId === customer.user.id));
});

test('validates order input', async () => {
  for (const bad of [
    orderBody({ items: [] }),
    orderBody({ deliveryAddress: 'x' }),
    orderBody({ items: [{ productId: bakery.productIds[0], quantity: 0 }] }),
    orderBody({ items: [{ productId: other.productIds[0], quantity: 1 }] }), // product from another store
  ]) {
    const r = await t.api('POST', '/orders', bad, customer.token);
    assert.ok([400, 409].includes(r.status), JSON.stringify(r.body));
  }
});

test('scheduled orders: accepted 20 min to 7 days ahead, rejected otherwise', async () => {
  const at = new Date(Date.now() + 2 * 3600e3).toISOString();
  const ok = await t.api('POST', '/orders', orderBody({ scheduledFor: at }), customer.token);
  assert.equal(ok.status, 201);
  assert.equal(new Date(ok.body.order.scheduledFor).toISOString(), at);

  for (const bad of [new Date(Date.now() + 5 * 60e3), new Date(Date.now() + 8 * 86400e3), 'tomorrow-ish']) {
    const r = await t.api('POST', '/orders', orderBody({ scheduledFor: bad }), customer.token);
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, 'schedule_invalid');
  }
});

test('stores outside the served cities are hidden', async () => {
  await t.pool.query("UPDATE stores SET city = 'duhok' WHERE store_id = $1", [other.storeId]);
  const list = await t.api('GET', '/stores');
  assert.ok(list.body.stores.every((s) => s.city === 'sharya'));
  assert.equal((await t.api('GET', `/stores/${other.storeId}`)).status, 404);
  await t.pool.query("UPDATE stores SET city = 'sharya' WHERE store_id = $1", [other.storeId]);
});
