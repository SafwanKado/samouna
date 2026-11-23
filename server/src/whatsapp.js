import { config } from './config.js';

// WhatsApp authentication templates support Arabic and English but not
// Kurdish, so Badini users get the Arabic template.
const TEMPLATE_LANG = { ku: 'ar', ar: 'ar', en: 'en' };

/**
 * Send a 6-digit code using an approved "Authentication" category template.
 * `to` must be in Meta format: 9647XXXXXXXXX.
 */
export async function sendOtpMessage(to, code, lang = 'ku') {
  const { phoneNumberId, accessToken, graphVersion, otpTemplate, otpHasButton } = config.meta;

  const components = [{ type: 'body', parameters: [{ type: 'text', text: code }] }];
  if (otpHasButton) {
    // Copy-code / one-tap buttons require the code as the URL button parameter.
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: code }],
    });
  }

  const res = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: { name: otpTemplate, language: { code: TEMPLATE_LANG[lang] || 'ar' }, components },
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`WhatsApp API ${res.status}: ${body.slice(0, 500)}`);
  }
  return res.json();
}
