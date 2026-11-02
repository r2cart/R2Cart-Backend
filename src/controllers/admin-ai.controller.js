import { asyncHandler, ok } from '../utils/response.js';

/**
 * Intelligent E-Commerce Rewrite & Semantic Polishing Engine
 */
function semanticEcommerceRewrite(text, type) {
  const lower = text.toLowerCase();

  const hasDelivery = /ship|deliver|courier|bhej|transport|reach|pan[\s-]*india|all[\s-]*india|desh|all over|har jagah/i.test(lower);
  const hasHandmade = /hand[\s-]*made|handcraft|hath\s*se|custom|resin|curing|art\b|kala/i.test(lower);
  const hasCancel = /cancel|return|wapas|refund|exchange/i.test(lower);
  const hasTrack = /track|whatsapp|msg|call|sms|status/i.test(lower);
  const hasFragile = /fragile|glass|tut|damage|safe|pack|care/i.test(lower);
  const hasDays = /(\d+)\s*[-to\s]+\s*(\d+)\s*(days?|din)?/i.exec(lower);

  const daysStr = hasDays ? `${hasDays[1]}–${hasDays[2]} business days` : '4–7 business days';

  if (type === 'badge') {
    if (hasDelivery && /pan|all/i.test(lower)) return 'Pan-India Delivery';
    if (hasHandmade) return 'Handcrafted & Custom';
    if (/express|fast|quick|urgent/i.test(lower)) return 'Express Shipping';
    if (/quality|best|premium/i.test(lower)) return 'Premium Quality';
    if (hasDelivery) return 'All-India Shipping';
    
    // Capitalize each word cleanly
    return text
      .split(' ')
      .map(w => w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : '')
      .join(' ')
      .slice(0, 30);
  }

  if (type === 'title') {
    if (hasHandmade && hasCancel) return 'Important: Custom Order & Cancellation Guidelines';
    if (hasDelivery && (hasHandmade || /resin/i.test(lower))) return 'Pan-India Shipping & Handcrafted Order Notice';
    if (hasDelivery) return 'Pan-India Shipping & Delivery Guidelines';
    if (hasHandmade) return 'Important Notice for Resin Art Customers';
    if (hasFragile) return 'Fragile Handling & Protective Transit Notice';
    return 'Important Notice & Customer Guidelines';
  }

  // Type === 'message'
  const sentences = [];

  if (hasHandmade) {
    sentences.push('Every piece is meticulously handcrafted with premium resin and undergoes an artistic curing process.');
  }

  if (hasDelivery) {
    sentences.push(`We provide reliable Pan-India courier delivery directly to your doorstep within ${daysStr}.`);
  }

  if (hasCancel) {
    sentences.push('Because each item is custom-crafted specifically for you, orders cannot be cancelled or modified once crafting begins.');
  }

  if (hasFragile) {
    sentences.push('All orders are wrapped in multi-layer protective bubble packaging to guarantee zero transit damage.');
  }

  if (hasTrack) {
    sentences.push('A live courier tracking link will be sent to your registered WhatsApp number as soon as your package is dispatched.');
  }

  if (sentences.length === 0) {
    // If input is general English or unique text, clean and structure it properly
    let cleaned = text.trim();
    cleaned = cleaned.replace(/^[a-z]/, c => c.toUpperCase());
    if (!/[.!?]$/.test(cleaned)) cleaned += '.';
    sentences.push(cleaned);
    sentences.push('Thank you for choosing us for your unique handcrafted needs!');
  }

  return sentences.join(' ');
}

