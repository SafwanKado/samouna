import { createApiClient, wsUrlFrom } from '@samouna/shared/api';
import { createLiveHub, createSessionStore } from '@samouna/shared/react';

const baseUrl = import.meta.env.VITE_API_URL || '';

export const LOGO = '/icons/logo.png';
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

/* ---------------------------------------------------------------- cart
   Shape: { storeId, items: { [productId]: quantity } } */

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

export function setCartQty(cart, storeId, productId, qty) {
  const items = { ...(cart?.storeId === storeId ? cart.items : {}) };
  if (qty <= 0) delete items[productId];
  else items[productId] = Math.min(99, qty);
  return Object.keys(items).length ? { storeId, items } : null;
}

/* ---------------------------------------------------------------- scheduling
   Delivery choice is stored as { mode: 'now' | 'schedule', day: 'YYYY-MM-DD', time: 'HH:MM' }.
   Slots run every 30 minutes, 06:00-22:00, at least 30 minutes from now, up to 6 days ahead. */

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const LEAD_MS = 30 * 60 * 1000;

function slotDate(day, time) {
  const [y, mo, d] = day.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return new Date(y, mo - 1, d, h, mi, 0, 0);
}

export function timeSlots(day, now = new Date()) {
  const out = [];
  for (let m = 6 * 60; m <= 22 * 60; m += 30) {
    const time = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
    if (slotDate(day, time) - now >= LEAD_MS) out.push(time);
  }
  return out;
}

export function scheduleDays(now = new Date()) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const key = dayKey(d);
    if (timeSlots(key, now).length) days.push({ key, offset: i, date: d });
  }
  return days;
}

/** Keeps a stored choice valid as time passes (falls back to the first open slot). */
export function normalizeSchedule(delivery, now = new Date()) {
  const days = scheduleDays(now);
  const day = days.find((d) => d.key === delivery?.day)?.key ?? days[0]?.key;
  const slots = day ? timeSlots(day, now) : [];
  const time = slots.includes(delivery?.time) ? delivery.time : slots[0];
  return { mode: delivery?.mode === 'schedule' ? 'schedule' : 'now', day, time };
}

export function scheduledAt(delivery) {
  if (delivery?.mode !== 'schedule' || !delivery.day || !delivery.time) return null;
  return slotDate(delivery.day, delivery.time);
}

const KU_DAYS = ['یەکشەمب', 'دووشەمب', 'سێشەمب', 'چارشەمب', 'پێنجشەمب', 'ئەینی', 'شەمبی'];

export function dayLabel(date, lang, t, now = new Date()) {
  const diff = Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  if (diff === 0) return t('today');
  if (diff === 1) return t('tomorrow');
  const dm = `${date.getDate()}/${date.getMonth() + 1}`;
  if (lang === 'ku') return `${KU_DAYS[date.getDay()]} ${dm}`;
  return `${new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en-GB', { weekday: 'long' }).format(date)} ${dm}`;
}

export function whenLabel(date, lang, t) {
  const d = new Date(date);
  return `${dayLabel(d, lang, t)} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
