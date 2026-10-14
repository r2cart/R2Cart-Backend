import webpush from 'web-push';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';

if (env.vapidPublicKey && env.vapidPrivateKey) {
  try {
    webpush.setVapidDetails(
      env.vapidSubject || 'mailto:r2cartsupport@gmail.com',
      env.vapidPublicKey,
      env.vapidPrivateKey
    );
  } catch (err) {
    console.error('Failed to configure VAPID details for web-push:', err.message);
  }
}

export async function savePushSubscription({ userId, role = 'CUSTOMER', subscription, userAgent }) {
  if (!subscription || !subscription.endpoint || !subscription.keys) {
    throw new Error('Invalid push subscription payload');
  }

  const endpoint = String(subscription.endpoint).trim();
  const p256dh = String(subscription.keys.p256dh || '').trim();
  const auth = String(subscription.keys.auth || '').trim();

  if (!endpoint || !p256dh || !auth) {
    throw new Error('Subscription requires endpoint, p256dh, and auth keys');
  }

  return prisma.pushSubscription.upsert({
    where: { endpoint },
    update: {
      userId: userId || undefined,
      role: role || 'CUSTOMER',
      p256dh,
      auth,
      userAgent: userAgent ? String(userAgent).slice(0, 500) : undefined,
      updatedAt: new Date(),
    },
    create: {
      userId: userId || null,
      role: role || 'CUSTOMER',
      endpoint,
      p256dh,
      auth,
      userAgent: userAgent ? String(userAgent).slice(0, 500) : null,
    },
  });
}

export async function removePushSubscription(endpoint) {
  if (!endpoint) return null;
  try {
    return await prisma.pushSubscription.deleteMany({
      where: { endpoint: String(endpoint).trim() },
    });
  } catch (err) {
    console.error('Error removing push subscription:', err.message);
    return null;
  }
}

export async function sendNotificationToSubscription(sub, payload) {
  const pushConfig = {
    endpoint: sub.endpoint,
    keys: {
      p256dh: sub.p256dh,
      auth: sub.auth,
    },
  };

  const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);

  try {
    await webpush.sendNotification(pushConfig, payloadString, {
      TTL: 60 * 60 * 24, // 24 hours
      urgency: 'high',
    });
    return { success: true };
  } catch (err) {
    // 404 Not Found or 410 Gone means the subscription is no longer valid or unsubscribed
    if (err.statusCode === 404 || err.statusCode === 410) {
      await removePushSubscription(sub.endpoint);
    } else {
      console.error(`Failed to send web push to ${sub.endpoint.slice(0, 40)}...`, err.message);
    }
    return { success: false, error: err.message, statusCode: err.statusCode };
  }
}

export async function notifyAdminsNewOrder(order) {
  try {
    // Find subscriptions belonging to ADMIN or with admin role
    const adminSubs = await prisma.pushSubscription.findMany({
      where: {
        OR: [
          { role: 'ADMIN' },
          { user: { role: 'ADMIN' } },
        ],
      },
    });

    let targets = adminSubs;
    if (!targets.length) {
      targets = await prisma.pushSubscription.findMany({
        take: 5,
        orderBy: { updatedAt: 'desc' },
      });
      console.log(`[Push Notification] No explicit ADMIN subscriptions. Dispatching order #${order.orderNumber} to ${targets.length} active device(s).`);
    }
    if (!targets.length) return;

    const customerName = order.user?.name || order.addressSnapshot?.name || 'A customer';
    const total = Number(order.grandTotal || 0).toLocaleString('en-IN');
    const itemsCount = order.items?.length || 1;

    const payload = {
      title: '🚨 New Order Received!',
      body: `Order #${order.orderNumber} for ₹${total} (${itemsCount} items) placed by ${customerName}.`,
      icon: '/r2cart-logo.png',
      badge: '/r2cart-logo.png',
      tag: `new-order-${order.id}`,
      url: `/admin/orders/${order.id}`,
      data: {
        url: `/admin/orders/${order.id}`,
        orderId: order.id,
        orderNumber: order.orderNumber,
        type: 'ADMIN_NEW_ORDER',
      },
    };

    const results = await Promise.allSettled(
      targets.map((sub) => sendNotificationToSubscription(sub, payload))
    );
    const sentCount = results.filter((r) => r.status === 'fulfilled' && r.value?.success).length;
    console.log(`[Push Notification] Dispatched order #${order.orderNumber} to admins/targets: ${sentCount}/${targets.length} delivered.`);
  } catch (err) {
    console.error('Error in notifyAdminsNewOrder:', err.message);
  }
}

export async function notifyCustomerOrderPlaced(order) {
  try {
    if (!order.userId) return;

    const userSubs = await prisma.pushSubscription.findMany({
      where: { userId: order.userId },
    });

    if (!userSubs.length) return;

    const total = Number(order.grandTotal || 0).toLocaleString('en-IN');
    const payload = {
      title: '🎉 Order Placed Successfully!',
      body: `Your order #${order.orderNumber} for ₹${total} is confirmed and is being processed.`,
      icon: '/r2cart-logo.png',
      badge: '/r2cart-logo.png',
      tag: `order-${order.id}`,
      url: `/orders/${order.id}`,
      data: {
        url: `/orders/${order.id}`,
        orderId: order.id,
        orderNumber: order.orderNumber,
        type: 'CUSTOMER_ORDER_PLACED',
      },
    };

    await Promise.allSettled(
      userSubs.map((sub) => sendNotificationToSubscription(sub, payload))
    );
  } catch (err) {
    console.error('Error in notifyCustomerOrderPlaced:', err.message);
  }
}

const STATUS_MESSAGES = {
  CONFIRMED: {
    title: '👍 Order Confirmed',
    body: (num) => `Your order #${num} has been accepted and confirmed by R2Cart.`,
  },
  PACKING: {
    title: '📦 Order is Being Packed',
    body: (num) => `We are carefully packing items for order #${num}.`,
  },
  OUT_FOR_DELIVERY: {
    title: '🚚 Out for Delivery!',
    body: (num) => `Great news! Order #${num} is out for delivery. Our delivery partner is on the way.`,
  },
  DELIVERED: {
    title: '✅ Order Delivered!',
    body: (num) => `Order #${num} has been delivered. Thank you for shopping with R2Cart!`,
  },
  CANCELLED: {
    title: '❌ Order Cancelled',
    body: (num, note) => note || `Order #${num} has been cancelled.`,
  },
};

export async function notifyCustomerOrderStatusUpdate(order, newStatus, note = '') {
  try {
    if (!order.userId) return;

    const userSubs = await prisma.pushSubscription.findMany({
      where: { userId: order.userId },
    });

    if (!userSubs.length) return;

    const statusConfig = STATUS_MESSAGES[newStatus] || {
      title: `Order Status: ${newStatus}`,
      body: (num) => `Your order #${num} status changed to ${newStatus}.`,
    };

    const payload = {
      title: statusConfig.title,
      body: statusConfig.body(order.orderNumber, note),
      icon: '/r2cart-logo.png',
      badge: '/r2cart-logo.png',
      tag: `order-${order.id}-${newStatus.toLowerCase()}`,
      url: `/orders/${order.id}`,
      data: {
        url: `/orders/${order.id}`,
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: newStatus,
        type: 'CUSTOMER_ORDER_STATUS',
      },
    };

    await Promise.allSettled(
      userSubs.map((sub) => sendNotificationToSubscription(sub, payload))
    );
  } catch (err) {
    console.error('Error in notifyCustomerOrderStatusUpdate:', err.message);
  }
}
