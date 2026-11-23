import { useCallback, useState } from 'react';
import { LanguagePicker, LanguageSwitcher, OfflineBanner, Toast } from '@samouna/shared/components';
import { useHashRoute, useI18n, useRealtimeConnection, useStoredState } from '@samouna/shared/react';
import { live, session, wsUrl } from './lib.js';
import Checkout from './screens/Checkout.jsx';
import Home from './screens/Home.jsx';
import Orders from './screens/Orders.jsx';
import StoreMenu from './screens/StoreMenu.jsx';

export default function App() {
  const { t, hasChosenLang } = useI18n();
  const [path, navigate] = useHashRoute();
  const auth = session.useSession();
  const [cart, setCart] = useStoredState('samouna.cart', null);
  const [toast, setToast] = useState(null);
  const status = useRealtimeConnection({ url: wsUrl, token: auth?.token ?? null, hub: live });

  const notify = useCallback((message, tone = 'info') => setToast({ message, tone }), []);
  const clearToast = useCallback(() => setToast(null), []);

  if (!hasChosenLang) return <LanguagePicker title={t('appName')} />;

  const [, section, id] = path.split('/');
  const ctx = { navigate, cart, setCart, notify, auth };

  let screen;
  if (section === 'store' && id) screen = <StoreMenu storeId={Number(id)} {...ctx} />;
  else if (section === 'checkout') screen = <Checkout {...ctx} />;
  else if (section === 'orders') screen = <Orders focusId={id ? Number(id) : null} {...ctx} />;
  else screen = <Home {...ctx} />;

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <a href="#/" className="brand">
            <img src="/icons/icon-192.png" alt="" width="32" height="32" />
            <span>{t('appName')}</span>
          </a>
          <div className="row">
            <LanguageSwitcher />
            <a href="#/orders" className="btn btn-small" aria-label={t('myOrders')}>
              {t('myOrders')}
            </a>
          </div>
        </div>
        <OfflineBanner status={status} />
      </header>
      <main>{screen}</main>
      <Toast message={toast?.message} tone={toast?.tone} onDone={clearToast} />
    </>
  );
}
