import { prisma } from '../src/config/prisma.js';

const newCategories = [
  {
    name: 'Baby Care',
    slug: 'baby-care',
    image: 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?auto=format&fit=crop&w=600&q=80',
    color: '#EBF4FF',
    position: 15
  },
  {
    name: 'Jewellery',
    slug: 'jewellery',
    image: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=600&q=80',
    color: '#FFF0F6',
    position: 16
  },
  {
    name: 'Cleaning & Kitchen',
    slug: 'cleaning-kitchen',
    image: 'https://images.unsplash.com/photo-1585832770485-e68a5dbfad52?auto=format&fit=crop&w=600&q=80',
    color: '#E8F8F5',
    position: 17
  },
  {
    name: 'Paan Corner',
    slug: 'paan-corner',
    image: 'https://images.unsplash.com/photo-1621996346565-e3d5d6281220?auto=format&fit=crop&w=600&q=80',
    color: '#E8F5E9',
    position: 18
  },
  {
    name: 'Pharma & Wellness',
    slug: 'pharma-wellness',
    image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80',
    color: '#F3E5F5',
    position: 19
  },
  {
    name: 'Stationery & Utilities',
    slug: 'stationery-utilities',
    image: 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=600&q=80',
    color: '#FFFDE7',
    position: 20
  }
];

