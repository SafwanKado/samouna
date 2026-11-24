import { useState } from 'react';
import { ConfirmDialog, EmptyState, Icon, Segmented, Skeleton, useConfirm } from '@samouna/shared/components';
import { useI18n, useNow } from '@samouna/shared/react';
import { cartLines, cartSubtotal, dayLabel, normalizeSchedule, scheduleDays, setCartQty, timeSlots } from '../lib.js';
import { ProductThumb, Stepper, useStore } from './StoreMenu.jsx';

export default function Cart({ cart, setCart, notify, auth, navigate, delivery, setDelivery }) {
  const { t, money, name, lang } = useI18n();
  const { data } = useStore(cart?.storeId, { cart, setCart, notify });
  const [ask, confirmDialog] = useConfirm();
  const [needLogin, setNeedLogin] = useState(false);
  useNow(60_000); // keep schedule slots current

  if (!cart) {
    return (
      <div className="page">
        <h1 className="screen-title">{t('shoppingCart')}</h1>
        <EmptyState icon="cart" title={t('cartEmpty')} text={t('cartEmptyHint')}>
          <a href="#/" className="btn btn-primary btn-lg">{t('browseBakeries')}<Icon name="arrowEnd" size={20} flip /></a>
        </EmptyState>
      </div>
    );
  }
  if (!data) return <div className="page"><Skeleton h={30} w="50%" /><div className="stack" style={{ marginTop: 20 }}><Skeleton h={130} r={20} /><Skeleton h={260} r={24} /></div></div>;

  const { store, products } = data;
  const lines = cartLines(cart, products);
  const subtotal = cartSubtotal(lines);
  const total = subtotal + (lines.length ? store.deliveryFee : 0);
  const sched = normalizeSchedule(delivery);
  const days = scheduleDays();
  const slots = sched.day ? timeSlots(sched.day) : [];

  function setQty(p, q) {
    const before = cart;
    setCart(setCartQty(cart, cart.storeId, p.id, q));
    if (q <= 0) notify(t('itemRemoved', { name: name(p) }), 'info', { label: t('undo'), onClick: () => setCart(before) });
  }

  async function clearAll() {
    const ok = await ask({ icon: 'trash', tone: 'danger', title: t('clearCart'), message: t('clearCartConfirm'), confirmLabel: t('clearCart') });
    if (!ok) return;
    const before = cart;
    setCart(null);
    notify(t('clearCart'), 'info', { label: t('undo'), onClick: () => setCart(before) });
  }

  function proceed() {
    if (!auth) return setNeedLogin(true);
    if (sched.mode === 'schedule' && !sched.time) return notify(t('err_schedule_invalid'), 'danger');
    setDelivery(sched);
    navigate('/checkout');
  }

  return (
    <div className="page">
      <div className="row-between">
        <h1 className="screen-title">{t('shoppingCart')}</h1>
        <button type="button" className="icon-btn" aria-label={t('clearCart')} onClick={clearAll}><Icon name="trash" size={20} /></button>
      </div>
      <a href={`#/store/${store.id}`} className="from-store"><Icon name="store" size={16} />{t('from', { store: store.name })}<Icon name="chevronEnd" size={16} flip /></a>

      <ul className="cart-list">
        {lines.map(({ product: p, quantity }) => (
          <li key={p.id} className="card cart-item rise">
            <ProductThumb product={p} size="lg" />
            <div className="grow cart-item-body">
              <div className="row-between">
                <h3>{name(p)}</h3>
                <button type="button" className="icon-btn danger" aria-label={`${t('remove')} ${name(p)}`} onClick={() => setQty(p, 0)}><Icon name="x" size={18} /></button>
              </div>
              <p className="muted small">{t('perUnit', { price: money(p.price) })}</p>
              <div className="row-between cart-item-foot">
                <Stepper value={quantity} label={name(p)} onChange={(v) => setQty(p, v)} />
                <span className="num line-total">{money(p.price * quantity)}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <section className="card summary" aria-label={t('orderSummary')}>
        <Segmented
          tone="brand"
          label={t('deliveryDetails')}
          value={sched.mode}
          onChange={(mode) => setDelivery({ ...sched, mode })}
          options={[{ value: 'now', label: t('orderNow'), icon: 'bolt' }, { value: 'schedule', label: t('scheduleOrder'), icon: 'clock' }]}
        />
        {sched.mode === 'schedule' && (
          <div className="schedule rise">
            <p className="eyebrow">{t('chooseDay')}</p>
            <div className="chip-row" role="radiogroup" aria-label={t('chooseDay')}>
              {days.map((d) => (
                <button key={d.key} type="button" role="radio" className="chip day-chip" aria-checked={d.key === sched.day}
                  onClick={() => setDelivery({ ...sched, day: d.key, time: timeSlots(d.key)[0] })}>
                  {dayLabel(d.date, lang, t)}
                </button>
              ))}
            </div>
            <p className="eyebrow">{t('chooseTime')}</p>
            <div className="slot-grid" role="radiogroup" aria-label={t('chooseTime')}>
              {slots.map((s) => (
                <button key={s} type="button" role="radio" className="chip slot" aria-checked={s === sched.time} onClick={() => setDelivery({ ...sched, time: s })}>
                  <span className="num">{s}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <dl className="totals">
          <div><dt>{t('subtotal')}</dt><dd className="num">{money(subtotal)}</dd></div>
          <div><dt>{t('deliveryFee')}</dt><dd className="num">{store.deliveryFee ? money(store.deliveryFee) : t('free')}</dd></div>
          <div className="grand"><dt>{t('total')}</dt><dd className="num">{money(total)}</dd></div>
        </dl>
        <button type="button" className="btn btn-primary btn-lg btn-block" disabled={!lines.length || !store.isActive} onClick={proceed}>
          {t('proceedToCheckout')}<Icon name="arrowEnd" size={20} flip />
        </button>
        {!store.isActive && <p className="small text-danger">{t('closedNow')}</p>}
      </section>

      <ConfirmDialog open={needLogin} icon="login" title={t('loginRequired')} message={t('loginRequiredText')} confirmLabel={t('login')}
        onCancel={() => setNeedLogin(false)} onConfirm={() => { setNeedLogin(false); navigate('/login/cart'); }} />
      {confirmDialog}
    </div>
  );
}
