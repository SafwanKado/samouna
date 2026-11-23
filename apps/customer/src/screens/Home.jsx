import { useCallback, useEffect, useState } from 'react';
import { CITIES } from '@samouna/shared/orders';
import { useI18n, useStoredState } from '@samouna/shared/react';
import { api, live } from '../lib.js';

export default function Home() {
  const { t, money } = useI18n();
  const [city, setCity] = useStoredState('samouna.city', 'duhok');
  const [stores, setStores] = useState(null);

  const load = useCallback(() => {
    api.get(`/stores?city=${city}`).then((r) => setStores(r.stores)).catch(() => setStores((s) => s || []));
  }, [city]);

  useEffect(() => {
    setStores(null);
    load();
  }, [load]);

  live.useLive((e) => {
    if (e.type === 'store.updated') {
      setStores((list) => list?.map((s) => (s.id === e.store.id ? e.store : s)));
    }
    if (e.type === 'reconnected') load();
  });

  return (
    <div className="page">
      <div className="segmented" role="tablist">
        {CITIES.map((c) => (
          <button key={c} role="tab" aria-selected={c === city} className={c === city ? 'active' : ''} onClick={() => setCity(c)}>
            {t(c)}
          </button>
        ))}
      </div>

      <h1>{t('bakeriesIn', { city: t(city) })}</h1>

      {!stores && <div className="spinner" />}
      {stores?.length === 0 && <p className="empty">{t('noBakeries')}</p>}

      <div className="stack">
        {stores?.map((s) => (
          <a key={s.id} href={`#/store/${s.id}`} className={`card store-card ${s.isActive ? '' : 'is-closed'}`}>
            <div className="store-avatar" aria-hidden="true">{s.name.slice(0, 1)}</div>
            <div className="grow">
              <div className="row-between">
                <h3>{s.name}</h3>
                <span className={`badge ${s.isActive ? 'badge-ok' : 'badge-muted'}`}>
                  {s.isActive ? t('open') : t('closed')}
                </span>
              </div>
              <p className="muted small">{s.address}</p>
              <p className="small">
                {t('deliveryFee')}: {s.deliveryFee ? <span className="num">{money(s.deliveryFee)}</span> : t('free')}
              </p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
