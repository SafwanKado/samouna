import { useEffect, useId, useRef, useState } from 'react';
import { errorMessage } from './api.js';
import { LANGUAGES } from './i18n.js';
import { formatIraqiMobile, toAsciiDigits } from './phone.js';
import { useI18n } from './react.jsx';

/* ------------------------------------------------------------------ icons */

const ICONS = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></>,
  store: <><path d="M3 9l1.5-5h15L21 9" /><path d="M4 9v11h16V9" /><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" /></>,
  cart: <><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.6 12.2a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.5L21.5 8H6.2" /></>,
  bag: <><path d="M6 8h12l1 13H5z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />,
  clearList: <><path d="M3 6h11" /><path d="M5 6v13a2 2 0 0 0 2 2h5a2 2 0 0 0 2-2V6" /><path d="M8 6V4h3v2" /><path d="M17 10h4M17 14h4M17 18h4" /></>,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  card: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /></>,
  login: <><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>,
  compass: <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></>,
  minus: <path d="M5 12h14" />,
  plus: <path d="M12 5v14M5 12h14" />,
  back: <path d="m15 18-6-6 6-6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronEnd: <path d="m9 18 6-6-6-6" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  pin: <><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" /></>,
  check: <path d="m5 12 5 5 9-10" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  bread: <><path d="M4 11a4 4 0 0 1 2-7.5h12A4 4 0 0 1 20 11v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /><path d="M9 8v1.5M12 8v1.5M15 8v1.5" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></>,
};

