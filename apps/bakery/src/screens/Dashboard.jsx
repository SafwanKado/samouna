import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '@samouna/shared/api';
import { LanguageSwitcher, OfflineBanner, Switch, Toast } from '@samouna/shared/components';
import { ACTIVE_STATUSES } from '@samouna/shared/orders';
import { useI18n, useNow, useRealtimeConnection, useStoredState } from '@samouna/shared/react';
import { unlockAudio, useChime, useWakeLock } from '../chime.js';
import { api, live, session, wsUrl } from '../lib.js';

const ACTION = {
  pending: { label: 'accept', className: 'btn-primary' },
  in_oven: { label: 'markReady', className: 'btn-primary' },
  ready: { label: 'handToRunner', className: 'btn-primary' },
  out_for_delivery: { label: 'confirmCash', className: 'btn-ok' },
};

export default function Dashboard({ auth }) {
  const { t } = useI18n();
  const [tab, setTab] = useStoredState('samouna.bakery.tab', 'orders');
  const [store, setStore] = useState(auth.store);
  const [orders, setOrders] = useState(null);
  const [dismissed, setDismissed] = useStoredState('samouna.bakery.dismissed', []);
  const [toast, setToast] = useState(null);
  const status = useRealtimeConnection({ url: wsUrl, token: auth.token, hub: live });
  useWakeLock();

  const loadOrders = useCallback(() => {
    api.get('/bakery/orders').then((r) => setOrders(r.orders)).catch(() => setOrders((o) => o || []));
    api.get('/bakery/store').then((r) => setStore(r.store)).catch(() => {});
  }, []);
  useEffect(loadOrders, [loadOrders]);

  live.useLive((e) => {
    if (e.type === 'reconnected') loadOrders();
    if (e.type === 'order.created' || e.type === 'order.updated') {
      setOrders((list) => {
        if (!list) return list;
        return list.some((o) => o.id === e.order.id)
          ? list.map((o) => (o.id === e.order.id ? e.order : o))
          : [...list, e.order];
      });
    }
    if (e.type === 'store.updated' && e.store.id === store.id) setStore(e.store);
  });

  const pendingCount = orders?.filter((o) => o.status === 'pending').length ?? 0;
  const soundReady = useChime(pendingCount > 0);

  useEffect(() => {
    document.title = pendingCount ? `(${pendingCount}) ${t('newOrder')}` : t('bakeryAppName');
  }, [pendingCount, t]);

  const updateOrder = (o) => setOrders((list) => list.map((x) => (x.id === o.id ? o : x)));

  return (
    <div className={`dash ${pendingCount ? 'has-pending' : ''}`}>
      <header className="dash-top">
        <div className="dash-top-inner">
          <div className="grow">
            <div className="dash-store">{store.name}</div>
            <div className={`small ${store.isActive ? 'text-ok' : 'text-danger'}`}>
              {store.isActive ? t('shopOpen') : t('shopClosed')}
            </div>
          </div>
          <LanguageSwitcher />
        </div>
        <OfflineBanner status={status} />
        {!soundReady && (
          <button className="sound-banner" onClick={unlockAudio}>🔔 {t('enableSound')}</button>
        )}
      </header>

      <main className="dash-main">
        {tab === 'orders' && (
          <OrdersTab
            orders={orders}
            dismissed={dismissed}
            onDismiss={(id) => setDismissed([...dismissed.slice(-50), id])}
            onUpdate={updateOrder}
            onError={(msg) => setToast(msg)}
            reload={loadOrders}
          />
        )}
        {tab === 'menu' && <MenuTab onError={(msg) => setToast(msg)} />}
        {tab === 'shop' && <ShopTab store={store} setStore={setStore} onError={(msg) => setToast(msg)} />}
      </main>

      <nav className="tabbar">
        {['orders', 'menu', 'shop'].map((k) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
            {t(`${k}Tab`)}
            {k === 'orders' && pendingCount > 0 && <span className="tab-count num">{pendingCount}</span>}
          </button>
        ))}
      </nav>
      <Toast message={toast} tone="danger" onDone={() => setToast(null)} />
    </div>
  );
}

function OrdersTab({ orders, dismissed, onDismiss, onUpdate, onError, reload }) {
  const { t } = useI18n();
  if (!orders) return <div className="spinner" />;

  const order = { pending: 0, in_oven: 1, ready: 2, out_for_delivery: 3 };
  const cancelled = orders.filter((o) => o.status === 'cancelled' && !dismissed.includes(o.id));
  const active = orders
    .filter((o) => ACTIVE_STATUSES.includes(o.status))
    .sort((a, b) => order[a.status] - order[b.status] || new Date(a.createdAt) - new Date(b.createdAt));

  if (!cancelled.length && !active.length) return <p className="empty big-empty">🍞 {t('noActiveOrders')}</p>;

  return (
    <div className="ticket-grid">
      {cancelled.map((o) => (
        <Ticket key={o.id} order={o} onDismiss={() => onDismiss(o.id)} />
      ))}
      {active.map((o) => (
        <Ticket key={o.id} order={o} onUpdate={onUpdate} onError={onError} reload={reload} />
      ))}
    </div>
  );
}

