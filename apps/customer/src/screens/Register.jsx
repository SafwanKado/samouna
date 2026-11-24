import { useState } from 'react';
import { errorMessage } from '@samouna/shared/api';
import { BrandMark, LanguageMenu, PhoneField } from '@samouna/shared/components';
import { normalizeIraqiMobile } from '@samouna/shared/phone';
import { useI18n } from '@samouna/shared/react';
import { LOGO } from '../lib.js';
import { useOtpLogin } from '../useOtpLogin.jsx';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function Register({ navigate, setGuest, returnTo }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const otp = useOtpLogin();
  const suffix = returnTo ? `/${returnTo}` : '';

  async function submit(e) {
    e.preventDefault();
    const normalized = normalizeIraqiMobile(phone);
    if (name.trim().length < 2) return setError(t('err_name_required'));
    if (!normalized) return setError(t('err_invalid_phone'));
    if (email.trim() && !EMAIL_RE.test(email.trim())) return setError(t('err_invalid_email'));
    setError('');
    setBusy(true);
    try {
      await otp.start({
        phone: normalized,
        intent: 'register',
        fullName: name.trim(),
        email: email.trim() || undefined,
        onSuccess: () => { setGuest(false); navigate(suffix || '/'); },
      });
    } catch (err) {
      setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-top"><LanguageMenu /></div>
      <BrandMark src={LOGO} size={190} ring={false} />
      <h1 className="auth-title register">{t('registerNow')}</h1>

      <form className="auth-form" onSubmit={submit} noValidate>
        <input id="reg-name" placeholder={t('name')} aria-label={t('name')} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        <PhoneField id="reg-phone" value={phone} onChange={setPhone} />
        <input id="reg-email" type="email" inputMode="email" dir="ltr" placeholder={t('emailOptional')} aria-label={t('emailOptional')} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-outline-accent btn-big register-btn" disabled={busy}>{t('registerNow')}</button>
      </form>

      <p className="auth-switch">
        <span>{t('haveAccountQ')}</span>
        <a href={`#/login${suffix}`}>{t('login')}</a>
      </p>
      {otp.modal}
    </div>
  );
}
