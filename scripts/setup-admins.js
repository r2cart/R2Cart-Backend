import bcrypt from 'bcryptjs';
import { prisma } from '../src/config/prisma.js';

async function setupAdmins() {
  console.log('[Setup] Starting admin & super-admin reconfiguration...');

  try {
    const adminPasswordHash = await bcrypt.hash('Admin@123', 12);
    const superPasswordHash = await bcrypt.hash('Super@123', 12);

    // 1. Upsert Super Admin: super@gmail.com
    const superAdmin = await prisma.user.upsert({
      where: { email: 'super@gmail.com' },
      update: {
        name: 'Platform Super Admin',
        passwordHash: superPasswordHash,
        role: 'SUPER_ADMIN',
        staffRole: 'SUPER_ADMIN',
        status: 'ACTIVE',
        isStaffActive: true,
        permissions: { all: true }
      },
      create: {
        name: 'Platform Super Admin',
        email: 'super@gmail.com',
        mobile: '9876543211',
        passwordHash: superPasswordHash,
        role: 'SUPER_ADMIN',
        staffRole: 'SUPER_ADMIN',
        status: 'ACTIVE',
        isStaffActive: true,
        permissions: { all: true }
      }
    });
    console.log(`[Setup] Super Admin ready: ${superAdmin.email} (ID: ${superAdmin.id})`);

    // 2. Upsert Admin: admin@gmail.com
    const adminUser = await prisma.user.upsert({
      where: { email: 'admin@gmail.com' },
      update: {
        name: 'Store Admin',
        passwordHash: adminPasswordHash,
        role: 'ADMIN',
        staffRole: 'ADMIN',
        status: 'ACTIVE',
        isStaffActive: true,
        permissions: { all: true }
      },
      create: {
        name: 'Store Admin',
        email: 'admin@gmail.com',
        mobile: '9876543210',
        passwordHash: adminPasswordHash,
        role: 'ADMIN',
        staffRole: 'ADMIN',
        status: 'ACTIVE',
        isStaffActive: true,
        permissions: { all: true }
      }
    });
    console.log(`[Setup] Admin ready: ${adminUser.email} (ID: ${adminUser.id})`);

    // 3. Find all old admin / super-admin accounts that are NOT admin@gmail.com and NOT super@gmail.com
    const oldAdmins = await prisma.user.findMany({
      where: {
        AND: [
          { email: { notIn: ['admin@gmail.com', 'super@gmail.com'] } },
          {
            OR: [
              { role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
              { staffRole: { in: ['ADMIN', 'SUPER_ADMIN'] } }
            ]
          }
        ]
      }
    });

    console.log(`[Setup] Found ${oldAdmins.length} old admin/super-admin account(s) to remove.`);

    for (const old of oldAdmins) {
      console.log(`[Setup] Cleaning references for old admin: ${old.email} (ID: ${old.id})...`);

      // Reassign or delete references
      await prisma.refreshToken.deleteMany({ where: { userId: old.id } });
      await prisma.deliveryAssignment.updateMany({ where: { assignedById: old.id }, data: { assignedById: superAdmin.id } });
      await prisma.deliveryProof.updateMany({ where: { verifiedById: old.id }, data: { verifiedById: superAdmin.id } });
      await prisma.deliveryStatusLog.updateMany({ where: { staffId: old.id }, data: { staffId: superAdmin.id } });
      await prisma.auditLog.updateMany({ where: { userId: old.id }, data: { userId: superAdmin.id } });
      await prisma.codSettlement.updateMany({ where: { settledById: old.id }, data: { settledById: superAdmin.id } });

      // If they have placed orders or addresses as customer, update role to CUSTOMER; otherwise delete
      const orderCount = await prisma.order.count({ where: { userId: old.id } });
      if (orderCount > 0) {
        await prisma.user.update({
          where: { id: old.id },
          data: { role: 'CUSTOMER', staffRole: null, isStaffActive: false }
        });
        console.log(`[Setup] Converted old admin ${old.email} to plain CUSTOMER because of existing order history.`);
      } else {
        await prisma.user.delete({ where: { id: old.id } });
        console.log(`[Setup] Permanently deleted old admin: ${old.email}`);
      }
    }

    // 4. Verify final list of admins
    const remaining = await prisma.user.findMany({
      where: {
        OR: [
          { role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
          { staffRole: { in: ['ADMIN', 'SUPER_ADMIN'] } }
        ]
      },
      select: { id: true, name: true, email: true, role: true, staffRole: true }
    });

    console.log('[Setup] Final active admin accounts:', remaining);
  } catch (err) {
    console.error('[Setup] Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

setupAdmins();
