import { useEffect, useId, useRef, useState } from 'react';
import { errorMessage } from './api.js';
import { LANGUAGES } from './i18n.js';
import { carrierOf, formatIraqiMobile, formatLocalAsYouType, normalizeIraqiMobile, toAsciiDigits } from './phone.js';
import { useI18n, useTheme } from './react.jsx';

/* ======================================================================= icons */

const ICONS = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></>,
  store: <><path d="M3 9l1.5-5h15L21 9" /><path d="M4 9v11h16V9" /><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" /></>,
  cart: <><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.6 12.2a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.5L21.5 8H6.2" /></>,
  bag: <><path d="M6 8h12l1 13H5z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />,
  trash: <><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 15h10l1-15" /></>,
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
  arrowEnd: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  pin: <><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" /></>,
  check: <path d="m5 12 5 5 9-10" />,
  checkCircle: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.01" /></>,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  bread: <><path d="M4 11a4 4 0 0 1 2-7.5h12A4 4 0 0 1 20 11v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /><path d="M9 8v1.5M12 8v1.5M15 8v1.5" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  monitor: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
  wifiOff: <><path d="M2 2l20 20" /><path d="M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2.2-1.6M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 11 5" /><path d="M12 20h.01" /></>,
  truck: <><path d="M3 6h11v10H3z" /><path d="M14 9h4l3 3v4h-7" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
  receipt: <><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z" /><path d="M9 8h6M9 12h6" /></>,
  repeat: <><path d="M17 2l4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
};

/** Line icon. `flip` mirrors direction-sensitive icons (arrows) in RTL. */
export function Icon({ name, size = 22, stroke = 2, className = '', flip = false, label }) {
  return (
    <svg
      className={`icon ${flip ? 'icon-flip' : ''} ${className}`}
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden={label ? undefined : 'true'} role={label ? 'img' : undefined} aria-label={label}
    >
      {ICONS[name]}
    </svg>
  );
}

/* ======================================================================= flags */

function sunRays(cx, cy, r1, r2, n) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r1 : r2;
    const a = (Math.PI * i) / n - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

