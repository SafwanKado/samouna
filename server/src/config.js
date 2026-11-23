const env = process.env;
const isProd = env.NODE_ENV === 'production';

export const config = {
  isProd,
  port: Number(env.PORT || 4000),
  databaseUrl: env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/samouna',
  jwtSecret: env.JWT_SECRET || 'dev-only-secret',
  corsOrigins: (env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:5174')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  trustProxy: env.TRUST_PROXY === '1' ? 1 : false,
  meta: {
    phoneNumberId: env.META_PHONE_NUMBER_ID || '',
    accessToken: env.META_ACCESS_TOKEN || '',
    graphVersion: env.META_GRAPH_VERSION || 'v21.0',
    otpTemplate: env.META_OTP_TEMPLATE || 'samouna_otp',
    otpHasButton: env.META_OTP_HAS_BUTTON !== 'false',
  },
  otp: {
    ttlSeconds: 5 * 60,
    maxPerHour: 3,
    maxAttempts: 5,
  },
};

/** Without Meta credentials outside production, codes are logged instead of sent. */
config.otpDevMode = !isProd && !(config.meta.phoneNumberId && config.meta.accessToken);

export function assertProductionConfig() {
  if (!isProd) return;
  const missing = [];
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) missing.push('JWT_SECRET (>= 32 chars)');
  if (!config.meta.phoneNumberId) missing.push('META_PHONE_NUMBER_ID');
  if (!config.meta.accessToken) missing.push('META_ACCESS_TOKEN');
  if (missing.length) throw new Error(`Missing production config: ${missing.join(', ')}`);
}
