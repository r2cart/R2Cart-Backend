import {PrismaClient} from '@prisma/client';
export const prisma=globalThis.__r2cartPrisma||new PrismaClient();
if(process.env.NODE_ENV!=='production')globalThis.__r2cartPrisma=prisma;
