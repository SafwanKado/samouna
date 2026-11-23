import { useState } from 'react';
import { OtpModal } from '@samouna/shared/components';
import { useI18n } from '@samouna/shared/react';
import { api, session } from './lib.js';

/**
 * WhatsApp OTP gate. `start(phone, fullName, onSuccess)` sends a code and
 * shows the modal; a correct code creates/logs in the account, stores the
 * session and then calls onSuccess(token).
 */
export function useOtpLogin() {
  const { lang } = useI18n();
  const [pending, setPending] = useState(null);

  async function start(phone, fullName, onSuccess) {
    const r = await api.post('/auth/otp/request', { phone, app: 'customer', lang });
    setPending({ phone: r.phone, fullName, devCode: r.devCode, onSuccess });
  }

  const modal = pending && (
    <OtpModal
      phone={pending.phone}
      devCode={pending.devCode}
      onClose={() => setPending(null)}
      onResend={() => api.post('/auth/otp/request', { phone: pending.phone, app: 'customer', lang })}
      onVerify={async (code) => {
        const r = await api.post('/auth/otp/verify', {
          phone: pending.phone, code, app: 'customer', fullName: pending.fullName, lang,
        });
        session.set({ token: r.token, user: r.user });
        const done = pending.onSuccess;
        setPending(null);
        await done?.(r.token);
      }}
    />
  );

  return { start, modal };
}
