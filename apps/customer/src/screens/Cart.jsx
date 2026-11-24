import { useState } from 'react';
import { ConfirmDialog, Icon, useConfirm } from '@samouna/shared/components';
import { useI18n, useNow } from '@samouna/shared/react';
import { cartLines, cartSubtotal, dayLabel, normalizeSchedule, scheduleDays, setCartQty, timeSlots } from '../lib.js';
import { ProductThumb, QtyControl, useStore } from './StoreMenu.jsx';

export default function Cart({ cart, setCart, notify, auth, navigate, delivery, setDelivery }) {
  const { t, money, name, lang } = useI18n();
  const { data } = useStore(cart?.storeId, { cart, setCart, notify });
  const [ask, confirmDialog] = useConfirm();
  const [needLogin, setNeedLogin] = useState(false);
  useNow(60_000); // keep schedule slots current

  if (!cart) {
    return (
      <div className="page">
        <h2 className="screen-title">{t('shoppingCart')}</h2>
        <div className="cart-empty">
          <Icon name="cart" size={120} stroke={2.2} className="cart-empty-icon" />
          <h2>{t('cartEmpty')}</h2>
          <p className="muted">{t('cartEmptyHint')}</p>
          <a href="#/" className="btn btn-outline-accent">{t('browseBakeries')}</a>
        </div>
      </div>
    );
  }
  if (!data) return <div className="spinner" />;

  const { store, products } = data;
  const lines = cartLines(cart, products);
  const subtotal = cartSubtotal(lines);
  const total = subtotal + (lines.length ? store.deliveryFee : 0);
  const sched = normalizeSchedule(delivery);
  const days = scheduleDays();
  const slots = sched.day ? timeSlots(sched.day) : [];
  const setQty = (id, q) => setCart(setCartQty(cart, cart.storeId, id, q));

  async function clearAll() {
    if (await ask({ icon: 'clearList', tone: 'danger', title: t('clearCart'), message: t('clearCartConfirm'), confirmLabel: t('clearCart') })) setCart(null);
  }

  function proceed() {
    if (!auth) return setNeedLogin(true);
    if (sched.mode === 'schedule' && !sched.time) return notify(t('err_schedule_invalid'), 'danger');
    setDelivery(sched);
    navigate('/checkout');
  }

  return (
    <div className="page cart-page">
      <div className="row-between">
        <h2 className="screen-title">{t('shoppingCart')}</h2>
        <button type="button" className="icon-btn plain" aria-label={t('clearCart')} onClick={clearAll}><Icon name="clearList" size={28} /></button>
      </div>
      <p className="muted small cart-from"><Icon name="store" size={16} />{t('from', { store: store.name })}</p>

      <div className="stack">
        {lines.map(({ product: p, quantity }) => (
          <div key={p.id} className="card cart-item">
            <ProductThumb product={p} size="lg" />
            <div className="grow cart-item-body">
              <div className="row-between cart-item-head">
                <h3>{name(p)}</h3>
                <button type="button" className="icon-btn danger" aria-label={`${t('remove')} ${name(p)}`} onClick={() => setQty(p.id, 0)}><Icon name="x" size={20} /></button>
              </div>
              <p className="muted">{t('perUnit', { price: money(p.price) })}</p>
              <QtyControl value={quantity} onChange={(v) => setQty(p.id, v)} />
              <p className="cart-item-total"><span className="muted">{t('itemTotal')}</span><span className="num text-price">{money(p.price * quantity)}</span></p>
            </div>
          </div>
        ))}
      </div>

      <section className="summary-card" aria-label={t('orderSummary')}>
        {store.deliveryFee > 0 && (
          <div className="row-between muted small"><span>{t('deliveryFee')}</span><span className="num">{money(store.deliveryFee)}</span></div>
        )}
        <div className="row-between summary-total">
          <span>{t('total')}</span>
          <span className="num text-price">{money(total)}</span>
        </div>
        <div className="mode-toggle" role="radiogroup" aria-label={t('deliveryDetails')}>
          <button type="button" role="radio" aria-checked={sched.mode === 'now'} className={sched.mode === 'now' ? 'on' : ''} onClick={() => setDelivery({ ...sched, mode: 'now' })}>
            <Icon name="bolt" size={20} />{t('orderNow')}
          </button>
          <button type="button" role="radio" aria-checked={sched.mode === 'schedule'} className={sched.mode === 'schedule' ? 'on' : ''} onClick={() => setDelivery({ ...sched, mode: 'schedule' })}>
            <Icon name="clock" size={20} />{t('scheduleOrder')}
          </button>
        </div>
        {sched.mode === 'schedule' && (
          <div className="schedule-row">
            <label className="field">
              {t('deliveryDay')}
              <select id="sched-day" value={sched.day} onChange={(e) => setDelivery({ ...sched, day: e.target.value, time: timeSlots(e.target.value)[0] })}>
                {days.map((d) => <option key={d.key} value={d.key}>{dayLabel(d.date, lang, t)}</option>)}
              </select>
            </label>
            <label className="field">
              {t('deliveryTime')}
              <select id="sched-time" value={sched.time} onChange={(e) => setDelivery({ ...sched, time: e.target.value })} dir="ltr">
                {slots.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>
        )}
        <button type="button" className="btn btn-primary btn-big checkout-btn" disabled={!lines.length || !store.isActive} onClick={proceed}>
          <Icon name="card" size={24} />{t('proceedToCheckout')}
        </button>
        {!store.isActive && <p className="small text-danger">{t('closedNow')}</p>}
      </section>

      <ConfirmDialog
        open={needLogin}
        icon="login"
        title={t('loginRequired')}
        message={t('loginRequiredText')}
        confirmLabel={t('login')}
        onCancel={() => setNeedLogin(false)}
        onConfirm={() => { setNeedLogin(false); navigate('/login/cart'); }}
      />
      {confirmDialog}
    </div>
  );
}
