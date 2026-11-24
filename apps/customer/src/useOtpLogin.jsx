import { useState } from 'react';
import { OtpModal } from '@samouna/shared/components';
import { useI18n } from '@samouna/shared/react';
import { api, session } from './lib.js';

/**
 * WhatsApp OTP step shared by Login and Register.
 * start({ phone, intent, fullName, email, onSuccess }) sends the code and
 * opens the modal; a correct code stores the session and calls onSuccess.
 */
export function useOtpLogin() {
  const { lang } = useI18n();
  const [pending, setPending] = useState(null);

  async function start(opts) {
    const r = await api.post('/auth/otp/request', { phone: opts.phone, app: 'customer', intent: opts.intent, lang });
    setPending({ ...opts, phone: r.phone, devCode: r.devCode });
  }

  const modal = pending && (
    <OtpModal
      phone={pending.phone}
      devCode={pending.devCode}
      onClose={() => setPending(null)}
      onResend={() => api.post('/auth/otp/request', { phone: pending.phone, app: 'customer', intent: pending.intent, lang })}
      onVerify={async (code) => {
        const r = await api.post('/auth/otp/verify', {
          phone: pending.phone, code, app: 'customer', intent: pending.intent,
          fullName: pending.fullName, email: pending.email, lang,
        });
        session.set({ token: r.token, user: r.user });
        const done = pending.onSuccess;
        setPending(null);
        done?.(r.user);
      }}
    />
  );

  return { start, modal };
}
