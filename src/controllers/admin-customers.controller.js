import { prisma } from '../config/prisma.js';
import { AppError, asyncHandler, ok } from '../utils/response.js';

export const customers = asyncHandler(async (req, res) => {
  const where = { role: 'CUSTOMER' };
  if (req.query.q) {
    where.OR = [
      { name: { contains: String(req.query.q) } },
      { email: { contains: String(req.query.q) } },
      { mobile: { contains: String(req.query.q) } }
    ];
  }
  if (req.query.status) {
    if (!['ACTIVE', 'INACTIVE'].includes(req.query.status)) {
      throw new AppError('Invalid customer status', 422);
    }
    where.status = req.query.status;
  }
  const rows = await prisma.user.findMany({
    where,
    select: {
      id: true,
      name: true,
      email: true,
      mobile: true,
      status: true,
      createdAt: true,
      addresses: true,
      orders: {
        select: {
          id: true,
          orderNumber: true,
          grandTotal: true,
          status: true,
          createdAt: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  ok(
    res,
    rows.map(user => ({
      ...user,
      totalOrders: user.orders.length,
      totalSpent: user.orders
        .filter(order => order.status === 'DELIVERED')
        .reduce((sum, order) => sum + Number(order.grandTotal), 0)
    }))
  );
});

export const setCustomerStatus = asyncHandler(async (req, res) => {
  const status = String(req.body.status || '').toUpperCase();
  if (!['ACTIVE', 'INACTIVE'].includes(status)) {
    throw new AppError('Invalid customer status', 422);
  }
  const user = await prisma.user.findFirst({
    where: { id: req.params.id, role: 'CUSTOMER' },
    select: { id: true }
  });
  if (!user) throw new AppError('Customer not found', 404);

  await prisma.user.update({
    where: { id: user.id },
    data: { status }
  });

  ok(res, { id: user.id, status }, 'Customer status updated');
});

export const deleteCustomer = asyncHandler(async (req, res) => {
  const currentRole = req.user?.role;
  const currentStaffRole = req.user?.staffRole;
  const isSuperAdmin = currentRole === 'SUPER_ADMIN' || currentStaffRole === 'SUPER_ADMIN';
  const isAdmin = currentRole === 'ADMIN' || currentStaffRole === 'ADMIN';

  if (!isSuperAdmin && !isAdmin) {
    throw new AppError('Only Admins and Super Admins are authorized to delete customer accounts', 403);
  }

  const { id } = req.params;
  const customer = await prisma.user.findFirst({
    where: { id, role: 'CUSTOMER' },
    select: { id: true, name: true, email: true }
  });

  if (!customer) {
    throw new AppError('Customer not found or is not a customer account', 404);
  }

  await prisma.$transaction(async tx => {
    // 1. Find all orders placed by this customer
    const customerOrders = await tx.order.findMany({
      where: { userId: id },
      select: { id: true }
    });
    const orderIds = customerOrders.map(o => o.id);

    // 2. Cascade delete all dependencies linked to customer's orders
    if (orderIds.length > 0) {
      await tx.couponUsage.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.payment.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.deliveryProof.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.deliveryStatusLog.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.codCollection.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.deliveryChatMessage.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.deliveryAssignment.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.order.deleteMany({ where: { id: { in: orderIds } } });
    }

    // 3. Delete all direct customer dependencies
    await tx.ticketMessage.deleteMany({ where: { ticket: { userId: id } } });
    await tx.supportTicket.deleteMany({ where: { userId: id } });
    await tx.couponUsage.deleteMany({ where: { userId: id } });
    await tx.productRating.deleteMany({ where: { userId: id } });
    await tx.cartItem.deleteMany({ where: { cart: { userId: id } } });
    await tx.cart.deleteMany({ where: { userId: id } });
    await tx.favorite.deleteMany({ where: { userId: id } });
    await tx.address.deleteMany({ where: { userId: id } });
    await tx.refreshToken.deleteMany({ where: { userId: id } });
    await tx.searchHistory.deleteMany({ where: { userId: id } });
    await tx.pushSubscription.deleteMany({ where: { userId: id } });
    await tx.deviceToken.deleteMany({ where: { userId: id } });
    await tx.deliveryChatMessage.deleteMany({ where: { senderId: id } });

    // 4. Finally delete customer record from users table
    await tx.user.delete({ where: { id } });
  });

  ok(
    res,
    { id, name: customer.name, email: customer.email },
    'Customer permanently deleted from database'
  );
});
