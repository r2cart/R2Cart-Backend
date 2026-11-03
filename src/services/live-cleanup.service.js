import { prisma } from '../config/prisma.js';

/**
 * Safe Live Production Database Cleanup Runner
 * Deletes all orders, all inquiries, and non-admin customers
 * Preserves staff/admin accounts and tevadej256@hopefunder.com
 */
export async function runOneTimeProductionCleanup() {
  console.log('[LiveCleanup] Starting real live database cleanup...');

  try {
    // 1. Temporarily disable foreign key checks for this MySQL session
    await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0;');

    // 2. Delete all inquiries & support tickets
    const [deletedEnquiries, deletedTicketMessages, deletedSupportTickets] = await Promise.all([
      prisma.productEnquiry.deleteMany({}),
      prisma.ticketMessage.deleteMany({}),
      prisma.supportTicket.deleteMany({})
    ]);

    // 3. Delete all orders and child records safely
    await prisma.orderFifoAllocation.deleteMany({}).catch(() => {});
    await prisma.deliveryChatMessage.deleteMany({}).catch(() => {});
    await prisma.deliveryStatusLog.deleteMany({}).catch(() => {});
    await prisma.deliveryProof.deleteMany({}).catch(() => {});
    await prisma.deliveryAssignment.deleteMany({}).catch(() => {});
    await prisma.payment.deleteMany({}).catch(() => {});
    await prisma.orderStatusHistory.deleteMany({}).catch(() => {});
    await prisma.orderItem.deleteMany({}).catch(() => {});
    await prisma.couponUsage.deleteMany({}).catch(() => {});
    const deletedOrders = await prisma.order.deleteMany({});

    // 4. Find and delete Customer Users (preserving staff/admins and tevadej256@hopefunder.com)
    const customersToDelete = await prisma.user.findMany({
      where: {
        role: 'CUSTOMER',
        email: {
          not: 'tevadej256@hopefunder.com'
        }
      },
      select: { id: true, email: true, name: true }
    });

    let deletedCustomersCount = 0;
    if (customersToDelete.length > 0) {
      const deleteIds = customersToDelete.map(u => u.id);

      await prisma.address.deleteMany({ where: { userId: { in: deleteIds } } }).catch(() => {});
      await prisma.cartItem.deleteMany({ where: { cart: { userId: { in: deleteIds } } } }).catch(() => {});
      await prisma.cart.deleteMany({ where: { userId: { in: deleteIds } } }).catch(() => {});
      await prisma.favorite.deleteMany({ where: { userId: { in: deleteIds } } }).catch(() => {});
      await prisma.searchHistory.deleteMany({ where: { userId: { in: deleteIds } } }).catch(() => {});
      await prisma.refreshToken.deleteMany({ where: { userId: { in: deleteIds } } }).catch(() => {});
      await prisma.deviceToken.deleteMany({ where: { userId: { in: deleteIds } } }).catch(() => {});
      await prisma.pushSubscription.deleteMany({ where: { userId: { in: deleteIds } } }).catch(() => {});
      await prisma.productRating.deleteMany({ where: { userId: { in: deleteIds } } }).catch(() => {});

      const deletedUsers = await prisma.user.deleteMany({
        where: { id: { in: deleteIds } }
      });
      deletedCustomersCount = deletedUsers.count;
    }

    // 5. Re-enable foreign key checks
    await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1;');

    const remainingUsers = await prisma.user.findMany({
      select: { id: true, email: true, role: true, name: true }
    });

    const [ordersCount, enquiriesCount, ticketsCount] = await Promise.all([
      prisma.order.count(),
      prisma.productEnquiry.count(),
      prisma.supportTicket.count()
    ]);

    const result = {
      ordersCount,
      enquiriesCount,
      ticketsCount,
      deletedCustomersCount,
      remainingUsers
    };

    console.log('[LiveCleanup] Completed! Results:', JSON.stringify(result, null, 2));
    return result;
  } catch (err) {
    await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1;').catch(() => {});
    console.error('[LiveCleanup] Error during live cleanup:', err.message);
    throw err;
  }
}
