import { useState } from 'react';
import { errorMessage } from '@samouna/shared/api';
import { Brand, Button, Icon, LanguageMenu, PhoneField } from '@samouna/shared/components';
import { normalizeIraqiMobile } from '@samouna/shared/phone';
import { useI18n } from '@samouna/shared/react';
import { LOGO } from '../lib.js';
import { useOtpLogin } from '../useOtpLogin.jsx';

export default function Login({ navigate, setGuest, returnTo }) {
  const { t } = useI18n();
  const [phone, setPhone] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const otp = useOtpLogin();
  const suffix = returnTo ? `/${returnTo}` : '';
  const normalized = normalizeIraqiMobile(phone);

  async function submit(e) {
    e?.preventDefault();
    setShowErrors(true);
    if (!normalized) return;
    setError('');
    setBusy(true);
    try {
      await otp.start({ phone: normalized, intent: 'login', onSuccess: () => { setGuest(false); navigate(suffix || '/'); } });
    } catch (err) {
      setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-bar"><LanguageMenu /></div>
      <div className="auth-body rise">
        <Brand src={LOGO} />
        <div className="auth-head">
          <h1>{t('welcomeBack')}</h1>
          <p className="muted">{t('loginSubtitle')}</p>
        </div>
        <form className="auth-form" onSubmit={submit} noValidate>
          <PhoneField id="login-phone" label={t('phoneNumber')} value={phone} onChange={(v) => { setPhone(v); setError(''); }} error={!normalized && t('err_invalid_phone')} showErrors={showErrors} />
          {error && (
            <div className="form-error" role="alert">
              <Icon name="alert" size={18} />
              <span>{error}{' '}{error === t('err_no_account') && <a href={`#/register${suffix}`}>{t('registerNow')}</a>}</span>
            </div>
          )}
          <Button type="submit" className="btn-primary btn-lg btn-block" loading={busy}>{t('login')}<Icon name="arrowEnd" size={20} flip /></Button>
        </form>
        <div className="divider-or"><span>{t('or')}</span></div>
        <button type="button" className="btn btn-lg btn-block" onClick={() => { setGuest(true); navigate('/'); }}>
          <Icon name="compass" size={20} />{t('browseApp')}
        </button>
      </div>
      <p className="auth-switch">{t('noAccountQ')} <a href={`#/register${suffix}`}>{t('registerNow')}</a></p>
      {otp.modal}
    </div>
  );
}
