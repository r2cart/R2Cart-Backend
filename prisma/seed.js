import bcrypt from 'bcryptjs';
import {PrismaClient} from '@prisma/client';
import {serviceableLocalities} from '../src/data/serviceableLocalities.js';

const prisma = new PrismaClient();

/**
 * seedIfEmpty - called on every server startup.
 *
 * ONLY bootstraps the bare minimum needed to run the platform:
 *   1. Admin + Super Admin user accounts  (always upserted - safe)
 *   2. Default store settings             (only if not yet configured)
 *   3. Default delivery area              (only if none exists)
 *
 * Products, categories, banners, and coupons are NEVER seeded here.
 * All catalog content is created and managed by the admin via the dashboard.
 * This guarantees admin changes are never overwritten on server restart.
 */
export async function seedIfEmpty() {
  console.log('[Startup] Checking platform bootstrap status...');

  // 1. Admin accounts - bootstrapped from environment variables if configured
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
  const superPassword = process.env.INITIAL_SUPER_ADMIN_PASSWORD || process.env.SUPER_ADMIN_PASSWORD;

  if (superPassword) {
    const superPasswordHash = await bcrypt.hash(superPassword, 12);
    await prisma.user.upsert({
      where:  { email: process.env.SUPER_ADMIN_EMAIL || 'super@gmail.com' },
      update: { passwordHash: superPasswordHash, role: 'SUPER_ADMIN', staffRole: 'SUPER_ADMIN' },
      create: {
        name:          'Platform Super Admin',
        email:         process.env.SUPER_ADMIN_EMAIL || 'super@gmail.com',
        mobile:        '9876543211',
        passwordHash:  superPasswordHash,
        role:          'SUPER_ADMIN',
        staffRole:     'SUPER_ADMIN',
        status:        'ACTIVE',
        isStaffActive: true,
        permissions:   { all: true },
      },
    });
    console.log('[Bootstrap] Super Admin account ready.');
  } else {
    console.warn('[Bootstrap] SUPER_ADMIN_PASSWORD not configured; skipping Super Admin seed.');
  }

  if (adminPassword) {
    const adminPasswordHash = await bcrypt.hash(adminPassword, 12);
    await prisma.user.upsert({
      where:  { email: process.env.ADMIN_EMAIL || 'admin@gmail.com' },
      update: { passwordHash: adminPasswordHash, role: 'ADMIN', staffRole: 'ADMIN' },
      create: {
        name:          'Store Admin',
        email:         process.env.ADMIN_EMAIL || 'admin@gmail.com',
        mobile:        '9876543210',
        passwordHash:  adminPasswordHash,
        role:          'ADMIN',
        staffRole:     'ADMIN',
        status:        'ACTIVE',
        isStaffActive: true,
        permissions:   { all: true },
      },
    });
    console.log('[Bootstrap] Store Admin account ready.');
  } else {
    console.warn('[Bootstrap] ADMIN_PASSWORD not configured; skipping Store Admin seed.');
  }

  // 2. Store settings - created once, never overwritten.
  const existingSettings = await prisma.storeSetting.findUnique({ where: { id: 1 } });
  if (!existingSettings) {
    await prisma.storeSetting.create({
      data: {
        id:                    1,
        storeName:             'R2Cart',
        contactNumber:         '+91 80000 10001',
        email:                 'support@r2cart.in',
        address:               'Bailey Road, Patna, Bihar 800001',
        openingTime:           '07:00',
        closingTime:           '23:00',
        currency:              'INR',
        minimumOrder:          199,
        deliveryFee:           35,
        freeDeliveryThreshold: 499,
        estimatedDelivery:     '10-30 minutes',
        notifications:         { orders: true, stock: true, customers: true },
      },
    });
    console.log('[Bootstrap] Default store settings initialized.');
  } else {
    console.log('[Bootstrap] Store settings already configured - preserving admin changes.');
  }

  // Delivery areas and villages are completely managed by Admin / Super Admin via Dashboard & Excel import.
  console.log('[Bootstrap] Complete. Delivery areas and catalog data are managed via the admin dashboard.');
}

// CLI entry-point: node prisma/seed.js
if (process.argv[1]?.endsWith('seed.js')) {
  seedIfEmpty().finally(() => prisma.$disconnect());
}
