import { useRef, useState } from 'react';
import { errorMessage } from '@samouna/shared/api';
import { normalizeIraqiMobile, toE164 } from '@samouna/shared/phone';
import { useI18n, useStoredState } from '@samouna/shared/react';
import { api, cartLines, cartSubtotal, newRequestId, session } from '../lib.js';
import { useOtpLogin } from '../useOtpLogin.jsx';
import { useStore } from './StoreMenu.jsx';

export default function Checkout({ cart, setCart, navigate, notify, auth }) {
  const { t } = useI18n();
  const storeId = cart?.storeId;
  if (!storeId) {
    return (
      <div className="page empty">
        <a href="#/" className="btn btn-primary">{t('back')}</a>
      </div>
    );
  }
  return <CheckoutForm storeId={storeId} cart={cart} setCart={setCart} navigate={navigate} notify={notify} auth={auth} />;
}

function CheckoutForm({ storeId, cart, setCart, navigate, notify, auth }) {
  const { t, money, name } = useI18n();
  const { data } = useStore(storeId, { cart, setCart, notify });
  const [draft, setDraft] = useStoredState('samouna.checkout', { fullName: '', phone: '', address: '' });
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const requestId = useRef(newRequestId());
  const otp = useOtpLogin();

  if (!data) return <div className="spinner" />;
  const { store, products } = data;
  const lines = cartLines(cart, products);
  const subtotal = cartSubtotal(lines);
  const total = subtotal + store.deliveryFee;

  const fullName = draft.fullName || auth?.user?.fullName || '';
  const phone = auth ? auth.user.phone : draft.phone;
  const update = (field) => (e) => setDraft({ ...draft, [field]: e.target.value });

  async function placeOrder() {
    try {
      const { order } = await api.post('/orders', {
        storeId,
        items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
        deliveryAddress: draft.address,
        fullName,
        notes,
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
    }
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    const normalized = normalizeIraqiMobile(phone);
    if (fullName.trim().length < 2) return setError(t('err_name_required'));
    if (!normalized) return setError(t('err_invalid_phone'));
    if (draft.address.trim().length < 5) return setError(t('err_validation'));

    setBusy(true);
    try {
      if (auth && auth.user.phone === toE164(normalized)) {
        await placeOrder();
      } else {
        await otp.start(normalized, fullName.trim(), placeOrder);
      }
    } catch (err) {
      setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <a href={`#/store/${storeId}`} className="btn-link">‹ {t('back')}</a>
      <h1>{t('checkout')}</h1>
      <p className="muted">{store.name}</p>

      <div className="card summary">
        {lines.map((l) => (
          <div key={l.product.id} className="row-between">
            <span><span className="num">{l.quantity}×</span> {name(l.product)}</span>
            <span className="num">{money(l.product.price * l.quantity)}</span>
          </div>
        ))}
        <hr />
        <div className="row-between muted"><span>{t('subtotal')}</span><span className="num">{money(subtotal)}</span></div>
        <div className="row-between muted">
          <span>{t('deliveryFee')}</span>
          <span className="num">{store.deliveryFee ? money(store.deliveryFee) : t('free')}</span>
        </div>
        <div className="row-between total"><span>{t('total')}</span><span className="num">{money(total)}</span></div>
      </div>

      <form className="stack" onSubmit={submit} noValidate>
        <label className="field">
          {t('fullName')}
          <input value={fullName} onChange={update('fullName')} autoComplete="name" required />
        </label>

        <label className="field">
          {t('phone')}
          <input
            dir="ltr"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder={t('phoneHint')}
            value={phone}
            readOnly={Boolean(auth)}
            onChange={update('phone')}
          />
          {auth && (
            <button type="button" className="btn-link small" onClick={() => session.set(null)}>
              {t('changeNumber')}
            </button>
          )}
        </label>

        <label className="field">
          {t('deliveryAddress')}
          <span className="hint">{t('addressHint')}</span>
          <textarea value={draft.address} onChange={update('address')} autoComplete="street-address" required />
        </label>

        <label className="field">
          {t('notes')}
          <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} />
        </label>

        <div className="notice">💵 {t('payCash')}</div>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-big" disabled={busy || !lines.length || !store.isActive}>
          {t('placeOrder')} · <span className="num">{money(total)}</span>
        </button>
      </form>
      {otp.modal}
    </div>
  );
}