function Ticket({ order, onUpdate, onError, onDismiss, reload }) {
  const { t, money, name } = useI18n();
  const now = useNow(30_000);
  const [busy, setBusy] = useState(false);
  const minutes = Math.max(0, Math.floor((now - new Date(order.createdAt).getTime()) / 60000));
  const action = ACTION[order.status];

  async function run(fn) {
    setBusy(true);
    try {
      onUpdate((await fn()).order);
    } catch (err) {
      onError(errorMessage(t, err));
      if (err.status === 409) reload();
    } finally {
      setBusy(false);
    }
  }

  const advance = () => run(() => api.post(`/bakery/orders/${order.id}/advance`, { from: order.status }));
  const reject = () => {
    if (window.confirm(t('rejectConfirm'))) run(() => api.post(`/bakery/orders/${order.id}/reject`));
  };

  const isCancelled = order.status === 'cancelled';
  return (
    <article className={`ticket status-${order.status}`}>
      <div className="row-between">
        <div className="ticket-id">#{order.id}</div>
        <div className="small muted">{minutes < 1 ? t('justNow') : t('minutesAgo', { n: minutes })}</div>
      </div>

      {order.status === 'pending' && <div className="ticket-flag">🔔 {t('newOrder')}</div>}
      {isCancelled && (
        <div className="ticket-flag cancelled">
          ✖ {order.cancelledBy === 'customer' ? t('cancelledByCustomer') : t('cancelledByBakery')}
        </div>
      )}
      {!isCancelled && order.status !== 'pending' && (
        <span className="badge badge-brand">{t(`status_${order.status}`)}</span>
      )}

      <ul className="ticket-items">
        {order.items.map((i) => (
          <li key={i.productId}>
            <span className="ticket-qty num">{i.quantity}×</span> {name(i)}
          </li>
        ))}
      </ul>
      {order.notes && <p className="ticket-notes">📝 {order.notes}</p>}

      <div className="ticket-customer">
        <div className="grow">
          <strong>{order.customerName}</strong>
          <div className="small">📍 {order.deliveryAddress}</div>
        </div>
        <a className="btn btn-small" href={`tel:${order.customerPhone}`}>📞 {t('call')}</a>
      </div>

      <div className="row-between ticket-total">
        <span>{t('total')}</span>
        <strong className="num">{money(order.total)}</strong>
      </div>

      {isCancelled ? (
        <button className="btn btn-big" onClick={onDismiss}>{t('dismiss')}</button>
      ) : (
        <div className="stack">
          <button className={`btn btn-big btn-xl ${action.className}`} disabled={busy} onClick={advance}>
            {t(action.label)}
          </button>
          {order.status === 'pending' && (
            <button className="btn-link danger-link" disabled={busy} onClick={reject}>{t('reject')}</button>
          )}
        </div>
      )}
    </article>
  );
}

function MenuTab({ onError }) {
  const { t, money, name } = useI18n();
  const [products, setProducts] = useState(null);

  useEffect(() => {
    api.get('/bakery/products').then((r) => setProducts(r.products)).catch(() => setProducts([]));
  }, []);

  async function toggle(p, isAvailable) {
    setProducts((list) => list.map((x) => (x.id === p.id ? { ...x, isAvailable } : x)));
    try {
      await api.patch(`/bakery/products/${p.id}`, { isAvailable });
    } catch (err) {
      setProducts((list) => list.map((x) => (x.id === p.id ? p : x)));
      onError(errorMessage(t, err));
    }
  }

  if (!products) return <div className="spinner" />;
  return (
    <ul className="stock-list">
      {products.map((p) => (
        <li key={p.id} className={`stock-item ${p.isAvailable ? '' : 'off'}`}>
          <div className="grow">
            <div className="stock-name">{name(p)}</div>
            <div className="small muted num">{money(p.price)}</div>
          </div>
          <span className={`badge ${p.isAvailable ? 'badge-ok' : 'badge-muted'}`}>
            {p.isAvailable ? t('inStock') : t('soldOut')}
          </span>
          <Switch checked={p.isAvailable} label={name(p)} onChange={(v) => toggle(p, v)} />
        </li>
      ))}
    </ul>
  );
}

function ShopTab({ store, setStore, onError }) {
  const { t, money } = useI18n();
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get('/bakery/summary').then(setSummary).catch(() => {});
  }, []);
  useEffect(load, [load]);
  live.useLive((e) => {
    if (e.type === 'order.updated' && e.order.status === 'completed') load();
  });

  async function setOpen(isActive) {
    setBusy(true);
    try {
      setStore((await api.patch('/bakery/store', { isActive })).store);
    } catch (err) {
      onError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className={`card shop-toggle ${store.isActive ? 'is-open' : 'is-closed'}`}>
        <div className="grow">
          <h2>{store.isActive ? t('open') : t('closed')}</h2>
          <p className="muted">{store.isActive ? t('shopOpen') : t('shopClosed')}</p>
        </div>
        <Switch checked={store.isActive} disabled={busy} label={t('shopTab')} onChange={setOpen} />
      </div>

      <div className="card cash-card">
        <div className="muted">{t('todaysCash')}</div>
        <div className="cash-amount num">{summary ? money(summary.today.cash) : '—'}</div>
        <div className="muted small">
          {t('completedToday')}: <span className="num">{summary?.today.orders ?? '—'}</span>
        </div>
      </div>

      {summary?.last7Days?.length > 0 && (
        <div className="card">
          <div className="row-between">
            <h3>{t('last7Days')}</h3>
            <strong className="num">{money(summary.weekTotal)}</strong>
          </div>
          <table className="days">
            <tbody>
              {summary.last7Days.map((d) => (
                <tr key={d.date}>
                  <td className="num">{d.date}</td>
                  <td className="num">{d.orders}</td>
                  <td className="num">{money(d.cash)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button className="btn btn-big" onClick={() => session.set(null)}>{t('logout')}</button>
    </div>
  );
}
