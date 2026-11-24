import { useState } from 'react';
import { errorMessage } from '@samouna/shared/api';
import { BrandMark, Icon, LanguageMenu, PhoneField } from '@samouna/shared/components';
import { normalizeIraqiMobile } from '@samouna/shared/phone';
import { useI18n } from '@samouna/shared/react';
import { LOGO } from '../lib.js';
import { useOtpLogin } from '../useOtpLogin.jsx';

export default function Login({ navigate, setGuest, returnTo }) {
  const { t } = useI18n();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const otp = useOtpLogin();
  const suffix = returnTo ? `/${returnTo}` : '';

  async function submit(e) {
    e.preventDefault();
    const normalized = normalizeIraqiMobile(phone);
    if (!normalized) return setError(t('err_invalid_phone'));
    setError('');
    setBusy(true);
    try {
      await otp.start({
        phone: normalized,
        intent: 'login',
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
      <BrandMark src={LOGO} size={150} ring />
      <h1 className="auth-title">{t('login')}</h1>
      <p className="auth-sub">{t('loginSubtitle')}</p>

      <form className="auth-card" onSubmit={submit} noValidate>
        <PhoneField id="login-phone" value={phone} onChange={setPhone} />
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-big" disabled={busy}>{t('login')}</button>
      </form>

      <p className="auth-switch">
        <span>{t('noAccountQ')}</span>
        <a href={`#/register${suffix}`}>{t('registerNow')}</a>
      </p>
      <button type="button" className="btn-text auth-browse" onClick={() => { setGuest(true); navigate('/'); }}>
        <Icon name="compass" size={22} />
        {t('browseApp')}
      </button>
      {otp.modal}
    </div>
  );
}
