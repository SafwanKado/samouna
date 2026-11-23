import { CANCEL_WINDOW_MS } from '@samouna/shared/orders';

export const ORDER_COLUMNS = `
  o.order_id, o.customer_id, o.store_id, o.customer_name, o.customer_phone,
  o.delivery_address, o.delivery_city, o.notes, o.subtotal_amount, o.delivery_fee,
  o.total_amount, o.status, o.cancellation_reason, o.cancelled_by, o.created_at,
  o.accepted_at, o.ready_at, o.out_for_delivery_at, o.completed_at, o.cancelled_at,
  s.store_name`;

export function serializeUser(u) {
  return {
    id: u.user_id,
    fullName: u.full_name,
    phone: u.phone_number,
    role: u.role,
    preferredLanguage: u.preferred_language,
  };
}

export function serializeStore(s) {
  return {
    id: s.store_id,
    name: s.store_name,
    address: s.address,
    city: s.city,
    deliveryFee: s.delivery_fee_iqd,
    isActive: s.is_active,
  };
}

export function serializeProduct(p) {
  return {
    id: p.product_id,
    storeId: p.store_id,
    name: { ku: p.name_ku, ar: p.name_ar, en: p.name_en },
    price: p.price,
    isAvailable: p.is_available,
  };
}

export function serializeOrder(o, items = []) {
  return {
    id: o.order_id,
    customerId: o.customer_id,
    storeId: o.store_id,
    storeName: o.store_name,
    customerName: o.customer_name,
    customerPhone: o.customer_phone,
    deliveryAddress: o.delivery_address,
    deliveryCity: o.delivery_city,
    notes: o.notes,
    subtotal: o.subtotal_amount,
    deliveryFee: o.delivery_fee,
    total: o.total_amount,
    status: o.status,
    cancellationReason: o.cancellation_reason,
    cancelledBy: o.cancelled_by,
    createdAt: o.created_at,
    cancellableUntil: new Date(new Date(o.created_at).getTime() + CANCEL_WINDOW_MS),
    acceptedAt: o.accepted_at,
    readyAt: o.ready_at,
    outForDeliveryAt: o.out_for_delivery_at,
    completedAt: o.completed_at,
    cancelledAt: o.cancelled_at,
    items: items.map((i) => ({
      productId: i.product_id,
      name: { ku: i.name_ku, ar: i.name_ar, en: i.name_en },
      quantity: i.quantity,
      price: i.price,
    })),
  };
}

/** Load orders (already selected with ORDER_COLUMNS) together with their items. */
export async function withItems(db, orderRows) {
  if (!orderRows.length) return [];
  const ids = orderRows.map((o) => o.order_id);
  const { rows } = await db.query(
    `SELECT oi.order_id, oi.product_id, oi.quantity, oi.price, p.name_ku, p.name_ar, p.name_en
       FROM order_items oi JOIN products p USING (product_id)
      WHERE oi.order_id = ANY($1)
      ORDER BY oi.order_item_id`,
    [ids],
  );
  const byOrder = new Map(ids.map((id) => [id, []]));
  for (const r of rows) byOrder.get(r.order_id).push(r);
  return orderRows.map((o) => serializeOrder(o, byOrder.get(o.order_id)));
}

export async function loadOrder(db, orderId) {
  const { rows } = await db.query(
    `SELECT ${ORDER_COLUMNS} FROM orders o JOIN stores s USING (store_id) WHERE o.order_id = $1`,
    [orderId],
  );
  const [order] = await withItems(db, rows);
  return order || null;
}
