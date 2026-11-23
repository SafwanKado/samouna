import { createApiClient, wsUrlFrom } from '@samouna/shared/api';
import { createLiveHub, createSessionStore } from '@samouna/shared/react';

const baseUrl = import.meta.env.VITE_API_URL || '';

export const session = createSessionStore('samouna.customer.session');
export const live = createLiveHub();
export const wsUrl = wsUrlFrom(baseUrl);

export const api = createApiClient({
  baseUrl,
  getToken: () => session.get()?.token,
  onUnauthorized: () => session.set(null),
});

export function newRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Cart shape: { storeId, items: { [productId]: quantity } } */
export function cartCount(cart) {
  return cart ? Object.values(cart.items).reduce((a, b) => a + b, 0) : 0;
}

export function cartLines(cart, products) {
  if (!cart || !products) return [];
  const byId = new Map(products.map((p) => [p.id, p]));
  return Object.entries(cart.items)
    .map(([id, quantity]) => ({ product: byId.get(Number(id)), quantity }))
    .filter((l) => l.product && l.product.isAvailable && l.quantity > 0);
}

export function cartSubtotal(lines) {
  return lines.reduce((s, l) => s + l.product.price * l.quantity, 0);
}
