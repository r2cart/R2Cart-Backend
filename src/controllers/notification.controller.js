import { env } from '../config/env.js';
import { ok, created, AppError, asyncHandler } from '../utils/response.js';
import {
  savePushSubscription,
  removePushSubscription,
  sendNotificationToSubscription,
} from '../services/notification.service.js';

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

  const result = await sendNotificationToSubscription(
    {
      endpoint: sub.endpoint,
      p256dh: sub.keys?.p256dh,
      auth: sub.keys?.auth,
    },
    {
      title: '🔔 Test Notification from R2Cart',
      body: 'Push notifications are working properly on this browser!',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
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
