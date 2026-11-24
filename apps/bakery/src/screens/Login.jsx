import { useState } from 'react';
import { errorMessage } from '@samouna/shared/api';
import { BrandMark, LanguageMenu, OtpModal, PhoneField } from '@samouna/shared/components';
import { normalizeIraqiMobile } from '@samouna/shared/phone';
import { useI18n } from '@samouna/shared/react';
import { api, session } from '../lib.js';

export default function Login() {
  const { t, lang } = useI18n();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);

  async function submit(e) {
    e.preventDefault();
    const normalized = normalizeIraqiMobile(phone);
    if (!normalized) return setError(t('err_invalid_phone'));
    setError('');
    setBusy(true);
    try {
      const r = await api.post('/auth/otp/request', { phone: normalized, app: 'bakery', lang });
      setPending({ phone: r.phone, devCode: r.devCode });
    } catch (err) {
      setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-top"><LanguageMenu /></div>
      <BrandMark src="/icons/logo.png" size={140} ring />
      <h1 className="login-title">{t('bakeryAppName')}</h1>
      <p className="muted login-sub">{t('bakeryLoginHint')}</p>
      <form className="login-card" onSubmit={submit} noValidate>
        <PhoneField id="bakery-phone" value={phone} onChange={setPhone} />
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-big" disabled={busy}>{t('login')}</button>
      </form>
      {pending && (
        <OtpModal
          phone={pending.phone}
          devCode={pending.devCode}
          onClose={() => setPending(null)}
          onResend={() => api.post('/auth/otp/request', { phone: pending.phone, app: 'bakery', lang })}
          onVerify={async (code) => {
            const r = await api.post('/auth/otp/verify', { phone: pending.phone, code, app: 'bakery', lang });
            session.set({ token: r.token, user: r.user, store: r.store });
          }}
        />
      )}
    </div>
  );
}
