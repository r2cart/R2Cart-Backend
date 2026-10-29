import 'dotenv/config';

const required = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing environment variable: ${key}`);
}

const clientOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 5000),
  clientOrigins,
  accessSecret: process.env.JWT_ACCESS_SECRET,
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  accessExpires: process.env.JWT_ACCESS_EXPIRES_IN || '30d',
  refreshExpires: process.env.JWT_REFRESH_EXPIRES_IN || '90d',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  otpMinutes: Number(process.env.OTP_EXPIRY_MINUTES || 5),
  otpCooldownSeconds: Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || 60),
  exposeOtp: process.env.EXPOSE_DEV_OTP === 'true',
  otpProvider: process.env.RESEND_API_KEY ? 'resend' : (process.env.OTP_PROVIDER || (process.env.SMTP_HOST ? 'smtp' : 'console')),
  resendApiKey: (process.env.RESEND_API_KEY || '').trim().replace(/['"]/g, ''),
  resendFrom: process.env.RESEND_FROM || 'R2Cart <otp@r2cart.in>',
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: Number(process.env.SMTP_PORT || 465),
  smtpSecure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT || 465) === 465,
  smtpRejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED === 'true',
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  smtpFrom: process.env.SMTP_FROM || '',
  supportEmail: process.env.SUPPORT_EMAIL || process.env.SMTP_FROM || '',
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
  vapidSubject: process.env.VAPID_SUBJECT || (process.env.SUPPORT_EMAIL ? (process.env.SUPPORT_EMAIL.startsWith('mailto:') ? process.env.SUPPORT_EMAIL : `mailto:${process.env.SUPPORT_EMAIL}`) : ''),
  superAdminEmail: (process.env.SUPER_ADMIN_EMAIL || process.env.INITIAL_SUPER_ADMIN_EMAIL || 'super@gmail.com').trim().toLowerCase(),
  superAdminPassword: process.env.SUPER_ADMIN_PASSWORD || process.env.INITIAL_SUPER_ADMIN_PASSWORD || ''
};

if (env.otpProvider === 'smtp' && (!env.smtpHost || !env.smtpUser || !env.smtpPass || !env.smtpFrom)) {
  throw new Error('SMTP configuration is incomplete');
}

if (env.otpProvider === 'resend' && !env.resendApiKey) {
  throw new Error('Resend configuration is incomplete. Missing RESEND_API_KEY');
}
