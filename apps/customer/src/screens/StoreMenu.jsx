import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState, Icon, SearchField, Skeleton, useConfirm } from '@samouna/shared/components';
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
    notify(t('someUnavailable'), 'danger');
  }, [data, cart, storeId, setCart, notify, t]);

  return { data, error };
}

export function ProductThumb({ product, size = 'md' }) {
  return (
    <div className={`thumb thumb-${size}`} aria-hidden="true">
      {product.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy" /> : <Icon name="bread" size={size === 'lg' ? 40 : 30} stroke={1.7} />}
    </div>
  );
}

/** − qty + stepper with a gentle haptic tick. */
export function Stepper({ value, onChange, max = 99, disabledPlus, label }) {
  const tick = () => navigator.vibrate?.(8);
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label="−" onClick={() => { tick(); onChange(value - 1); }}><Icon name={value === 1 ? 'trash' : 'minus'} size={18} /></button>
      <span key={value} className="stepper-value num" aria-live="polite">{value}</span>
      <button type="button" aria-label="+" disabled={disabledPlus || value >= max} onClick={() => { tick(); onChange(value + 1); }}><Icon name="plus" size={18} /></button>
    </div>
  );
}

export default function StoreMenu({ storeId, cart, setCart, notify }) {
  const { t, money, name } = useI18n();
  const { data, error } = useStore(storeId, { cart, setCart, notify });
  const [query, setQuery] = useState('');
  const [ask, dialog] = useConfirm();

  const products = data?.products;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!products || !q) return products || [];
    return products.filter((p) => Object.values(p.name).some((n) => n.toLowerCase().includes(q)));
  }, [products, query]);

  if (error) return <div className="page"><EmptyState icon="alert" title={t('err_generic')} /></div>;
  if (!data) {
    return (
      <div className="page" aria-busy="true">
        <Skeleton w={110} h={36} r={12} />
        <div className="stack" style={{ marginTop: 18 }}><Skeleton w="70%" h={30} /><Skeleton w="50%" h={16} /></div>
        <div className="stack" style={{ marginTop: 24 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={96} r={20} />)}</div>
      </div>
    );
  }
  const { store } = data;
  const myCart = cart?.storeId === storeId ? cart : null;

  async function setQty(p, qty) {
    if (cart && cart.storeId !== storeId && cartCount(cart) > 0) {
      const ok = await ask({ icon: 'cart', title: t('replaceCartTitle'), message: t('replaceCart'), confirmLabel: t('yes'), cancelLabel: t('no') });
      if (!ok) return;
      setCart(setCartQty(null, storeId, p.id, qty));
      return;
    }
    setCart(setCartQty(cart, storeId, p.id, qty));
  }

  const lines = cartLines(myCart, data.products);
  const count = lines.reduce((s, l) => s + l.quantity, 0);

  return (
    <div className="page">
      <div className="topbar">
        <a href="#/" className="icon-btn round" aria-label={t('back')}><Icon name="back" flip /></a>
      </div>
      <header className="store-hero rise">
        <div className="store-thumb lg" aria-hidden="true"><Icon name="bread" size={40} stroke={1.7} /></div>
        <div className="grow">
          <h1>{store.name}</h1>
          <p className="muted row small"><Icon name="pin" size={15} />{store.address}</p>
          <div className="row store-meta">
            <span className={`badge dot ${store.isActive ? 'badge-success' : 'badge-muted'}`}>{store.isActive ? t('open') : t('closed')}</span>
            <span className="badge badge-muted"><Icon name="truck" size={14} />{store.deliveryFee ? <span className="num">{money(store.deliveryFee)}</span> : t('free')}</span>
          </div>
        </div>
      </header>
      {!store.isActive && <div className="notice warn"><Icon name="clock" size={18} />{t('closedNow')}</div>}

      <div className="sticky-tools">
        <SearchField id="menu-search" value={query} onChange={setQuery} placeholder={t('searchMenu')} />
      </div>
      <p className="muted small section-sub">{t('menuCount', { n: data.products.length })}</p>

      {shown.length === 0 && <EmptyState icon="search" title={t('noResults', { q: query })} />}
      <ul className="menu">
        {shown.map((p, i) => {
          const qty = myCart?.items[p.id] || 0;
          const disabled = !p.isAvailable || !store.isActive;
          return (
            <li key={p.id} className={`card menu-item rise ${p.isAvailable ? '' : 'sold-out'} ${qty ? 'in-cart' : ''}`} style={{ animationDelay: `${i * 30}ms` }}>
              <ProductThumb product={p} />
              <div className="grow">
                <div className="menu-name">{name(p)}</div>
                <div className="menu-price num">{money(p.price)}</div>
                {!p.isAvailable && <span className="badge badge-muted">{t('soldOut')}</span>}
              </div>
              {qty > 0 ? (
                <Stepper value={qty} label={name(p)} disabledPlus={disabled} onChange={(v) => setQty(p, v)} />
              ) : (
                <button type="button" className="add-btn" disabled={disabled} aria-label={`${t('add')} ${name(p)}`} onClick={() => { navigator.vibrate?.(10); setQty(p, 1); }}>
                  <Icon name="plus" size={22} stroke={2.4} />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {count > 0 && (
        <a href="#/cart" className="cart-bar">
          <span key={count} className="cart-bar-count num">{count}</span>
          <span className="grow">{t('viewCart')}</span>
          <span className="num">{money(cartSubtotal(lines))}</span>
          <Icon name="arrowEnd" size={20} flip />
        </a>
      )}
      {dialog}
    </div>
  );
}
