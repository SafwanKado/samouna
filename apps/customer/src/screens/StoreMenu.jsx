import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@samouna/shared/react';
import { api, cartCount, cartLines, cartSubtotal, live } from '../lib.js';

/** Loads a store + products and keeps them live. Shared with Checkout. */
export function useStore(storeId, { cart, setCart, notify }) {
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    api.get(`/stores/${storeId}`).then(setData).catch(() => setError(true));
  }, [storeId]);
  useEffect(load, [load]);

  live.useLive((e) => {
    if (e.type === 'reconnected') load();
    if (e.type === 'store.updated' && e.store.id === storeId) setData((d) => d && { ...d, store: e.store });
    if (e.type === 'product.updated' && e.product.storeId === storeId) {
      setData((d) => d && { ...d, products: d.products.map((p) => (p.id === e.product.id ? e.product : p)) });
    }
  });

  // Drop items from the basket the moment the bakery marks them sold out.
  useEffect(() => {
    if (!data || !cart || cart.storeId !== storeId) return;
    const gone = data.products.filter((p) => !p.isAvailable && cart.items[p.id]);
    if (!gone.length) return;
    const items = { ...cart.items };
    gone.forEach((p) => delete items[p.id]);
    setCart(Object.keys(items).length ? { ...cart, items } : null);
    notify(t('someUnavailable'));
  }, [data, cart, storeId, setCart, notify, t]);

  return { data, error };
}

export default function StoreMenu({ storeId, cart, setCart, navigate, notify }) {
  const { t, money, name } = useI18n();
  const { data, error } = useStore(storeId, { cart, setCart, notify });

  if (error) return <p className="empty">{t('err_generic')}</p>;
  if (!data) return <div className="spinner" />;
  const { store, products } = data;
  const myCart = cart?.storeId === storeId ? cart : null;

  function setQty(productId, qty) {
    if (cart && cart.storeId !== storeId && cartCount(cart) > 0) {
      if (!window.confirm(t('replaceCart'))) return;
      cart = null;
    }
    const items = { ...(cart?.storeId === storeId ? cart.items : {}) };
    if (qty <= 0) delete items[productId];
    else items[productId] = Math.min(99, qty);
    setCart(Object.keys(items).length ? { storeId, items } : null);
  }

  const lines = cartLines(myCart, products);
  const count = lines.reduce((s, l) => s + l.quantity, 0);

  return (
    <div className="page">
      <a href="#/" className="btn-link">‹ {t('back')}</a>
      <div className="store-header">
        <h1>{store.name}</h1>
        <p className="muted">{store.address}</p>
      </div>
      {!store.isActive && <div className="notice notice-warn">{t('closedNow')}</div>}

      <ul className="menu">
        {products.map((p) => {
          const qty = myCart?.items[p.id] || 0;
          const disabled = !p.isAvailable || !store.isActive;
          return (
            <li key={p.id} className={`menu-item ${p.isAvailable ? '' : 'sold-out'}`}>
              <div className="grow">
                <div className="menu-name">{name(p)}</div>
                <div className="menu-price num">{money(p.price)}</div>
                {!p.isAvailable && <span className="badge badge-muted">{t('soldOut')}</span>}
              </div>
              {qty > 0 ? (
                <div className="qty">
                  <button className="icon-btn" aria-label="−" onClick={() => setQty(p.id, qty - 1)}>−</button>
                  <span className="qty-value num" aria-live="polite">{qty}</span>
                  <button className="icon-btn" aria-label="+" disabled={disabled} onClick={() => setQty(p.id, qty + 1)}>+</button>
                </div>
              ) : (
                <button className="btn btn-add" disabled={disabled} onClick={() => setQty(p.id, 1)}>
                  + {t('add')}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {count > 0 && (
        <div className="cart-bar">
          <div className="cart-bar-inner">
            <div>
              <div className="small muted">{t('items', { n: count })}</div>
              <div className="cart-total num">{money(cartSubtotal(lines))}</div>
            </div>
            <button className="btn btn-primary" disabled={!store.isActive} onClick={() => navigate('/checkout')}>
              {t('proceedToCheckout')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