/** Line icon. `flip` mirrors direction-sensitive icons (back arrows) in RTL. */
export function Icon({ name, size = 22, stroke = 2, className = '', flip = false, label }) {
  return (
    <svg
      className={`icon ${flip ? 'icon-flip' : ''} ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : 'true'}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      {ICONS[name]}
    </svg>
  );
}

/* ------------------------------------------------------------------ flags */

function sunRays(cx, cy, r1, r2, n) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r1 : r2;
    const a = (Math.PI * i) / n - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

/** Flags drawn inline: Kurdistan (Badini), Iraq (Arabic), United Kingdom (English). */
export function Flag({ lang, width = 30 }) {
  const id = useId().replace(/:/g, '');
  const h = Math.round((width * 2) / 3);
  if (lang === 'ku') {
    return (
      <svg width={width} height={h} viewBox="0 0 30 20" className="flag" aria-hidden="true">
        <rect width="30" height="6.67" fill="#ED2024" />
        <rect y="6.67" width="30" height="6.67" fill="#FFFFFF" />
        <rect y="13.33" width="30" height="6.67" fill="#278E43" />
        <polygon points={sunRays(15, 10, 2.1, 3.9, 21)} fill="#FEBD11" />
        <circle cx="15" cy="10" r="2.2" fill="#FEBD11" />
      </svg>
    );
  }
  if (lang === 'ar') {
    return (
      <svg width={width} height={h} viewBox="0 0 30 20" className="flag" aria-hidden="true">
        <rect width="30" height="6.67" fill="#CE1126" />
        <rect y="6.67" width="30" height="6.67" fill="#FFFFFF" />
        <rect y="13.33" width="30" height="6.67" fill="#000000" />
        <text x="15" y="11.6" textAnchor="middle" fontSize="3.6" fill="#007A3D" fontFamily="'Noto Sans Arabic', sans-serif" fontWeight="700">الله أكبر</text>
      </svg>
    );
  }
  return (
    <svg width={width} height={h} viewBox="0 0 60 40" className="flag" aria-hidden="true">
      <clipPath id={`${id}c`}><rect width="60" height="40" /></clipPath>
      <clipPath id={`${id}t`}><path d="M30,20 h30 v20 z v20 h-30 z h-30 v-20 z v-20 h30 z" /></clipPath>
      <g clipPath={`url(#${id}c)`}>
        <rect width="60" height="40" fill="#012169" />
        <path d="M0,0 L60,40 M60,0 L0,40" stroke="#FFFFFF" strokeWidth="8" />
        <path d="M0,0 L60,40 M60,0 L0,40" clipPath={`url(#${id}t)`} stroke="#C8102E" strokeWidth="5" />
        <path d="M30,0 v40 M0,20 h60" stroke="#FFFFFF" strokeWidth="12" />
        <path d="M30,0 v40 M0,20 h60" stroke="#C8102E" strokeWidth="7" />
      </g>
    </svg>
  );
}

/** Flag + language name button that opens a small menu. */
export function LanguageMenu({ compact = false }) {
  const { lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = LANGUAGES.find((l) => l.code === lang);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className={`lang-menu ${compact ? 'compact' : ''}`} ref={ref}>
      <button type="button" className="lang-menu-button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Flag lang={lang} />
        {!compact && <span lang={current.htmlLang}>{current.label}</span>}
        <Icon name="chevronDown" size={16} />
      </button>
      {open && (
        <ul className="lang-menu-list" role="listbox" aria-label="Language">
          {LANGUAGES.map((l) => (
            <li key={l.code}>
              <button
                type="button"
                role="option"
                aria-selected={l.code === lang}
                lang={l.htmlLang}
                onClick={() => { setLang(l.code); setOpen(false); }}
              >
                <Flag lang={l.code} />
                <span>{l.label}</span>
                {l.code === lang && <Icon name="check" size={18} className="text-accent" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Full language list with flags, for settings screens. */
export function LanguageList() {
  const { lang, setLang } = useI18n();
  return (
    <div className="option-list" role="radiogroup" aria-label="Language">
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          type="button"
          role="radio"
          aria-checked={l.code === lang}
          className={`option-row ${l.code === lang ? 'selected' : ''}`}
          onClick={() => setLang(l.code)}
          lang={l.htmlLang}
        >
          <Flag lang={l.code} />
          <span className="grow">{l.label}</span>
          <span className="radio-dot" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ forms */

/** "+964 | phone-icon  Phone number" field from the design. */
export function PhoneField({ id, value, onChange, readOnly, autoFocus }) {
  const { t } = useI18n();
  return (
    <div className={`phone-field ${readOnly ? 'readonly' : ''}`} dir="ltr">
      <span className="phone-prefix">+964</span>
      <span className="phone-divider" aria-hidden="true" />
      <Icon name="phone" size={22} className="text-accent" />
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder={t('phoneNumber')}
        aria-label={t('phoneNumber')}
        value={value}
        readOnly={readOnly}
        autoFocus={autoFocus}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ dialogs */

/**
 * In-app confirmation dialog (browser confirm() is blocked in some hosts and
 * looks out of place in an installed PWA).
 */
export function ConfirmDialog({ open, icon, title, message, confirmLabel, cancelLabel, tone = 'primary', onConfirm, onCancel }) {
  const { t } = useI18n();
  const confirmRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    confirmRef.current?.focus();
    const esc = (e) => { if (e.key === 'Escape') onCancel?.(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="modal-backdrop center" role="presentation" onClick={(e) => e.target === e.currentTarget && onCancel?.()}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" aria-describedby="dlg-msg">
        <h2 id="dlg-title" className="dialog-title">
          {icon && <Icon name={icon} size={28} className={tone === 'danger' ? 'text-danger' : 'text-accent'} flip={icon === 'login'} />}
          {title}
        </h2>
        {message && <p id="dlg-msg" className="dialog-text">{message}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn-text" onClick={onCancel}>{cancelLabel || t('cancel')}</button>
          <button ref={confirmRef} type="button" className={`btn ${tone === 'danger' ? 'btn-danger-solid' : 'btn-primary'}`} onClick={onConfirm}>
            {confirmLabel || t('confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Hook wrapper: `const [ask, dialog] = useConfirm(); if (await ask({...})) ...` */
export function useConfirm() {
  const [state, setState] = useState(null);
  const ask = (opts) => new Promise((resolve) => setState({ ...opts, resolve }));
  const done = (v) => { state?.resolve(v); setState(null); };
  const dialog = (
    <ConfirmDialog open={Boolean(state)} {...(state || {})} onConfirm={() => done(true)} onCancel={() => done(false)} />
  );
  return [ask, dialog];
}

/**
 * Six-digit WhatsApp code entry. Auto-submits on the 6th digit and accepts
 * Arabic-Indic digits from RTL keyboards.
 */
export function OtpModal({ phone, devCode, onVerify, onResend, onClose }) {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(60);
  const [hint, setHint] = useState(devCode);
  const inputRef = useRef(null);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  async function submit(value) {
    if (busy || value.length !== 6) return;
    setBusy(true);
    setError('');
    try {
      await onVerify(value);
    } catch (err) {
      setError(errorMessage(t, err));
      setCode('');
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError('');
    try {
      const r = await onResend();
      setHint(r?.devCode);
      setCooldown(60);
    } catch (err) {
      setError(errorMessage(t, err));
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="otp-title">
      <form className="modal" onSubmit={(e) => { e.preventDefault(); submit(code); }}>
        <h2 id="otp-title">{t('verifyTitle')}</h2>
        <p className="muted">{t('verifySent', { phone: formatIraqiMobile(phone) })}</p>
        <input
          ref={inputRef}
          className="otp-input"
          dir="ltr"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          value={code}
          aria-label={t('verifyTitle')}
          disabled={busy}
          onChange={(e) => {
            const v = toAsciiDigits(e.target.value).replace(/\D/g, '').slice(0, 6);
            setCode(v);
            if (v.length === 6) submit(v);
          }}
        />
        {hint && <p className="dev-hint">Demo code: {hint}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-big" disabled={busy || code.length !== 6}>{t('verify')}</button>
        <div className="row-between">
          <button type="button" className="btn-text" onClick={onClose}>{t('cancel')}</button>
          <button type="button" className="btn-text" disabled={cooldown > 0} onClick={resend}>
            {cooldown > 0 ? t('resendIn', { s: cooldown }) : t('resend')}
          </button>
        </div>
      </form>
    </div>
  );
}

export function Toast({ message, tone = 'info', onDone }) {
  useEffect(() => {
    if (!message) return undefined;
    const id = setTimeout(onDone, 4000);
    return () => clearTimeout(id);
  }, [message, onDone]);
  if (!message) return null;
  return <div className={`toast toast-${tone}`} role="status" dir="auto">{message}</div>;
}

export function Switch({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`switch ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-knob" />
    </button>
  );
}

export function OfflineBanner({ status }) {
  const { t } = useI18n();
  if (status !== 'offline') return null;
  return <div className="offline-banner" role="status">{t('offline')}</div>;
}

/** Circular brand mark used on the login and register screens. */
export function BrandMark({ src, size = 150, ring = true }) {
  return (
    <div className={`brand-mark ${ring ? 'ring' : ''}`} style={{ '--mark': `${size}px` }}>
      <img src={src} alt="" width={size} height={size} />
    </div>
  );
}
