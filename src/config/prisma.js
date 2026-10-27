import {PrismaClient} from '@prisma/client';
export const prisma=globalThis.__r2cartPrisma||new PrismaClient();
globalThis.__r2cartPrisma=prisma;
