import { prisma } from '../src/config/prisma.js';

function inferDetails(product) {
  const name = product.name || '';
  const lower = name.toLowerCase();
  const cat = typeof product.category === 'object' ? (product.category?.slug || '') : String(product.category || '');
  const catLower = cat.toLowerCase();

  // 1. Detect Brand
  const knownBrands = [
    'Nestle', 'Nestlé', 'Cadbury', 'Amul', "Haldiram's", 'Aashirvaad', 'India Gate',
    'Tata Sampann', 'Tata', 'Fortune', 'Parle-G', 'Parle', 'Coca-Cola', 'Real',
    'Surf Excel', 'Dove', 'Maggi', 'Kissan', "Kellogg's", "Kwality Wall's",
    'Mother Dairy', 'Havmor', 'Huggies', 'Pampers', "Johnson's", 'Sebamed',
    'Snickers', 'Tanishq', 'Tic Tac', 'Vadilal', 'Vicks', 'Vim', 'Volini',
    'Wagh Bakri', 'Brooke Bond', 'Lipton', 'Philips', 'Fevistik', 'Scotch-Brite',
    'Scotch', 'Orbit', 'Pass Pass', 'Rajnigandha', 'Freshwrapp', 'Hansaplast',
    'Harpic', 'Iodex', 'MamyPoko', 'Origami', 'Revital H', 'Lizol'
  ];

  let brand = '';
  for (const b of knownBrands) {
    if (name.toLowerCase().includes(b.toLowerCase())) {
      brand = b;
      break;
    }
  }
  if (!brand) {
    brand = name.split(' ')[0] || 'R2Cart Select';
  }

  // 2. Detect Product Type & Dietary Preference
  let productType = '';
  let dietaryPreference = 'Veg';
  let flavour = '';
  let itemForm = 'Pack';
  let packagingType = 'Packet';
  let shelfLife = '6–12 Months';
  let ingredients = '';
  let allergens = '';
  let storage = 'Store in a cool, dry and hygienic place and avoid direct sunlight.';
  let nutrition = {
    serving: 'Per 100g',
    energy: '380 kcal',
    protein: '7.5 g',
    carbs: '65.0 g',
    sugars: '12.0 g',
    addedSugars: '8.0 g',
    fat: '9.0 g'
  };

  const isNonFood = catLower.includes('household') ||
    catLower.includes('cleaning') ||
    catLower.includes('personal') ||
    catLower.includes('stationery') ||
    catLower.includes('jewellery') ||
    catLower.includes('baby');

  if (isNonFood) {
    dietaryPreference = ''; // Not applicable for non-food
  }

  // Categories specific logic
  if (lower.includes('chocolate') || lower.includes('chocos') || lower.includes('kitkat') || lower.includes('snickers')) {
    productType = 'Confectionery / Chocolate';
    flavour = 'Rich Chocolate';
    itemForm = 'Bar';
    packagingType = 'Pouch / Wrapper';
    shelfLife = '9 Months';
    ingredients = 'Sugar, Milk solids, Fractionated vegetable fat, Hydrogenated vegetable fats, Cocoa solids, Emulsifier (Soya lecithin) and Nature Identical flavouring substances.';
    allergens = 'Contains: Milk, Sesame, Soy, and Wheat (Gluten).';
    storage = 'Store in a cool, hygienic and dry place (18°C–22°C). Avoid direct exposure to heat.';
    nutrition = {
      serving: 'Per 100g',
      energy: '515 kcal',
      protein: '8.7 g',
      carbs: '57.5 g',
      sugars: '49.8 g',
      addedSugars: '39.2 g',
      fat: '27.8 g'
    };
  } else if (lower.includes('milk') && !isNonFood) {
    productType = 'Fresh Dairy Milk';
    flavour = 'Natural Fresh Milk';
    itemForm = 'Liquid';
    packagingType = 'Poly Pouch / Tetra Pak';
    shelfLife = '2–3 Days (Fresh) / 6 Months (UHT)';
    ingredients = 'Standardized pasteurized milk, Vitamin A & D fortified.';
    allergens = 'Contains: Milk.';
    storage = 'Keep refrigerated at 4°C or below. Consume within 2 days after opening.';
    nutrition = {
      serving: 'Per 100ml',
      energy: '62 kcal',
      protein: '3.2 g',
      carbs: '4.8 g',
      sugars: '4.8 g',
      addedSugars: '0 g',
      fat: '3.0 g'
    };
  } else if (lower.includes('tea') || lower.includes('coffee')) {
    productType = 'Beverage / Tea & Coffee';
    flavour = lower.includes('masala') ? 'Spiced Masala' : 'Rich Authentic Blend';
    itemForm = 'Loose Leaves / Tea Bags';
    packagingType = 'Pouch / Tin / Box';
    shelfLife = '12 Months';
    ingredients = '100% Selected Premium Tea Leaves.';
    allergens = 'None.';
    storage = 'Transfer contents to an airtight container after opening. Keep away from strong odours.';
    nutrition = {
      serving: 'Per 100g',
      energy: '105 kcal',
      protein: '19.0 g',
      carbs: '4.0 g',
      sugars: '0 g',
      addedSugars: '0 g',
      fat: '0.8 g'
    };
  } else if (lower.includes('atta') || lower.includes('rice') || lower.includes('dal') || lower.includes('oil')) {
    productType = 'Kitchen Staples / Groceries';
    itemForm = lower.includes('oil') ? 'Liquid' : 'Grain / Flour / Pulses';
    packagingType = lower.includes('oil') ? 'Pouch / Bottle' : 'Bag / Pouch';
    shelfLife = '6–9 Months';
    ingredients = lower.includes('atta')
      ? '100% Whole Wheat Grains.'
      : lower.includes('rice')
        ? '100% Aged Basmati Rice.'
        : lower.includes('oil')
          ? 'Refined Edible Vegetable Oil, Fortified with Vitamin A & D.'
          : '100% Unpolished Natural Pulses.';
    allergens = lower.includes('atta') ? 'Contains: Wheat (Gluten).' : 'Free from common allergens.';
    storage = 'Store in a cool, dry place. Keep in an airtight container for lasting freshness.';
    nutrition = {
      serving: 'Per 100g',
      energy: lower.includes('oil') ? '900 kcal' : '360 kcal',
      protein: lower.includes('dal') ? '22.0 g' : lower.includes('atta') ? '11.8 g' : '7.0 g',
      carbs: lower.includes('oil') ? '0 g' : '72.0 g',
      sugars: '1.2 g',
      addedSugars: '0 g',
      fat: lower.includes('oil') ? '100 g' : '1.5 g'
    };
  } else if (lower.includes('ice cream') || lower.includes('kulfi') || lower.includes('cassata') || lower.includes('cornetto')) {
    productType = 'Frozen Dessert / Ice Cream';
    flavour = lower.includes('butterscotch') ? 'Butterscotch Crunch' : lower.includes('mango') ? 'Alphonso Mango' : 'Rich Creamy Delight';
    itemForm = 'Tub / Cone / Stick';
    packagingType = 'Tub / Wrapper';
    shelfLife = '12 Months';
    ingredients = 'Milk Solids, Sugar, Water, Edible Vegetable Oil, Liquid Glucose, Emulsifiers, Stabilizers and Added Flavours.';
    allergens = 'Contains: Milk, Wheat (cone) and may contain traces of Tree Nuts.';
    storage = 'Keep frozen at -18°C or below.';
    nutrition = {
      serving: 'Per 100ml',
      energy: '210 kcal',
      protein: '3.8 g',
      carbs: '24.5 g',
      sugars: '20.0 g',
      addedSugars: '16.5 g',
      fat: '11.0 g'
    };
  } else if (lower.includes('biscuit') || lower.includes('chips') || lower.includes('namkeen') || lower.includes('snacks')) {
    productType = 'Ready to Eat Snacks & Munchies';
    flavour = lower.includes('salted') ? 'Classic Salted' : 'Crunchy Oven Baked';
    itemForm = 'Crisps / Biscuits';
    packagingType = 'Sealed Foil Pouch';
    shelfLife = '6 Months';
    ingredients = 'Wheat Flour / Potatoes, Edible Vegetable Oil, Sugar / Iodised Salt, Leavening agents, Spices & Condiments.';
    allergens = 'Contains: Wheat. May contain traces of Soy & Nuts.';
    storage = 'Store in a cool and dry place away from direct sunlight. Once opened, store in an airtight container.';
    nutrition = {
      serving: 'Per 100g',
      energy: '460 kcal',
      protein: '6.5 g',
      carbs: '68.0 g',
      sugars: '22.0 g',
      addedSugars: '18.0 g',
      fat: '18.5 g'
    };
  } else if (isNonFood) {
    productType = catLower.includes('household')
      ? 'Household Cleaning & Essentials'
      : catLower.includes('personal')
        ? 'Personal Care & Hygiene'
        : catLower.includes('baby')
          ? 'Baby Care & Nurturing'
          : catLower.includes('jewellery')
            ? 'Fashion & Traditional Jewellery'
            : 'Home & Office Utility';
    itemForm = 'Item';
    packagingType = 'Pack / Bottle / Box';
    shelfLife = '24–36 Months';
    ingredients = 'Formulated with dermatologically tested, high-grade ingredients compliant with Indian Bureau of Standards.';
    allergens = 'For external use only. Keep out of reach of children.';
    storage = 'Store in a cool, dry place away from direct heat and sunlight.';
    nutrition = {
      serving: 'N/A',
      energy: '',
      protein: '',
      carbs: '',
      sugars: '',
      addedSugars: '',
      fat: ''
    };
  }

  // Key Features Checklist
  const keyFeatures = [
    `100% Genuine and authentic ${brand} quality guaranteed`,
    `Hygienically packed and fresh dispatch direct from R2Cart store`,
    `Convenient ${product.unit || 'pack'} size ideal for daily household needs`,
    `Quality inspected before every delivery to ensure maximum customer satisfaction`
  ];

  return {
    summary: product.description && !product.description.startsWith('{')
      ? product.description
      : `${name} by ${brand}. Fresh, reliable and authentic quality essentials delivered to your doorstep.`,
    brand,
    productType: productType || 'Daily Grocery Essential',
    dietaryPreference,
    flavour,
    itemForm,
    weight: product.unit || '',
    itemIncluded: `1 x ${name}`,
    packagingType,
    countryOfOrigin: 'India',
    shelfLife,
    keyFeatures,
    ingredients,
    allergens,
    storage,
    nutrition,
    customSpecs: []
  };
}

async function main() {
  console.log('Starting automated product specifications enrichment...');
  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    include: { category: true }
  });

  console.log(`Found ${products.length} products to enrich.`);
  let updatedCount = 0;

  for (const p of products) {
    // If product already has full valid JSON description with brand, we can preserve or enhance
    let hasFullJson = false;
    if (p.description && p.description.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(p.description);
        if (parsed.brand && parsed.keyFeatures && parsed.keyFeatures.length > 0) {
          hasFullJson = true;
        }
      } catch {}
    }

    if (!hasFullJson) {
      const details = inferDetails(p);
      const jsonDesc = JSON.stringify(details);
      await prisma.product.update({
        where: { id: p.id },
        data: { description: jsonDesc }
      });
      updatedCount++;
    }
  }

  console.log(`Successfully enriched ${updatedCount} products with full production specifications!`);
  await prisma.$disconnect();
}

main().catch(console.error);
