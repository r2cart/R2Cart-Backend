import { prisma } from '../config/prisma.js';

/**
 * Safe Live Production Database Cleanup Runner
 * Deletes all orders, all inquiries, and non-admin customers
 * Preserves staff/admin accounts and tevadej256@hopefunder.com
 */
export async function runOneTimeProductionCleanup() {
  console.log('[LiveCleanup] Starting real live database cleanup...');

  try {
    // Disable foreign key checks for this cleanup session
    await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0;');

    // 1. Delete all inquiries & support tickets
    const deletedEnquiries = await prisma.productEnquiry.deleteMany({});
    const deletedTicketMessages = await prisma.ticketMessage.deleteMany({});
    const deletedSupportTickets = await prisma.supportTicket.deleteMany({});

    // 2. Delete all orders and related records
    await prisma.$executeRawUnsafe('DELETE FROM order_fifo_allocations;');
    await prisma.$executeRawUnsafe('DELETE FROM delivery_chat_messages;');
    await prisma.$executeRawUnsafe('DELETE FROM cash_collections;');
    await prisma.$executeRawUnsafe('DELETE FROM delivery_status_logs;');
    await prisma.$executeRawUnsafe('DELETE FROM delivery_proofs;');
    await prisma.$executeRawUnsafe('DELETE FROM delivery_assignments;');
    await prisma.$executeRawUnsafe('DELETE FROM payments;');
    await prisma.$executeRawUnsafe('DELETE FROM order_status_history;');
    await prisma.$executeRawUnsafe('DELETE FROM order_items;');
    await prisma.$executeRawUnsafe('DELETE FROM coupon_usages;');
    await prisma.$executeRawUnsafe('DELETE FROM orders;');

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

    let deletedCustomersCount = 0;
    if (customersToDelete.length > 0) {
      const deleteIds = customersToDelete.map(u => u.id);

      await prisma.address.deleteMany({ where: { userId: { in: deleteIds } } });
      await prisma.cartItem.deleteMany({ where: { cart: { userId: { in: deleteIds } } } });
      await prisma.cart.deleteMany({ where: { cart: { userId: { in: deleteIds } } } }).catch(() => {});
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
    }

    // Re-enable foreign key checks
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
