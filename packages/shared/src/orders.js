// Order lifecycle rules shared by the API and both frontends.

export const STATUS = Object.freeze({
  PENDING: 'pending',
  IN_OVEN: 'in_oven',
  READY: 'ready',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

export const ALL_STATUSES = Object.values(STATUS);

/** The single-tap bakery pipeline: each status has exactly one next step. */
export const NEXT_STATUS = Object.freeze({
  pending: 'in_oven',
  in_oven: 'ready',
  ready: 'out_for_delivery',
  out_for_delivery: 'completed',
});

/** Timestamp column set when an order enters a status. */
export const STATUS_TIMESTAMP = Object.freeze({
  in_oven: 'accepted_at',
  ready: 'ready_at',
  out_for_delivery: 'out_for_delivery_at',
  completed: 'completed_at',
  cancelled: 'cancelled_at',
});

export const ACTIVE_STATUSES = ['pending', 'in_oven', 'ready', 'out_for_delivery'];

export const CANCEL_WINDOW_MS = 5 * 60 * 1000;

export const CITIES = Object.freeze(['duhok', 'sharya']);

export function cancelDeadline(createdAt) {
  return new Date(createdAt).getTime() + CANCEL_WINDOW_MS;
}

/** Client-side mirror of the server rule (the server is the source of truth). */
export function canCustomerCancel(order, now = Date.now()) {
  return order.status === STATUS.PENDING && now < cancelDeadline(order.createdAt);
}

/** Customer-facing timeline steps. */
export const CUSTOMER_TIMELINE = ['pending', 'in_oven', 'ready', 'out_for_delivery', 'completed'];