const newProducts = [
  // Baby Care
  {
    name: 'Pampers All Round Protection Diaper Pants (L)',
    slug: 'pampers-all-round-protection-diaper-pants-l-34',
    categorySlug: 'baby-care',
    unit: '34 Count',
    mrp: 749,
    price: 629,
    stock: 40,
    description: 'Cotton-soft pant-style diapers with anti-rash lotion and up to 12 hours of ultra-dry absorb lock for active babies.',
    image: 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?auto=format&fit=crop&w=600&q=80',
    bestSeller: true
  },
  {
    name: 'Huggies Wonder Pants Diapers (M)',
    slug: 'huggies-wonder-pants-diapers-m-42',
    categorySlug: 'baby-care',
    unit: '42 Count',
    mrp: 699,
    price: 589,
    stock: 45,
    description: 'Super-stretchy waistband diapers with cushiony comfort and bubble-bed technology for all-night dryness.',
    image: 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?auto=format&fit=crop&w=600&q=80',
    bestSeller: true
  },
  {
    name: "Johnson's Baby No More Tears Shampoo",
    slug: 'johnsons-baby-no-more-tears-shampoo-200ml',
    categorySlug: 'baby-care',
    unit: '200 ml',
    mrp: 215,
    price: 189,
    stock: 35,
    description: 'Clinically proven mild shampoo that is gentle to baby eyes as pure water. Leaves baby hair silky soft and clean.',
    image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=600&q=80'
  },
  {
    name: "Johnson's Baby Powder with Natural Cornstarch",
    slug: 'johnsons-baby-powder-cornstarch-200g',
    categorySlug: 'baby-care',
    unit: '200 g',
    mrp: 180,
    price: 155,
    stock: 50,
    description: 'Absorbs excess moisture for soft, fresh, and comfortably dry baby skin throughout the day.',
    image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=600&q=80'
  },
  {
    name: 'Nestlé Cerelac Wheat Apple Baby Cereal with Milk',
    slug: 'nestle-cerelac-wheat-apple-300g',
    categorySlug: 'baby-care',
    unit: '300 g',
    mrp: 310,
    price: 285,
    stock: 30,
    description: 'Complementary fortified baby cereal rich in iron, zinc, calcium and 14 essential vitamins for growing infants.',
    image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80'
  },
  {
    name: 'Sebamed Baby Gentle Cleansing Bar',
    slug: 'sebamed-baby-cleansing-bar-100g',
    categorySlug: 'baby-care',
    unit: '100 g',
    mrp: 280,
    price: 249,
    stock: 25,
    description: '100% soap-free and alkali-free cleansing bar with pH 5.5 to support the natural barrier of sensitive baby skin.',
    image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=600&q=80'
  },
  {
    name: 'MamyPoko Extra Absorb Diaper Pants (XL)',
    slug: 'mamypoko-extra-absorb-diaper-pants-xl-30',
    categorySlug: 'baby-care',
    unit: '30 Count',
    mrp: 799,
    price: 679,
    stock: 35,
    description: 'Crisscross absorbent sheet with thigh-support fit prevents leakage for up to 12 hours.',
    image: 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?auto=format&fit=crop&w=600&q=80'
  },
  {
    name: 'Chicco Baby Moments Gentle Body Wash & Shampoo',
    slug: 'chicco-baby-moments-gentle-wash-shampoo-200ml',
    categorySlug: 'baby-care',
    unit: '200 ml',
    mrp: 299,
    price: 259,
    stock: 25,
    description: 'Formulated with oats extract to gently cleanse and moisturize delicate baby skin and fine hair without irritation.',
    image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=600&q=80'
  },

  // Jewellery
  {
    name: 'Tanishq Gold Plated Floral Stud Earrings',
    slug: 'tanishq-gold-plated-floral-stud-earrings',
    categorySlug: 'jewellery',
    unit: '1 Pair',
    mrp: 1299,
    price: 1099,
    stock: 25,
    description: 'Exquisitely crafted gold-plated floral stud earrings with sparkling cubic zirconia stones. Perfect for festive and everyday elegance.',
    image: 'https://images.unsplash.com/photo-1611652022419-a9419f74343d?auto=format&fit=crop&w=600&q=80',
    bestSeller: true
  },
  {
    name: 'Traditional Kundan Pearl Choker Necklace Set',
    slug: 'traditional-kundan-pearl-choker-necklace-set',
    categorySlug: 'jewellery',
    unit: '1 Set',
    mrp: 2499,
    price: 1899,
    stock: 20,
    description: 'Handcrafted royal Kundan choker necklace paired with matching hanging earrings and delicate faux pearl drops.',
    image: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=600&q=80',
    bestSeller: true
  },
  {
    name: '18K Rose Gold Plated Crystal Solitaire Ring',
    slug: '18k-rose-gold-plated-crystal-solitaire-ring',
    categorySlug: 'jewellery',
    unit: '1 Piece',
    mrp: 899,
    price: 699,
    stock: 35,
    description: 'Dainty adjustable band featuring a brilliant-cut center solitaire stone crafted in anti-tarnish rose gold polish.',
    image: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=600&q=80'
  },
  {
    name: 'Antique Brass Traditional Temple Bangles',
    slug: 'antique-brass-traditional-temple-bangles',
    categorySlug: 'jewellery',
    unit: 'Set of 4',
    mrp: 1499,
    price: 1199,
    stock: 30,
    description: 'Intricately etched matte antique gold finish bangles with heritage temple motifs. Lightweight and comfortable for all-day wear.',
    image: 'https://images.unsplash.com/photo-1573408301185-9519f94d8a1a?auto=format&fit=crop&w=600&q=80'
  },
  {
    name: 'Sterling Silver 925 Infinity Link Bracelet',
    slug: 'sterling-silver-925-infinity-link-bracelet',
    categorySlug: 'jewellery',
    unit: '1 Piece',
    mrp: 1599,
    price: 1249,
    stock: 25,
    description: 'Pure 925 sterling silver sleek chain bracelet with an infinity symbol motif and secure lobster clasp closure.',
    image: 'https://images.unsplash.com/photo-1611591475879-1100f0017482?auto=format&fit=crop&w=600&q=80'
  },
  {
    name: 'Pearl Drop Elegant Dangler Jhumka Earrings',
    slug: 'pearl-drop-elegant-dangler-jhumka-earrings',
    categorySlug: 'jewellery',
    unit: '1 Pair',
    mrp: 999,
    price: 749,
    stock: 40,
    description: 'Traditional Indian ethnic jhumkas with micro pearl clusters, fine filigree work, and easy push-back closure.',
    image: 'https://images.unsplash.com/photo-1630019852942-f89202989a59?auto=format&fit=crop&w=600&q=80'
  },
  {
    name: 'Minimalist Layered Gold Chain with Pendant',
    slug: 'minimalist-layered-gold-chain-with-pendant',
    categorySlug: 'jewellery',
    unit: '1 Piece',
    mrp: 1199,
    price: 899,
    stock: 30,
    description: 'Chic modern layered chain necklace with a textured coin medallion pendant, coated with protective anti-tarnish glaze.',
    image: 'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=600&q=80'
  },
  {
    name: 'Sparkling Zircon Adjustable Traditional Anklet',
    slug: 'sparkling-zircon-adjustable-traditional-anklet',
    categorySlug: 'jewellery',
    unit: '1 Pair',
    mrp: 799,
    price: 599,
    stock: 35,
    description: 'Silver-toned delicate payal anklets studded with shimmering American diamonds and soothing mini ghungroo bells.',
    image: 'https://images.unsplash.com/photo-1602751584552-8ba73aad10e1?auto=format&fit=crop&w=600&q=80'
  },

  // Cleaning & Kitchen
  {
    name: 'Vim Lemon Dishwash Gel with Easy Dispenser',
    slug: 'vim-lemon-dishwash-gel-dispenser-750ml',
    categorySlug: 'cleaning-kitchen',
    unit: '750 ml',
    mrp: 190,
    price: 165,
    stock: 50,
    description: 'Power of 100 lemons cuts through stubborn grease on utensils in one swipe without leaving any white residue.',
    image: 'https://images.unsplash.com/photo-1585832770485-e68a5dbfad52?auto=format&fit=crop&w=600&q=80',
    bestSeller: true
  },
  {
    name: 'Scotch-Brite Heavy Duty Scrub Sponge',
    slug: 'scotch-brite-heavy-duty-sponge-3pack',
    categorySlug: 'cleaning-kitchen',
    unit: 'Pack of 3',
    mrp: 115,
    price: 99,
    stock: 60,
    description: 'Durable nylon scrub pad with high-density sponge backing for spotless kitchenware and long-lasting lather.',
    image: 'https://images.unsplash.com/photo-1585832770485-e68a5dbfad52?auto=format&fit=crop&w=600&q=80',
    bestSeller: true
  },
  {
    name: 'Harpic Power Plus 10x Disinfectant Toilet Cleaner',
    slug: 'harpic-power-plus-toilet-cleaner-1l',
    categorySlug: 'cleaning-kitchen',
    unit: '1 L',
    mrp: 215,
    price: 185,
    stock: 45,
    description: 'Thick liquid formula kills 99.9% germs, removes limescale and yellow stains for sparkling clean ceramic bowls.',
    image: 'https://images.unsplash.com/photo-1585832770485-e68a5dbfad52?auto=format&fit=crop&w=600&q=80'
  },
  {
    name: 'Lizol Citrus Disinfectant Floor Cleaner',
    slug: 'lizol-citrus-floor-cleaner-2l',
    categorySlug: 'cleaning-kitchen',
    unit: '2 L',
    mrp: 399,
    price: 349,
    stock: 40,
    description: 'Triple action floor disinfectant kills 99.9% viruses and bacteria while leaving a refreshing citrus fragrance.',
    image: 'https://images.unsplash.com/photo-1585832770485-e68a5dbfad52?auto=format&fit=crop&w=600&q=80'
  },
  {
    name: 'Colin Glass & Household Surface Cleaner Spray',
    slug: 'colin-glass-surface-cleaner-spray-500ml',
    categorySlug: 'cleaning-kitchen',
    unit: '500 ml',
    mrp: 110,
    price: 95,
    stock: 55,
    description: 'Streak-free shine formula with vinegar for mirrors, tabletops, windows, and kitchen glass cooktops.',
    image: 'https://images.unsplash.com/photo-1585832770485-e68a5dbfad52?auto=format&fit=crop&w=600&q=80'
  },
  {
    name: 'Freshwrapp Food Grade Aluminium Foil',
    slug: 'freshwrapp-aluminium-foil-9m',
    categorySlug: 'cleaning-kitchen',
    unit: '9 m',
    mrp: 125,
    price: 109,
    stock: 50,
    description: 'Hygienic 11-micron thick foil locks in freshness and aroma of cooked rotis, parathas, and barbecue snacks.',
    image: 'https://images.unsplash.com/photo-1585832770485-e68a5dbfad52?auto=format&fit=crop&w=600&q=80'
  },
  {
    name: 'Origami 2-Ply Kitchen Paper Towel Roll',
    slug: 'origami-2ply-kitchen-paper-towel-2rolls',
    categorySlug: 'cleaning-kitchen',
    unit: '2 Rolls',
    mrp: 160,
    price: 139,
    stock: 40,
    description: 'Extra absorbent virgin paper towels for soaking excess cooking oil, wiping spills, and keeping counters spotless.',
    image: 'https://images.unsplash.com/photo-1585832770485-e68a5dbfad52?auto=format&fit=crop&w=600&q=80'
  },
  {
    name: 'Clean Pro Heavy Duty Garbage Bags (Medium)',
    slug: 'clean-pro-garbage-bags-medium-30pack',
    categorySlug: 'cleaning-kitchen',
    unit: '30 Bags',
    mrp: 145,
    price: 119,
    stock: 45,
    description: 'Leak-proof oxo-biodegradable trash bags with tie-strings, ideal for kitchen bins and daily household disposal.',
    image: 'https://images.unsplash.com/photo-1585832770485-e68a5dbfad52?auto=format&fit=crop&w=600&q=80'
  },

  // Paan Corner
  {
    name: 'Rajnigandha Flavored Pan Masala Premium Zipper',
    slug: 'rajnigandha-flavored-pan-masala-100g',
    categorySlug: 'paan-corner',
    unit: '100 g',
    mrp: 210,
    price: 195,
    stock: 40,
    description: 'Exquisite blend of betel nuts, saffron flavor, and essential herbs crafted with traditional Indian royal heritage.',
    image: 'https://images.unsplash.com/photo-1621996346565-e3d5d6281220?auto=format&fit=crop&w=600&q=80',
    bestSeller: true
  },
  {
    name: 'Baba Elaichi Silver Coated Cardamom Seeds',
    slug: 'baba-elaichi-silver-coated-10g',
    categorySlug: 'paan-corner',
    unit: '10 g',
    mrp: 120,
    price: 109,
    stock: 50,
    description: 'Finest handpicked green cardamom seeds coated with 99.9% pure refined silver leaf and aromatic saffron oil.',
    image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=600&q=80',
    bestSeller: true
  },
  {
    name: 'Pass Pass Sweet Mint Herbal Mouth Freshener',
    slug: 'pass-pass-sweet-mint-mouth-freshener-105g',
    categorySlug: 'paan-corner',
    unit: '105 g',
    mrp: 50,
    price: 45,
    stock: 60,
    description: 'Crunchy sweet herbal mouth freshener made with fennel seeds, coriander seeds, dry dates, and cooling menthol.',
    image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=600&q=80'
  },
  {
    name: 'Center Fresh Spearmint Chewing Gum Stick',
    slug: 'center-fresh-spearmint-chewing-gum-12pack',
    categorySlug: 'paan-corner',
    unit: 'Pack of 12',
    mrp: 60,
    price: 54,
    stock: 70,
    description: 'Liquid-filled spearmint chewing gum that unleashes a blast of icy cooling freshness with every chew.',
    image: 'https://images.unsplash.com/photo-1582293041079-7814c2f12063?auto=format&fit=crop&w=600&q=80'
  },
  {
    name: 'Orbit Spearmint Sugarfree Chewing Gum Bottle',
    slug: 'orbit-spearmint-sugarfree-gum-22g',
    categorySlug: 'paan-corner',
    unit: '22 g',
    mrp: 50,
    price: 45,
    stock: 65,
    description: 'Sugar-free spearmint pellets endorsed by dental health foundations to keep breath fresh and teeth clean.',
    image: 'https://images.unsplash.com/photo-1582293041079-7814c2f12063?auto=format&fit=crop&w=600&q=80'
  },
  {
    name: "Dilbahar's Shahi Calcutta Meetha Paan Leaves",
    slug: 'dilbahars-shahi-calcutta-meetha-paan-200g',
    categorySlug: 'paan-corner',
    unit: '200 g',
    mrp: 175,
    price: 155,
    stock: 35,
    description: 'Ready-to-eat tobacco-free traditional sweet paan packed with gulkand, tutty fruity, menthol, and sweet fennel.',
    image: 'https://images.unsplash.com/photo-1621996346565-e3d5d6281220?auto=format&fit=crop&w=600&q=80'
  },
  {
    name: 'Churan Goli Pachak Digestive Hing Candy',
    slug: 'churan-goli-pachak-digestive-candy-150g',
    categorySlug: 'paan-corner',
    unit: '150 g',
    mrp: 75,
    price: 65,
    stock: 50,
    description: 'Tangy and spiced Ayurvedic digestive balls made with pure hing, black salt, cumin, and dry mango powder.',
    image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=600&q=80'
  },
  {
    name: 'Tic Tac Fresh Spearmint Flavored Mints',
    slug: 'tic-tac-fresh-spearmint-mints-14-5g',
    categorySlug: 'paan-corner',
    unit: '14.5 g',
    mrp: 20,
    price: 18,
    stock: 80,
    description: 'Iconic tiny pill-shaped pocket mints delivering instant cool spearmint flavor with less than 2 calories each.',
    image: 'https://images.unsplash.com/photo-1582293041079-7814c2f12063?auto=format&fit=crop&w=600&q=80'
  },

  // Pharma & Wellness
  {
    name: 'Hansaplast Regular Washproof Bandages',
    slug: 'hansaplast-regular-washproof-bandages-20pack',
    categorySlug: 'pharma-wellness',
    unit: 'Pack of 20',
    mrp: 75,
    price: 65,
    stock: 70,
    description: 'Antiseptic medicated wound pad protects cuts and scrapes from water, dirt, and bacteria.',
    image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80',
    bestSeller: true
  },
  {
    name: 'Volini Maxx Instant Pain Relief Spray',
    slug: 'volini-maxx-instant-pain-relief-spray-100g',
    categorySlug: 'pharma-wellness',
    unit: '100 g',
    mrp: 295,
    price: 249,
    stock: 40,
    description: 'Micro-particles penetrate 2x deeper for immediate relief from backache, neck pain, sprains, and joint stiffness.',
    image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80',
    bestSeller: true
  },
  {
    name: 'Eno Fast Relief Fruit Salt Regular Lemon',
    slug: 'eno-fruit-salt-lemon-6pack',
    categorySlug: 'pharma-wellness',
    unit: 'Pack of 6',
    mrp: 60,
    price: 54,
    stock: 80,
    description: 'Works in 6 seconds to neutralize stomach acid and bring quick cooling relief from heartburn and indigestion.',
    image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80'
  },
  {
    name: 'Digene Acidity & Gas Relief Gel Orange Flavor',
    slug: 'digene-acidity-gas-relief-gel-200ml',
    categorySlug: 'pharma-wellness',
    unit: '200 ml',
    mrp: 165,
    price: 145,
    stock: 45,
    description: 'Doctor-prescribed soothing antacid suspension relieves stomach burning, acid reflux, and heavy gas bloating.',
    image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80'
  },
  {
    name: 'Dettol Antiseptic Disinfectant Liquid',
    slug: 'dettol-antiseptic-liquid-250ml',
    categorySlug: 'pharma-wellness',
    unit: '250 ml',
    mrp: 145,
    price: 129,
    stock: 50,
    description: 'Trusted gold-standard antiseptic protection for first aid, wound cleaning, personal hygiene, and surface disinfection.',
    image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80'
  },
  {
    name: 'Revital H Daily Health Supplement Capsules',
    slug: 'revital-h-daily-health-capsules-30pack',
    categorySlug: 'pharma-wellness',
    unit: '30 Capsules',
    mrp: 350,
    price: 299,
    stock: 35,
    description: 'Balanced multivitamin and mineral formulation with natural ginseng extract to boost daily stamina and immunity.',
    image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80'
  },
  {
    name: 'Iodex Multi-Purpose Fast Relief Balm',
    slug: 'iodex-multi-purpose-relief-balm-40g',
    categorySlug: 'pharma-wellness',
    unit: '40 g',
    mrp: 160,
    price: 139,
    stock: 50,
    description: 'Herbal power of 5 natural ingredients targets deep-seated muscular ache, back pain, and joint swelling.',
    image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80'
  },
  {
    name: 'Vicks Vaporub Ayurvedic Cold & Cough Relief Balm',
    slug: 'vicks-vaporub-relief-balm-50ml',
    categorySlug: 'pharma-wellness',
    unit: '50 ml',
    mrp: 165,
    price: 145,
    stock: 60,
    description: 'Vaporizing soothing chest ointment with camphor, eucalyptus, and menthol provides fast relief from blocked nose.',
    image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80'
  },

  // Stationery & Utilities
  {
    name: 'Duracell Chota Power AAA Alkaline Batteries',
    slug: 'duracell-chota-power-aaa-batteries-4pack',
    categorySlug: 'stationery-utilities',
    unit: 'Pack of 4',
    mrp: 180,
    price: 159,
    stock: 60,
    description: 'Long-lasting high performance AAA batteries with Duralock Power Preserve technology for remote controls and toys.',
    image: 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=600&q=80',
    bestSeller: true
  },
  {
    name: 'Duracell Ultra AA High Drain Alkaline Batteries',
    slug: 'duracell-ultra-aa-batteries-4pack',
    categorySlug: 'stationery-utilities',
    unit: 'Pack of 4',
    mrp: 220,
    price: 189,
    stock: 55,
    description: 'Up to 100% more power for high-drain gadgets, digital cameras, gaming controllers, and wall clocks.',
    image: 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=600&q=80',
    bestSeller: true
  },
  {
    name: 'Classmate Spiral Bound Soft Cover Long Notebook',
    slug: 'classmate-spiral-long-notebook-240pages',
    categorySlug: 'stationery-utilities',
    unit: '240 Pages',
    mrp: 140,
    price: 119,
    stock: 45,
    description: 'Single-line ozone-treated elemental chlorine-free paper notebook with sturdy spiral binding for smooth note-taking.',
    image: 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=600&q=80'
  },
  {
    name: 'Cello Butterflow Classic Blue Ballpoint Pens',
    slug: 'cello-butterflow-blue-ballpoint-pens-5pack',
    categorySlug: 'stationery-utilities',
    unit: 'Pack of 5',
    mrp: 50,
    price: 44,
    stock: 75,
    description: 'Ultra-low viscosity Lubriflow ink system delivers exceptionally light, pressure-free handwriting.',
    image: 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=600&q=80'
  },
  {
    name: 'Fevistik All Round Non-Toxic Glue Stick',
    slug: 'fevistik-glue-stick-15g',
    categorySlug: 'stationery-utilities',
    unit: '15 g',
    mrp: 40,
    price: 35,
    stock: 80,
    description: 'Mess-free rotary glue stick bonds paper, cardboard, and craft sheets instantly without wrinkling.',
    image: 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=600&q=80'
  },
  {
    name: 'Scotch Magic Invisible Mending Tape with Dispenser',
    slug: 'scotch-magic-tape-dispenser-19mm',
    categorySlug: 'stationery-utilities',
    unit: '19 mm x 7.6 m',
    mrp: 110,
    price: 95,
    stock: 40,
    description: 'Frosty matte tape looks invisible on paper, can be written on with pen or marker, and will not yellow over time.',
    image: 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=600&q=80'
  },
  {
    name: 'Philips Stellar Bright 9W B22 Cool Day White Bulb',
    slug: 'philips-stellar-bright-9w-led-bulb-2pack',
    categorySlug: 'stationery-utilities',
    unit: 'Pack of 2',
    mrp: 240,
    price: 189,
    stock: 40,
    description: 'Energy-saving 9W LED bulb with 850 lumens output, wide beam angle, and EyeComfort certification.',
    image: 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=600&q=80'
  },
  {
    name: 'Eveready Digiled Compact LED Flashlight Torch',
    slug: 'eveready-digiled-flashlight-torch-1unit',
    categorySlug: 'stationery-utilities',
    unit: '1 Unit',
    mrp: 180,
    price: 149,
    stock: 35,
    description: 'High-intensity white LED beam with durable shock-resistant body, supplied with batteries for emergency lighting.',
    image: 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=600&q=80'
  }
];

