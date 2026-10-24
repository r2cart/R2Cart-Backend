import { prisma } from '../src/config/prisma.js';

async function main() {
  console.log('[CategoryMigration] Starting category updates and additions...');

  // 1. Update existing categories (preserving foreign keys and product links)
  const updates = [
    {
      findSlug: 'dairy-breakfast',
      name: 'Dairy, Bread & Eggs',
      newSlug: 'dairy-bread-eggs',
      image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=600&q=80',
      color: '#E9F5FF',
      position: 2
    },
    {
      findSlug: 'staples',
      name: 'Atta, Rice, Dal & Oil',
      newSlug: 'atta-rice-dal-oil',
      image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80',
      color: '#FFF6D9',
      position: 3
    },
    {
      findSlug: 'cooking',
      name: 'Masalas & Dry Fruits',
      newSlug: 'masala-dry-fruits',
      image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=600&q=80',
      color: '#FFF0E5',
      position: 4
    },
    {
      findSlug: 'beverages',
      name: 'Cold Drinks & Juices',
      newSlug: 'cold-drinks-juices',
      image: 'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?auto=format&fit=crop&w=600&q=80',
      color: '#FFEDED',
      position: 5
    },
    {
      findSlug: 'bakery',
      name: 'Biscuits & Bakery',
      newSlug: 'biscuits-bakery',
      image: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=600&q=80',
      color: '#FFF0E4',
      position: 7
    },
    {
      findSlug: 'instant-food',
      name: 'Packaged Food',
      newSlug: 'packaged-food',
      image: 'https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?auto=format&fit=crop&w=600&q=80',
      color: '#FFF3D6',
      position: 10
    }
  ];

  for (const item of updates) {
    const existing = await prisma.category.findFirst({
      where: {
        OR: [
          { slug: item.findSlug },
          { slug: item.newSlug }
        ]
      }
    });

    if (existing) {
      console.log(`[CategoryMigration] Updating category "${existing.name}" -> "${item.name}" (${item.newSlug})...`);
      await prisma.category.update({
        where: { id: existing.id },
        data: {
          name: item.name,
          slug: item.newSlug,
          image: item.image,
          color: item.color,
          position: item.position,
          status: 'ACTIVE'
        }
      });
    }
  }

  // Set positions for unchanged categories
  await prisma.category.updateMany({
    where: { slug: 'fruits-vegetables' },
    data: { position: 1 }
  });
  await prisma.category.updateMany({
    where: { slug: 'snacks' },
    data: { 
      position: 6,
      image: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?auto=format&fit=crop&w=600&q=80'
    }
  });
  await prisma.category.updateMany({
    where: { slug: 'household' },
    data: { position: 13 }
  });
  await prisma.category.updateMany({
    where: { slug: 'personal' },
    data: { position: 14 }
  });

  // 2. Add New Categories requested by user
  const newCategories = [
    {
      name: 'Ice Creams & More',
      slug: 'ice-creams-more',
      image: 'https://images.unsplash.com/photo-1501443762994-82bd5dace89a?auto=format&fit=crop&w=600&q=80',
      color: '#FFE8EC',
      position: 8
    },
    {
      name: 'Tea & Coffee',
      slug: 'tea-coffee',
      image: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=600&q=80',
      color: '#F5EBE1',
      position: 9
    },
    {
      name: 'Breakfast & Sauces',
      slug: 'breakfast-sauces',
      image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80',
      color: '#FFF3E0',
      position: 11
    },
    {
      name: 'Sweet Cravings',
      slug: 'sweet-cravings',
      image: 'https://images.unsplash.com/photo-1582293041079-7814c2f12063?auto=format&fit=crop&w=600&q=80',
      color: '#FCE4EC',
      position: 12
    }
  ];

  for (const cat of newCategories) {
    const existing = await prisma.category.findUnique({
      where: { slug: cat.slug }
    });

    if (existing) {
      console.log(`[CategoryMigration] Existing new category "${cat.name}" found. Updating details...`);
      await prisma.category.update({
        where: { id: existing.id },
        data: {
          name: cat.name,
          image: cat.image,
          color: cat.color,
          position: cat.position,
          status: 'ACTIVE'
        }
      });
    } else {
      console.log(`[CategoryMigration] Creating new category: "${cat.name}" (${cat.slug})...`);
      await prisma.category.create({
        data: {
          name: cat.name,
          slug: cat.slug,
          image: cat.image,
          color: cat.color,
          position: cat.position,
          status: 'ACTIVE'
        }
      });
    }
  }

  // 3. Print final category list
  const finalCategories = await prisma.category.findMany({
    orderBy: { position: 'asc' },
    select: {
      id: true,
      position: true,
      name: true,
      slug: true,
      _count: { select: { products: true } }
    }
  });

  console.log(`\n[CategoryMigration] Success! Total Categories: ${finalCategories.length}`);
  console.table(finalCategories.map(c => ({
    Position: c.position,
    Name: c.name,
    Slug: c.slug,
    Products: c._count.products
  })));

  process.exit(0);
}

main().catch(err => {
  console.error('[CategoryMigration] Error:', err);
  process.exit(1);
});
