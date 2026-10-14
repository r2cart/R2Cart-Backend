import {prisma} from '../config/prisma.js';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'pendingpasswordhash',
  'token',
  'refreshtoken',
  'codehash',
  'otp',
  'secret',
  'authorization',
  'cookie'
]);

function sanitizeDetails(data) {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sanitizeDetails);

  const clean = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      clean[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      clean[key] = sanitizeDetails(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

export function logAudit(req, { module, action, resourceId = null, resourceName = null, details = null }) {
  // Execute asynchronously without blocking the API response
  Promise.resolve().then(async () => {
    try {
      const user = req?.user;
      const ip = req?.ip || req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || null;
      const userAgent = req?.headers?.['user-agent'] || null;

      await prisma.auditLog.create({
        data: {
          userId: user?.id || null,
          userName: user?.name || 'System / Anonymous',
          userRole: user?.staffRole || user?.role || 'SYSTEM',
          module: String(module || 'GENERAL').toUpperCase(),
          action: String(action || 'ACTION').toUpperCase(),
          resourceId: resourceId ? String(resourceId) : null,
          resourceName: resourceName ? String(resourceName) : null,
          details: details ? sanitizeDetails(details) : null,
          ipAddress: ip ? String(ip).slice(0, 45) : null,
          userAgent: userAgent ? String(userAgent).slice(0, 500) : null
        }
      });
    } catch (err) {
      console.error('[AuditLog] Failed to record audit log:', err.message);
    }
  });
}
