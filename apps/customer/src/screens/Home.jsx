import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@samouna/shared/components';
import { useI18n } from '@samouna/shared/react';
import { api, live } from '../lib.js';

export default function Home({ auth }) {
  const { t, money } = useI18n();
  const [stores, setStores] = useState(null);

  const load = useCallback(() => {
    api.get('/stores').then((r) => setStores(r.stores)).catch(() => setStores((s) => s || []));
  }, []);
  useEffect(load, [load]);

  live.useLive((e) => {
    if (e.type === 'store.updated') setStores((list) => list?.map((s) => (s.id === e.store.id ? e.store : s)));
    if (e.type === 'reconnected') load();
  });

  return (
    <div className="page">
      <header className="screen-head">
        <div>
          <p className="muted greet">{auth ? t('welcomeName', { name: auth.user.fullName.split(' ')[0] }) : t('welcome')}</p>
          <h1>{t('bakeriesInSharya')}</h1>
        </div>
        <span className="city-pill"><Icon name="pin" size={18} />{t('sharya')}</span>
      </header>

      {!stores && <div className="spinner" />}
      {stores?.length === 0 && <p className="empty">{t('noBakeries')}</p>}

      <div className="stack">
        {stores?.map((s) => (
          <a key={s.id} href={`#/store/${s.id}`} className={`card store-card ${s.isActive ? '' : 'is-closed'}`}>
            <div className="store-thumb" aria-hidden="true"><Icon name="bread" size={34} stroke={1.8} /></div>
            <div className="grow">
              <div className="row-between">
                <h3>{s.name}</h3>
                <span className={`badge ${s.isActive ? 'badge-ok' : 'badge-muted'}`}>{s.isActive ? t('open') : t('closed')}</span>
              </div>
              <p className="muted small store-addr">{s.address}</p>
              <p className="small">
                <span className="muted">{t('deliveryFee')}: </span>
                {s.deliveryFee ? <span className="num text-price">{money(s.deliveryFee)}</span> : <span className="text-accent">{t('free')}</span>}
              </p>
            </div>
            <Icon name="chevronEnd" size={20} className="muted" flip />
          </a>
        ))}
      </div>
    </div>
  );
}
