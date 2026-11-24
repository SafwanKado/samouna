import { useState } from 'react';
import { errorMessage } from '@samouna/shared/api';
import { Brand, Button, Icon, LanguageMenu, PhoneField, TextField } from '@samouna/shared/components';
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
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const otp = useOtpLogin();
  const suffix = returnTo ? `/${returnTo}` : '';

  const nameOk = name.trim().length >= 2;
  const normalized = normalizeIraqiMobile(phone);
  const emailOk = EMAIL_RE.test(email.trim());
  const emailError = email.trim() && !emailOk ? t('err_invalid_email') : '';

  async function submit(e) {
    e.preventDefault();
    setShowErrors(true);
    if (!nameOk || !normalized || emailError) return;
    setError('');
    setBusy(true);
    try {
      await otp.start({
        phone: normalized, intent: 'register', fullName: name.trim(), email: email.trim() || undefined,
        onSuccess: () => { setGuest(false); navigate(suffix || '/'); },
      });
    } catch (err) {
      setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-bar">
        <a href={`#/login${suffix}`} className="icon-btn round" aria-label={t('back')}><Icon name="back" flip /></a>
        <LanguageMenu />
      </div>
      <div className="auth-body rise">
        <Brand src={LOGO} />
        <div className="auth-head">
          <h1>{t('createAccount')}</h1>
          <p className="muted">{t('registerSubtitle')}</p>
        </div>
        <form className="auth-form" onSubmit={submit} noValidate>
          <TextField id="reg-name" label={t('name')} icon="user" value={name} onChange={setName} autoComplete="name"
            valid={nameOk} error={!nameOk && t('err_name_required')} showErrors={showErrors} />
          <PhoneField id="reg-phone" label={t('phoneNumber')} value={phone} onChange={(v) => { setPhone(v); setError(''); }}
            error={!normalized && t('err_invalid_phone')} showErrors={showErrors} />
          <TextField id="reg-email" label={t('emailOptional')} icon="mail" type="email" inputMode="email" dir="ltr" autoComplete="email"
            value={email} onChange={setEmail} valid={emailOk} error={emailError} showErrors={showErrors} />
          {error && (
            <div className="form-error" role="alert">
              <Icon name="alert" size={18} />
              <span>{error}{' '}{error === t('err_account_exists') && <a href={`#/login${suffix}`}>{t('login')}</a>}</span>
            </div>
          )}
          <Button type="submit" className="btn-primary btn-lg btn-block" loading={busy}>{t('registerNow')}</Button>
        </form>
      </div>
      <p className="auth-switch">{t('haveAccountQ')} <a href={`#/login${suffix}`}>{t('login')}</a></p>
      {otp.modal}
    </div>
  );
}
