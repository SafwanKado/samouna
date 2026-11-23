import { useEffect, useRef, useState } from 'react';
import { errorMessage } from './api.js';
import { LANGUAGES } from './i18n.js';
import { formatIraqiMobile, toAsciiDigits } from './phone.js';
import { useI18n } from './react.jsx';

export function LanguageSwitcher() {
  const { lang, setLang } = useI18n();
  return (
    <div className="lang-switch" role="group" aria-label="Language">
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          type="button"
          lang={l.htmlLang}
          className={l.code === lang ? 'active' : ''}
          aria-pressed={l.code === lang}
          onClick={() => setLang(l.code)}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

/** Full-screen first-launch language chooser. */
export function LanguagePicker({ title }) {
  const { setLang } = useI18n();
  return (
    <div className="lang-picker">
      <div className="lang-picker-logo" aria-hidden="true">
        <img src="/icons/icon-192.png" alt="" width="96" height="96" />
      </div>
      <h1>{title}</h1>
      <p className="muted">زمانێ خۆ هەلبژێرە · اختر لغتك · Choose your language</p>
      <div className="stack">
        {LANGUAGES.map((l) => (
          <button key={l.code} lang={l.htmlLang} dir={l.dir} className="btn btn-big" onClick={() => setLang(l.code)}>
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
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
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault();
          submit(code);
        }}
      >
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
        {hint && <p className="dev-hint">Dev mode code: {hint}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-big" disabled={busy || code.length !== 6}>
          {t('verify')}
        </button>
        <div className="row-between">
          <button type="button" className="btn-link" onClick={onClose}>{t('cancel')}</button>
          <button type="button" className="btn-link" disabled={cooldown > 0} onClick={resend}>
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
  return <div className={`toast toast-${tone}`} role="status">{message}</div>;
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
