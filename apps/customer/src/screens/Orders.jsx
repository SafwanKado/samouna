import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '@samouna/shared/api';
import { Icon, useConfirm } from '@samouna/shared/components';
import { ACTIVE_STATUSES, CUSTOMER_TIMELINE } from '@samouna/shared/orders';
import { useI18n, useNow } from '@samouna/shared/react';
import { api, live, whenLabel } from '../lib.js';

export default function Orders({ auth, ...ctx }) {
  const { t } = useI18n();
  if (!auth) {
    return (
      <div className="page">
        <h2 className="screen-title">{t('ordersTab')}</h2>
        <div className="cart-empty">
          <Icon name="bag" size={96} stroke={2} className="cart-empty-icon" />
          <h2>{t('loginRequired')}</h2>
          <p className="muted">{t('loginToSeeOrders')}</p>
          <div className="stack prompt-actions">
            <a href="#/login/orders" className="btn btn-primary btn-big">{t('login')}</a>
            <a href="#/register/orders" className="btn btn-outline-accent btn-big">{t('registerNow')}</a>
          </div>
        </div>
      </div>
    );
  }
  return <OrderList {...ctx} />;
}

function OrderList({ focusId, setCart, navigate, notify }) {
  const { t } = useI18n();
  const [orders, setOrders] = useState(null);
  const [offset, setOffset] = useState(0); // server clock - device clock
  const [ask, dialog] = useConfirm();

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
        return list.some((o) => o.id === e.order.id) ? list.map((o) => (o.id === e.order.id ? e.order : o)) : [e.order, ...list];
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
    navigate('/cart');
  }

  if (!orders) return <div className="spinner" />;
  const active = orders.filter((o) => ACTIVE_STATUSES.includes(o.status));
  const past = orders.filter((o) => !ACTIVE_STATUSES.includes(o.status));
  const update = (next) => setOrders((l) => l.map((x) => (x.id === next.id ? next : x)));

  return (
    <div className="page">
      <h2 className="screen-title">{t('ordersTab')}</h2>
      {orders.length === 0 && (
        <div className="cart-empty">
          <Icon name="bag" size={96} stroke={2} className="cart-empty-icon" />
          <h2>{t('noOrders')}</h2>
          <a href="#/" className="btn btn-outline-accent">{t('browseBakeries')}</a>
        </div>
      )}

      {active.length > 0 && <h3 className="section-title">{t('activeOrders')}</h3>}
      <div className="stack">
        {active.map((o) => <ActiveOrder key={o.id} order={o} offset={offset} focused={o.id === focusId} ask={ask} onChange={update} />)}
      </div>

      {past.length > 0 && <h3 className="section-title">{t('orderHistory')}</h3>}
      <div className="stack">
        {past.map((o) => (
          <div key={o.id} id={`order-${o.id}`} className={`card order-card ${o.id === focusId ? 'focused' : ''}`}>
            <OrderHeader order={o} />
            <OrderItems order={o} />
            <button className="btn btn-outline-accent btn-big" onClick={() => orderAgain(o).catch(() => notify(t('err_generic'), 'danger'))}>
              {t('orderAgain')}
            </button>
          </div>
        ))}
      </div>
      {dialog}
    </div>
  );
}

function OrderHeader({ order }) {
  const { t, money, lang } = useI18n();
  const tone = { completed: 'badge-ok', cancelled: 'badge-danger', pending: 'badge-warn' }[order.status] || 'badge-brand';
  return (
    <div className="order-head">
      <div className="grow">
        <h3>{order.storeName}</h3>
        <p className="muted small">
          {t('order', { id: order.id })} · <span className="num">{new Date(order.createdAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</span>
        </p>
        {order.scheduledFor && (
          <p className="small sched-line"><Icon name="clock" size={16} />{t('scheduledFor', { when: whenLabel(order.scheduledFor, lang, t) })}</p>
        )}
      </div>
      <div className="stack-end">
        <span className={`badge ${tone}`}>{t(`status_${order.status}`)}</span>
        <span className="num text-price total-small">{money(order.total)}</span>
      </div>
    </div>
  );
}

function OrderItems({ order }) {
  const { name } = useI18n();
  return (
    <ul className="order-items">
      {order.items.map((i) => <li key={i.productId}><span className="num muted">{i.quantity}×</span> {name(i)}</li>)}
    </ul>
  );
}

function ActiveOrder({ order, offset, focused, ask, onChange }) {
  const { t } = useI18n();
  const now = useNow(1000) + offset;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const remaining = new Date(order.cancellableUntil).getTime() - now;
  const canCancel = order.status === 'pending' && remaining > 0;

  async function cancel() {
    const ok = await ask({ icon: 'x', tone: 'danger', title: t('cancelOrder'), message: t('cancelConfirm'), confirmLabel: t('cancelOrder'), cancelLabel: t('no') });
    if (!ok) return;
    setBusy(true);
    setError('');
    try {
      onChange((await api.post(`/orders/${order.id}/cancel`)).order);
    } catch (err) {
      setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  const mm = Math.floor(Math.max(0, remaining) / 60000);
  const ss = String(Math.floor((Math.max(0, remaining) % 60000) / 1000)).padStart(2, '0');

  return (
    <div id={`order-${order.id}`} className={`card order-card ${focused ? 'focused' : ''}`}>
      <OrderHeader order={order} />
      <Timeline status={order.status} />
      <OrderItems order={order} />
      <p className="muted small row"><Icon name="pin" size={16} />{order.deliveryAddress}</p>
      {canCancel ? (
        <div className="cancel-box">
          <span className="small"><strong>{t('cancelLeft', { time: `${mm}:${ss}` })}</strong></span>
          <button className="btn btn-danger" disabled={busy} onClick={cancel}>{t('cancelOrder')}</button>
        </div>
      ) : (
        <p className="muted small">{t('cancelLocked')}</p>
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
