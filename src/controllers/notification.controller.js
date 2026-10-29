import { env } from '../config/env.js';
import { ok, created, AppError, asyncHandler } from '../utils/response.js';

// SSRF allowlist — only known push service hosts are permitted (BUG-04)
const ALLOWED_PUSH_HOSTS = [
  'fcm.googleapis.com',          // Google FCM
  'updates.push.services.mozilla.com', // Firefox
  'updates-autopush.stage.mozaws.net', // Firefox staging
  'web.push.apple.com',          // Safari / Apple
  'edge.microsoft.com',          // Edge
  'wns2.notify.windows.com',     // Windows Push Notification Service
  'notify.windows.com',
];

function assertSafePushEndpoint(endpoint) {
  let parsed;
  try { parsed = new URL(endpoint); } catch {
    throw new AppError('Invalid subscription endpoint URL', 400);
  }
  if (parsed.protocol !== 'https:') {
    throw new AppError('Push endpoint must use HTTPS', 400);
  }
  const host = parsed.hostname.toLowerCase();
  const allowed = ALLOWED_PUSH_HOSTS.some(h => host === h || host.endsWith('.' + h));
  if (!allowed) {
    throw new AppError('Push endpoint host is not a recognised push service', 400);
  }
}
import {
  savePushSubscription,
  removePushSubscription,
  sendNotificationToSubscription,
} from '../services/notification.service.js';
import {
  saveDeviceToken,
  removeDeviceToken,
} from '../services/fcm.service.js';

export const getVapidPublicKey = asyncHandler(async (req, res) => {
  if (!env.vapidPublicKey) {
    throw new AppError('Push notifications are not configured on this server', 503);
  }
  ok(res, { publicKey: env.vapidPublicKey });
});

export const subscribe = asyncHandler(async (req, res) => {
  const { subscription, role } = req.body;
  if (!subscription || !subscription.endpoint || !subscription.keys) {
    throw new AppError('Valid push subscription object is required', 400);
  }

  const assignedRole = (req.user?.role === 'ADMIN' || role === 'ADMIN') ? 'ADMIN' : 'CUSTOMER';
  const userId = (assignedRole === 'ADMIN' && req.user?.role !== 'ADMIN') ? null : (req.user?.id || null);
  const userAgent = req.headers['user-agent'] || null;

  // SSRF guard — validate endpoint before persisting (BUG-04)
  assertSafePushEndpoint(subscription.endpoint);

  const saved = await savePushSubscription({
    userId,
    role: assignedRole,
    subscription,
    userAgent,
  });

  created(res, { id: saved.id, role: saved.role }, 'Subscribed to push notifications successfully');
});

export const unsubscribe = asyncHandler(async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) {
    throw new AppError('Endpoint is required to unsubscribe', 400);
  }

  await removePushSubscription(endpoint);
  ok(res, null, 'Unsubscribed successfully');
});

export const sendTestPush = asyncHandler(async (req, res) => {
  const { subscription } = req.body;
  let sub = subscription;

  if (!sub || !sub.endpoint) {
    throw new AppError('Subscription is required for test notification', 400);
  }

  // SSRF guard — reject arbitrary/internal URLs (BUG-04)
  assertSafePushEndpoint(sub.endpoint);

  const result = await sendNotificationToSubscription(
    {
      endpoint: sub.endpoint,
      p256dh: sub.keys?.p256dh,
      auth: sub.keys?.auth,
    },
    {
      title: '🔔 Test Notification from R2Cart',
      body: 'Push notifications are working properly on this browser!',
      icon: '/r2cart-logo.png',
      badge: '/r2cart-logo.png',
      tag: 'test-push',
      url: req.user?.role === 'ADMIN' ? '/admin' : '/',
      data: {
        url: req.user?.role === 'ADMIN' ? '/admin' : '/',
        type: 'TEST_PUSH',
      },
    }
  );

  if (!result.success) {
    throw new AppError(result.error || 'Failed to send test push notification', 500);
  }

  ok(res, { success: true }, 'Test push notification sent successfully');
});

export const registerFcmToken = asyncHandler(async (req, res) => {
  const { token, role, platform } = req.body;
  if (!token) {
    throw new AppError('Valid FCM device token is required', 400);
  }

  const assignedRole = (req.user?.role === 'ADMIN' || role === 'ADMIN') ? 'ADMIN' : 'CUSTOMER';
  const userId = (assignedRole === 'ADMIN' && req.user?.role !== 'ADMIN') ? null : (req.user?.id || null);
  const userAgent = req.headers['user-agent'] || null;

  const saved = await saveDeviceToken({
    userId,
    role: assignedRole,
    token,
    platform: platform || 'WEB',
    userAgent,
  });

  created(res, { id: saved.id, role: saved.role }, 'FCM token registered successfully');
});

export const unregisterFcmToken = asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) {
    throw new AppError('Token is required', 400);
  }

  await removeDeviceToken(token);
  ok(res, null, 'FCM token unregistered successfully');
});
