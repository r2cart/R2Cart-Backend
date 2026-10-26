const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const vim = await prisma.product.findMany({
    where: { name: { contains: 'Vim' } },
    select: { id: true, name: true, stock: true, status: true, deletedAt: true }
  });
  console.log('=== VIM PRODUCTS ===');
  console.log(JSON.stringify(vim, null, 2));

  const cartItems = await prisma.cartItem.findMany({
    include: { product: { select: { id: true, name: true, stock: true, status: true, deletedAt: true } } }
  });
  console.log('=== CART ITEMS IN DB ===');
  console.log(JSON.stringify(cartItems, null, 2));

  const slots = await prisma.deliverySlot.findMany({
    orderBy: { startTime: 'asc' }
  });
  console.log('=== DELIVERY SLOTS IN DB (Total: ' + slots.length + ') ===');
  slots.forEach(s => console.log(s.id, s.label, s.startTime, s.endTime, s.status));
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
