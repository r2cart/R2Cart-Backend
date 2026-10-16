import { prisma } from '../src/config/prisma.js';

async function listAdmins() {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
        { staffRole: { in: ['ADMIN', 'SUPER_ADMIN'] } }
      ]
    },
    select: { id: true, name: true, email: true, role: true, staffRole: true }
  });
  console.log('Current Admins/SuperAdmins:', users);
  await prisma.$disconnect();
}

listAdmins();