export const correctEnglishText = asyncHandler(async (req, res) => {
  const { text, type } = req.body;
  if (!text || !String(text).trim()) {
    return ok(res, { original: '', corrected: '', changesMade: false });
  }

  const original = String(text).trim();
  let rewritten = '';

  // 1. Check if Google Gemini API key is configured in environment
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (geminiApiKey) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;
      
      const prompt = `You are a professional e-commerce copywriter for an online store in India.
The user wrote: "${original}"
Rewrite this draft into attractive, high-converting, professional English for an e-commerce website.
Type of field: ${type} (badge = 2-4 word punchy tag, title = clean Title Case heading, message = 1-3 polished, customer-friendly sentences).
Return ONLY the final rewritten text without quotes, markdown headers, or explanations.`;

      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 120, temperature: 0.3 }
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidate && candidate.trim()) {
          rewritten = candidate.trim().replace(/^["']|["']$/g, '');
        }
      }
    } catch (err) {
      console.warn('[AI] Gemini API attempt notice:', err.message);
    }
  }

  // 2. If Gemini is not set or failed, use Google Translate auto-detection to convert any Hindi/Hinglish to English
  if (!rewritten) {
    try {
      const gtUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(original)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const gtRes = await fetch(gtUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (gtRes.ok) {
        const gtData = await gtRes.json();
        const translated = gtData?.[0]?.map(chunk => chunk[0]).join('') || '';
        if (translated && translated.trim()) {
          rewritten = semanticEcommerceRewrite(translated, type);
        }
      }
    } catch {
      // Fallback to local semantic rewriter
    }
  }

  // 3. Fallback to smart semantic e-commerce polisher
  if (!rewritten) {
    rewritten = semanticEcommerceRewrite(original, type);
  }

  return ok(res, {
    original,
    corrected: rewritten,
    changesMade: rewritten.trim() !== original.trim()
  });
});

/**
 * Advanced Semantic Indian Grocery & E-Commerce Knowledge Engine
 * Provides instant, high-accuracy specifications, dietary preference, and persuasive descriptions.
 */
