import {PrismaClient} from '@prisma/client';

export const prisma = globalThis.__r2cartPrisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

globalThis.__r2cartPrisma = prisma;

let isReconnecting = false;

/**
 * Pings the database to ensure connection is warm and healthy.
 * Automatically recovers dead TCP sockets before incoming user requests hit it.
 */
export async function pingDatabase() {
  if (isReconnecting) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (err) {
    console.warn('[Prisma] Database connection dropped or stale:', err.message);
    isReconnecting = true;
    try {
      await prisma.$disconnect().catch(() => {});
      await prisma.$connect();
      console.log('[Prisma] Database connection successfully restored');
      isReconnecting = false;
      return true;
    } catch (reconnectErr) {
      console.error('[Prisma] Database reconnect attempt failed:', reconnectErr.message);
      isReconnecting = false;
      return false;
    }
  }
}

/**
 * Periodic database heartbeat:
 * Cloud MySQL closes idle connections after 5-10 minutes (wait_timeout).
 * Ping every 3 minutes so MySQL NEVER closes the connection on Render.
 */
let heartbeatInterval = null;
export function startDbHeartbeat() {
  if (heartbeatInterval) return;
  // Initial ping
  pingDatabase().catch(() => {});
  // Every 3 minutes
  heartbeatInterval = setInterval(() => {
    pingDatabase().catch(() => {});
  }, 3 * 60 * 1000);
  if (heartbeatInterval.unref) heartbeatInterval.unref();
}