/** Kurdistan (Badini), Iraq (Arabic), United Kingdom (English). */
export function Flag({ lang, width = 26 }) {
  const id = useId().replace(/:/g, '');
  const h = Math.round((width * 2) / 3);
  if (lang === 'ku') {
    return (
      <svg width={width} height={h} viewBox="0 0 30 20" className="flag" aria-hidden="true">
        <rect width="30" height="6.67" fill="#ED2024" /><rect y="6.67" width="30" height="6.67" fill="#FFFFFF" />
        <rect y="13.33" width="30" height="6.67" fill="#278E43" />
        <polygon points={sunRays(15, 10, 2.1, 3.9, 21)} fill="#FEBD11" /><circle cx="15" cy="10" r="2.2" fill="#FEBD11" />
      </svg>
    );
  }
  if (lang === 'ar') {
    return (
      <svg width={width} height={h} viewBox="0 0 30 20" className="flag" aria-hidden="true">
        <rect width="30" height="6.67" fill="#CE1126" /><rect y="6.67" width="30" height="6.67" fill="#FFFFFF" />
        <rect y="13.33" width="30" height="6.67" fill="#000000" />
        <text x="15" y="11.6" textAnchor="middle" fontSize="3.6" fill="#007A3D" fontFamily="'IBM Plex Sans Arabic', sans-serif" fontWeight="700">الله أكبر</text>
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

/* ======================================================================= controls */

export function Button({ loading = false, children, className = '', disabled, type = 'button', ...rest }) {
  return (
    <button type={type} className={`btn ${className}`} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <span className="spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

/** Pill menu with flag + language name. `align="start"` opens toward the start edge. */
export function LanguageMenu({ compact = false, align = 'end' }) {
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
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div className={`lang-menu ${compact ? 'compact' : ''} ${align}`} ref={ref}>
      <button type="button" className="lang-menu-button" aria-haspopup="listbox" aria-expanded={open} aria-label={current.label} onClick={() => setOpen(!open)}>
        <Flag lang={lang} width={22} />
        {!compact && <span lang={current.htmlLang}>{current.label}</span>}
        <Icon name="chevronDown" size={16} />
      </button>
      {open && (
        <ul className="lang-menu-list" role="listbox" aria-label="Language">
          {LANGUAGES.map((l) => (
            <li key={l.code}>
              <button type="button" role="option" aria-selected={l.code === lang} lang={l.htmlLang} onClick={() => { setLang(l.code); setOpen(false); }}>
                <Flag lang={l.code} /><span>{l.label}</span>
                {l.code === lang && <Icon name="check" size={18} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function LanguageList() {
  const { lang, setLang } = useI18n();
  return (
    <div className="option-list" role="radiogroup" aria-label="Language">
      {LANGUAGES.map((l) => (
        <button key={l.code} type="button" role="radio" aria-checked={l.code === lang} className="option-row" onClick={() => setLang(l.code)} lang={l.htmlLang}>
          <Flag lang={l.code} /><span className="grow">{l.label}</span><span className="radio-dot" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

/** Radio-style segmented control. options: [{ value, label, icon }] */
export function Segmented({ options, value, onChange, label, tone = '' }) {
  const refs = useRef([]);
  const idx = options.findIndex((o) => o.value === value);
  const onKey = (e) => {
    const dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight');
    const next = (idx + (rtl ? -dir : dir) + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div className={`segmented ${tone}`} role="radiogroup" aria-label={label} onKeyDown={onKey}>
      {options.map((o, i) => (
        <button key={o.value} ref={(el) => { refs.current[i] = el; }} type="button" role="radio" aria-checked={o.value === value} tabIndex={o.value === value ? 0 : -1} onClick={() => onChange(o.value)}>
          {o.icon && <Icon name={o.icon} size={18} />}{o.label}
        </button>
      ))}
    </div>
  );
}

export function ThemeToggle() {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  return (
    <Segmented
      label={t('theme')}
      value={theme}
      onChange={setTheme}
      options={[
        { value: 'system', label: t('themeSystem'), icon: 'monitor' },
        { value: 'light', label: t('themeLight'), icon: 'sun' },
        { value: 'dark', label: t('themeDark'), icon: 'moon' },
      ]}
    />
  );
}

export function Chip({ selected, children, icon, ...rest }) {
  return (
    <button type="button" className="chip" aria-pressed={selected} {...rest}>
      {icon && <Icon name={icon} size={16} />}{children}
    </button>
  );
}

export function Switch({ checked, onChange, label, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={`switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
      <span className="switch-knob" />
    </button>
  );
}

/* ======================================================================= fields */

/**
 * Floating-label text field with inline validation.
 * Shows `error` only once the field was touched (blurred) or `showErrors` is set.
 */
export function TextField({
  id, label, value, onChange, error, showErrors = false, valid = false, hint, icon, multiline = false,
  maxLength, type = 'text', inputMode, autoComplete, dir, readOnly, autoFocus, onEnter,
}) {
  const [touched, setTouched] = useState(false);
  const shownError = (touched || showErrors) && error;
  const Field = multiline ? 'textarea' : 'input';
  const count = maxLength && value.length;
  return (
    <div className={`tf ${shownError ? 'has-error' : ''}`}>
      <div className="tf-box">
        {icon && <Icon name={icon} size={20} />}
        <div className="tf-field">
          <Field
            id={id} type={multiline ? undefined : type} value={value} placeholder=" " maxLength={maxLength} inputMode={inputMode}
            autoComplete={autoComplete} dir={dir} readOnly={readOnly} autoFocus={autoFocus}
            aria-invalid={shownError ? 'true' : undefined} aria-describedby={shownError ? `${id}-err` : hint ? `${id}-hint` : undefined}
            onChange={(e) => onChange(e.target.value)} onBlur={() => setTouched(true)}
            onKeyDown={(e) => { if (onEnter && e.key === 'Enter' && !multiline) onEnter(); }}
          />
          <label htmlFor={id}>{label}</label>
        </div>
        {valid && !shownError && <Icon name="checkCircle" size={20} className="tf-ok" />}
      </div>
      {(shownError || hint || maxLength) && (
        <div className="tf-foot">
          {shownError ? <span id={`${id}-err`} className="tf-error" role="alert"><Icon name="alert" size={15} />{error}</span>
            : hint ? <span id={`${id}-hint`} className="tf-hint">{hint}</span> : null}
          {maxLength && <span className={`tf-count ${count > maxLength * 0.9 ? 'near' : ''}`}>{count}/{maxLength}</span>}
        </div>
      )}
    </div>
  );
}

/** +964 field that formats as you type and names the operator (Korek / Asiacell / Zain). */
export function PhoneField({ id, value, onChange, error, showErrors = false, readOnly, autoFocus, label, onEnter }) {
  const { t } = useI18n();
  const [touched, setTouched] = useState(false);
  const valid = Boolean(normalizeIraqiMobile(value));
  const carrier = carrierOf(value);
  const shownError = (touched || showErrors) && error;
  return (
    <div className={`tf ${shownError ? 'has-error' : ''}`}>
      {label && <label className="field-label" htmlFor={id}>{label}</label>}
      <div className="tf-box phone-box" dir="ltr">
        <span className="phone-cc"><Icon name="phone" size={16} />+964</span>
        <input
          id={id} className="phone-input" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="750 123 4567"
          aria-label={label ? undefined : t('phoneNumber')} aria-invalid={shownError ? 'true' : undefined}
          aria-describedby={shownError ? `${id}-err` : undefined}
          value={value} readOnly={readOnly} autoFocus={autoFocus}
          onChange={(e) => onChange(formatLocalAsYouType(e.target.value))} onBlur={() => setTouched(true)}
          onKeyDown={(e) => { if (onEnter && e.key === 'Enter') onEnter(); }}
        />
        {carrier && <span className="carrier">{t(`carrier_${carrier}`)}</span>}
        {valid && !shownError && <Icon name="checkCircle" size={20} className="tf-ok" />}
      </div>
      {shownError && <div className="tf-foot"><span id={`${id}-err`} className="tf-error" role="alert"><Icon name="alert" size={15} />{error}</span></div>}
    </div>
  );
}

/** Six boxes: auto-advance, backspace to previous, paste / SMS autofill fills all. */
export function OtpInput({ value, onChange, onComplete, disabled, status, shakeKey }) {
  const refs = useRef([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] || '');

  useEffect(() => { refs.current[Math.min(value.length, 5)]?.focus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function put(start, raw) {
    const incoming = toAsciiDigits(raw).replace(/\D/g, '');
    if (!incoming) return;
    const next = (value.slice(0, start) + incoming).slice(0, 6);
    onChange(next);
    refs.current[Math.min(next.length, 5)]?.focus();
    if (next.length === 6) onComplete?.(next);
  }

  function onKeyDown(i, e) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (digits[i]) onChange(value.slice(0, i));
      else if (i > 0) { onChange(value.slice(0, i - 1)); refs.current[i - 1]?.focus(); }
    } else if (e.key === 'ArrowLeft') refs.current[Math.max(0, i - 1)]?.focus();
    else if (e.key === 'ArrowRight') refs.current[Math.min(5, i + 1)]?.focus();
  }

  return (
    <div key={shakeKey} className={`otp ${status === 'error' ? 'error shake' : ''} ${status === 'done' ? 'done' : ''}`} dir="ltr" role="group" aria-label="6-digit code">
      {digits.map((d, i) => (
        <input
          key={i} ref={(el) => { refs.current[i] = el; }} className={d ? 'filled' : ''} value={d} disabled={disabled}
          inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} aria-label={`Digit ${i + 1}`}
          onChange={(e) => put(Math.min(i, value.length), e.target.value.replace(d, '') || e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={(e) => { e.preventDefault(); put(0, e.clipboardData.getData('text')); }}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}

export function SearchField({ value, onChange, placeholder, id }) {
  const { t } = useI18n();
  return (
    <div className="search" role="search">
      <Icon name="search" size={20} />
      <input id={id} type="search" value={value} placeholder={placeholder} aria-label={placeholder} onChange={(e) => onChange(e.target.value)} />
      {value && <button type="button" className="icon-btn ghost round" aria-label={t('clearSearch')} onClick={() => onChange('')}><Icon name="x" size={18} /></button>}
    </div>
  );
}

/* ======================================================================= overlays */

function useEscape(active, fn) {
  useEffect(() => {
    if (!active) return undefined;
    const h = (e) => { if (e.key === 'Escape') fn?.(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [active, fn]);
}

/** Bottom sheet on phones, centred dialog on wider screens. */
export function Sheet({ open, onClose, labelledBy, children, role = 'dialog', center = false }) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <div className={`scrim ${center ? 'center' : ''}`} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="sheet" role={role} aria-modal="true" aria-labelledby={labelledBy}>
        <div className="sheet-handle" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, icon, title, message, confirmLabel, cancelLabel, tone = 'primary', onConfirm, onCancel }) {
  const { t } = useI18n();
  const ref = useRef(null);
  useEffect(() => { if (open) ref.current?.focus(); }, [open]);
  return (
    <Sheet open={open} onClose={onCancel} role="alertdialog" labelledBy="dlg-title">
      {icon && <div className={`sheet-icon ${tone === 'danger' ? 'danger' : ''}`}><Icon name={icon} size={26} flip={icon === 'login'} /></div>}
      <h2 id="dlg-title">{title}</h2>
      {message && <p className="sheet-text">{message}</p>}
      <div className="sheet-actions">
        <button type="button" className="btn btn-lg" onClick={onCancel}>{cancelLabel || t('cancel')}</button>
        <button ref={ref} type="button" className={`btn btn-lg ${tone === 'danger' ? 'btn-danger-solid' : 'btn-primary'}`} onClick={onConfirm}>{confirmLabel || t('confirm')}</button>
      </div>
    </Sheet>
  );
}

/** `const [ask, dialog] = useConfirm(); if (await ask({...})) ...` */
export function useConfirm() {
  const [state, setState] = useState(null);
  const ask = (opts) => new Promise((resolve) => setState({ ...opts, resolve }));
  const done = (v) => { state?.resolve(v); setState(null); };
  return [ask, <ConfirmDialog key="confirm" open={Boolean(state)} {...(state || {})} onConfirm={() => done(true)} onCancel={() => done(false)} />];
}

/** WhatsApp code sheet with six boxes, resend timer and an error shake. */
export function OtpModal({ phone, devCode, onVerify, onResend, onClose }) {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [shakes, setShakes] = useState(0);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(60);
  const [hint, setHint] = useState(devCode);

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
      setStatus('done');
      await onVerify(value);
    } catch (err) {
      setStatus('error');
      setShakes((n) => n + 1);
      setError(errorMessage(t, err));
      setCode('');
      navigator.vibrate?.(120);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError('');
    setStatus('');
    try {
      const r = await onResend();
      setHint(r?.devCode);
      setCode('');
      setCooldown(60);
    } catch (err) {
      setError(errorMessage(t, err));
    }
  }

  return (
    <Sheet open onClose={onClose} labelledBy="otp-title">
      <div className="sheet-icon"><Icon name="phone" size={24} /></div>
      <h2 id="otp-title">{t('verifyTitle')}</h2>
      <p className="sheet-text">{t('verifySent', { phone: formatIraqiMobile(phone) })}</p>
      <form onSubmit={(e) => { e.preventDefault(); submit(code); }} className="stack">
        <OtpInput value={code} onChange={(v) => { setCode(v); if (status) setStatus(''); }} onComplete={submit} disabled={busy} status={status} shakeKey={shakes} />
        {hint && (
          <div className="dev-hint">
            <span>Demo code: <span className="num">{hint}</span></span>
            <button type="button" onClick={() => { setCode(hint); submit(hint); }}>{t('tapToFill')}</button>
          </div>
        )}
        {error && <div className="form-error" role="alert"><Icon name="alert" size={18} />{error}</div>}
        <Button type="submit" className="btn-primary btn-lg btn-block" loading={busy} disabled={code.length !== 6}>{t('verify')}</Button>
      </form>
      <div className="row-between">
        <button type="button" className="link-btn" onClick={onClose}>{t('changeNumber')}</button>
        <button type="button" className="link-btn" disabled={cooldown > 0} onClick={resend}>
          {cooldown > 0 ? <span>{t('resendIn', { s: cooldown })}</span> : t('resend')}
        </button>
      </div>
    </Sheet>
  );
}

/** Toast with optional action (e.g. Undo). */
export function Toast({ message, tone = 'info', action, onDone }) {
  useEffect(() => {
    if (!message) return undefined;
    const id = setTimeout(onDone, action ? 5000 : 3500);
    return () => clearTimeout(id);
  }, [message, action, onDone]);
  if (!message) return null;
  const icon = { success: 'checkCircle', danger: 'alert' }[tone] || 'bell';
  return (
    <div className={`toast toast-${tone}`} role="status" dir="auto">
      <Icon name={icon} size={20} />
      <span className="toast-msg">{message}</span>
      {action && <button type="button" className="toast-action" onClick={() => { action.onClick(); onDone(); }}>{action.label}</button>}
    </div>
  );
}

export function OfflineBanner({ status }) {
  const { t } = useI18n();
  if (status !== 'offline') return null;
  return <div className="offline-banner" role="status"><Icon name="wifiOff" size={16} />{t('offline')}</div>;
}

export function Skeleton({ w = '100%', h = 16, r, style }) {
  return <div className="skel" style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden="true" />;
}

/** Circular countdown, e.g. the 5-minute cancellation window. */
export function CountdownRing({ remaining, total, size = 52 }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, remaining / total));
  const s = Math.max(0, Math.ceil(remaining / 1000));
  return (
    <div className="ring" style={{ width: size, height: size }} role="timer" aria-label={`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`}>
      <svg width={size} height={size}>
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="5" />
        <circle className="ring-bar" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />
      </svg>
      <span className="ring-label">{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</span>
    </div>
  );
}

export function EmptyState({ icon, title, text, children }) {
  return (
    <div className="empty-state rise">
      <div className="empty-art"><Icon name={icon} size={52} stroke={1.7} /></div>
      <h2>{title}</h2>
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}

/** App mark + wordmark. */
export function Brand({ src, name = 'Samouna', size = 52 }) {
  return (
    <div className="brand">
      <img className="brand-mark" src={src} alt="" width={size} height={size} style={{ width: size, height: size }} />
      <span className="brand-word" dir="ltr">{name}</span>
    </div>
  );
}
