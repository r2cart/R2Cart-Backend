import { prisma } from '../config/prisma.js';
import { AppError, asyncHandler, created, ok } from '../utils/response.js';
import { notifyCustomerDeliveryChatMessage, notifyRiderDeliveryChatMessage } from '../services/notification.service.js';

export const deliveryChatController = {
  // ========================================================
  // 1. CUSTOMER: Get Chat History & Rider Info
  // ========================================================
  getCustomerChat: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    const isAdmin = ['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(req.user.role);

    const orderWhere = {
      OR: [{ id }, { orderNumber: id }]
    };
    if (!isAdmin) {
      orderWhere.userId = userId;
    }

    const order = await prisma.order.findFirst({
      where: orderWhere,
      include: {
        deliveryAssignments: {
          orderBy: { createdAt: 'desc' },
          include: {
            deliveryPerson: {
              select: {
                id: true,
                name: true,
                mobile: true,
                dutyStatus: true,
                vehicleType: true,
                vehicleNumber: true
              }
            }
          }
        }
      }
    });

    if (!order) {
      throw new AppError('Order not found or unauthorized', 404);
    }

    const currentAssignment = order.deliveryAssignments.find(a => a.isCurrent) || order.deliveryAssignments[0] || null;
    const rider = currentAssignment?.deliveryPerson || null;

    // Fetch messages for this order
    const messages = await prisma.deliveryChatMessage.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: 'asc' }
    });

    // Mark unread messages sent by rider as read by customer
    prisma.deliveryChatMessage.updateMany({
      where: {
        orderId: order.id,
        senderRole: 'DELIVERY_PERSON',
        isRead: false
      },
      data: {
        isRead: true,
        readAt: new Date()
      }
    }).catch(err => console.warn('[DeliveryChat] Mark read error:', err.message));

    const riderInfo = rider ? {
      id: rider.id,
      name: rider.name,
      mobile: rider.mobile,
      dutyStatus: rider.dutyStatus,
      vehicleType: rider.vehicleType,
      vehicleNumber: rider.vehicleNumber
    } : null;

    ok(res, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderStatus: order.status,
      assignmentStatus: currentAssignment?.status || null,
      isOutForDelivery: order.status === 'OUT_FOR_DELIVERY' || currentAssignment?.status === 'OUT_FOR_DELIVERY',
      isDelivered: order.status === 'DELIVERED',
      rider: riderInfo,
      deliveryPerson: riderInfo,
      messages
    });
  }),

  // ========================================================
  // 2. CUSTOMER: Send Message to Rider
  // ========================================================
  sendCustomerMessage: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    const text = String(req.body.message || '').trim();

    if (!text) {
      throw new AppError('Message content is required', 422);
    }
    if (text.length > 600) {
      throw new AppError('Message is too long (maximum 600 characters)', 422);
    }

    const orderWhere = {
      OR: [{ id }, { orderNumber: id }]
    };
    if (!['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(req.user.role)) {
      orderWhere.userId = userId;
    }

    const order = await prisma.order.findFirst({
      where: orderWhere,
      include: {
        deliveryAssignments: {
          orderBy: { createdAt: 'desc' },
          include: { deliveryPerson: true }
        }
      }
    });

    if (!order) {
      throw new AppError('Order not found or unauthorized', 404);
    }

    if (order.status === 'CANCELLED') {
      throw new AppError('Cannot send messages for a cancelled order', 400);
    }

    const assignment = order.deliveryAssignments.find(a => a.isCurrent) || order.deliveryAssignments[0] || null;

    const newMsg = await prisma.deliveryChatMessage.create({
      data: {
        orderId: order.id,
        assignmentId: assignment?.id || null,
        senderId: userId,
        senderRole: 'CUSTOMER',
        senderName: req.user.name || 'Customer',
        message: text,
        isRead: false
      }
    });

    // Notify Rider via Push Notification & FCM
    if (assignment?.deliveryPersonId) {
      notifyRiderDeliveryChatMessage(
        assignment.deliveryPersonId,
        order,
        text,
        req.user.name || 'Customer'
      ).catch(err => console.error('[DeliveryChat] Rider notify error:', err.message));
    }

    created(res, newMsg, 'Message sent to delivery partner');
  }),

  // ========================================================
  // 3. RIDER: Get Chat History for Assigned Order
  // ========================================================
  getRiderChat: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const riderId = req.user.id;

    // Find assignment for this delivery person - flexible lookup by assignment id, order id, or order number
    const assignment = await prisma.deliveryAssignment.findFirst({
      where: {
        deliveryPersonId: riderId,
        OR: [
          { id },
          { orderId: id },
          { order: { id } },
          { order: { orderNumber: id } }
        ]
      },
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          include: {
            user: { select: { id: true, name: true, mobile: true } }
          }
        }
      }
    });

    if (!assignment) {
      throw new AppError('Delivery assignment not found or not assigned to you', 404);
    }

    const order = assignment.order;
    const customer = order?.user || {};
    const addr = typeof order?.addressSnapshot === 'object' && order?.addressSnapshot ? order.addressSnapshot : {};

    const messages = await prisma.deliveryChatMessage.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: 'asc' }
    });

    // Mark unread messages sent by customer as read by rider
    prisma.deliveryChatMessage.updateMany({
      where: {
        orderId: order.id,
        senderRole: 'CUSTOMER',
        isRead: false
      },
      data: {
        isRead: true,
        readAt: new Date()
      }
    }).catch(err => console.warn('[DeliveryChat] Rider mark read error:', err.message));

    ok(res, {
      assignmentId: assignment.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderStatus: order.status,
      assignmentStatus: assignment.status,
      customer: {
        id: customer.id,
        name: addr.fullName || addr.name || customer.name || 'Customer',
        mobile: addr.mobile || addr.phone || customer.mobile || ''
      },
      deliveryAddress: [addr.house, addr.street, addr.landmark, addr.area || addr.villageName, addr.city].filter(Boolean).join(', ') || 'Address not provided',
      messages
    });
  }),

  // ========================================================
  // 4. RIDER: Send Message to Customer
  // ========================================================
  sendRiderMessage: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const riderId = req.user.id;
    const text = String(req.body.message || '').trim();

    if (!text) {
      throw new AppError('Message content is required', 422);
    }
    if (text.length > 600) {
      throw new AppError('Message is too long (maximum 600 characters)', 422);
    }

    const assignment = await prisma.deliveryAssignment.findFirst({
      where: {
        deliveryPersonId: riderId,
        OR: [
          { id },
          { orderId: id },
          { order: { id } },
          { order: { orderNumber: id } }
        ]
      },
      orderBy: { createdAt: 'desc' },
      include: {
        order: true
      }
    });

    if (!assignment) {
      throw new AppError('Delivery assignment not found or not assigned to you', 404);
    }

    const order = assignment.order;

    const newMsg = await prisma.deliveryChatMessage.create({
      data: {
        orderId: order.id,
        assignmentId: assignment.id,
        senderId: riderId,
        senderRole: 'DELIVERY_PERSON',
        senderName: req.user.name || 'Delivery Partner',
        message: text,
        isRead: false
      }
    });

    // Notify Customer via Push Notification
    if (order.userId) {
      notifyCustomerDeliveryChatMessage(
        order.userId,
        order,
        text,
        req.user.name || 'Delivery Partner'
      ).catch(err => console.error('[DeliveryChat] Customer notify error:', err.message));
    }

    created(res, newMsg, 'Message sent to customer');
  })
};
