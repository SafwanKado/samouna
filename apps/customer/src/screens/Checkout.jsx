import { useRef, useState } from 'react';
import { errorMessage } from '@samouna/shared/api';
import { Button, Icon, Skeleton, TextField } from '@samouna/shared/components';
import { formatIraqiMobile } from '@samouna/shared/phone';
import { useI18n, useStoredState } from '@samouna/shared/react';
import { api, cartLines, cartSubtotal, newRequestId, normalizeSchedule, scheduledAt, whenLabel } from '../lib.js';
import { useStore } from './StoreMenu.jsx';

export default function Checkout(props) {
  const { t } = useI18n();
  if (!props.cart || !props.auth) {
    return <div className="page"><a href="#/cart" className="btn">{t('back')}</a></div>;
  }
  return <CheckoutForm {...props} />;
}

function CheckoutForm({ cart, setCart, navigate, notify, auth, delivery }) {
  const { t, money, name, lang } = useI18n();
  const { data } = useStore(cart.storeId, { cart, setCart, notify });
  const [saved, setSaved] = useStoredState('samouna.address', '');
  const [address, setAddress] = useState(saved);
  const [notes, setNotes] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const requestId = useRef(newRequestId());

  if (!data) return <div className="page"><Skeleton h={30} w="40%" /><div className="stack" style={{ marginTop: 20 }}><Skeleton h={200} r={20} /><Skeleton h={160} r={20} /></div></div>;
  const { store, products } = data;
  const lines = cartLines(cart, products);
  const subtotal = cartSubtotal(lines);
  const total = subtotal + store.deliveryFee;
  const at = scheduledAt(normalizeSchedule(delivery));
  const addressOk = address.trim().length >= 5;

  async function submit(e) {
    e.preventDefault();
    setShowErrors(true);
    if (!addressOk) return document.getElementById('co-address')?.focus();
    setError('');
    setBusy(true);
    try {
      const { order } = await api.post('/orders', {
        storeId: cart.storeId,
        items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
        deliveryAddress: address.trim(), fullName: auth.user.fullName, notes,
        scheduledFor: at ? at.toISOString() : undefined, clientRequestId: requestId.current,
      });
      setSaved(address.trim());
      setCart(null);
      navigator.vibrate?.([15, 40, 15]);
      notify(t('orderPlaced'), 'success');
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
      <div className="topbar">
        <a href="#/cart" className="icon-btn round" aria-label={t('back')}><Icon name="back" flip /></a>
        <h1 className="screen-title">{t('checkout')}</h1>
        <span style={{ width: 44 }} />
      </div>

      <form className="stack checkout" onSubmit={submit} noValidate>
        <section className="card stack">
          <div className="row-between">
            <h2 className="card-title"><Icon name={at ? 'clock' : 'bolt'} size={20} className="text-brand" />{t('deliveryDetails')}</h2>
            <a href="#/cart" className="link-btn small"><Icon name="edit" size={16} />{t('change')}</a>
          </div>
          <p className={`when-pill ${at ? 'scheduled' : ''}`}>{at ? t('scheduledFor', { when: whenLabel(at, lang, t) }) : t('deliverNow')}</p>
          <TextField id="co-address" label={t('deliveryAddress')} hint={t('addressHint')} icon="pin" multiline maxLength={300}
            value={address} onChange={setAddress} valid={addressOk} error={!addressOk && t('err_address_required')} showErrors={showErrors} autoComplete="street-address" />
          {saved && saved !== address && (
            <button type="button" className="chip" onClick={() => setAddress(saved)}><Icon name="repeat" size={16} />{t('lastAddress')}</button>
          )}
          <TextField id="co-notes" label={t('notes')} icon="edit" value={notes} onChange={setNotes} maxLength={300} />
        </section>

        <section className="card stack">
          <h2 className="card-title"><Icon name="user" size={20} className="text-brand" />{t('yourDetails')}</h2>
          <div className="kv"><span className="muted">{t('name')}</span><span>{auth.user.fullName}</span></div>
          <div className="kv"><span className="muted">{t('phoneNumber')}</span><span className="num">{formatIraqiMobile(auth.user.phone)}</span></div>
        </section>

        <section className="card stack">
          <h2 className="card-title"><Icon name="receipt" size={20} className="text-brand" />{store.name}</h2>
          {lines.map((l) => (
            <div key={l.product.id} className="kv">
              <span><span className="qty-tag num">{l.quantity}×</span>{name(l.product)}</span>
              <span className="num">{money(l.product.price * l.quantity)}</span>
            </div>
          ))}
          <dl className="totals">
            <div><dt>{t('subtotal')}</dt><dd className="num">{money(subtotal)}</dd></div>
            <div><dt>{t('deliveryFee')}</dt><dd className="num">{store.deliveryFee ? money(store.deliveryFee) : t('free')}</dd></div>
            <div className="grand"><dt>{t('total')}</dt><dd className="num">{money(total)}</dd></div>
          </dl>
        </section>

        <div className="notice"><Icon name="card" size={18} />{t('payCash')}</div>
        {error && <div className="form-error" role="alert"><Icon name="alert" size={18} />{error}</div>}
        <Button type="submit" className="btn-primary btn-lg btn-block" loading={busy} disabled={!lines.length || !store.isActive}>
          {t('placeOrder')} · <span className="num">{money(total)}</span>
        </Button>
      </form>
    </div>
  );
}
