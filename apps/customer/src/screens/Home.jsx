import { useCallback, useEffect, useMemo, useState } from 'react';
import { Chip, EmptyState, Icon, LanguageMenu, SearchField, Skeleton } from '@samouna/shared/components';
import { useI18n } from '@samouna/shared/react';
import { api, live, LOGO } from '../lib.js';

const FILTERS = ['all', 'open', 'free'];

export default function Home({ auth }) {
  const { t, money } = useI18n();
  const [stores, setStores] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  const load = useCallback(() => {
    api.get('/stores').then((r) => setStores(r.stores)).catch(() => setStores((s) => s || []));
  }, []);
  useEffect(load, [load]);

  live.useLive((e) => {
    if (e.type === 'store.updated') setStores((list) => list?.map((s) => (s.id === e.store.id ? e.store : s)));
    if (e.type === 'reconnected') load();
  });

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (stores || []).filter((s) =>
      (!q || s.name.toLowerCase().includes(q) || s.address.toLowerCase().includes(q))
      && (filter !== 'open' || s.isActive)
      && (filter !== 'free' || s.deliveryFee === 0));
  }, [stores, query, filter]);

  return (
    <div className="page">
      <header className="topbar">
        <div className="row">
          <img src={LOGO} alt="" width="36" height="36" className="topbar-logo" />
          <span className="topbar-word" dir="ltr">Samouna</span>
        </div>
        <LanguageMenu compact />
      </header>

      <section className="hero rise">
        <p className="eyebrow row"><Icon name="pin" size={15} />{t('sharya')}</p>
        <h1>{auth ? t('welcomeName', { name: auth.user.fullName.split(' ')[0] }) : t('welcome')}</h1>
      </section>

      <div className="sticky-tools">
        <SearchField id="store-search" value={query} onChange={setQuery} placeholder={t('searchBakeries')} />
        <div className="chip-row" role="group" aria-label={t('bakeriesInSharya')}>
          {FILTERS.map((f) => (
            <Chip key={f} selected={filter === f} onClick={() => setFilter(f)} icon={{ open: 'clock', free: 'truck' }[f]}>
              {t({ all: 'filterAll', open: 'openNow', free: 'freeDelivery' }[f])}
            </Chip>
          ))}
        </div>
      </div>

      <h2 className="section-title">{t('bakeriesInSharya')}</h2>

      {!stores && (
        <div className="stack">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card store-card" aria-hidden="true">
              <Skeleton w={72} h={72} r={18} />
              <div className="grow stack" style={{ gap: 8 }}><Skeleton w="60%" h={18} /><Skeleton w="85%" h={14} /><Skeleton w="40%" h={14} /></div>
            </div>
          ))}
        </div>
      )}

      {stores && shown.length === 0 && (
        <EmptyState icon="search" title={query ? t('noResults', { q: query }) : t('noBakeries')}>
          {(query || filter !== 'all') && <button type="button" className="btn btn-soft" onClick={() => { setQuery(''); setFilter('all'); }}>{t('clearSearch')}</button>}
        </EmptyState>
      )}

      <div className="stack">
        {shown.map((s, i) => (
          <a key={s.id} href={`#/store/${s.id}`} className={`card card-link store-card rise ${s.isActive ? '' : 'is-closed'}`} style={{ animationDelay: `${i * 40}ms` }}>
            <div className="store-thumb" aria-hidden="true"><Icon name="bread" size={32} stroke={1.8} /></div>
            <div className="grow store-info">
              <h3>{s.name}</h3>
              <p className="muted small row store-addr"><Icon name="pin" size={14} /><span>{s.address}</span></p>
              <div className="row store-meta">
                <span className={`badge dot ${s.isActive ? 'badge-success' : 'badge-muted'}`}>{s.isActive ? t('open') : t('closed')}</span>
                <span className="badge badge-muted"><Icon name="truck" size={14} />{s.deliveryFee ? <span className="num">{money(s.deliveryFee)}</span> : t('free')}</span>
              </div>
            </div>
            <Icon name="chevronEnd" size={20} className="muted" flip />
          </a>
        ))}
      </div>
    </div>
  );
}
