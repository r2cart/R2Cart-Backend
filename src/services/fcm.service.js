import { prisma } from '../config/prisma.js';
import { getFirebaseMessaging } from '../config/firebase.js';

export async function saveDeviceToken({ userId, role = 'CUSTOMER', token, platform = 'WEB', userAgent }) {
  if (!token) throw new Error('Device token is required');

  const cleanToken = String(token).trim();
  return prisma.deviceToken.upsert({
    where: { token: cleanToken },
    update: {
      userId: userId || undefined,
      role: role || 'CUSTOMER',
      platform: platform || 'WEB',
      userAgent: userAgent ? String(userAgent).slice(0, 500) : undefined,
      updatedAt: new Date(),
    },
    create: {
      userId: userId || null,
      role: role || 'CUSTOMER',
      token: cleanToken,
      platform: platform || 'WEB',
      userAgent: userAgent ? String(userAgent).slice(0, 500) : null,
    },
  });
}

export async function removeDeviceToken(token) {
  if (!token) return null;
  try {
    return await prisma.deviceToken.deleteMany({
      where: { token: String(token).trim() },
    });
  } catch (err) {
    console.error('Error removing device token:', err.message);
    return null;
  }
}

export async function sendFcmMulticast({ tokens, notification, data = {} }) {
  const messaging = getFirebaseMessaging();
  if (!messaging) {
    console.warn('[FCM] Skipping push: Firebase Admin is not initialized.');
    return { success: false, reason: 'unconfigured' };
  }

  const validTokens = [...new Set(tokens.filter(Boolean))];
  if (!validTokens.length) return { success: true, count: 0 };

  const stringData = Object.entries(data).reduce((acc, [k, v]) => {
    acc[k] = String(v ?? '');
    return acc;
  }, {});

  try {
    const response = await messaging.sendEachForMulticast({
      tokens: validTokens,
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: stringData,
      webpush: {
        fcmOptions: {
          link: data.url || '/',
        },
        notification: {
          icon: '/r2cart-logo.png',
          badge: '/r2cart-logo.png',
        },
      },
    });

    console.log(`[FCM] Sent: ${response.successCount} succeeded, ${response.failureCount} failed out of ${validTokens.length}`);

    // Cleanup expired/unregistered tokens
    if (response.failureCount > 0) {
      const expiredTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const code = resp.error?.code;
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token'
          ) {
            expiredTokens.push(validTokens[idx]);
          }
        }
      });

      if (expiredTokens.length) {
        await prisma.deviceToken.deleteMany({
          where: { token: { in: expiredTokens } },
        });
        console.log(`[FCM] Cleaned up ${expiredTokens.length} expired device tokens.`);
      }
    }

    return { success: true, response };
  } catch (err) {
    console.error('[FCM] Multicast send error:', err.message);
    return { success: false, error: err.message };
  }
}

export async function sendFcmToAdminsNewOrder(order) {
  try {
    const adminTokens = await prisma.deviceToken.findMany({
      where: {
        OR: [
          { role: 'ADMIN' },
          { user: { role: 'ADMIN' } },
        ],
      },
    });

    if (!adminTokens.length) return;

    const customerName = order.user?.name || order.addressSnapshot?.name || 'A customer';
    const total = Number(order.grandTotal || 0).toLocaleString('en-IN');
    const itemsCount = order.items?.length || 1;

    await sendFcmMulticast({
      tokens: adminTokens.map((t) => t.token),
      notification: {
        title: '🚨 New Order Received!',
        body: `Order #${order.orderNumber} for ₹${total} (${itemsCount} items) placed by ${customerName}.`,
      },
      data: {
        url: `/admin/orders/${order.id}`,
        orderId: order.id,
        orderNumber: order.orderNumber,
        type: 'ADMIN_NEW_ORDER',
      },
    });
  } catch (err) {
    console.error('Error in sendFcmToAdminsNewOrder:', err.message);
  }
}

export async function sendFcmToAdminsOrderCancelled(order, reason = '', cancelledByName = 'Customer') {
  try {
    const adminTokens = await prisma.deviceToken.findMany({
      where: {
        OR: [
          { role: 'ADMIN' },
          { role: 'SUPER_ADMIN' },
          { user: { role: 'ADMIN' } },
          { user: { role: 'SUPER_ADMIN' } },
        ],
      },
    });

    if (!adminTokens.length) return;

    const reasonText = reason ? `: "${reason}"` : '';
    await sendFcmMulticast({
      tokens: adminTokens.map((t) => t.token),
      notification: {
        title: `❌ Order #${order.orderNumber} Cancelled`,
        body: `Cancelled by ${cancelledByName}${reasonText}. Deducted items restored.`,
      },
      data: {
        url: `/admin/orders/${order.id}`,
        orderId: order.id,
        orderNumber: order.orderNumber,
        reason: reason,
        type: 'ADMIN_ORDER_CANCELLED',
      },
    });
  } catch (err) {
    console.error('Error in sendFcmToAdminsOrderCancelled:', err.message);
  }
}

