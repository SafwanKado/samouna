import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore,
} from 'react';
import { getLanguage, translate, formatIQD, localizedName } from './i18n.js';
import { connectRealtime } from './realtime.js';

const I18nContext = createContext(null);
const LANG_KEY = 'samouna.lang';

function readLang() {
  try {
    return localStorage.getItem(LANG_KEY);
  } catch {
    return null;
  }
}

/** Provides `t`, `lang`, `setLang` and keeps <html lang dir> in sync. */
export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => readLang());

  const setLang = useCallback((code) => {
    setLangState(code);
    try {
      localStorage.setItem(LANG_KEY, code);
    } catch {
      /* private mode */
    }
  }, []);

  const effective = lang || 'ku';
  useEffect(() => {
    const l = getLanguage(effective);
    document.documentElement.lang = l.htmlLang;
    document.documentElement.dir = l.dir;
  }, [effective]);

  const value = useMemo(
    () => ({
      lang: effective,
      hasChosenLang: Boolean(lang),
      setLang,
      dir: getLanguage(effective).dir,
      t: (key, vars) => translate(effective, key, vars),
      money: (n) => formatIQD(n, effective),
      name: (item) => localizedName(item, effective),
    }),
    [effective, lang, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}

/** Re-renders every `ms` so countdowns and "5 min ago" labels stay fresh. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Persisted state in localStorage, tolerant of private mode. */
export function useStoredState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : JSON.parse(raw);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      if (value === null || value === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [key, value]);
  return [value, setValue];
}

/**
 * A tiny persisted store for the login session (token + user [+ store]).
 * Used outside React by the API client and inside React via the hook.
 */
export function createSessionStore(key) {
  let session = null;
  try {
    session = JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    session = null;
  }
  const listeners = new Set();
  const store = {
    get: () => session,
    set(next) {
      session = typeof next === 'function' ? next(session) : next;
      try {
        if (session) localStorage.setItem(key, JSON.stringify(session));
        else localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
      listeners.forEach((l) => l());
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    useSession: () => useSyncExternalStore(store.subscribe, store.get),
  };
  return store;
}

/** Hash routing ("#/store/3") keeps hosting trivial: no server rewrites needed. */
export function useHashRoute() {
  const read = () => window.location.hash.replace(/^#/, '') || '/';
  const [path, setPath] = useState(read);
  useEffect(() => {
    const on = () => {
      setPath(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const navigate = useCallback((to) => {
    window.location.hash = to;
  }, []);
  return [path, navigate];
}

/** Fan-out of realtime events to whichever screens are mounted. */
export function createLiveHub() {
  const subs = new Set();
  return {
    emit: (e) => subs.forEach((s) => s(e)),
    useLive(handler) {
      const ref = useRef(handler);
      ref.current = handler;
      useEffect(() => {
        const f = (e) => ref.current(e);
        subs.add(f);
        return () => subs.delete(f);
      }, []);
    },
  };
}

/** One socket per app; reconnects re-auth with the current token. */
export function useRealtimeConnection({ url, token, hub }) {
  const [status, setStatus] = useState('connecting');
  useEffect(() => {
    const conn = connectRealtime({
      url,
      getToken: () => token,
      onEvent: hub.emit,
      onStatus: setStatus,
      onReconnect: () => hub.emit({ type: 'reconnected' }),
    });
    return () => conn.close();
  }, [url, token, hub]);
  return status;
}