async function main() {
  console.log('--- Seeding 6 New Categories for 10/10 Grid ---');

  // Clean up legacy pet-care category & products if they exist
  try {
    const legacyPetCare = await prisma.category.findUnique({ where: { slug: 'pet-care' } });
    if (legacyPetCare) {
      const legacyProducts = await prisma.product.findMany({
        where: { categoryId: legacyPetCare.id },
        select: { id: true }
      });
      const prodIds = legacyProducts.map(p => p.id);
      if (prodIds.length > 0) {
        await prisma.productImage.deleteMany({ where: { productId: { in: prodIds } } });
        await prisma.favorite.deleteMany({ where: { productId: { in: prodIds } } });
        await prisma.cartItem.deleteMany({ where: { productId: { in: prodIds } } });
        await prisma.product.deleteMany({ where: { id: { in: prodIds } } });
      }
      await prisma.category.delete({ where: { id: legacyPetCare.id } });
      console.log('Cleaned up legacy pet-care category and its products.');
    }
  } catch (cleanErr) {
    console.warn('Note on legacy cleanup:', cleanErr.message);
  }

  for (const cat of newCategories) {
    const upserted = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: {
        name: cat.name,
        slug: cat.slug,
        image: cat.image,
        color: cat.color,
        position: cat.position,
        status: 'ACTIVE'
      }
    });
    console.log(`Upserted category: ${upserted.name} (${upserted.slug}) - ID: ${upserted.id}`);
  }

  // Fetch all categories to map slug to ID
  const allCats = await prisma.category.findMany();
  const catMap = Object.fromEntries(allCats.map(c => [c.slug, c.id]));

  console.log('\n--- Seeding Products for New Categories ---');
  for (const p of newProducts) {
    const catId = catMap[p.categorySlug];
    if (!catId) {
      console.warn(`Category not found for slug: ${p.categorySlug}`);
      continue;
    }

    const productId = `p-${p.slug}`;
    const sku = `R2C-${p.slug.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20)}`;

    const existing = await prisma.product.findFirst({
      where: {
        OR: [
          { id: productId },
          { slug: p.slug }
        ]
      }
    });

    if (existing) {
      // Preserve existing products edited by admin
      continue;
    } else {
      await prisma.product.create({
        data: {
          id: productId,
          name: p.name,
          slug: p.slug,
          sku,
          categoryId: catId,
          price: p.price,
          mrp: p.mrp,
          stock: p.stock,
          unit: p.unit,
          description: p.description,
          status: 'ACTIVE',
          bestSeller: !!p.bestSeller,
          images: {
            create: {
              url: p.image,
              alt: p.name,
              position: 0
            }
          }
        }
      });
      console.log(`Created product: ${p.name}`);
    }
  }

  console.log('\n--- Final Categories & Active Product Count (Total 20 Categories) ---');
  const finalCats = await prisma.category.findMany({
    select: {
      position: true,
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

  console.table(finalCats.map(c => ({
    Position: c.position,
    Name: c.name,
    Slug: c.slug,
    Products: c._count.products
  })));
}

export async function seedTenTenCategories() {
  return main();
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('seed-ten-ten-categories.js')) {
  main()
    .catch(err => {
      console.error('Error during seeding:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
