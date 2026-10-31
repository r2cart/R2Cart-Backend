import { prisma } from '../config/prisma.js';
import { AppError, asyncHandler, ok } from '../utils/response.js';
import { resolveUserCategoryScope } from '../utils/category-scope.js';

export const customers = asyncHandler(async (req, res) => {
  const scope = await resolveUserCategoryScope(req.user);

  const where = { role: 'CUSTOMER' };

  // Category-scoped: only show customers who have placed at least one order
  // containing a product from the admin's assigned category/categories.
  if (scope.isScoped) {
    if (scope.categoryIds.length === 0) {
      // No categories assigned → return empty list (safe default)
      return ok(res, []);
    }
    where.orders = {
      some: {
        items: {
          some: {
            product: { categoryId: { in: scope.categoryIds } }
          }
        }
      }
    };
  }

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
        // For scoped users: only include orders that contain category items
        ...(scope.isScoped && {
          where: {
            items: {
              some: {
                product: { categoryId: { in: scope.categoryIds } }
              }
            }
          }
        }),
        select: {
          id: true,
          orderNumber: true,
          grandTotal: true,
          status: true,
          createdAt: true,
          items: scope.isScoped ? {
            where: { product: { categoryId: { in: scope.categoryIds } } },
            select: { id: true, price: true, quantity: true }
          } : false
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  ok(
    res,
    rows.map(user => {
      const relevantOrders = user.orders;
      const totalSpent = relevantOrders
        .filter(order => order.status === 'DELIVERED')
        .reduce((sum, order) => {
          // For scoped: sum only category item amounts instead of order grandTotal
          if (scope.isScoped && Array.isArray(order.items)) {
            return sum + order.items.reduce((s, item) => s + Number(item.price) * item.quantity, 0);
          }
          return sum + Number(order.grandTotal);
        }, 0);

      return {
        ...user,
        orders: relevantOrders.map(o => ({ ...o, items: undefined })), // strip items from response
        totalOrders: relevantOrders.length,
        totalSpent
      };
    })
  );
});

export const setCustomerStatus = asyncHandler(async (req, res) => {
  // Category Admins cannot change customer account status
  const scope = await resolveUserCategoryScope(req.user);
  if (scope.isScoped) {
    throw new AppError('Access denied: Only store-level admins can modify customer account status', 403);
  }

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
  // Category Admins cannot delete customers
  const scope = await resolveUserCategoryScope(req.user);
  if (scope.isScoped) {
    throw new AppError('Access denied: Only store-level admins can delete customer accounts', 403);
  }

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
    const customerOrders = await tx.order.findMany({
      where: { userId: id },
      select: { id: true }
    });
    const orderIds = customerOrders.map(o => o.id);

    if (orderIds.length > 0) {
      await Promise.all([
        tx.couponUsage.deleteMany({ where: { orderId: { in: orderIds } } }),
        tx.payment.deleteMany({ where: { orderId: { in: orderIds } } }),
        tx.deliveryProof.deleteMany({ where: { orderId: { in: orderIds } } }),
        tx.deliveryStatusLog.deleteMany({ where: { orderId: { in: orderIds } } }),
        tx.codCollection.deleteMany({ where: { orderId: { in: orderIds } } }),
        tx.deliveryChatMessage.deleteMany({ where: { orderId: { in: orderIds } } }),
        tx.deliveryAssignment.deleteMany({ where: { orderId: { in: orderIds } } }),
        tx.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } }),
        tx.orderItem.deleteMany({ where: { orderId: { in: orderIds } } })
      ]);
      await tx.order.deleteMany({ where: { id: { in: orderIds } } });
    }

    await Promise.all([
      tx.ticketMessage.deleteMany({ where: { ticket: { userId: id } } }),
      tx.supportTicket.deleteMany({ where: { userId: id } }),
      tx.couponUsage.deleteMany({ where: { userId: id } }),
      tx.productRating.deleteMany({ where: { userId: id } }),
      tx.cartItem.deleteMany({ where: { cart: { userId: id } } }),
      tx.cart.deleteMany({ where: { userId: id } }),
      tx.favorite.deleteMany({ where: { userId: id } }),
      tx.address.deleteMany({ where: { userId: id } }),
      tx.refreshToken.deleteMany({ where: { userId: id } }),
      tx.searchHistory.deleteMany({ where: { userId: id } }),
      tx.pushSubscription.deleteMany({ where: { userId: id } }),
      tx.deviceToken.deleteMany({ where: { userId: id } }),
      tx.deliveryChatMessage.deleteMany({ where: { senderId: id } })
    ]);

    await tx.user.delete({ where: { id } });
  }, {
    maxWait: 15000,
    timeout: 45000
  });

  ok(
    res,
    { id, name: customer.name, email: customer.email },
    'Customer permanently deleted from database'
  );
});
