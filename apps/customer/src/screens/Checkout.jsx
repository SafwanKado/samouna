import { useRef, useState } from 'react';
import { errorMessage } from '@samouna/shared/api';
import { Icon } from '@samouna/shared/components';
import { formatIraqiMobile } from '@samouna/shared/phone';
import { useI18n, useStoredState } from '@samouna/shared/react';
import { api, cartLines, cartSubtotal, newRequestId, normalizeSchedule, scheduledAt, whenLabel } from '../lib.js';
import { useStore } from './StoreMenu.jsx';

export default function Checkout(props) {
  const { t } = useI18n();
  if (!props.cart || !props.auth) {
    return <div className="page empty"><a href="#/cart" className="btn btn-primary">{t('back')}</a></div>;
  }
  return <CheckoutForm {...props} />;
}

function CheckoutForm({ cart, setCart, navigate, notify, auth, delivery }) {
  const { t, money, name, lang } = useI18n();
  const { data } = useStore(cart.storeId, { cart, setCart, notify });
  const [address, setAddress] = useStoredState('samouna.address', '');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const requestId = useRef(newRequestId());

  if (!data) return <div className="spinner" />;
  const { store, products } = data;
  const lines = cartLines(cart, products);
  const subtotal = cartSubtotal(lines);
  const total = subtotal + store.deliveryFee;
  const sched = normalizeSchedule(delivery);
  const at = scheduledAt(sched);

  async function submit(e) {
    e.preventDefault();
    if (address.trim().length < 5) return setError(t('err_address_required'));
    setError('');
    setBusy(true);
    try {
      const { order } = await api.post('/orders', {
        storeId: cart.storeId,
        items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
        deliveryAddress: address,
        fullName: auth.user.fullName,
        notes,
        scheduledFor: at ? at.toISOString() : undefined,
        clientRequestId: requestId.current,
      });
      setCart(null);
      notify(t('orderPlaced'), 'ok');
      navigate(`/orders/${order.id}`);
    } catch (err) {
      if (err.code === 'product_unavailable') {
        const items = { ...cart.items };
        err.details?.productIds?.forEach((id) => delete items[id]);
        setCart(Object.keys(items).length ? { ...cart, items } : null);
      }
      requestId.current = newRequestId();
      setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <a href="#/cart" className="back-link"><Icon name="back" size={22} flip />{t('back')}</a>
      <h1>{t('checkout')}</h1>

      <form className="stack" onSubmit={submit} noValidate>
        <section className="card stack">
          <h3 className="row"><Icon name={at ? 'clock' : 'bolt'} size={20} className="text-accent" />{t('deliveryDetails')}</h3>
          <p className="muted">{at ? t('scheduledFor', { when: whenLabel(at, lang, t) }) : t('deliverNow')}</p>
          <label className="field">
            {t('deliveryAddress')}
            <span className="hint">{t('addressHint')}</span>
            <textarea id="co-address" value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" />
          </label>
          <label className="field">
            {t('notes')}
            <input id="co-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} />
          </label>
        </section>

        <section className="card stack">
          <h3 className="row"><Icon name="user" size={20} className="text-accent" />{t('yourDetails')}</h3>
          <div className="row-between"><span className="muted">{t('name')}</span><span>{auth.user.fullName}</span></div>
          <div className="row-between"><span className="muted">{t('phoneNumber')}</span><span className="num">{formatIraqiMobile(auth.user.phone)}</span></div>
        </section>

        <section className="card stack">
          <h3 className="row"><Icon name="store" size={20} className="text-accent" />{store.name}</h3>
          {lines.map((l) => (
            <div key={l.product.id} className="row-between">
              <span><span className="num muted">{l.quantity}×</span> {name(l.product)}</span>
              <span className="num">{money(l.product.price * l.quantity)}</span>
            </div>
          ))}
          <hr className="divider" />
          <div className="row-between muted"><span>{t('subtotal')}</span><span className="num">{money(subtotal)}</span></div>
          <div className="row-between muted"><span>{t('deliveryFee')}</span><span className="num">{store.deliveryFee ? money(store.deliveryFee) : t('free')}</span></div>
          <div className="row-between summary-total"><span>{t('total')}</span><span className="num text-price">{money(total)}</span></div>
        </section>

        <div className="notice">{t('payCash')}</div>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-big" disabled={busy || !lines.length || !store.isActive}>
          {t('placeOrder')} · <span className="num">{money(total)}</span>
        </button>
      </form>
    </div>
  );
}
