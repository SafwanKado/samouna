// Iraqi mobile number handling, shared by the API and both frontends.
//
// Accepts what people actually type: 0750 123 4567, 750-123-4567,
// +964 750 123 4567, 00964750..., 9640750..., and the same with
// Arabic-Indic (٠-٩) or Persian/Kurdish (۰-۹) digits from RTL keyboards.

const ARABIC_INDIC_ZERO = 0x0660; // ٠
const EXTENDED_ZERO = 0x06f0; // ۰

export function toAsciiDigits(input) {
  return String(input).replace(/[٠-٩۰-۹]/g, (d) => {
    const code = d.charCodeAt(0);
    const base = code >= EXTENDED_ZERO ? EXTENDED_ZERO : ARABIC_INDIC_ZERO;
    return String(code - base);
  });
}

/**
 * Normalize to Meta's WhatsApp format: "9647XXXXXXXXX" (13 digits, no plus).
 * Returns null if the input is not a valid Iraqi mobile number.
 */
export function normalizeIraqiMobile(input) {
  if (input === null || input === undefined) return null;
  let s = toAsciiDigits(input).trim().replace(/[\s\-().‎‏]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  else if (s.startsWith('00')) s = s.slice(2);
  if (!/^\d+$/.test(s)) return null;
  if (s.startsWith('964')) s = s.slice(3);
  if (s.startsWith('0')) s = s.slice(1);
  if (!/^7\d{9}$/.test(s)) return null;
  return `964${s}`;
}

/** "9647501234567" -> "+9647501234567" (the form stored in users.phone_number) */
export function toE164(metaFormat) {
  return `+${metaFormat}`;
}

/** Any accepted input -> "+964 750 123 4567", or the input unchanged if invalid. */
export function formatIraqiMobile(input) {
  const n = normalizeIraqiMobile(input);
  if (!n) return String(input ?? '');
  const local = n.slice(3);
  return `+964 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}
