import { useCallback, useState } from 'react';
import { Icon, OfflineBanner, Toast } from '@samouna/shared/components';
import { useHashRoute, useI18n, useRealtimeConnection, useStoredState } from '@samouna/shared/react';
import { cartCount, live, session, wsUrl } from './lib.js';
import Cart from './screens/Cart.jsx';
import Checkout from './screens/Checkout.jsx';
import Home from './screens/Home.jsx';
import Login from './screens/Login.jsx';
import Orders from './screens/Orders.jsx';
import Register from './screens/Register.jsx';
import Settings from './screens/Settings.jsx';
import StoreMenu from './screens/StoreMenu.jsx';

const TABS = [
  { key: '', href: '#/', icon: 'home', label: 'bakeriesTab' },
  { key: 'cart', href: '#/cart', icon: 'cart', label: 'cartTab' },
  { key: 'orders', href: '#/orders', icon: 'bag', label: 'ordersTab' },
  { key: 'settings', href: '#/settings', icon: 'gear', label: 'settingsTab' },
];

export default function App() {
  const { t } = useI18n();
  const [path, navigate] = useHashRoute();
  const auth = session.useSession();
  const [guest, setGuest] = useStoredState('samouna.guest', false);
  const [cart, setCart] = useStoredState('samouna.cart', null);
  const [delivery, setDelivery] = useStoredState('samouna.delivery', { mode: 'now' });
  const [toast, setToast] = useState(null);
  const status = useRealtimeConnection({ url: wsUrl, token: auth?.token ?? null, hub: live });

  const notify = useCallback((message, tone = 'info') => setToast({ message, tone }), []);
  const clearToast = useCallback(() => setToast(null), []);
  const toastEl = <Toast message={toast?.message} tone={toast?.tone} onDone={clearToast} />;

  const [, section = '', id] = path.split('/');
  const ctx = { navigate, cart, setCart, notify, auth, guest, setGuest, delivery, setDelivery };

  // Signed-out visitors start on Login unless they chose "Browse the app".
  if (!auth && section === 'register') return <><Register {...ctx} returnTo={id} />{toastEl}</>;
  if (!auth && (section === 'login' || !guest)) {
    return <><Login {...ctx} returnTo={section === 'login' ? id : undefined} />{toastEl}</>;
  }

  let screen;
  if (section === 'store' && id) screen = <StoreMenu storeId={Number(id)} {...ctx} />;
  else if (section === 'cart') screen = <Cart {...ctx} />;
  else if (section === 'checkout') screen = <Checkout {...ctx} />;
  else if (section === 'orders') screen = <Orders focusId={id ? Number(id) : null} {...ctx} />;
  else if (section === 'settings') screen = <Settings {...ctx} />;
  else screen = <Home {...ctx} />;

  const activeTab = section === 'store' ? '' : section === 'checkout' ? 'cart' : section;
  const count = cartCount(cart);

  return (
    <>
      <OfflineBanner status={status} />
      <main>{screen}</main>
      <nav className="tabbar" aria-label="Main">
        {TABS.map((tab) => (
          <a key={tab.key} href={tab.href} className={activeTab === tab.key ? 'active' : ''} aria-current={activeTab === tab.key ? 'page' : undefined}>
            <span className="tab-icon">
              <Icon name={tab.icon} size={26} />
              {tab.key === 'cart' && count > 0 && <span className="tab-badge num">{count}</span>}
            </span>
            <span>{t(tab.label)}</span>
          </a>
        ))}
      </nav>
      {toastEl}
    </>
  );
}
