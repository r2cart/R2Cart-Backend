import bcrypt from 'bcryptjs';
import { prisma } from '../src/config/prisma.js';

async function resetAdminAccounts() {
  console.log('[Accounts] Starting admin and super-admin accounts reset...');

  try {
    // 1. Delete all existing users with ADMIN or SUPER_ADMIN roles or staffRoles
    const deleted = await prisma.user.deleteMany({
      where: {
        OR: [
          { role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
          { staffRole: { in: ['ADMIN', 'SUPER_ADMIN'] } }
        ]
      }
    });
    console.log(`[Accounts] Deleted ${deleted.count} old admin/super-admin account(s).`);

    // 2. Hash passwords
    const adminPasswordHash = await bcrypt.hash('Admin@123', 12);
    const superPasswordHash = await bcrypt.hash('Super@123', 12);

    // 3. Create Admin account
    const newAdmin = await prisma.user.create({
      data: {
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
    console.log(`[Accounts] Created new ADMIN: ${newAdmin.email} (ID: ${newAdmin.id})`);

    // 4. Create Super Admin account
    const newSuper = await prisma.user.create({
      data: {
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
    console.log(`[Accounts] Created new SUPER_ADMIN: ${newSuper.email} (ID: ${newSuper.id})`);

    console.log('[Accounts] Successfully reset all accounts!');
  } catch (err) {
    console.error('[Accounts] Error during reset:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

resetAdminAccounts();
