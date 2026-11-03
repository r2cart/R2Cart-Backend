import { prisma } from '../config/prisma.js';

/**
 * Safe Live Production Database Cleanup Runner
 * Deletes all orders, all inquiries, and non-admin customers
 * Preserves staff/admin accounts and tevadej256@hopefunder.com
 */
export async function runOneTimeProductionCleanup() {
  console.log('[LiveCleanup] Starting real live database cleanup...');

  try {
    // 1. Delete all inquiries
    const deletedEnquiries = await prisma.productEnquiry.deleteMany({});
    const deletedTicketMessages = await prisma.ticketMessage.deleteMany({});
    const deletedSupportTickets = await prisma.supportTicket.deleteMany({});
    console.log(`[LiveCleanup] Deleted enquiries: ${deletedEnquiries.count}, tickets: ${deletedSupportTickets.count}`);

    // 2. Delete all orders and related records
    const deletedCouponUsages = await prisma.couponUsage.deleteMany({});
    const deletedOrders = await prisma.order.deleteMany({});
    console.log(`[LiveCleanup] Deleted orders: ${deletedOrders.count}`);

    // 3. Find Customer Users to delete (excluding staff/admins and tevadej256@hopefunder.com)
    const customersToDelete = await prisma.user.findMany({
      where: {
        role: 'CUSTOMER',
        email: {
          not: 'tevadej256@hopefunder.com'
        }
      },
      select: { id: true, email: true, name: true }
    });

    console.log(`[LiveCleanup] Found ${customersToDelete.length} customer users to delete.`);
    let deletedCustomersCount = 0;

    if (customersToDelete.length > 0) {
      const deleteIds = customersToDelete.map(u => u.id);

      await prisma.address.deleteMany({ where: { userId: { in: deleteIds } } });
      await prisma.cartItem.deleteMany({ where: { cart: { userId: { in: deleteIds } } } });
      await prisma.cart.deleteMany({ where: { userId: { in: deleteIds } } });
      await prisma.favorite.deleteMany({ where: { userId: { in: deleteIds } } });
      await prisma.searchHistory.deleteMany({ where: { userId: { in: deleteIds } } });
      await prisma.refreshToken.deleteMany({ where: { userId: { in: deleteIds } } });
      await prisma.deviceToken.deleteMany({ where: { userId: { in: deleteIds } } });
      await prisma.pushSubscription.deleteMany({ where: { userId: { in: deleteIds } } });
      await prisma.productRating.deleteMany({ where: { userId: { in: deleteIds } } });

      const deletedUsers = await prisma.user.deleteMany({
        where: { id: { in: deleteIds } }
      });
      deletedCustomersCount = deletedUsers.count;
      console.log(`[LiveCleanup] Deleted ${deletedCustomersCount} customer users.`);
    }

    const remainingUsers = await prisma.user.findMany({
      select: { id: true, email: true, role: true, name: true }
    });

    const result = {
      deletedEnquiries: deletedEnquiries.count,
      deletedSupportTickets: deletedSupportTickets.count,
      deletedCouponUsages: deletedCouponUsages.count,
      deletedOrders: deletedOrders.count,
      deletedCustomers: deletedCustomersCount,
      remainingUsers
    };

    console.log('[LiveCleanup] Completed! Results:', JSON.stringify(result, null, 2));
    return result;
  } catch (err) {
    console.error('[LiveCleanup] Error during live cleanup:', err.message);
    throw err;
  }
}
