import { prisma } from '../config/prisma.js';

/**
 * One-time safe production cleanup runner
 * Deletes all orders, all inquiries, and test customers (preserving staff & tevadej256@hopefunder.com)
 */
export async function runOneTimeProductionCleanup() {
  console.log('[LiveCleanup] Starting production database cleanup...');

  try {
    // 1. Delete all inquiries
    const deletedEnquiries = await prisma.productEnquiry.deleteMany({});
    const deletedTicketMessages = await prisma.ticketMessage.deleteMany({});
    const deletedSupportTickets = await prisma.supportTicket.deleteMany({});
    console.log(`[LiveCleanup] Deleted inquiries: ${deletedEnquiries.count} product enquiries, ${deletedSupportTickets.count} support tickets`);

    // 2. Delete all orders and related records
    await prisma.couponUsage.deleteMany({});
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
      console.log(`[LiveCleanup] Deleted ${deletedUsers.count} customer users. Safe users preserved.`);
    }

    const remainingUsers = await prisma.user.findMany({
      select: { id: true, email: true, role: true, name: true }
    });
    console.log('[LiveCleanup] Successfully completed! Remaining safe users:', remainingUsers);
  } catch (err) {
    console.error('[LiveCleanup] Notice during live cleanup:', err.message);
  }
}
