import { useState } from 'react';
import { errorMessage } from '@samouna/shared/api';
import { Brand, Button, Icon, LanguageMenu, OtpModal, PhoneField } from '@samouna/shared/components';
import { normalizeIraqiMobile } from '@samouna/shared/phone';
import { useI18n } from '@samouna/shared/react';
import { api, session } from '../lib.js';

export default function Login() {
  const { t, lang } = useI18n();
  const [phone, setPhone] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);
  const normalized = normalizeIraqiMobile(phone);

  async function submit(e) {
    e.preventDefault();
    setShowErrors(true);
    if (!normalized) return;
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
      <div className="login-bar"><LanguageMenu /></div>
      <div className="login-body rise">
        <Brand src="/icons/icon-192.png" name="Samouna Bakery" />
        <div className="stack" style={{ gap: 8 }}>
          <h1>{t('bakeryLogin')}</h1>
          <p className="muted">{t('bakeryLoginHint')}</p>
        </div>
        <form className="stack" onSubmit={submit} noValidate>
          <PhoneField id="bakery-phone" label={t('phoneNumber')} value={phone} onChange={(v) => { setPhone(v); setError(''); }}
            error={!normalized && t('err_invalid_phone')} showErrors={showErrors} />
          {error && <div className="form-error" role="alert"><Icon name="alert" size={18} />{error}</div>}
          <Button type="submit" className="btn-primary btn-lg btn-block" loading={busy}>{t('login')}<Icon name="arrowEnd" size={20} flip /></Button>
        </form>
      </div>
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
