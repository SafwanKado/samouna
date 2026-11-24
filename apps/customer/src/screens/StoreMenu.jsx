import { useCallback, useEffect, useState } from 'react';
import { Icon, useConfirm } from '@samouna/shared/components';
import { useI18n } from '@samouna/shared/react';
import { api, cartCount, cartLines, cartSubtotal, live, setCartQty } from '../lib.js';

/** Loads a store + products and keeps them live. Shared with Cart and Checkout. */
export function useStore(storeId, { cart, setCart, notify }) {
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    if (!storeId) return;
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

  // Drop items from the cart the moment the bakery marks them sold out.
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

export function ProductThumb({ product, size = 'md' }) {
  return (
    <div className={`thumb thumb-${size}`} aria-hidden="true">
      {product.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy" /> : <Icon name="bread" size={size === 'lg' ? 44 : 34} stroke={1.6} />}
    </div>
  );
}

export function QtyControl({ value, onChange, max = 99, disabledPlus }) {
  return (
    <div className="qty">
      <button type="button" className="icon-btn" aria-label="−" onClick={() => onChange(value - 1)}><Icon name="minus" /></button>
      <span className="qty-value num" aria-live="polite">{value}</span>
      <button type="button" className="icon-btn" aria-label="+" disabled={disabledPlus || value >= max} onClick={() => onChange(value + 1)}><Icon name="plus" /></button>
    </div>
  );
}

export default function StoreMenu({ storeId, cart, setCart, notify }) {
  const { t, money, name } = useI18n();
  const { data, error } = useStore(storeId, { cart, setCart, notify });
  const [ask, dialog] = useConfirm();

  if (error) return <p className="empty">{t('err_generic')}</p>;
  if (!data) return <div className="spinner" />;
  const { store, products } = data;
  const myCart = cart?.storeId === storeId ? cart : null;

  async function setQty(productId, qty) {
    if (cart && cart.storeId !== storeId && cartCount(cart) > 0) {
      const ok = await ask({ icon: 'cart', title: t('replaceCartTitle'), message: t('replaceCart'), confirmLabel: t('yes'), cancelLabel: t('no') });
      if (!ok) return;
      return setCart(setCartQty(null, storeId, productId, qty));
    }
    setCart(setCartQty(cart, storeId, productId, qty));
  }

  const lines = cartLines(myCart, products);
  const count = lines.reduce((s, l) => s + l.quantity, 0);

  return (
    <div className="page">
      <a href="#/" className="back-link"><Icon name="back" size={22} flip />{t('back')}</a>
      <header className="store-header">
        <h1>{store.name}</h1>
        <p className="muted row"><Icon name="pin" size={16} />{store.address}</p>
        <div className="row">
          <span className={`badge ${store.isActive ? 'badge-ok' : 'badge-muted'}`}>{store.isActive ? t('open') : t('closed')}</span>
          <span className="badge badge-muted">{t('deliveryFee')}: {store.deliveryFee ? money(store.deliveryFee) : t('free')}</span>
        </div>
      </header>
      {!store.isActive && <div className="notice notice-warn">{t('closedNow')}</div>}

      <ul className="menu">
        {products.map((p) => {
          const qty = myCart?.items[p.id] || 0;
          const disabled = !p.isAvailable || !store.isActive;
          return (
            <li key={p.id} className={`card menu-item ${p.isAvailable ? '' : 'sold-out'}`}>
              <ProductThumb product={p} />
              <div className="grow">
                <div className="menu-name">{name(p)}</div>
                <div className="menu-price num">{money(p.price)}</div>
                {!p.isAvailable && <span className="badge badge-muted">{t('soldOut')}</span>}
              </div>
              {qty > 0 ? (
                <QtyControl value={qty} disabledPlus={disabled} onChange={(v) => setQty(p.id, v)} />
              ) : (
                <button className="btn btn-primary btn-add" disabled={disabled} onClick={() => setQty(p.id, 1)}>
                  <Icon name="plus" size={18} />{t('add')}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {count > 0 && (
        <a href="#/cart" className="cart-float">
          <span className="cart-float-count num">{count}</span>
          <span className="grow">{t('viewCart')}</span>
          <span className="num">{money(cartSubtotal(lines))}</span>
        </a>
      )}
      {dialog}
    </div>
  );
}
