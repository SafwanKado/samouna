import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '@samouna/shared/api';
import { ACTIVE_STATUSES, CUSTOMER_TIMELINE } from '@samouna/shared/orders';
import { normalizeIraqiMobile } from '@samouna/shared/phone';
import { useI18n, useNow } from '@samouna/shared/react';
import { api, live, session } from '../lib.js';
import { useOtpLogin } from '../useOtpLogin.jsx';

export default function Orders({ auth, ...ctx }) {
  return auth ? <OrderList {...ctx} auth={auth} /> : <LoginForm />;
}

function LoginForm() {
  const { t } = useI18n();
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const otp = useOtpLogin();

  async function submit(e) {
    e.preventDefault();
    const normalized = normalizeIraqiMobile(phone);
    if (!normalized) return setError(t('err_invalid_phone'));
    setError('');
    try {
      await otp.start(normalized, fullName.trim());
    } catch (err) {
      setError(errorMessage(t, err));
    }
  }

  return (
    <div className="page">
      <h1>{t('login')}</h1>
      <form className="stack" onSubmit={submit} noValidate>
        <label className="field">
          {t('phone')}
          <input dir="ltr" type="tel" inputMode="tel" placeholder={t('phoneHint')} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="field">
          {t('fullName')}
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-big">{t('sendCode')}</button>
      </form>
      {otp.modal}
    </div>
  );
}

function OrderList({ focusId, auth, setCart, navigate, notify }) {
  const { t } = useI18n();
  const [orders, setOrders] = useState(null);
  const [offset, setOffset] = useState(0); // server clock - device clock

  const load = useCallback(() => {
    api.get('/orders').then((r) => {
      setOffset(new Date(r.serverTime).getTime() - Date.now());
      setOrders(r.orders);
    }).catch(() => setOrders((o) => o || []));
  }, []);
  useEffect(load, [load]);

  live.useLive((e) => {
    if (e.type === 'reconnected') load();
    if (e.type === 'order.updated') {
      setOrders((list) => {
        if (!list) return list;
        const exists = list.some((o) => o.id === e.order.id);
        return exists ? list.map((o) => (o.id === e.order.id ? e.order : o)) : [e.order, ...list];
      });
    }
  });

  useEffect(() => {
    if (focusId && orders) document.getElementById(`order-${focusId}`)?.scrollIntoView({ block: 'start' });
  }, [focusId, orders]);

  async function orderAgain(order) {
    const { products } = await api.get(`/stores/${order.storeId}`);
    const byId = new Map(products.map((p) => [p.id, p]));
    const items = {};
    let missing = false;
    for (const i of order.items) {
      if (byId.get(i.productId)?.isAvailable) items[i.productId] = i.quantity;
      else missing = true;
    }
    if (missing) notify(t('someUnavailable'));
    setCart(Object.keys(items).length ? { storeId: order.storeId, items } : null);
    navigate(`/store/${order.storeId}`);
  }

  if (!orders) return <div className="spinner" />;
  const active = orders.filter((o) => ACTIVE_STATUSES.includes(o.status));
  const past = orders.filter((o) => !ACTIVE_STATUSES.includes(o.status));

  return (
    <div className="page">
      <div className="row-between">
        <div>
          <h1>{t('myOrders')}</h1>
          <p className="muted small"><span className="num">{auth.user.phone}</span> · {auth.user.fullName}</p>
        </div>
        <button className="btn btn-small" onClick={() => session.set(null)}>{t('logout')}</button>
      </div>

      {orders.length === 0 && <p className="empty">{t('noOrders')}</p>}

      {active.length > 0 && <h2>{t('activeOrders')}</h2>}
      <div className="stack">
        {active.map((o) => (
          <ActiveOrder key={o.id} order={o} offset={offset} focused={o.id === focusId} onChange={(next) => setOrders((l) => l.map((x) => (x.id === next.id ? next : x)))} />
        ))}
      </div>

      {past.length > 0 && <h2 className="section-title">{t('orderHistory')}</h2>}
      <div className="stack">
        {past.map((o) => (
          <div key={o.id} id={`order-${o.id}`} className={`card ${o.id === focusId ? 'focused' : ''}`}>
            <OrderHeader order={o} />
            <OrderItems order={o} />
            <button className="btn btn-big" onClick={() => orderAgain(o).catch(() => notify(t('err_generic'), 'danger'))}>
              ↻ {t('orderAgain')}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function OrderHeader({ order }) {
  const { t, money } = useI18n();
  const tone = { completed: 'badge-ok', cancelled: 'badge-danger', pending: 'badge-warn' }[order.status] || 'badge-brand';
  return (
    <div className="row-between order-head">
      <div>
        <h3>{order.storeName}</h3>
        <p className="muted small">
          {t('order', { id: order.id })} · <span className="num">{new Date(order.createdAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</span>
        </p>
      </div>
      <div className="stack-end">
        <span className={`badge ${tone}`}>{t(`status_${order.status}`)}</span>
        <span className="num total-small">{money(order.total)}</span>
      </div>
    </div>
  );
}

function OrderItems({ order }) {
  const { name } = useI18n();
  return (
    <ul className="order-items">
      {order.items.map((i) => (
        <li key={i.productId}><span className="num">{i.quantity}×</span> {name(i)}</li>
      ))}
    </ul>
  );
}

function ActiveOrder({ order, offset, focused, onChange }) {
  const { t } = useI18n();
  const now = useNow(1000) + offset;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const remaining = new Date(order.cancellableUntil).getTime() - now;
  const canCancel = order.status === 'pending' && remaining > 0;

  async function cancel() {
    if (!window.confirm(t('cancelConfirm'))) return;
    setBusy(true);
    setError('');
    try {
      const r = await api.post(`/orders/${order.id}/cancel`);
      onChange(r.order);
    } catch (err) {
      setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  const mm = Math.floor(Math.max(0, remaining) / 60000);
  const ss = String(Math.floor((Math.max(0, remaining) % 60000) / 1000)).padStart(2, '0');

  return (
    <div id={`order-${order.id}`} className={`card ${focused ? 'focused' : ''}`}>
      <OrderHeader order={order} />
      <Timeline status={order.status} />
      <OrderItems order={order} />
      <p className="muted small">📍 {order.deliveryAddress}</p>
      {canCancel ? (
        <div className="cancel-box">
          <span className="small"><strong>{t('cancelLeft', { time: `${mm}:${ss}` })}</strong></span>
          <button className="btn btn-danger" disabled={busy} onClick={cancel}>{t('cancelOrder')}</button>
        </div>
      ) : (
        <p className="muted small">🔒 {t('cancelLocked')}</p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

function Timeline({ status }) {
  const { t } = useI18n();
  const current = CUSTOMER_TIMELINE.indexOf(status);
  return (
    <ol className="timeline" aria-label={t(`status_${status}`)}>
      {CUSTOMER_TIMELINE.map((s, i) => (
        <li key={s} className={i < current ? 'done' : i === current ? 'current' : ''} aria-current={i === current ? 'step' : undefined}>
          <span className="dot" />
          <span className="label">{t(`status_${s}`)}</span>
        </li>
      ))}
    </ol>
  );
}
