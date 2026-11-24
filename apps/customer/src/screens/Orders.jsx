import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '@samouna/shared/api';
import { Button, CountdownRing, EmptyState, Icon, Skeleton, useConfirm } from '@samouna/shared/components';
import { ACTIVE_STATUSES, CANCEL_WINDOW_MS, CUSTOMER_TIMELINE } from '@samouna/shared/orders';
import { useI18n, useNow } from '@samouna/shared/react';
import { api, live, whenLabel } from '../lib.js';

const TONE = { completed: 'badge-success', cancelled: 'badge-danger', pending: 'badge-warning' };

export default function Orders({ auth, ...ctx }) {
  const { t } = useI18n();
  if (!auth) {
    return (
      <div className="page">
        <h1 className="screen-title">{t('ordersTab')}</h1>
        <EmptyState icon="bag" title={t('loginRequired')} text={t('loginToSeeOrders')}>
          <div className="stack prompt-actions">
            <a href="#/login/orders" className="btn btn-primary btn-lg btn-block">{t('login')}</a>
            <a href="#/register/orders" className="btn btn-lg btn-block">{t('registerNow')}</a>
          </div>
        </EmptyState>
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
    if (focusId && orders) document.getElementById(`order-${focusId}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
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
    if (missing) notify(t('someUnavailable'), 'danger');
    setCart(Object.keys(items).length ? { storeId: order.storeId, items } : null);
    navigate('/cart');
  }

  if (!orders) {
    return <div className="page"><Skeleton h={30} w="40%" /><div className="stack" style={{ marginTop: 20 }}><Skeleton h={220} r={20} /><Skeleton h={140} r={20} /></div></div>;
  }
  const active = orders.filter((o) => ACTIVE_STATUSES.includes(o.status));
  const past = orders.filter((o) => !ACTIVE_STATUSES.includes(o.status));
  const update = (next) => setOrders((l) => l.map((x) => (x.id === next.id ? next : x)));

  return (
    <div className="page">
      <h1 className="screen-title">{t('ordersTab')}</h1>
      {orders.length === 0 && (
        <EmptyState icon="receipt" title={t('noOrders')}>
          <a href="#/" className="btn btn-primary btn-lg">{t('browseBakeries')}</a>
        </EmptyState>
      )}

      {active.length > 0 && <h2 className="section-title">{t('activeOrders')}</h2>}
      <div className="stack">
        {active.map((o) => <ActiveOrder key={o.id} order={o} offset={offset} focused={o.id === focusId} ask={ask} onChange={update} />)}
      </div>

      {past.length > 0 && <h2 className="section-title">{t('orderHistory')}</h2>}
      <div className="stack">
        {past.map((o) => (
          <article key={o.id} id={`order-${o.id}`} className={`card order-card ${o.id === focusId ? 'focused' : ''}`}>
            <OrderHeader order={o} />
            <OrderItems order={o} />
            <Button className="btn-soft btn-block" onClick={() => orderAgain(o).catch(() => notify(t('err_generic'), 'danger'))}>
              <Icon name="repeat" size={18} />{t('orderAgain')}
            </Button>
          </article>
        ))}
      </div>
      {dialog}
    </div>
  );
}

function OrderHeader({ order }) {
  const { t, money, lang } = useI18n();
  return (
    <div className="order-head">
      <div className="grow">
        <h3>{order.storeName}</h3>
        <p className="muted small">{t('order', { id: order.id })} · <span className="num">{new Date(order.createdAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</span></p>
        {order.scheduledFor && <p className="sched-line"><Icon name="clock" size={15} />{t('scheduledFor', { when: whenLabel(order.scheduledFor, lang, t) })}</p>}
      </div>
      <div className="order-head-end">
        <span className={`badge dot ${TONE[order.status] || 'badge-brand'}`}>{t(`status_${order.status}`)}</span>
        <span className="num order-total">{money(order.total)}</span>
      </div>
    </div>
  );
}

function OrderItems({ order }) {
  const { name } = useI18n();
  return (
    <ul className="order-items">
      {order.items.map((i) => <li key={i.productId}><span className="qty-tag num">{i.quantity}×</span>{name(i)}</li>)}
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

  return (
    <article id={`order-${order.id}`} className={`card order-card active ${focused ? 'focused' : ''}`}>
      <OrderHeader order={order} />
      <Timeline status={order.status} />
      <OrderItems order={order} />
      <p className="muted small row"><Icon name="pin" size={15} />{order.deliveryAddress}</p>
      {canCancel ? (
        <div className="cancel-box">
          <CountdownRing remaining={remaining} total={CANCEL_WINDOW_MS} />
          <div className="grow"><p className="small muted">{t('cancelEndsIn')}</p></div>
          <Button className="btn-danger" loading={busy} onClick={cancel}>{t('cancelOrder')}</Button>
        </div>
      ) : (
        <p className="locked-note"><Icon name="checkCircle" size={16} />{t('cancelLocked')}</p>
      )}
      {error && <div className="form-error" role="alert"><Icon name="alert" size={18} />{error}</div>}
    </article>
  );
}

function Timeline({ status }) {
  const { t } = useI18n();
  const current = CUSTOMER_TIMELINE.indexOf(status);
  const pct = Math.max(0, current) / (CUSTOMER_TIMELINE.length - 1);
  return (
    <div className="timeline">
      <div className="timeline-track" aria-hidden="true"><span style={{ inlineSize: `${pct * 100}%` }} /></div>
      <ol>
        {CUSTOMER_TIMELINE.map((s, i) => (
          <li key={s} className={i < current ? 'done' : i === current ? 'current' : ''} aria-current={i === current ? 'step' : undefined}>
            <span className="dot">{i < current && <Icon name="check" size={12} stroke={3} />}</span>
            <span className="label">{t(`status_${s}`)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
