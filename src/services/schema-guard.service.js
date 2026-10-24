import { execSync } from 'node:child_process';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma.js';

export async function ensureStoreSettingColumns() {
  try {
    console.log('[Schema] Checking store_settings columns...');
    const columnsToCheck = [
      { name: 'autoHideOutOfStock', def: 'BOOLEAN NOT NULL DEFAULT false' },
      { name: 'globalDeliveryRadius', def: 'DECIMAL(6,2) DEFAULT 5.00' },
      { name: 'isOrderPaused', def: 'BOOLEAN NOT NULL DEFAULT false' },
      { name: 'orderPauseMessage', def: 'TEXT NULL' },
      { name: 'holidays', def: 'JSON NULL' },
      { name: 'weekdayHours', def: 'JSON NULL' },
      { name: 'prepTimeMinutes', def: 'INT NOT NULL DEFAULT 30' },
      { name: 'seasonalSchedules', def: 'JSON NULL' },
      { name: 'specialDaySchedules', def: 'JSON NULL' },
      { name: 'allowAfterHoursScheduledOrders', def: 'BOOLEAN NOT NULL DEFAULT true' },
      { name: 'isSchedulingEnabled', def: 'BOOLEAN NOT NULL DEFAULT true' },
      { name: 'advanceBookingDays', def: 'INT NOT NULL DEFAULT 4' },
      { name: 'sameDayCutoffMinutes', def: 'INT NOT NULL DEFAULT 60' },
      { name: 'allowCod', def: 'BOOLEAN NOT NULL DEFAULT true' },
      { name: 'allowScheduled', def: 'BOOLEAN NOT NULL DEFAULT true' },
      { name: 'emergencySettings', def: 'JSON NULL' }
    ];

    for (const col of columnsToCheck) {
      const existing = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as cnt 
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'store_settings' 
          AND COLUMN_NAME = '${col.name}'
      `);
      const count = Number(existing[0]?.cnt || 0);
      if (count === 0) {
        console.log(`[Schema] Adding missing column: store_settings.${col.name}`);
        await prisma.$executeRawUnsafe(`ALTER TABLE \`store_settings\` ADD COLUMN \`${col.name}\` ${col.def}`);
      }
    }
    console.log('[Schema] store_settings columns verified.');
  } catch (err) {
    console.warn('[Schema] Column verify notice:', err.message);
  }
}

export async function generateNextDeliveryStaffId() {
  const staffWithIds = await prisma.user.findMany({
    where: {
      deliveryStaffId: {
        startsWith: 'R2D-'
      }
    },
    select: {
      deliveryStaffId: true
    }
  });

  let maxNum = 1000;
  for (const staff of staffWithIds) {
    if (staff.deliveryStaffId) {
      const num = parseInt(staff.deliveryStaffId.replace(/^R2D-/i, ''), 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }

  return `R2D-${maxNum + 1}`;
}

export async function ensureDeliveryStaffColumns() {
  try {
    const isPostgres = process.env.DATABASE_URL?.startsWith('postgres');
    
    if (isPostgres) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deliveryStaffId" VARCHAR(50);
      `).catch(() => {});
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "users_deliverystaffid_key" ON "users"("deliveryStaffId");
      `).catch(() => {});
    } else {
      const existing = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as cnt 
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'users' 
          AND COLUMN_NAME = 'deliveryStaffId'
      `);
      const count = Number(existing[0]?.cnt || 0);
      if (count === 0) {
        console.log('[Schema] Adding missing column: users.deliveryStaffId');
        await prisma.$executeRawUnsafe(`ALTER TABLE \`users\` ADD COLUMN \`deliveryStaffId\` VARCHAR(50) NULL UNIQUE`);
      }
    }

    // Auto-assign Delivery Staff IDs to existing delivery persons who don't have one
    const deliveryPersonsWithoutId = await prisma.user.findMany({
      where: {
        AND: [
          {
            OR: [
              { role: 'DELIVERY_PERSON' },
              { staffRole: 'DELIVERY_PERSON' }
            ]
          },
          { deliveryStaffId: null }
        ]
      },
      orderBy: { createdAt: 'asc' }
    });

    if (deliveryPersonsWithoutId.length > 0) {
      console.log(`[Schema] Found ${deliveryPersonsWithoutId.length} delivery staff without Delivery Staff ID. Assigning IDs...`);
      for (const staff of deliveryPersonsWithoutId) {
        const nextId = await generateNextDeliveryStaffId();
        await prisma.user.update({
          where: { id: staff.id },
          data: { deliveryStaffId: nextId }
        });
        console.log(`[Schema] Assigned Delivery Staff ID ${nextId} to ${staff.name || staff.email} (${staff.id})`);
      }
    }
  } catch (err) {
    console.warn('[Schema] DeliveryStaffId column verify notice:', err.message);
  }
}

