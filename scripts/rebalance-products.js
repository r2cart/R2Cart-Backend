import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Starting Product Rebalance & Real Category Mapping ---');

  // 1. Fetch all categories
  const categories = await prisma.category.findMany();
  const catMap = Object.fromEntries(categories.map(c => [c.slug, c.id]));

  console.log('Found categories:', Object.keys(catMap).length);

  // 2. Re-assign existing active products to correct categories

  // A. Cooking Oils -> Atta, Rice, Dal & Oil
  const oilKeywords = ['Mustard Oil', 'Sunflower Oil', 'Healthy Heart Oil', 'Sunlite Oil'];
  for (const kw of oilKeywords) {
    const res = await prisma.product.updateMany({
      where: {
        deletedAt: null,
        name: { contains: kw }
      },
      data: { categoryId: catMap['atta-rice-dal-oil'] }
    });
    console.log(`Updated ${kw} -> atta-rice-dal-oil (${res.count} items)`);
  }

  // B. Tea & Coffee -> Tea & Coffee
  const teaCoffeeKeywords = ['Tata Tea', 'Nescafe', 'Brooke Bond', 'Red Label', 'Tea Gold'];
  for (const kw of teaCoffeeKeywords) {
    const res = await prisma.product.updateMany({
      where: {
        deletedAt: null,
        name: { contains: kw }
      },
      data: { categoryId: catMap['tea-coffee'] }
    });
    console.log(`Updated ${kw} -> tea-coffee (${res.count} items)`);
  }

  // C. Breakfast items & Sauces -> Breakfast & Sauces
  const breakfastSauceKeywords = [
    'Quaker', 'Masala Oats', 'Corn Flakes', 'Tomato Ketchup',
    'Mayonnaise', 'Schezwan Chutney', 'Peanut Butter'
  ];
  for (const kw of breakfastSauceKeywords) {
    const res = await prisma.product.updateMany({
      where: {
        deletedAt: null,
        name: { contains: kw }
      },
      data: { categoryId: catMap['breakfast-sauces'] }
    });
    console.log(`Updated ${kw} -> breakfast-sauces (${res.count} items)`);
  }

  // D. Biscuits in Snacks -> Biscuits & Bakery
  const biscuitKeywords = ['Parle-G', 'Oreo', 'Good Day', 'Butter Cookies', 'Gluco'];
  for (const kw of biscuitKeywords) {
    const res = await prisma.product.updateMany({
      where: {
        deletedAt: null,
        name: { contains: kw }
      },
      data: { categoryId: catMap['biscuits-bakery'] }
    });
    console.log(`Updated ${kw} -> biscuits-bakery (${res.count} items)`);
  }

  // E. Chocolates & Confectionery -> Sweet Cravings
  const sweetKeywords = ['Nutella', 'Bourbon', 'Chocolate Croissant', 'Chocolate Muffins', 'Swiss Roll', 'Fruit Cake'];
  for (const kw of sweetKeywords) {
    const res = await prisma.product.updateMany({
      where: {
        deletedAt: null,
        name: { contains: kw }
      },
      data: { categoryId: catMap['sweet-cravings'] }
    });
    console.log(`Updated ${kw} -> sweet-cravings (${res.count} items)`);
  }

  // 3. New Real Products to Seed
  const newProducts = [
    // --- Ice Creams & More (ice-creams-more) ---
    {
      name: 'Amul Vanilla Magic Ice Cream Tub',
      slug: 'amul-vanilla-magic-ice-cream-1l',
      categorySlug: 'ice-creams-more',
      unit: '1 L',
      mrp: 170,
      price: 145,
      stock: 35,
      description: 'Rich, smooth and creamy real milk vanilla ice cream tub from Amul. Perfect for family celebrations and sundaes.',
      image: 'https://images.unsplash.com/photo-1570197788417-0e82375c9371?auto=format&fit=crop&w=600&q=80',
      bestSeller: true
    },
    {
      name: "Kwality Wall's Chocolate Disc Cornetto",
      slug: 'kwality-walls-chocolate-disc-cornetto-120ml',
      categorySlug: 'ice-creams-more',
      unit: '120 ml',
      mrp: 45,
      price: 40,
      stock: 45,
      description: 'Crispy wafer cone layered with creamy chocolate ice cream and topped with a thick chocolate disc and nut toppings.',
      image: 'https://images.unsplash.com/photo-1501443762994-82bd5dace89a?auto=format&fit=crop&w=600&q=80',
      bestSeller: true
    },
    {
      name: "Kwality Wall's Butterscotch Ice Cream Tub",
      slug: 'kwality-walls-butterscotch-tub-700ml',
      categorySlug: 'ice-creams-more',
      unit: '700 ml',
      mrp: 199,
      price: 169,
      stock: 25,
      description: 'Velvety butterscotch flavored ice cream loaded with crunchy caramelized cashew praline chunks.',
      image: 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=600&q=80'
    },
    {
      name: 'Amul Frostik Premium Chocobar',
      slug: 'amul-frostik-chocobar-70ml',
      categorySlug: 'ice-creams-more',
      unit: '70 ml',
      mrp: 30,
      price: 27,
      stock: 60,
      description: 'Classic creamy vanilla ice cream stick coated in a thick, crisp Belgian-style milk chocolate shell.',
      image: 'https://images.unsplash.com/photo-1582293041079-7814c2f12063?auto=format&fit=crop&w=600&q=80'
    },
    {
      name: 'Mother Dairy Classic Rabdi Kulfi',
      slug: 'mother-dairy-rabdi-kulfi-60ml',
      categorySlug: 'ice-creams-more',
      unit: '60 ml',
      mrp: 35,
      price: 32,
      stock: 40,
      description: 'Traditional slow-cooked thick rabdi kulfi made with pure whole milk, fragrant cardamom, and roasted pistachios.',
      image: 'https://images.unsplash.com/photo-1570197788417-0e82375c9371?auto=format&fit=crop&w=600&q=80'
    },
    {
      name: 'Vadilal Royal Cassata Ice Cream Slice',
      slug: 'vadilal-royal-cassata-slice-150ml',
      categorySlug: 'ice-creams-more',
      unit: '150 ml',
      mrp: 60,
      price: 52,
      stock: 30,
      description: 'Tri-layer ice cream slice combining strawberry, vanilla, and mango on a moist sponge cake base crowned with nuts.',
      image: 'https://images.unsplash.com/photo-1501443762994-82bd5dace89a?auto=format&fit=crop&w=600&q=80'
    },
    {
      name: 'Havmor Alphonso Mango Ice Candy Duet',
      slug: 'havmor-alphonso-mango-duet-70ml',
      categorySlug: 'ice-creams-more',
      unit: '70 ml',
      mrp: 25,
      price: 22,
      stock: 50,
      description: 'Real Ratnagiri Alphonso mango pulp exterior filled with a rich, velvety vanilla ice cream core.',
      image: 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=600&q=80'
    },
    {
      name: 'Amul Kesar Pista Matka Kulfi',
      slug: 'amul-kesar-pista-matka-kulfi-100ml',
      categorySlug: 'ice-creams-more',
      unit: '100 ml',
      mrp: 50,
      price: 45,
      stock: 35,
      description: 'Earthy clay matka packed with rich saffron infused kulfi generously topped with slivered almonds and pistachios.',
      image: 'https://images.unsplash.com/photo-1501443762994-82bd5dace89a?auto=format&fit=crop&w=600&q=80'
    },

    // --- Sweet Cravings (sweet-cravings) ---
    {
      name: 'Cadbury Dairy Milk Silk Chocolate Bar',
      slug: 'cadbury-dairy-milk-silk-60g',
      categorySlug: 'sweet-cravings',
      unit: '60 g',
      mrp: 90,
      price: 82,
      stock: 65,
      description: 'The classic taste of Cadbury Dairy Milk chocolates in a curvier, silkier, and softer bar that melts effortlessly.',
      image: 'https://images.unsplash.com/photo-1582293041079-7814c2f12063?auto=format&fit=crop&w=600&q=80',
      bestSeller: true
    },
    {
      name: 'Nestlé KitKat 4-Finger Wafer Bar',
      slug: 'nestle-kitkat-4-finger-38g',
      categorySlug: 'sweet-cravings',
      unit: '38 g',
      mrp: 30,
      price: 27,
      stock: 80,
      description: 'Crispy wafer fingers drenched in smooth milk chocolate. Have a break, have a KitKat.',
      image: 'https://images.unsplash.com/photo-1582293041079-7814c2f12063?auto=format&fit=crop&w=600&q=80',
      bestSeller: true
    },
    {
      name: 'Cadbury Celebrations Gift Pack',
      slug: 'cadbury-celebrations-gift-pack-130g',
      categorySlug: 'sweet-cravings',
      unit: '130 g',
      mrp: 160,
      price: 139,
      stock: 40,
      description: 'Assorted gift box packed with all favorite Cadbury treats including Dairy Milk, 5 Star, and Gems.',
      image: 'https://images.unsplash.com/photo-1549007994-cb92caebd54b?auto=format&fit=crop&w=600&q=80'
    },
    {
      name: "Haldiram's Gulab Jamun Sweet Tin",
      slug: 'haldirams-gulab-jamun-tin-1kg',
      categorySlug: 'sweet-cravings',
      unit: '1 kg',
      mrp: 240,
      price: 215,
      stock: 35,
      description: 'Soft, melt-in-the-mouth fried dumplings of khoya steeped in aromatic rose and cardamom flavored sugar syrup.',
      image: 'https://images.unsplash.com/photo-1549007994-cb92caebd54b?auto=format&fit=crop&w=600&q=80',
      bestSeller: true
    },
    {
      name: "Haldiram's Sponge Rasgulla Sweet Tin",
      slug: 'haldirams-sponge-rasgulla-tin-1kg',
      categorySlug: 'sweet-cravings',
      unit: '1 kg',
      mrp: 230,
      price: 205,
      stock: 35,
      description: 'Spongy and juicy cottage cheese chhena balls cooked in light sugar syrup. Authentic Kolkata sweet treat.',
      image: 'https://images.unsplash.com/photo-1549007994-cb92caebd54b?auto=format&fit=crop&w=600&q=80'
    },
    {
      name: "Haldiram's Desi Ghee Soan Papdi",
      slug: 'haldirams-desi-ghee-soan-papdi-500g',
      categorySlug: 'sweet-cravings',
      unit: '500 g',
      mrp: 175,
      price: 155,
      stock: 40,
      description: 'Flaky and crisp multi-layered sweet made with gram flour, pure desi ghee, almonds, and pistachios.',
      image: 'https://images.unsplash.com/photo-1549007994-cb92caebd54b?auto=format&fit=crop&w=600&q=80'
    },
    {
      name: 'Ferrero Rocher Hazelnut Chocolates Box',
      slug: 'ferrero-rocher-16pcs-200g',
      categorySlug: 'sweet-cravings',
      unit: '16 pcs (200 g)',
      mrp: 549,
      price: 495,
      stock: 25,
      description: 'Whole crunchy hazelnut enveloped in a creamy chocolate filling, encased in a crisp wafer shell and coated with milk chocolate and chopped hazelnuts.',
      image: 'https://images.unsplash.com/photo-1549007994-cb92caebd54b?auto=format&fit=crop&w=600&q=80'
    },
    {
      name: 'Snickers Roasted Peanut Chocolate Bar',
      slug: 'snickers-roasted-peanut-bar-45g',
      categorySlug: 'sweet-cravings',
      unit: '45 g',
      mrp: 50,
      price: 45,
      stock: 60,
      description: 'Packed with roasted peanuts, rich nougat, and luscious caramel coated in thick milk chocolate. Hunger ki aisi taisi.',
      image: 'https://images.unsplash.com/photo-1582293041079-7814c2f12063?auto=format&fit=crop&w=600&q=80'
    },

    // --- Tea & Coffee (tea-coffee) ---
    {
      name: 'Brooke Bond Taj Mahal Spiced Leaf Tea',
      slug: 'taj-mahal-spiced-leaf-tea-250g',
      categorySlug: 'tea-coffee',
      unit: '250 g',
      mrp: 195,
      price: 175,
      stock: 40,
      description: 'Carefully chosen tea leaves from Upper Assam with a unique aroma and unmatched rich flavor. Wah Taj!',
      image: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=600&q=80'
    },
    {
      name: 'Wagh Bakri Premium Leaf Tea Bag',
      slug: 'wagh-bakri-premium-leaf-tea-500g',
      categorySlug: 'tea-coffee',
      unit: '500 g',
      mrp: 290,
      price: 260,
      stock: 40,
      description: 'Renowned for its strong liquor, inviting aroma, and authentic taste crafted from premium garden fresh tea leaves.',
      image: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=600&q=80',
      bestSeller: true
    },
    {
      name: 'BRU Instant Coffee Chicory Mix',
      slug: 'bru-instant-coffee-100g',
      categorySlug: 'tea-coffee',
      unit: '100 g',
      mrp: 170,
      price: 149,
      stock: 45,
      description: 'Perfect blend of 70% Robusta and Arabica coffee beans and 30% chicory, roasted to perfection for an aromatic cup.',
      image: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=80',
      bestSeller: true
    },
    {
      name: 'Lipton Pure & Light Green Tea Bags',
      slug: 'lipton-pure-light-green-tea-25bags',
      categorySlug: 'tea-coffee',
      unit: '25 bags',
      mrp: 160,
      price: 139,
      stock: 35,
      description: 'Zero calorie unsweetened green tea loaded with protective antioxidants to keep you hydrated and active.',
      image: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=600&q=80'
    },
    {
      name: 'Continental Xtra Instant Coffee Powder',
      slug: 'continental-xtra-coffee-50g',
      categorySlug: 'tea-coffee',
      unit: '50 g',
      mrp: 125,
      price: 109,
      stock: 30,
      description: 'A rich granules instant coffee blend with chicory that delivers a strong body, enticing aroma, and satisfying finish.',
      image: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=80'
    },

    // --- Breakfast & Sauces (breakfast-sauces) ---
    {
      name: "Kellogg's Chocolate Chocos Pack",
      slug: 'kelloggs-chocolate-chocos-375g',
      categorySlug: 'breakfast-sauces',
      unit: '375 g',
      mrp: 195,
      price: 175,
      stock: 40,
      description: 'Crispy, chocolatey scoop biscuits made with wholegrain wheat. Turns milk chocolatey and irresistible.',
      image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80',
      bestSeller: true
    },
    {
      name: 'Kissan 100% Real Mixed Fruit Jam',
      slug: 'kissan-mixed-fruit-jam-500g',
      categorySlug: 'breakfast-sauces',
      unit: '500 g',
      mrp: 160,
      price: 139,
      stock: 45,
      description: 'Medley of 8 delicious fruits including banana, papaya, apple, pear, pineapple, mango, and grape.',
      image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80'
    },
    {
      name: 'Dabur 100% Pure Indigenous Honey',
      slug: 'dabur-pure-honey-500g',
      categorySlug: 'breakfast-sauces',
      unit: '500 g',
      mrp: 225,
      price: 199,
      stock: 35,
      description: 'Pure, raw honey tested with advanced NMR profiling. Boosts immunity, aids digestion, and serves as a natural sweetener.',
      image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80',
      bestSeller: true
    },
    {
      name: 'Maggi Rich Tomato Ketchup Pitcher',
      slug: 'maggi-rich-tomato-ketchup-1kg',
      categorySlug: 'breakfast-sauces',
      unit: '1 kg',
      mrp: 165,
      price: 145,
      stock: 40,
      description: 'Tangy and sweet tomato sauce crafted from ripe Indian tomatoes. Essential companion for samosas, pakodas, and burgers.',
      image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80'
    },
    {
      name: "Hershey's Chocolate Flavour Syrup",
      slug: 'hersheys-chocolate-syrup-623g',
      categorySlug: 'breakfast-sauces',
      unit: '623 g',
      mrp: 230,
      price: 199,
      stock: 30,
      description: 'Versatile chocolate syrup perfect for flavoring milk, topping ice cream scoops, and drizzling over desserts.',
      image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80'
    }
  ];

  // 4. Insert or update the new products
  for (const item of newProducts) {
    const categoryId = catMap[item.categorySlug];
    if (!categoryId) {
      console.warn(`Category slug not found: ${item.categorySlug}`);
      continue;
    }

    const productId = `p-${item.slug}`;
    const sku = `R2C-${item.slug.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20)}`;

    const existing = await prisma.product.findFirst({
      where: {
        OR: [
          { id: productId },
          { slug: item.slug }
        ]
      }
    });

    if (existing) {
      await prisma.product.update({
        where: { id: existing.id },
        data: {
          name: item.name,
          unit: item.unit,
          mrp: item.mrp,
          price: item.price,
          stock: item.stock,
          description: item.description,
          categoryId,
          deletedAt: null,
          status: 'ACTIVE',
          bestSeller: !!item.bestSeller
        }
      });
      console.log(`Updated existing product: ${item.name}`);
    } else {
      await prisma.product.create({
        data: {
          id: productId,
          name: item.name,
          slug: item.slug,
          unit: item.unit,
          sku,
          mrp: item.mrp,
          price: item.price,
          stock: item.stock,
          description: item.description,
          categoryId,
          status: 'ACTIVE',
          bestSeller: !!item.bestSeller,
          images: {
            create: {
              url: item.image,
              alt: item.name,
              position: 0
            }
          }
        }
      });
      console.log(`Created new product: ${item.name} in ${item.categorySlug}`);
    }
  }

  // 5. Final active count summary per category
  console.log('\n--- Final Category Product Count (deletedAt: null) ---');
  const finalCats = await prisma.category.findMany({
    select: {
      slug: true,
      name: true,
      _count: {
        select: {
          products: {
            where: { deletedAt: null }
          }
        }
      }
    },
    orderBy: { position: 'asc' }
  });

  console.log(JSON.stringify(finalCats, null, 2));
}

main()
  .catch(err => {
    console.error('Error during product rebalance:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