export async function sendFcmToCustomerOrderPlaced(order) {
  try {
    if (!order.userId) return;

    const customerTokens = await prisma.deviceToken.findMany({
      where: { userId: order.userId },
    });

    if (!customerTokens.length) return;

    const total = Number(order.grandTotal || 0).toLocaleString('en-IN');

    await sendFcmMulticast({
      tokens: customerTokens.map((t) => t.token),
      notification: {
        title: '🎉 Order Placed Successfully!',
        body: `Your order #${order.orderNumber} for ₹${total} is confirmed and is being processed.`,
      },
      data: {
        url: `/orders/${order.id}`,
        orderId: order.id,
        orderNumber: order.orderNumber,
        type: 'CUSTOMER_ORDER_PLACED',
      },
    });
  } catch (err) {
    console.error('Error in sendFcmToCustomerOrderPlaced:', err.message);
  }
}

export async function sendFcmToCustomerStatusUpdate(order, newStatus, note = '') {
  try {
    if (!order.userId) return;

    const customerTokens = await prisma.deviceToken.findMany({
      where: { userId: order.userId },
    });

    if (!customerTokens.length) return;

    const STATUS_MESSAGES = {
      CONFIRMED: { title: '👍 Order Confirmed', body: `Your order #${order.orderNumber} has been accepted and confirmed.` },
      PACKING: { title: '📦 Order is Being Packed', body: `We are packing items for order #${order.orderNumber}.` },
      OUT_FOR_DELIVERY: { title: '🚚 Out for Delivery!', body: `Order #${order.orderNumber} is out for delivery. Partner is on the way!` },
      DELIVERED: { title: '✅ Order Delivered!', body: `Order #${order.orderNumber} has been delivered. Thank you for shopping with R2Cart!` },
      CANCELLED: { title: '❌ Order Cancelled', body: note || `Order #${order.orderNumber} has been cancelled.` },
    };

    const statusConfig = STATUS_MESSAGES[newStatus] || {
      title: `Order Status: ${newStatus}`,
      body: `Your order #${order.orderNumber} status changed to ${newStatus}.`,
    };

    await sendFcmMulticast({
      tokens: customerTokens.map((t) => t.token),
      notification: {
        title: statusConfig.title,
        body: statusConfig.body,
      },
      data: {
        url: `/orders/${order.id}`,
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: newStatus,
        type: 'CUSTOMER_ORDER_STATUS',
      },
    });
  } catch (err) {
    console.error('Error in sendFcmToCustomerStatusUpdate:', err.message);
  }
}

export async function sendFcmToRiderNewAssignment(assignment, order, staff) {
  try {
    const riderId = assignment.deliveryPersonId || staff?.id;
    if (!riderId) return;

    const riderTokens = await prisma.deviceToken.findMany({
      where: {
        OR: [
          { userId: riderId },
          { user: { id: riderId } },
          { role: 'DELIVERY_PERSON', userId: riderId },
        ],
      },
    });

    if (!riderTokens.length) return;

    const addr = typeof order?.addressSnapshot === 'object' && order.addressSnapshot ? order.addressSnapshot : {};
    const village = addr.villageName || addr.village || addr.area || addr.deliveryZone?.name || 'Customer location';
    const total = Number(order?.grandTotal || 0).toLocaleString('en-IN');
    const itemsCount = (order?.items || []).length || 1;

    await sendFcmMulticast({
      tokens: riderTokens.map((t) => t.token),
      notification: {
        title: '🛵 New Delivery Assigned!',
        body: `Order #${order?.orderNumber || ''} (₹${total}, ${itemsCount} items) in ${village} assigned to you. Tap to accept.`,
      },
      data: {
        url: `/delivery`,
        assignmentId: assignment.id,
        orderId: order?.id,
        orderNumber: order?.orderNumber,
        type: 'RIDER_NEW_ASSIGNMENT',
      },
    });
  } catch (err) {
    console.error('Error in sendFcmToRiderNewAssignment:', err.message);
  }
}

export async function sendFcmToRiderReassignedAway(assignment, order, staff) {
  try {
    const riderId = assignment.deliveryPersonId || staff?.id;
    if (!riderId) return;

    const riderTokens = await prisma.deviceToken.findMany({
      where: {
        OR: [
          { userId: riderId },
          { user: { id: riderId } },
          { role: 'DELIVERY_PERSON', userId: riderId },
        ],
      },
    });

    if (!riderTokens.length) return;

    await sendFcmMulticast({
      tokens: riderTokens.map((t) => t.token),
      notification: {
        title: 'ℹ️ Delivery Reassigned',
        body: `Order #${order?.orderNumber} was reassigned to another delivery partner.`,
      },
      data: {
        url: `/delivery`,
        assignmentId: assignment.id,
        orderId: order?.id,
        orderNumber: order?.orderNumber,
        type: 'RIDER_REASSIGNED',
      },
    });
  } catch (err) {
    console.error('Error in sendFcmToRiderReassignedAway:', err.message);
  }
}

