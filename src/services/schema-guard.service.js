import { execSync } from 'node:child_process';
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

export function autoSyncPrismaSchema() {
  try {
    console.log('[Schema] Running prisma db push to ensure all enterprise & delivery tables exist...');
    execSync('npx prisma db push --skip-generate --accept-data-loss', {
      stdio: 'inherit',
      timeout: 120000
    });
    console.log('[Schema] Prisma db push completed successfully.');
  } catch (err) {
    console.warn('[Schema] Prisma db push notice:', err.message);
  }
}
