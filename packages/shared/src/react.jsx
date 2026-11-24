import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore,
} from 'react';
import { getLanguage, translate, formatIQD, localizedName } from './i18n.js';
import { connectRealtime } from './realtime.js';

const I18nContext = createContext(null);
const ThemeContext = createContext({ theme: 'system', setTheme: () => {} });

/**
 * Appearance: 'system' follows the phone; 'light' / 'dark' pin it.
 * Sets <html data-theme> and keeps the browser's theme-color in step.
 */
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useStoredState('samouna.theme', 'system');
  useEffect(() => {
    const el = document.documentElement;
    if (theme === 'light' || theme === 'dark') el.setAttribute('data-theme', theme);
    else el.removeAttribute('data-theme');
    const bg = getComputedStyle(document.body || el).getPropertyValue('--bg').trim();
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      if (theme === 'system') m.setAttribute('content', m.dataset.default || m.getAttribute('content'));
      else { m.dataset.default ??= m.getAttribute('content'); if (bg) m.setAttribute('content', bg); }
    });
  }, [theme]);
  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
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
  // Persist inside the setter, not in an effect: a component that saves and
  // then unmounts in the same tick (e.g. checkout -> order page) still saves.
  const latest = useRef(value);
  latest.current = value;
  const set = useCallback((next) => {
    const v = typeof next === 'function' ? next(latest.current) : next;
    latest.current = v;
    try {
      if (v === null || v === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* private mode */
    }
    setValue(v);
  }, [key]);
  return [value, set];
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
