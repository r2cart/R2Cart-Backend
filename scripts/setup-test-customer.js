import bcrypt from 'bcryptjs';
import { prisma } from '../src/config/prisma.js';

async function setupTestCustomer() {
  const customerPasswordHash = await bcrypt.hash('Customer@123', 12);
  const user = await prisma.user.upsert({
    where: { email: 'customer@gmail.com' },
    update: {
      name: 'R2Cart Test Customer',
      mobile: '9876543212',
      passwordHash: customerPasswordHash,
      role: 'CUSTOMER',
      status: 'ACTIVE'
    },
    create: {
      name: 'R2Cart Test Customer',
      email: 'customer@gmail.com',
      mobile: '9876543212',
      passwordHash: customerPasswordHash,
      role: 'CUSTOMER',
      status: 'ACTIVE'
    }
  });

  console.log(`Test Customer ready: ${user.email} (ID: ${user.id})`);

  // Ensure default address in serviceable area
  const existingAddr = await prisma.address.findFirst({ where: { userId: user.id } });
  if (!existingAddr) {
    const addr = await prisma.address.create({
      data: {
        userId: user.id,
        name: 'R2Cart Test Customer',
        mobile: '9876543212',
        house: 'House No. 12, Main Road',
        street: 'Near Clock Tower',
        area: 'Hathua',
        city: 'Gopalganj',
        state: 'Bihar',
        pin: '841438',
        type: 'Home',
        isDefault: true
      }
    });
    console.log(`Default address created: ${addr.id} in ${addr.area}`);
  } else {
    console.log(`Existing address verified for customer: ${existingAddr.area}`);
  }
}

setupTestCustomer().then(async () => {
  await prisma.$disconnect();
}).catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