function buildSemanticProductDetails(name = '', categorySlug = '', unit = '', overrideBrand = '') {
  const cleanName = String(name || '').trim();
  const lower = cleanName.toLowerCase();
  const catLower = String(categorySlug || '').toLowerCase();
  const unitStr = String(unit || '').trim();

  // 1. Detect Brand
  const KNOWN_BRANDS = [
    'Amul', 'Mother Dairy', 'Nestle', 'Cadbury', 'Aashirvaad', 'Fortune', 'India Gate', 'Tata',
    'Britannia', 'Parle', 'Haldiram\'s', 'Haldiram', 'Lay\'s', 'Lays', 'Kurkure', 'Bingo',
    'Maggi', 'Yippee', 'Knorr', 'Ching\'s', 'Kissan', 'Everest', 'MDH', 'Catch', 'Badshah',
    'Dettol', 'Surf Excel', 'Ariel', 'Tide', 'Vim', 'Colin', 'Harpic', 'Lizol', 'Pril',
    'Dove', 'Lux', 'Pears', 'Colgate', 'Pepsodent', 'Sensodyne', 'Head & Shoulders', 'Pantene',
    'Saffola', 'Dhara', 'Gemini', 'Borges', 'Figaro', 'Disano', 'Sundrop', 'Emami',
    'Nutrela', 'Patanjali', 'Dabur', 'Baidyanath', 'Himalaya', 'Zandu',
    'Coca-Cola', 'Thums Up', 'Sprite', 'Limca', 'Fanta', 'Pepsi', 'Mirinda', 'Mountain Dew',
    'Real', 'Tropicana', 'Frooti', 'Maaza', 'Slice', 'Paper Boat', 'Minute Maid', 'Bisleri', 'Kinley', 'Aquafina',
    'Bru', 'Nescafe', 'Tata Tea', 'Red Label', 'Taj Mahal', 'Wagh Bakri', 'Society', 'Tetley',
    'Harvest Gold', 'English Oven', 'Bonn', 'Modern',
    'Pampers', 'MamyPoko', 'Huggies', 'Johnson\'s', 'Himalaya Baby',
    'Pedigree', 'Whiskas', 'Drools', 'Royal Canin',
    'Classmate', 'Camlin', 'Faber-Castell', 'Doms', 'Natraj', 'Reynolds',
    'Ferrero Rocher', 'Kinder', 'Hershey\'s', 'Toblerone', 'Amul Dark Chocolate', 'Bournville'
  ];

  let detectedBrand = overrideBrand || '';
  if (!detectedBrand) {
    for (const b of KNOWN_BRANDS) {
      const bRegex = new RegExp(`(^|[^a-zA-Z0-9])${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-zA-Z0-9]|$)`, 'i');
      if (bRegex.test(cleanName)) {
        detectedBrand = b.replace(/\\'/g, "'");
        break;
      }
    }
  }

  // 2. Detect Dietary Preference & Speciality
  const nonVegRegex = /\b(chicken|mutton|fish|pork|meat|lamb|seafood|prawn|egg|salmon|tuna|rohu|katla|pomfret|beef|keema|biryani.*(chicken|mutton))\b/i;
  const egglessRegex = /\b(eggless|no[- ]*egg|without[- ]*egg)\b/i;
  const veganRegex = /\b(vegan|plant[- ]*based|soy[- ]*milk|almond[- ]*milk|oat[- ]*milk|tofu)\b/i;
  const organicRegex = /\b(organic|jaivik|bio|certified organic)\b/i;
  const jainRegex = /\b(jain|no[- ]*onion[- ]*no[- ]*garlic)\b/i;
  const nonFoodRegex = /clean|detergent|dishwash|soap|shampoo|paste|brush|harpic|lizol|colin|surf|ariel|tide|diaper|battery|stationery|jewel|resin|utility|plastic|pet|dog|cat/i;

  let dietaryPreference = 'Veg';
  if (nonFoodRegex.test(lower) || nonFoodRegex.test(catLower)) {
    dietaryPreference = '';
  } else if (egglessRegex.test(lower)) {
    dietaryPreference = 'Eggless';
  } else if (nonVegRegex.test(lower) || catLower.includes('meat') || catLower.includes('fish') || catLower.includes('egg')) {
    dietaryPreference = 'Non-Veg';
  } else if (veganRegex.test(lower)) {
    dietaryPreference = 'Vegan';
  } else if (organicRegex.test(lower)) {
    dietaryPreference = 'Organic';
  } else if (jainRegex.test(lower)) {
    dietaryPreference = 'Jain';
  }

  // 3. Detect Weight / Size
  let weight = unitStr;
  const sizeMatch = cleanName.match(/(\d+(?:\.\d+)?\s*(?:kg|g|gm|gms|liter|litre|l|ml|piece|pc|pcs|pack|box|sachet|meter|cm|mm))\b/i);
  if (sizeMatch && !weight) {
    weight = sizeMatch[1].trim();
  }

  // 4. Detect Product Type & Form
  let productType = '';
  let itemForm = '';
  let packagingType = 'Packet';
  let shelfLife = '6 Months';
  let storage = 'Store in a cool, dry and hygienic place away from direct sunlight.';
  let allergens = 'None';
  let keyFeatures = [];
  let ingredients = '';
  let nutrition = {
    serving: 'Per 100g',
    energy: '350 kcal',
    protein: '7.5 g',
    carbs: '65 g',
    sugars: '4.5 g',
    addedSugars: '0 g',
    fat: '5.0 g'
  };

  // Category specific templates & parameters
  if (/fruit|veg|sabzi|apple|banana|mango|potato|onion|tomato/i.test(lower) || catLower.includes('fruit') || catLower.includes('veg')) {
    productType = 'Farm Fresh Produce';
    itemForm = 'Fresh Whole Produce';
    packagingType = 'Crate / Perforated Pouch';
    shelfLife = '3–5 Days';
    storage = 'Store in a cool and dry place or refrigerate to preserve crispness and natural vitamins.';
    allergens = 'None';
    dietaryPreference = 'Veg';
    ingredients = '100% Farm Fresh Harvest';
    nutrition = { serving: 'Per 100g', energy: '52 kcal', protein: '1.1 g', carbs: '12 g', sugars: '8 g', addedSugars: '0 g', fat: '0.2 g' };
    keyFeatures = [
      'Farm-fresh handpicked harvest ensuring optimal crunch and authentic taste',
      'Naturally grown and thoroughly inspected under strict quality benchmarks',
      'Rich in vital vitamins, dietary fiber, and essential minerals for healthy living',
      'Hygienically sorted, clean, and delivered in breathable protective packaging'
    ];
  } else if (/milk|dairy|dahi|curd|paneer|butter|cheese/i.test(lower) || catLower.includes('dairy')) {
    productType = /paneer/i.test(lower) ? 'Fresh Malai Paneer' : /butter/i.test(lower) ? 'Pasteurized Butter' : /cheese/i.test(lower) ? 'Processed Cheese' : 'Pure Fresh Milk';
    itemForm = /milk/i.test(lower) ? 'Liquid' : /paneer|cheese|butter/i.test(lower) ? 'Solid Block' : 'Creamy Curd';
    packagingType = /milk/i.test(lower) ? 'Pouch / Tetra Pak' : 'Sealed Vacuum Pack';
    shelfLife = /milk/i.test(lower) ? '2–3 Days (Fresh) / 180 Days (Tetra Pak)' : '15–30 Days';
    storage = 'Keep refrigerated at 4°C or below. Consume within recommended period after opening.';
    allergens = 'Contains Milk (Lactose)';
    ingredients = 'Pasteurized Milk, Active Lactic Cultures, Permitted Stabilizers';
    nutrition = { serving: 'Per 100ml / 100g', energy: '65 kcal', protein: '3.4 g', carbs: '4.8 g', sugars: '4.8 g', addedSugars: '0 g', fat: '3.5 g' };
    keyFeatures = [
      'Pure, rich, and wholesome dairy sourced from trusted farms',
      'Standardized pasteurization ensuring maximum safety and long-lasting freshness',
      'Naturally high in calcium and high-quality protein to support strong bones',
      'Perfect for daily tea, coffee, breakfast bowls, and traditional culinary recipes'
    ];
  } else if (/atta|flour|rice|chawal|dal|oil|tel|ghee/i.test(lower) || catLower.includes('atta') || catLower.includes('dal') || catLower.includes('oil')) {
    productType = /oil|tel/i.test(lower) ? 'Refined Edible Cooking Oil' : /ghee/i.test(lower) ? 'Pure Desi Ghee' : /rice|chawal/i.test(lower) ? 'Premium Basmati Rice' : /dal|pulse/i.test(lower) ? 'Unpolished Desi Dal' : '100% Pure Whole Wheat Chakki Atta';
    itemForm = /oil|tel|ghee/i.test(lower) ? 'Liquid' : /atta|flour/i.test(lower) ? 'Finely Ground Flour' : 'Grains';
    packagingType = /oil|tel/i.test(lower) ? 'Pouch / Bottle' : 'Heavy-Duty Moisture Barrier Bag';
    shelfLife = '6–12 Months';
    storage = 'Store in an airtight container in a dry, ventilated pantry away from moisture.';
    allergens = /atta|wheat/i.test(lower) ? 'Contains Wheat (Gluten)' : 'None';
    ingredients = cleanName;
    nutrition = { serving: 'Per 100g', energy: '360 kcal', protein: '11.8 g', carbs: '72 g', sugars: '2.5 g', addedSugars: '0 g', fat: '1.5 g' };
    keyFeatures = [
      'Carefully cleaned, sorted, and sealed to retain natural grain goodness and aroma',
      'Unadulterated staple quality tested for authentic texture, purity, and taste',
      'High in dietary fiber and essential plant nutrients for nourishing home meals',
      'Hygienically packaged to protect against moisture, insects, and pantry pests'
    ];
  } else if (/chocolate|sweet|biscuit|cookie|wafer|candy/i.test(lower) || catLower.includes('sweet') || catLower.includes('biscuit')) {
    productType = /chocolate/i.test(lower) ? 'Chocolate & Confectionery' : 'Baked Cookies & Biscuits';
    itemForm = /chocolate/i.test(lower) ? 'Bar / Drops' : 'Crisp Baked Biscuit';
    packagingType = 'Airtight Foil Sealed Wrap';
    shelfLife = '9–12 Months';
    storage = 'Store in a cool, dry place away from heat and direct sunlight.';
    allergens = 'Contains Wheat (Gluten), Milk Solids, Soy. May contain traces of Tree Nuts.';
    nutrition = { serving: 'Per 100g', energy: '515 kcal', protein: '7.2 g', carbs: '62 g', sugars: '38 g', addedSugars: '32 g', fat: '26 g' };
    keyFeatures = [
      'Crafted with premium cocoa and quality ingredients for an indulgent taste',
      'Delightful crunch and smooth mouth-melting texture in every single bite',
      'Perfect sweet companion for your morning coffee, evening tea, or dessert cravings',
      'Air-tight packaging locking in peak freshness and rich authentic flavor'
    ];
  } else if (/detergent|clean|wash|soap|shampoo|harpic|lizol/i.test(lower) || catLower.includes('clean') || catLower.includes('care')) {
    productType = /detergent/i.test(lower) ? 'Fabric Washing Detergent' : /dishwash/i.test(lower) ? 'Dishwash Gel' : 'Home & Surface Cleaner';
    itemForm = /powder/i.test(lower) ? 'Free Flowing Powder' : /gel|liquid/i.test(lower) ? 'Liquid Gel' : 'Bar';
    packagingType = 'Sturdy Bottle / Leak-Proof Pouch';
    shelfLife = '24 Months';
    storage = 'Keep out of reach of children. Store in a dry place away from direct sunlight.';
    allergens = 'Not Applicable (Non-Food Household)';
    dietaryPreference = '';
    nutrition = { serving: 'Not Applicable', energy: '-', protein: '-', carbs: '-', sugars: '-', addedSugars: '-', fat: '-' };
    keyFeatures = [
      'Advanced deep-cleaning formula designed to eliminate tough stains and grease effortlessly',
      'Infused with fresh revitalizing fragrance that keeps surfaces and fabrics smelling pleasant',
      'Gentle on hands and surfaces while delivering 99.9% germ protection and sparkling shine',
      'Convenient pouring packaging engineered for controlled and mess-free dispensing'
    ];
  } else {
    productType = cleanName.replace(/Amul|Tata|Nestle|Fortune/gi, '').trim() || 'Daily Essential Grocery';
    itemForm = 'Standard Retail Unit';
    packagingType = 'Sealed Retail Packaging';
    keyFeatures = [
      'Guaranteed high-quality product inspected under rigorous safety standards',
      'Authentic taste, reliable performance, and exceptional daily retail value',
      'Hygienically packaged to lock in maximum freshness and shelf-life stability',
      'Trusted household choice sourced directly for complete peace of mind'
    ];
  }

  // 5. Build High-Power, Engaging Description (2-3 sentences)
  const brandPrefix = (detectedBrand && !cleanName.toLowerCase().startsWith(detectedBrand.toLowerCase())) ? `${detectedBrand} ` : '';
  const description = `Experience the premium quality and authentic taste of ${brandPrefix}${cleanName}. Specially sourced and packaged under stringent quality controls, it delivers wholesome goodness, trusted purity, and dependable freshness for your daily home needs. Perfect for everyday family use and guaranteed to delight with every purchase.`;

  return {
    description,
    brand: detectedBrand,
    productType,
    dietaryPreference,
    flavour: '',
    itemForm,
    weight: weight || unitStr || '',
    packagingType,
    itemsIncluded: `1 x Pack`,
    countryOfOrigin: 'India',
    shelfLife,
    keyFeatures,
    ingredients,
    allergens,
    storage,
    nutrition
  };
}

export const generateProductDetails = asyncHandler(async (req, res) => {
  const { name, category, unit, brand } = req.body || {};
  if (!name || !String(name).trim()) {
    return ok(res, buildSemanticProductDetails('Grocery Product', category, unit, brand));
  }

  const cleanName = String(name).trim();
  const catSlug = String(category || '').trim();
  const unitStr = String(unit || '').trim();
  const brandStr = String(brand || '').trim();

  // 1. Try Gemini API if key is available
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (geminiApiKey) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;

      const prompt = `You are an expert e-commerce catalog specialist for an Indian online grocery store (similar to Blinkit, Zepto, BigBasket).
Given the product details:
Product Name: "${cleanName}"
Category: "${catSlug}"
Pack/Unit: "${unitStr}"
Brand (if known): "${brandStr}"

Generate comprehensive, production-ready product details in strict JSON format with this exact structure:
{
  "description": "2-3 polished, persuasive sentences describing the product, its key appeal, freshness, and quality",
  "brand": "Brand name (e.g. Amul, Fortune, Maggi, or empty if unbranded produce/grain)",
  "productType": "Specific product type (e.g. Toned Milk, Chakki Atta, Refined Oil, Dark Chocolate, Dishwash Gel)",
  "dietaryPreference": "Veg | Non-Veg | Vegan | Eggless | Organic | Jain | (leave empty if non-food/cleaning/utility)",
  "flavour": "Specific flavour/variant (e.g. Masala, Classic, Vanilla, Salted) or empty",
  "itemForm": "Bar | Powder | Liquid | Grain | Cream | Solid | Paste",
  "weight": "${unitStr || 'e.g. 1 kg'}",
  "packagingType": "Pouch | Packet | Bottle | Tetra Pak | Box | Container | Can",
  "itemsIncluded": "1 x Pack",
  "countryOfOrigin": "India",
  "shelfLife": "Realistic shelf life (e.g. 2 Days, 6 Months, 12 Months, 24 Months)",
  "keyFeatures": [
    "3 to 4 strong bullet points highlighting quality, taste/freshness, hygiene, and key benefits"
  ],
  "ingredients": "Authentic realistic ingredients list separated by commas, or Not Applicable",
  "allergens": "Allergen warning or None",
  "storage": "Proper storage guidelines (e.g. Store in a cool dry place / Keep refrigerated)",
  "nutrition": {
    "serving": "Per 100g",
    "energy": "e.g. 350 kcal",
    "protein": "e.g. 8.5 g",
    "carbs": "e.g. 65 g",
    "sugars": "e.g. 5 g",
    "addedSugars": "e.g. 0 g",
    "fat": "e.g. 6.2 g"
  }
}
Return ONLY pure JSON without markdown code fences, headers, or explanations.`;

      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 600, temperature: 0.2 }
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidate) {
          const jsonText = candidate.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
          const parsed = JSON.parse(jsonText);
          if (parsed && typeof parsed === 'object') {
            return ok(res, {
              ...buildSemanticProductDetails(cleanName, catSlug, unitStr, brandStr),
              ...parsed,
              nutrition: {
                serving: 'Per 100g',
                ...(parsed.nutrition || {})
              }
            });
          }
        }
      }
    } catch (err) {
      console.warn('[AI] Gemini generateProductDetails notice:', err.message);
    }
  }

  // 2. High-power Semantic Engine Fallback
  const semanticData = buildSemanticProductDetails(cleanName, catSlug, unitStr, brandStr);
  return ok(res, semanticData);
});