export async function ensureHomepageRankingTables() {
  try {
    console.log('[Schema] Checking homepage ranking tables...');
    const isPostgres = process.env.DATABASE_URL?.startsWith('postgres');

    if (isPostgres) {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "homepage_ranking_configs" (
          "id" VARCHAR(50) PRIMARY KEY,
          "bestSellers" JSONB NOT NULL,
          "topPicks" JSONB NOT NULL,
          "version" INTEGER NOT NULL DEFAULT 1,
          "publishedAt" TIMESTAMP,
          "publishedBy" VARCHAR(191),
          "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `).catch(() => {});

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "homepage_ranking_history" (
          "id" VARCHAR(191) PRIMARY KEY,
          "version" INTEGER NOT NULL,
          "bestSellers" JSONB NOT NULL,
          "topPicks" JSONB NOT NULL,
          "publishedBy" VARCHAR(191),
          "note" TEXT,
          "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `).catch(() => {});
    } else {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS \`homepage_ranking_configs\` (
          \`id\` VARCHAR(50) NOT NULL,
          \`bestSellers\` JSON NOT NULL,
          \`topPicks\` JSON NOT NULL,
          \`version\` INT NOT NULL DEFAULT 1,
          \`publishedAt\` DATETIME(3) NULL,
          \`publishedBy\` VARCHAR(191) NULL,
          \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS \`homepage_ranking_history\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`version\` INT NOT NULL,
          \`bestSellers\` JSON NOT NULL,
          \`topPicks\` JSON NOT NULL,
          \`publishedBy\` VARCHAR(191) NULL,
          \`note\` TEXT NULL,
          \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          PRIMARY KEY (\`id\`),
          INDEX \`homepage_ranking_history_version_idx\` (\`version\`),
          INDEX \`homepage_ranking_history_createdAt_idx\` (\`createdAt\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    }

    // Ensure baseline 'active' and 'draft' configs exist
    const { DEFAULT_BEST_SELLERS_CONFIG, DEFAULT_TOP_PICKS_CONFIG } = await import('../config/ranking-defaults.js');
    
    // Find sample in-stock products for default fallback/curation if none specified
    const sampleProducts = await prisma.product.findMany({
      where: { status: 'ACTIVE', stock: { gt: 0 } },
      take: 10,
      select: { id: true }
    });
    const fallbackIds = sampleProducts.map(p => p.id);

    const activeRows = await prisma.$queryRawUnsafe(`
      SELECT id FROM \`homepage_ranking_configs\` WHERE id = 'active' LIMIT 1
    `);

    if (!Array.isArray(activeRows) || activeRows.length === 0) {
      console.log('[Schema] Seeding baseline active homepage ranking config...');
      const bs = { ...DEFAULT_BEST_SELLERS_CONFIG, fallbackProductIds: fallbackIds };
      const tp = { ...DEFAULT_TOP_PICKS_CONFIG, curatedProductIds: fallbackIds.slice(0, 8) };
      await prisma.$executeRawUnsafe(`
        INSERT INTO \`homepage_ranking_configs\` (\`id\`, \`bestSellers\`, \`topPicks\`, \`version\`, \`publishedAt\`, \`publishedBy\`, \`createdAt\`, \`updatedAt\`)
        VALUES ('active', ?, ?, 1, NOW(), 'system', NOW(), NOW())
      `, JSON.stringify(bs), JSON.stringify(tp));
    }

    const draftRows = await prisma.$queryRawUnsafe(`
      SELECT id FROM \`homepage_ranking_configs\` WHERE id = 'draft' LIMIT 1
    `);

    if (!Array.isArray(draftRows) || draftRows.length === 0) {
      console.log('[Schema] Seeding baseline draft homepage ranking config...');
      const bs = { ...DEFAULT_BEST_SELLERS_CONFIG, fallbackProductIds: fallbackIds };
      const tp = { ...DEFAULT_TOP_PICKS_CONFIG, curatedProductIds: fallbackIds.slice(0, 8) };
      await prisma.$executeRawUnsafe(`
        INSERT INTO \`homepage_ranking_configs\` (\`id\`, \`bestSellers\`, \`topPicks\`, \`version\`, \`publishedAt\`, \`publishedBy\`, \`createdAt\`, \`updatedAt\`)
        VALUES ('draft', ?, ?, 1, NULL, NULL, NOW(), NOW())
      `, JSON.stringify(bs), JSON.stringify(tp));
    }

    console.log('[Schema] Homepage ranking tables and baseline configs verified.');
  } catch (err) {
    console.warn('[Schema] Homepage ranking tables verify notice:', err.message);
  }
}

export async function ensureDeliveryChatTable() {
  try {
    const isPostgres = process.env.DATABASE_URL?.startsWith('postgres');
    if (isPostgres) {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "delivery_chat_messages" (
          "id" VARCHAR(191) PRIMARY KEY,
          "orderId" VARCHAR(191) NOT NULL,
          "assignmentId" VARCHAR(191),
          "senderId" VARCHAR(191) NOT NULL,
          "senderRole" VARCHAR(50) NOT NULL,
          "senderName" VARCHAR(191) NOT NULL,
          "message" TEXT NOT NULL,
          "isRead" BOOLEAN NOT NULL DEFAULT false,
          "readAt" TIMESTAMP,
          "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `).catch(() => {});
    } else {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS \`delivery_chat_messages\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`orderId\` VARCHAR(191) NOT NULL,
          \`assignmentId\` VARCHAR(191) NULL,
          \`senderId\` VARCHAR(191) NOT NULL,
          \`senderRole\` VARCHAR(50) NOT NULL,
          \`senderName\` VARCHAR(191) NOT NULL,
          \`message\` TEXT NOT NULL,
          \`isRead\` BOOLEAN NOT NULL DEFAULT false,
          \`readAt\` DATETIME(3) NULL,
          \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          PRIMARY KEY (\`id\`),
          INDEX \`delivery_chat_messages_orderId_createdAt_idx\` (\`orderId\`, \`createdAt\`),
          INDEX \`delivery_chat_messages_senderId_idx\` (\`senderId\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `).catch(() => {});
    }
    console.log('[Schema] delivery_chat_messages table verified.');
  } catch (err) {
    console.warn('[Schema] delivery_chat_messages table notice:', err.message);
  }
}

export function autoSyncPrismaSchema() {
  if (process.env.AUTO_SYNC_PRISMA === 'true') {
    try {
      console.log('[Schema] Running prisma db push to ensure all enterprise & delivery tables exist...');
      execSync('npx prisma db push --skip-generate', {
        stdio: 'inherit',
        timeout: 120000
      });
      console.log('[Schema] Prisma db push completed successfully.');
    } catch (err) {
      console.warn('[Schema] Prisma db push notice:', err.message);
    }
  }
}

export async function ensureSuperAdminAccount() {
  try {
    // 1. Check if ANY Super Admin already exists in the system
    const existingSuper = await prisma.user.findFirst({
      where: {
        OR: [
          { role: 'SUPER_ADMIN' },
          { staffRole: 'SUPER_ADMIN' }
        ]
      }
    });

    if (existingSuper) {
      console.log(`[AuthBootstrap] Active Super Admin already configured (ID: ${existingSuper.id}, email: ${existingSuper.email}). Preserving custom credentials.`);
      if (existingSuper.status !== 'ACTIVE' || !existingSuper.isStaffActive) {
        await prisma.user.update({
          where: { id: existingSuper.id },
          data: {
            status: 'ACTIVE',
            isStaffActive: true,
            permissions: { all: true }
          }
        });
      }
      return existingSuper;
    }

    // 2. Only if NO Super Admin exists at all, bootstrap the initial default super@gmail.com / Super@123
    console.log('[AuthBootstrap] No Super Admin found. Bootstrapping initial Super Admin (super@gmail.com)...');
    const superPasswordHash = await bcrypt.hash('Super@123', 12);

    // Safely remove mobile '9876543211' from other users if any, to avoid unique collision
    await prisma.user.updateMany({
      where: { mobile: '9876543211', email: { not: 'super@gmail.com' } },
      data: { mobile: null }
    }).catch(() => {});

    const superAdmin = await prisma.user.upsert({
      where: { email: 'super@gmail.com' },
      update: {
        name: 'Platform Super Admin',
        role: 'SUPER_ADMIN',
        staffRole: 'SUPER_ADMIN',
        status: 'ACTIVE',
        isStaffActive: true,
        permissions: { all: true }
      },
      create: {
        name: 'Platform Super Admin',
        email: 'super@gmail.com',
        mobile: null,
        passwordHash: superPasswordHash,
        role: 'SUPER_ADMIN',
        staffRole: 'SUPER_ADMIN',
        status: 'ACTIVE',
        isStaffActive: true,
        permissions: { all: true }
      }
    });

    console.log(`[AuthBootstrap] Initial default Super Admin guaranteed active: ${superAdmin.email}`);
    return superAdmin;
  } catch (err) {
    console.error('[AuthBootstrap] Error ensuring super admin:', err.message);
    throw err;
  }
}

export async function ensureStandardCategories() {
  try {
    const updates = [
      { findSlug: 'dairy-breakfast', name: 'Dairy, Bread & Eggs', newSlug: 'dairy-bread-eggs', image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=600&q=80', color: '#E9F5FF', position: 2 },
      { findSlug: 'staples', name: 'Atta, Rice, Dal & Oil', newSlug: 'atta-rice-dal-oil', image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80', color: '#FFF6D9', position: 3 },
      { findSlug: 'cooking', name: 'Masalas & Dry Fruits', newSlug: 'masala-dry-fruits', image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=600&q=80', color: '#FFF0E5', position: 4 },
      { findSlug: 'beverages', name: 'Cold Drinks & Juices', newSlug: 'cold-drinks-juices', image: 'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?auto=format&fit=crop&w=600&q=80', color: '#FFEDED', position: 5 },
      { findSlug: 'bakery', name: 'Biscuits & Bakery', newSlug: 'biscuits-bakery', image: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=600&q=80', color: '#FFF0E4', position: 7 },
      { findSlug: 'instant-food', name: 'Packaged Food', newSlug: 'packaged-food', image: 'https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?auto=format&fit=crop&w=600&q=80', color: '#FFF3D6', position: 10 }
    ];

    for (const item of updates) {
      const existing = await prisma.category.findFirst({
        where: { OR: [{ slug: item.findSlug }, { slug: item.newSlug }] }
      });
      if (existing) {
        await prisma.category.update({
          where: { id: existing.id },
          data: { name: item.name, slug: item.newSlug, image: item.image, color: item.color, position: item.position, status: 'ACTIVE' }
        });
      }
    }

    const newCategories = [
      { name: 'Ice Creams & More', slug: 'ice-creams-more', image: 'https://images.unsplash.com/photo-1501443762994-82bd5dace89a?auto=format&fit=crop&w=600&q=80', color: '#FFE8EC', position: 8 },
      { name: 'Tea & Coffee', slug: 'tea-coffee', image: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=600&q=80', color: '#F5EBE1', position: 9 },
      { name: 'Breakfast & Sauces', slug: 'breakfast-sauces', image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80', color: '#FFF3E0', position: 11 },
      { name: 'Sweet Cravings', slug: 'sweet-cravings', image: 'https://images.unsplash.com/photo-1582293041079-7814c2f12063?auto=format&fit=crop&w=600&q=80', color: '#FCE4EC', position: 12 }
    ];

    for (const cat of newCategories) {
      const existing = await prisma.category.findUnique({ where: { slug: cat.slug } });
      if (!existing) {
        await prisma.category.create({
          data: { name: cat.name, slug: cat.slug, image: cat.image, color: cat.color, position: cat.position, status: 'ACTIVE' }
        });
      }
    }
  } catch (err) {
    console.warn('[CategoryBootstrap] Notice:', err.message);
  }
}


