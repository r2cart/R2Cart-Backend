import fs from 'node:fs';
import path from 'node:path';
import {prisma} from './src/config/prisma.js';
import {validateImport} from './src/services/product-import.service.js';

// The exact 11 columns required by product-import.service.js
export const columns = [
  'Product Name',
  'Category',
  'Pack Size',
  'MRP',
  'Selling Price',
  'Stock',
  'Description',
  'Product Group Code',
  'Image URL',
  'Image Filename',
  'Status'
];

// Helper to escape CSV cell
function escapeCsv(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replaceAll('"', '""') + '"';
  }
  return s;
}

// 200 Real Grocery Products for Indian Quick-Commerce / R2Cart
const rawProducts = [
  // ==========================================
  // 1. Fruits & Vegetables (fruits-vegetables) - 25 items
  // ==========================================
  {
    name: 'Fresh Red Onion',
    category: 'fruits-vegetables',
    unit: '1 kg',
    mrp: 45,
    price: 36,
    stock: 80,
    description: 'Fresh, crisp and pungent red onions sourced directly from certified farms. Ideal for daily cooking, gravies, and salads.',
    groupCode: 'ONION-RED',
    image: 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=600&auto=format&fit=crop'
  },
  {
    name: 'Fresh Red Onion',
    category: 'fruits-vegetables',
    unit: '5 kg',
    mrp: 220,
    price: 165,
    stock: 40,
    description: 'Fresh, crisp and pungent red onions in a bulk family saver pack. Sourced directly from farms.',
    groupCode: 'ONION-RED',
    image: 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=600&auto=format&fit=crop'
  },
  {
    name: 'Farm Fresh Potato',
    category: 'fruits-vegetables',
    unit: '1 kg',
    mrp: 35,
    price: 28,
    stock: 90,
    description: 'High-quality farm fresh potatoes with thin skin and firm texture. Perfect for curries, boiling, and frying.',
    groupCode: 'POTATO-FARM',
    image: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=600&auto=format&fit=crop'
  },
  {
    name: 'Farm Fresh Potato',
    category: 'fruits-vegetables',
    unit: '5 kg',
    mrp: 170,
    price: 130,
    stock: 45,
    description: 'High-quality farm fresh potatoes in a value pack. Perfect for weekly family consumption.',
    groupCode: 'POTATO-FARM',
    image: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=600&auto=format&fit=crop'
  },
  {
    name: 'Desi Hybrid Tomato',
    category: 'fruits-vegetables',
    unit: '500 g',
    mrp: 25,
    price: 18,
    stock: 60,
    description: 'Plump, firm, and tangy red tomatoes. Packed with vitamins and antioxidants, essential for Indian gravies.',
    groupCode: 'TOMATO-HYBRID',
    image: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=600&auto=format&fit=crop'
  },
  {
    name: 'Desi Hybrid Tomato',
    category: 'fruits-vegetables',
    unit: '1 kg',
    mrp: 50,
    price: 34,
    stock: 75,
    description: 'Plump, firm, and juicy red tomatoes. Ideal for curries, dal tadka, rasam, and fresh salads.',
    groupCode: 'TOMATO-HYBRID',
    image: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=600&auto=format&fit=crop'
  },
  {
    name: 'Fresh Green Peas (Matar)',
    category: 'fruits-vegetables',
    unit: '500 g',
    mrp: 60,
    price: 48,
    stock: 50,
    description: 'Sweet, tender, and freshly podded green peas. Perfect for pulao, matar paneer, and aloo matar.',
    groupCode: 'MATAR-GREEN',
    image: 'https://images.unsplash.com/photo-1592394533824-9440e5d68530?w=600&auto=format&fit=crop'
  },
  {
    name: 'Fresh Green Peas (Matar)',
    category: 'fruits-vegetables',
    unit: '1 kg',
    mrp: 120,
    price: 92,
    stock: 35,
    description: 'Sweet, tender, and freshly podded green peas in a 1 kg pack. Great for freezing or family meals.',
    groupCode: 'MATAR-GREEN',
    image: 'https://images.unsplash.com/photo-1592394533824-9440e5d68530?w=600&auto=format&fit=crop'
  },
  {
    name: 'Fresh Ginger (Adrak)',
    category: 'fruits-vegetables',
    unit: '250 g',
    mrp: 35,
    price: 26,
    stock: 40,
    description: 'Aromatic, spicy, and zesty fresh ginger roots. Excellent for morning chai, curries, and immunity boosters.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=600&auto=format&fit=crop'
  },
  {
    name: 'Desi Garlic (Lahsun)',
    category: 'fruits-vegetables',
    unit: '250 g',
    mrp: 60,
    price: 48,
    stock: 45,
    description: 'Strong, pungent desi garlic cloves that infuse deep aroma and flavor into everyday cooking.',
    groupCode: 'GARLIC-DESI',
    image: 'https://images.unsplash.com/photo-1540148426945-6cf22a6b2383?w=600&auto=format&fit=crop'
  },
  {
    name: 'Desi Garlic (Lahsun)',
    category: 'fruits-vegetables',
    unit: '500 g',
    mrp: 120,
    price: 92,
    stock: 30,
    description: 'Hand-picked pungent garlic bulbs with clean cloves. Essential for Indian gravies and tadka.',
    groupCode: 'GARLIC-DESI',
    image: 'https://images.unsplash.com/photo-1540148426945-6cf22a6b2383?w=600&auto=format&fit=crop'
  },
  {
    name: 'Spicy Green Chilli',
    category: 'fruits-vegetables',
    unit: '100 g',
    mrp: 15,
    price: 10,
    stock: 60,
    description: 'Freshly harvested sharp green chillies. Delivers authentic Indian heat and spice to your dishes.',
    groupCode: 'CHILLI-GREEN',
    image: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=600&auto=format&fit=crop'
  },
  {
    name: 'Spicy Green Chilli',
    category: 'fruits-vegetables',
    unit: '250 g',
    mrp: 35,
    price: 24,
    stock: 45,
    description: 'Fresh crisp green chillies handpicked for high pungency and freshness.',
    groupCode: 'CHILLI-GREEN',
    image: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=600&auto=format&fit=crop'
  },
  {
    name: 'Fresh Coriander (Dhaniya)',
    category: 'fruits-vegetables',
    unit: '100 g',
    mrp: 20,
    price: 12,
    stock: 50,
    description: 'Fragrant and bright green coriander leaves with tender stems. Essential garnish for curries and chutneys.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1599940824399-b87987ceb72a?w=600&auto=format&fit=crop'
  },
  {
    name: 'Green Capsicum (Shimla Mirch)',
    category: 'fruits-vegetables',
    unit: '250 g',
    mrp: 30,
    price: 22,
    stock: 40,
    description: 'Crunchy bell peppers packed with Vitamin C. Great for noodles, paneer tikka, and stir fry.',
    groupCode: 'CAPSICUM-GREEN',
    image: 'https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?w=600&auto=format&fit=crop'
  },
  {
    name: 'Green Capsicum (Shimla Mirch)',
    category: 'fruits-vegetables',
    unit: '500 g',
    mrp: 60,
    price: 42,
    stock: 35,
    description: 'Firm and vibrant green capsicum. Adds delightful crunch and aroma to pastas, pizzas, and curries.',
    groupCode: 'CAPSICUM-GREEN',
    image: 'https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?w=600&auto=format&fit=crop'
  },
  {
    name: 'Juicy Yellow Lemon (Nimbu)',
    category: 'fruits-vegetables',
    unit: '4 pcs',
    mrp: 25,
    price: 18,
    stock: 60,
    description: 'Fresh thin-skinned juicy lemons rich in Vitamin C. Ideal for refreshing shikanji, salads, and marinades.',
    groupCode: 'LEMON-NIMBU',
    image: 'https://images.unsplash.com/photo-1533038590840-1cde6e668a91?w=600&auto=format&fit=crop'
  },
  {
    name: 'Juicy Yellow Lemon (Nimbu)',
    category: 'fruits-vegetables',
    unit: '10 pcs',
    mrp: 60,
    price: 42,
    stock: 40,
    description: 'Pack of 10 juicy lemons. Great value for daily detox water, cooking, and beverages.',
    groupCode: 'LEMON-NIMBU',
    image: 'https://images.unsplash.com/photo-1533038590840-1cde6e668a91?w=600&auto=format&fit=crop'
  },
  {
    name: 'Robusta Ripe Banana',
    category: 'fruits-vegetables',
    unit: '6 pcs',
    mrp: 40,
    price: 32,
    stock: 65,
    description: 'Naturally ripened sweet bananas packed with potassium and dietary fibre. Perfect quick energy snack.',
    groupCode: 'BANANA-ROBUSTA',
    image: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=600&auto=format&fit=crop'
  },
  {
    name: 'Robusta Ripe Banana',
    category: 'fruits-vegetables',
    unit: '12 pcs',
    mrp: 80,
    price: 60,
    stock: 40,
    description: 'Dozen sweet and golden bananas. Healthy snack choice for smoothies, breakfast bowls, and toddlers.',
    groupCode: 'BANANA-ROBUSTA',
    image: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=600&auto=format&fit=crop'
  },
  {
    name: 'Royal Gala Sweet Apple',
    category: 'fruits-vegetables',
    unit: '500 g',
    mrp: 110,
    price: 88,
    stock: 45,
    description: 'Crisp, sweet, and aromatic Gala apples imported for peak taste and crunch. Great for snacking.',
    groupCode: 'APPLE-GALA',
    image: 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=600&auto=format&fit=crop'
  },
  {
    name: 'Royal Gala Sweet Apple',
    category: 'fruits-vegetables',
    unit: '1 kg',
    mrp: 220,
    price: 168,
    stock: 35,
    description: 'Premium crisp Royal Gala apples rich in antioxidants and fibre. Cleanly graded and sanitized.',
    groupCode: 'APPLE-GALA',
    image: 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=600&auto=format&fit=crop'
  },
  {
    name: 'Nagpur Sweet Orange',
    category: 'fruits-vegetables',
    unit: '1 kg',
    mrp: 90,
    price: 72,
    stock: 40,
    description: 'Juicy, sweet and tangy Indian oranges bursting with natural citrus goodness and immunity vitamins.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1611080626919-7cf5a9dbab5b?w=600&auto=format&fit=crop'
  },
  {
    name: 'Ruby Red Pomegranate (Anar)',
    category: 'fruits-vegetables',
    unit: '500 g',
    mrp: 130,
    price: 105,
    stock: 35,
    description: 'Sweet, ruby-red arils loaded with iron, antioxidants, and pure juice. Perfect for morning salads and juice.',
    groupCode: 'ANAR-RUBY',
    image: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=600&auto=format&fit=crop'
  },
  {
    name: 'Ruby Red Pomegranate (Anar)',
    category: 'fruits-vegetables',
    unit: '1 kg',
    mrp: 260,
    price: 198,
    stock: 25,
    description: 'Fresh premium grade pomegranate with large juicy seeds. Healthy and heart-friendly.',
    groupCode: 'ANAR-RUBY',
    image: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=600&auto=format&fit=crop'
  },

  // ==========================================
  // 2. Dairy & Breakfast (dairy-breakfast) - 25 items
  // ==========================================
  {
    name: 'Amul Gold Full Cream Milk',
    category: 'dairy-breakfast',
    unit: '500 ml',
    mrp: 34,
    price: 33,
    stock: 80,
    description: 'Pasteurised full cream fresh milk with 6.0% fat and 9.0% SNF. Rich in taste, ideal for kheer, tea, and coffee.',
    groupCode: 'AMUL-GOLD-MILK',
    image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=600&auto=format&fit=crop'
  },
  {
    name: 'Amul Gold Full Cream Milk',
    category: 'dairy-breakfast',
    unit: '1 L',
    mrp: 68,
    price: 66,
    stock: 60,
    description: 'Amul Gold full cream milk in a 1 litre pouch. Pure nutrition for growing children and the whole family.',
    groupCode: 'AMUL-GOLD-MILK',
    image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=600&auto=format&fit=crop'
  },
  {
    name: 'Amul Taaza Toned Milk',
    category: 'dairy-breakfast',
    unit: '500 ml',
    mrp: 28,
    price: 27,
    stock: 85,
    description: 'Fresh toned milk with 3.0% fat and 8.5% SNF. Wholesome and light for everyday daily drinking and tea.',
    groupCode: 'AMUL-TAAZA-MILK',
    image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=600&auto=format&fit=crop'
  },
  {
    name: 'Amul Taaza Toned Milk',
    category: 'dairy-breakfast',
    unit: '1 L',
    mrp: 56,
    price: 54,
    stock: 65,
    description: 'Amul Taaza toned milk in 1 litre pouch. Contains balanced calories and essential calcium.',
    groupCode: 'AMUL-TAAZA-MILK',
    image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=600&auto=format&fit=crop'
  },
  {
    name: 'Mother Dairy Cow Fresh Milk',
    category: 'dairy-breakfast',
    unit: '500 ml',
    mrp: 29,
    price: 28,
    stock: 60,
    description: 'Nutritious cow milk with easy digestibility and natural sweetness. Great for infants and seniors.',
    groupCode: 'MD-COW-MILK',
    image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=600&auto=format&fit=crop'
  },
  {
    name: 'Mother Dairy Cow Fresh Milk',
    category: 'dairy-breakfast',
    unit: '1 L',
    mrp: 58,
    price: 56,
    stock: 45,
    description: 'Mother Dairy cow fresh milk in 1 litre family pack. Packed with natural nutrients and vitamins.',
    groupCode: 'MD-COW-MILK',
    image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=600&auto=format&fit=crop'
  },
  {
    name: 'Amul Fresh Malai Paneer',
    category: 'dairy-breakfast',
    unit: '200 g',
    mrp: 95,
    price: 88,
    stock: 50,
    description: 'Soft, succulent, and protein-packed cottage cheese prepared from pure buffalo milk. Ideal for paneer tikka and curries.',
    groupCode: 'AMUL-PANEER',
    image: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=600&auto=format&fit=crop'
  },
  {
    name: 'Amul Fresh Malai Paneer',
    category: 'dairy-breakfast',
    unit: '400 g',
    mrp: 185,
    price: 172,
    stock: 35,
    description: 'Fresh block of Amul malai paneer in a convenient 400 g pack. Retains moisture and soft texture when cooked.',
    groupCode: 'AMUL-PANEER',
    image: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=600&auto=format&fit=crop'
  },
  {
    name: 'Amul Pasteurized Salted Butter',
    category: 'dairy-breakfast',
    unit: '100 g',
    mrp: 60,
    price: 58,
    stock: 70,
    description: 'The iconic Utterly Butterly Delicious salted butter. Classic spread for toast, parathas, and baking.',
    groupCode: 'AMUL-BUTTER',
    image: 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=600&auto=format&fit=crop'
  },
  {
    name: 'Amul Pasteurized Salted Butter',
    category: 'dairy-breakfast',
    unit: '500 g',
    mrp: 295,
    price: 280,
    stock: 40,
    description: 'Family tub of Amul salted butter. Essential baking ingredient and rich garnish for pav bhaji and dals.',
    groupCode: 'AMUL-BUTTER',
    image: 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=600&auto=format&fit=crop'
  },
  {
    name: 'Amul Masti Dahi',
    category: 'dairy-breakfast',
    unit: '200 g',
    mrp: 25,
    price: 24,
    stock: 60,
    description: 'Creamy, thick, and perfectly cultured pasteurized curd. Delicious with meals or whipped into raita.',
    groupCode: 'AMUL-DAHI',
    image: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=600&auto=format&fit=crop'
  },
  {
    name: 'Amul Masti Dahi',
    category: 'dairy-breakfast',
    unit: '400 g',
    mrp: 45,
    price: 43,
    stock: 50,
    description: 'Thick set curd in a hygienic cup. Packed with gut-friendly live lactic cultures.',
    groupCode: 'AMUL-DAHI',
    image: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=600&auto=format&fit=crop'
  },
  {
    name: 'Epigamia Greek Yogurt Strawberry',
    category: 'dairy-breakfast',
    unit: '100 g',
    mrp: 55,
    price: 48,
    stock: 35,
    description: 'High-protein Greek yogurt blended with real strawberries. Zero preservatives and probiotic rich.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=600&auto=format&fit=crop'
  },
  {
    name: 'Epigamia Greek Yogurt Blueberry',
    category: 'dairy-breakfast',
    unit: '100 g',
    mrp: 55,
    price: 48,
    stock: 35,
    description: 'Velvety Greek yogurt infused with juicy blueberries. 6g protein per cup for healthy snacking.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=600&auto=format&fit=crop'
  },
  {
    name: 'Farm Fresh White Eggs',
    category: 'dairy-breakfast',
    unit: '6 pcs',
    mrp: 55,
    price: 46,
    stock: 70,
    description: 'Farm-fresh, sanitised table eggs rich in high quality protein, lutein, and choline.',
    groupCode: 'EGGS-WHITE',
    image: 'https://images.unsplash.com/photo-1506976785307-8732e854ad03?w=600&auto=format&fit=crop'
  },
  {
    name: 'Farm Fresh White Eggs',
    category: 'dairy-breakfast',
    unit: '12 pcs',
    mrp: 110,
    price: 88,
    stock: 55,
    description: 'Pack of 12 fresh graded white eggs. Stored in temperature-controlled facilities for maximum freshness.',
    groupCode: 'EGGS-WHITE',
    image: 'https://images.unsplash.com/photo-1506976785307-8732e854ad03?w=600&auto=format&fit=crop'
  },
  {
    name: 'Farm Fresh White Eggs',
    category: 'dairy-breakfast',
    unit: '30 pcs',
    mrp: 260,
    price: 215,
    stock: 30,
    description: 'Whole tray of 30 farm-fresh white eggs. Best value for high-protein meal planning.',
    groupCode: 'EGGS-WHITE',
    image: 'https://images.unsplash.com/photo-1506976785307-8732e854ad03?w=600&auto=format&fit=crop'
  },
  {
    name: "Kellogg's Original Corn Flakes",
    category: 'dairy-breakfast',
    unit: '300 g',
    mrp: 140,
    price: 122,
    stock: 45,
    description: 'Crunchy golden flakes made from sun-ripened corn. Enriched with 8 essential vitamins and iron.',
    groupCode: 'KELLOGGS-CORNFLAKES',
    image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&auto=format&fit=crop'
  },
  {
    name: "Kellogg's Original Corn Flakes",
    category: 'dairy-breakfast',
    unit: '875 g',
    mrp: 375,
    price: 320,
    stock: 30,
    description: 'Family saver pack of crispy Kellogg’s corn flakes. Quick, wholesome breakfast with cold or warm milk.',
    groupCode: 'KELLOGGS-CORNFLAKES',
    image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&auto=format&fit=crop'
  },
  {
    name: 'Quaker 100% Rolled Wholegrain Oats',
    category: 'dairy-breakfast',
    unit: '400 g',
    mrp: 110,
    price: 92,
    stock: 45,
    description: 'Natural whole grain rolled oats. Rich in soluble beta-glucan fibre to help lower cholesterol.',
    groupCode: 'QUAKER-OATS',
    image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&auto=format&fit=crop'
  },
  {
    name: 'Quaker 100% Rolled Wholegrain Oats',
    category: 'dairy-breakfast',
    unit: '1 kg',
    mrp: 230,
    price: 195,
    stock: 35,
    description: '1 kg pouch of nutritious Quaker rolled oats. Nutty texture, perfect for overnight porridge and smoothies.',
    groupCode: 'QUAKER-OATS',
    image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&auto=format&fit=crop'
  },
  {
    name: 'Saffola Masala Oats Classic',
    category: 'dairy-breakfast',
    unit: '400 g',
    mrp: 195,
    price: 165,
    stock: 40,
    description: 'Savory wholegrain oats with Indian spices and crunchy carrots. Ready in just 3 minutes.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&auto=format&fit=crop'
  },
  {
    name: 'Britannia Processed Cheese Slices',
    category: 'dairy-breakfast',
    unit: '100 g',
    mrp: 95,
    price: 85,
    stock: 40,
    description: 'Individually wrapped creamy cheese slices. Melts smoothly in burgers, sandwiches, and rolls.',
    groupCode: 'BRITANNIA-CHEESE',
    image: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=600&auto=format&fit=crop'
  },
  {
    name: 'Britannia Processed Cheese Slices',
    category: 'dairy-breakfast',
    unit: '200 g',
    mrp: 180,
    price: 160,
    stock: 30,
    description: 'Pack of 10 delicious Britannia processed cheese slices. Rich in calcium and dairy protein.',
    groupCode: 'BRITANNIA-CHEESE',
    image: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=600&auto=format&fit=crop'
  },
  {
    name: 'Amul Cheese Block',
    category: 'dairy-breakfast',
    unit: '200 g',
    mrp: 135,
    price: 125,
    stock: 35,
    description: 'Classic Amul processed cheddar cheese block. Ideal for grating over pizzas, dosas, and pasta.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=600&auto=format&fit=crop'
  },

  // ==========================================
  // 3. Atta, Rice & Dal (staples) - 25 items
  // ==========================================
  {
    name: 'Aashirvaad Shudh Chakki Atta',
    category: 'staples',
    unit: '5 kg',
    mrp: 265,
    price: 235,
    stock: 50,
    description: '100% pure whole wheat grain flour ground with traditional 4-step stone chakki process. Yields soft, fluffy rotis.',
    groupCode: 'AASHIRVAAD-ATTA',
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&auto=format&fit=crop'
  },
  {
    name: 'Aashirvaad Shudh Chakki Atta',
    category: 'staples',
    unit: '10 kg',
    mrp: 520,
    price: 450,
    stock: 40,
    description: 'Aashirvaad 100% whole wheat chakki atta in a 10 kg bag. High dietary fibre and natural sweetness.',
    groupCode: 'AASHIRVAAD-ATTA',
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&auto=format&fit=crop'
  },
  {
    name: 'Fortune Chakki Fresh Atta',
    category: 'staples',
    unit: '5 kg',
    mrp: 245,
    price: 215,
    stock: 45,
    description: 'Freshly milled whole wheat chakki atta. Retains natural moisture for soft chapatis that stay fresh all day.',
    groupCode: 'FORTUNE-ATTA',
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&auto=format&fit=crop'
  },
  {
    name: 'Fortune Chakki Fresh Atta',
    category: 'staples',
    unit: '10 kg',
    mrp: 480,
    price: 410,
    stock: 35,
    description: 'Fortune chakki fresh 10 kg bag with superior quality golden wheat grains. Unadulterated goodness.',
    groupCode: 'FORTUNE-ATTA',
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&auto=format&fit=crop'
  },
  {
    name: 'Fortune Biryani Special Basmati Rice',
    category: 'staples',
    unit: '1 kg',
    mrp: 195,
    price: 155,
    stock: 40,
    description: 'Extra long slender grains that elongate up to 2x after cooking. Non-sticky, fragrant, made for royal biryanis.',
    groupCode: 'FORTUNE-BIRYANI-RICE',
    image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&auto=format&fit=crop'
  },
  {
    name: 'Fortune Biryani Special Basmati Rice',
    category: 'staples',
    unit: '5 kg',
    mrp: 890,
    price: 710,
    stock: 30,
    description: 'Premium aged basmati rice in 5 kg bag. Pristine white grains with an enchanting Himalayan aroma.',
    groupCode: 'FORTUNE-BIRYANI-RICE',
    image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&auto=format&fit=crop'
  },
  {
    name: 'India Gate Feast Rozzana Basmati Rice',
    category: 'staples',
    unit: '1 kg',
    mrp: 125,
    price: 98,
    stock: 50,
    description: 'Aged fragrant basmati rice tailored for everyday family meals, jeera rice, and dal chawal.',
    groupCode: 'INDIA-GATE-ROZZANA',
    image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&auto=format&fit=crop'
  },
  {
    name: 'India Gate Feast Rozzana Basmati Rice',
    category: 'staples',
    unit: '5 kg',
    mrp: 580,
    price: 460,
    stock: 35,
    description: 'India Gate Rozzana basmati rice in 5 kg bag. Delivers aroma and fluffy texture at everyday price.',
    groupCode: 'INDIA-GATE-ROZZANA',
    image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&auto=format&fit=crop'
  },
  {
    name: 'Wada Kolam Daily Steam Rice',
    category: 'staples',
    unit: '5 kg',
    mrp: 380,
    price: 320,
    stock: 35,
    description: 'Fine medium grain steam rice. Soft, wholesome, and easy to digest, ideal for South and West Indian cooking.',
    groupCode: 'KOLAM-RICE',
    image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&auto=format&fit=crop'
  },
  {
    name: 'Wada Kolam Daily Steam Rice',
    category: 'staples',
    unit: '10 kg',
    mrp: 750,
    price: 625,
    stock: 25,
    description: 'Bulk 10 kg bag of premium Wada Kolam rice. Fluffy grains, perfect for daily khichdi and steamed rice.',
    groupCode: 'KOLAM-RICE',
    image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&auto=format&fit=crop'
  },
  {
    name: 'Tata Sampann Unpolished Toor Dal',
    category: 'staples',
    unit: '500 g',
    mrp: 110,
    price: 94,
    stock: 50,
    description: 'Unpolished pigeon pea pulses retaining natural wholesome goodness and protein. Cooked easily without water loss.',
    groupCode: 'TATA-TOOR-DAL',
    image: 'https://images.unsplash.com/photo-1515543237350-b3eea1ec8082?w=600&auto=format&fit=crop'
  },
  {
    name: 'Tata Sampann Unpolished Toor Dal',
    category: 'staples',
    unit: '1 kg',
    mrp: 215,
    price: 182,
    stock: 45,
    description: '100% unpolished toor dal from Tata Sampann. Natural wholesome aroma, completely chemical free.',
    groupCode: 'TATA-TOOR-DAL',
    image: 'https://images.unsplash.com/photo-1515543237350-b3eea1ec8082?w=600&auto=format&fit=crop'
  },
  {
    name: 'Tata Sampann Yellow Moong Dal Dhuli',
    category: 'staples',
    unit: '500 g',
    mrp: 95,
    price: 82,
    stock: 45,
    description: 'Pristine split and skinned moong lentils. Gentle on stomach, high in vegetarian protein, perfect for khichdi.',
    groupCode: 'TATA-MOONG-DAL',
    image: 'https://images.unsplash.com/photo-1515543237350-b3eea1ec8082?w=600&auto=format&fit=crop'
  },
  {
    name: 'Tata Sampann Yellow Moong Dal Dhuli',
    category: 'staples',
    unit: '1 kg',
    mrp: 185,
    price: 158,
    stock: 40,
    description: 'Unpolished yellow moong dal in 1 kg pack. Cleansed through rigorous 5-step quality sortation.',
    groupCode: 'TATA-MOONG-DAL',
    image: 'https://images.unsplash.com/photo-1515543237350-b3eea1ec8082?w=600&auto=format&fit=crop'
  },
  {
    name: 'Tata Sampann Desi Chana Dal',
    category: 'staples',
    unit: '500 g',
    mrp: 65,
    price: 52,
    stock: 45,
    description: 'Hearty Bengal gram lentils rich in zinc, folate, and calcium. Ideal for dal tadka and puran poli.',
    groupCode: 'TATA-CHANA-DAL',
    image: 'https://images.unsplash.com/photo-1515543237350-b3eea1ec8082?w=600&auto=format&fit=crop'
  },
  {
    name: 'Tata Sampann Desi Chana Dal',
    category: 'staples',
    unit: '1 kg',
    mrp: 125,
    price: 98,
    stock: 40,
    description: 'Unpolished premium chana dal. Cooks evenly with authentic nutty taste and aroma.',
    groupCode: 'TATA-CHANA-DAL',
    image: 'https://images.unsplash.com/photo-1515543237350-b3eea1ec8082?w=600&auto=format&fit=crop'
  },
  {
    name: 'Tata Sampann Whole Kali Urad Dal',
    category: 'staples',
    unit: '500 g',
    mrp: 90,
    price: 76,
    stock: 40,
    description: 'Black gram whole lentils for authentic Dal Makhani. Unpolished for maximum nutrient retention.',
    groupCode: 'TATA-URAD-DAL',
    image: 'https://images.unsplash.com/photo-1515543237350-b3eea1ec8082?w=600&auto=format&fit=crop'
  },
  {
    name: 'Tata Sampann Whole Kali Urad Dal',
    category: 'staples',
    unit: '1 kg',
    mrp: 175,
    price: 148,
    stock: 35,
    description: 'Whole black gram pulses rich in protein and fibre. Slow-cooked perfection for rich restaurant curries.',
    groupCode: 'TATA-URAD-DAL',
    image: 'https://images.unsplash.com/photo-1515543237350-b3eea1ec8082?w=600&auto=format&fit=crop'
  },
  {
    name: 'Tata Sampann Big Kabuli Chana',
    category: 'staples',
    unit: '500 g',
    mrp: 115,
    price: 96,
    stock: 40,
    description: 'Large sized chickpeas that boil to a creamy, melt-in-mouth consistency. Perfect for Punjabi Chhole.',
    groupCode: 'TATA-KABULI-CHANA',
    image: 'https://images.unsplash.com/photo-1515543237350-b3eea1ec8082?w=600&auto=format&fit=crop'
  },
  {
    name: 'Tata Sampann Big Kabuli Chana',
    category: 'staples',
    unit: '1 kg',
    mrp: 225,
    price: 186,
    stock: 35,
    description: 'High grade kabuli chana pulses with consistent size and spotless appearance. High protein staple.',
    groupCode: 'TATA-KABULI-CHANA',
    image: 'https://images.unsplash.com/photo-1515543237350-b3eea1ec8082?w=600&auto=format&fit=crop'
  },
  {
    name: 'Tata Sampann Desi Brown Kala Chana',
    category: 'staples',
    unit: '500 g',
    mrp: 65,
    price: 54,
    stock: 40,
    description: 'Fibrous desi brown chickpeas. Excellent for boiling, sprouting, and making healthy breakfast chaats.',
    groupCode: 'TATA-KALA-CHANA',
    image: 'https://images.unsplash.com/photo-1515543237350-b3eea1ec8082?w=600&auto=format&fit=crop'
  },
  {
    name: 'Tata Sampann Desi Brown Kala Chana',
    category: 'staples',
    unit: '1 kg',
    mrp: 125,
    price: 102,
    stock: 35,
    description: 'Unpolished kala chana packed with iron and plant protein. Traditional superfood for Indian kitchens.',
    groupCode: 'TATA-KALA-CHANA',
    image: 'https://images.unsplash.com/photo-1515543237350-b3eea1ec8082?w=600&auto=format&fit=crop'
  },
  {
    name: 'Himalayan Rajma Chitra',
    category: 'staples',
    unit: '500 g',
    mrp: 120,
    price: 98,
    stock: 45,
    description: 'Premium speckled kidney beans from Himalayan foothills. Buttery texture, cooks without splitting.',
    groupCode: 'RAJMA-CHITRA',
    image: 'https://images.unsplash.com/photo-1515543237350-b3eea1ec8082?w=600&auto=format&fit=crop'
  },
  {
    name: 'Himalayan Rajma Chitra',
    category: 'staples',
    unit: '1 kg',
    mrp: 235,
    price: 190,
    stock: 35,
    description: '1 kg pack of genuine Rajma Chitra. Essential for authentic Punjabi Rajma Masala with steamed rice.',
    groupCode: 'RAJMA-CHITRA',
    image: 'https://images.unsplash.com/photo-1515543237350-b3eea1ec8082?w=600&auto=format&fit=crop'
  },
  {
    name: 'Pure Roasted Sooji Rava',
    category: 'staples',
    unit: '500 g',
    mrp: 45,
    price: 36,
    stock: 40,
    description: 'Coarse semolina processed from durum wheat. Ideal for making fluffy upma, rava kesari, and halwa.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&auto=format&fit=crop'
  },

  // ==========================================
  // 4. Cooking Essentials (cooking) - 20 items
  // ==========================================
  {
    name: 'Fortune Sunlite Refined Sunflower Oil',
    category: 'cooking',
    unit: '1 L',
    mrp: 175,
    price: 142,
    stock: 65,
    description: 'Light, crystal clear sunflower oil enriched with Vitamin A and D. Retains natural food flavors during deep frying.',
    groupCode: 'FORTUNE-SUNLITE-OIL',
    image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&auto=format&fit=crop'
  },
  {
    name: 'Fortune Sunlite Refined Sunflower Oil',
    category: 'cooking',
    unit: '5 L',
    mrp: 850,
    price: 685,
    stock: 35,
    description: 'Fortune Sunlite oil in a sturdy 5 litre jar with ergonomic handle. Low absorb technology for healthier meals.',
    groupCode: 'FORTUNE-SUNLITE-OIL',
    image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&auto=format&fit=crop'
  },
  {
    name: 'Fortune Kachi Ghani Mustard Oil',
    category: 'cooking',
    unit: '1 L',
    mrp: 185,
    price: 152,
    stock: 60,
    description: 'Cold-pressed pungent mustard oil made from first-press mustard seeds. Distinctive flavor for pickles and fish curries.',
    groupCode: 'FORTUNE-MUSTARD-OIL',
    image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&auto=format&fit=crop'
  },
  {
    name: 'Fortune Kachi Ghani Mustard Oil',
    category: 'cooking',
    unit: '5 L',
    mrp: 890,
    price: 730,
    stock: 30,
    description: 'Authentic strong kachi ghani sarson tel in 5 litre bulk can. Rich in natural omega-3 and antioxidants.',
    groupCode: 'FORTUNE-MUSTARD-OIL',
    image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&auto=format&fit=crop'
  },
  {
    name: 'Saffola Gold Pro Healthy Heart Oil',
    category: 'cooking',
    unit: '1 L',
    mrp: 210,
    price: 175,
    stock: 50,
    description: 'Dual-seed blend of rice bran and sunflower oil with natural oryzanol to manage cholesterol and protect your heart.',
    groupCode: 'SAFFOLA-GOLD-OIL',
    image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&auto=format&fit=crop'
  },
  {
    name: 'Saffola Gold Pro Healthy Heart Oil',
    category: 'cooking',
    unit: '5 L',
    mrp: 990,
    price: 825,
    stock: 30,
    description: 'Saffola Gold 5 litre family jar. Helps absorb up to 33% less oil in fried snacks while maintaining crispiness.',
    groupCode: 'SAFFOLA-GOLD-OIL',
    image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&auto=format&fit=crop'
  },
  {
    name: 'Amul Pure Cow Ghee',
    category: 'cooking',
    unit: '500 ml',
    mrp: 340,
    price: 315,
    stock: 45,
    description: 'Aromatic golden cow ghee prepared from fresh cream. Enhances flavor of rotis, sweets, and festival dishes.',
    groupCode: 'AMUL-GHEE',
    image: 'https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=600&auto=format&fit=crop'
  },
  {
    name: 'Amul Pure Cow Ghee',
    category: 'cooking',
    unit: '1 L',
    mrp: 660,
    price: 610,
    stock: 40,
    description: 'Traditional granular Amul cow ghee in 1 L carton. Rich source of fat-soluble vitamins A, D, and E.',
    groupCode: 'AMUL-GHEE',
    image: 'https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=600&auto=format&fit=crop'
  },
  {
    name: 'Mother Dairy Shuddh Desi Ghee',
    category: 'cooking',
    unit: '1 L',
    mrp: 675,
    price: 625,
    stock: 35,
    description: 'Wholesome desi ghee with granular texture and divine fragrance. Made from churned butterfat.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=600&auto=format&fit=crop'
  },
  {
    name: 'Tata Salt Vacuum Evaporated Iodised',
    category: 'cooking',
    unit: '1 kg',
    mrp: 28,
    price: 25,
    stock: 120,
    description: 'Desh Ka Namak. Pure vacuum evaporated iodised salt ensuring healthy mental development and optimal iodine intake.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=600&auto=format&fit=crop'
  },
  {
    name: 'Tata Salt Lite 15% Low Sodium',
    category: 'cooking',
    unit: '1 kg',
    mrp: 50,
    price: 44,
    stock: 50,
    description: 'Low-sodium iodised salt formulated to help manage blood pressure while delivering standard saltiness.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=600&auto=format&fit=crop'
  },
  {
    name: 'Catch Red Chilli Powder (Lal Mirch)',
    category: 'cooking',
    unit: '100 g',
    mrp: 52,
    price: 42,
    stock: 50,
    description: 'Pungent red chilli powder with natural oils preserved using low-temperature grinding technology.',
    groupCode: 'CATCH-CHILLI-POWDER',
    image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=600&auto=format&fit=crop'
  },
  {
    name: 'Catch Red Chilli Powder (Lal Mirch)',
    category: 'cooking',
    unit: '200 g',
    mrp: 98,
    price: 78,
    stock: 40,
    description: 'Pure sun-dried hot chilli powder. Imparts deep red color and fiery heat to gravies.',
    groupCode: 'CATCH-CHILLI-POWDER',
    image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=600&auto=format&fit=crop'
  },
  {
    name: 'Catch Turmeric Powder (Haldi)',
    category: 'cooking',
    unit: '100 g',
    mrp: 42,
    price: 34,
    stock: 50,
    description: 'Rich golden yellow turmeric powder with high natural curcumin content. Natural healing and colorant.',
    groupCode: 'CATCH-HALDI',
    image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=600&auto=format&fit=crop'
  },
  {
    name: 'Catch Turmeric Powder (Haldi)',
    category: 'cooking',
    unit: '200 g',
    mrp: 80,
    price: 64,
    stock: 40,
    description: 'Sun-dried Salem turmeric root powder. Adds vibrant hue and antiseptic properties to every dish.',
    groupCode: 'CATCH-HALDI',
    image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=600&auto=format&fit=crop'
  },
  {
    name: 'Catch Coriander Powder (Dhaniya)',
    category: 'cooking',
    unit: '100 g',
    mrp: 38,
    price: 30,
    stock: 50,
    description: 'Freshly ground green coriander seeds with refreshing herbal aroma. Forms the backbone of curry pastes.',
    groupCode: 'CATCH-DHANIYA',
    image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=600&auto=format&fit=crop'
  },
  {
    name: 'Catch Coriander Powder (Dhaniya)',
    category: 'cooking',
    unit: '200 g',
    mrp: 72,
    price: 56,
    stock: 40,
    description: 'Fine ground coriander seeds in a stay-fresh aroma lock pack. Essential thickener for gravies.',
    groupCode: 'CATCH-DHANIYA',
    image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=600&auto=format&fit=crop'
  },
  {
    name: 'Everest Super Garam Masala',
    category: 'cooking',
    unit: '100 g',
    mrp: 92,
    price: 76,
    stock: 50,
    description: 'Exquisite blend of 13 roasted spices including cardamom, cinnamon, and cloves. Final magic touch for curries.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=600&auto=format&fit=crop'
  },
  {
    name: 'Everest Chhole Masala',
    category: 'cooking',
    unit: '100 g',
    mrp: 85,
    price: 70,
    stock: 45,
    description: 'Authentic North Indian spice mix with pomegranate and dry mango. Gives dark color and tangy taste to chhole.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=600&auto=format&fit=crop'
  },
  {
    name: 'MDH Deggi Mirch Natural Red',
    category: 'cooking',
    unit: '100 g',
    mrp: 90,
    price: 75,
    stock: 45,
    description: 'Unique blend of Kashmiri and Guntur chillies. Imparts deep radiant red color without overwhelming spiciness.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=600&auto=format&fit=crop'
  },

  // ==========================================
  // 5. Snacks (snacks) - 20 items
  // ==========================================
  {
    name: "Lay's India's Magic Masala Chips",
    category: 'snacks',
    unit: '50 g',
    mrp: 20,
    price: 19,
    stock: 90,
    description: 'Crispy wafer-thin potato chips tossed in signature blend of zesty Indian spices. India’s favourite potato chip.',
    groupCode: 'LAYS-MAGIC-MASALA',
    image: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=600&auto=format&fit=crop'
  },
  {
    name: "Lay's India's Magic Masala Chips",
    category: 'snacks',
    unit: '115 g',
    mrp: 50,
    price: 45,
    stock: 60,
    description: 'Party pack of Lay’s Magic Masala chips. Packed with irresistible crunch and savory spices.',
    groupCode: 'LAYS-MAGIC-MASALA',
    image: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=600&auto=format&fit=crop'
  },
  {
    name: "Lay's Classic Salted Potato Chips",
    category: 'snacks',
    unit: '50 g',
    mrp: 20,
    price: 19,
    stock: 80,
    description: 'Simple, pure, and golden fried potato crisps sprinkled with just the right pinch of sea salt.',
    groupCode: 'LAYS-CLASSIC-SALTED',
    image: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=600&auto=format&fit=crop'
  },
  {
    name: "Lay's Classic Salted Potato Chips",
    category: 'snacks',
    unit: '115 g',
    mrp: 50,
    price: 45,
    stock: 50,
    description: 'Bigger sharing pack of Lay’s Classic Salted potato chips. Pure crunch for movie nights.',
    groupCode: 'LAYS-CLASSIC-SALTED',
    image: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=600&auto=format&fit=crop'
  },
  {
    name: "Lay's American Style Cream & Onion",
    category: 'snacks',
    unit: '50 g',
    mrp: 20,
    price: 19,
    stock: 75,
    description: 'Smooth sour cream flavor paired with fragrant green spring onions over crispy potatoes.',
    groupCode: 'LAYS-CREAM-ONION',
    image: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=600&auto=format&fit=crop'
  },
  {
    name: "Lay's American Style Cream & Onion",
    category: 'snacks',
    unit: '115 g',
    mrp: 50,
    price: 45,
    stock: 45,
    description: 'Large sharing size of Lay’s Cream & Onion. A creamy crunch everyone loves.',
    groupCode: 'LAYS-CREAM-ONION',
    image: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=600&auto=format&fit=crop'
  },
  {
    name: 'Kurkure Masala Munch Crunchy Snack',
    category: 'snacks',
    unit: '45 g',
    mrp: 20,
    price: 19,
    stock: 85,
    description: 'Tedha Hai Par Mera Hai. Crispy corn and rice curls coated in fiery chatpata masala.',
    groupCode: 'KURKURE-MASALA-MUNCH',
    image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&auto=format&fit=crop'
  },
  {
    name: 'Kurkure Masala Munch Crunchy Snack',
    category: 'snacks',
    unit: '90 g',
    mrp: 40,
    price: 36,
    stock: 55,
    description: 'Family pack of crunchy Kurkure Masala Munch. Irresistible companion with evening tea.',
    groupCode: 'KURKURE-MASALA-MUNCH',
    image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&auto=format&fit=crop'
  },
  {
    name: "Haldiram's Nagpur Spicy Aloo Bhujia",
    category: 'snacks',
    unit: '200 g',
    mrp: 60,
    price: 52,
    stock: 70,
    description: 'Crunchy potato sev infused with mint, red chilli, and garam masala. India’s all-time teatime snack.',
    groupCode: 'HALDIRAMS-ALOO-BHUJIA',
    image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&auto=format&fit=crop'
  },
  {
    name: "Haldiram's Nagpur Spicy Aloo Bhujia",
    category: 'snacks',
    unit: '400 g',
    mrp: 115,
    price: 98,
    stock: 45,
    description: 'Mega value pack of Haldiram’s iconic spicy aloo bhujia. Crunchy, zesty, and utterly addictive.',
    groupCode: 'HALDIRAMS-ALOO-BHUJIA',
    image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&auto=format&fit=crop'
  },
  {
    name: "Haldiram's Classic Bhujia Sev",
    category: 'snacks',
    unit: '200 g',
    mrp: 65,
    price: 55,
    stock: 60,
    description: 'Traditional Bikaneri moth bean and besan sev seasoned with black pepper and cardamom.',
    groupCode: 'HALDIRAMS-BHUJIA-SEV',
    image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&auto=format&fit=crop'
  },
  {
    name: "Haldiram's Classic Bhujia Sev",
    category: 'snacks',
    unit: '400 g',
    mrp: 125,
    price: 105,
    stock: 40,
    description: '400 g family pack of authentic crispy Bhujia Sev. Great topping for poha, upma, and chaat.',
    groupCode: 'HALDIRAMS-BHUJIA-SEV',
    image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&auto=format&fit=crop'
  },
  {
    name: "Haldiram's Khatta Meetha Mixture",
    category: 'snacks',
    unit: '200 g',
    mrp: 60,
    price: 50,
    stock: 50,
    description: 'Sweet and tangy namkeen mixture with sago, rice flakes, peanuts, and green peas.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&auto=format&fit=crop'
  },
  {
    name: 'Parle-G Original Gluco Biscuits',
    category: 'snacks',
    unit: '130 g',
    mrp: 15,
    price: 14,
    stock: 100,
    description: 'The world’s largest selling biscuit. Wholesome glucose and wheat biscuits that pair timelessly with chai.',
    groupCode: 'PARLE-G-GLUCO',
    image: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=600&auto=format&fit=crop'
  },
  {
    name: 'Parle-G Original Gluco Biscuits',
    category: 'snacks',
    unit: '800 g',
    mrp: 90,
    price: 80,
    stock: 50,
    description: 'Super value family pack of Parle-G Gluco biscuits. Pure nostalgia and instant energy.',
    groupCode: 'PARLE-G-GLUCO',
    image: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=600&auto=format&fit=crop'
  },
  {
    name: 'Britannia Good Day Butter Cookies',
    category: 'snacks',
    unit: '100 g',
    mrp: 30,
    price: 26,
    stock: 75,
    description: 'Rich, crumbly butter cookies with an iconic smile pattern. Melt-in-mouth creamy taste.',
    groupCode: 'GOOD-DAY-BUTTER',
    image: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=600&auto=format&fit=crop'
  },
  {
    name: 'Britannia Good Day Butter Cookies',
    category: 'snacks',
    unit: '200 g',
    mrp: 60,
    price: 50,
    stock: 50,
    description: 'Double pack of Britannia Good Day butter cookies. Perfect sweet snack with morning coffee.',
    groupCode: 'GOOD-DAY-BUTTER',
    image: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=600&auto=format&fit=crop'
  },
  {
    name: 'Britannia Bourbon Chocolate Cream',
    category: 'snacks',
    unit: '150 g',
    mrp: 40,
    price: 34,
    stock: 60,
    description: 'Rich dark chocolate biscuits sprinkled with sugar crystals and sandwiched with velvety chocolate cream.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=600&auto=format&fit=crop'
  },
  {
    name: 'Oreo Original Vanilla Cream Biscuits',
    category: 'snacks',
    unit: '120 g',
    mrp: 40,
    price: 35,
    stock: 65,
    description: 'Twist, lick, and dunk! Crunchy rich cocoa sandwich biscuits filled with smooth vanilla cream.',
    groupCode: 'OREO-VANILLA',
    image: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=600&auto=format&fit=crop'
  },
  {
    name: 'Doritos Cheese Supreme Tortilla Chips',
    category: 'snacks',
    unit: '60 g',
    mrp: 35,
    price: 30,
    stock: 50,
    description: 'Triangular corn tortilla chips bursting with intense melted cheese flavor and loud crunch.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=600&auto=format&fit=crop'
  },

  // ==========================================
  // 6. Beverages (beverages) - 20 items
  // ==========================================
  {
    name: 'Coca-Cola Sparkling Soft Drink',
    category: 'beverages',
    unit: '750 ml',
    mrp: 40,
    price: 38,
    stock: 80,
    description: 'The world’s favourite refreshing carbonated cola beverage. Best served ice cold.',
    groupCode: 'COCA-COLA-BOTTLE',
    image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop'
  },
  {
    name: 'Coca-Cola Sparkling Soft Drink',
    category: 'beverages',
    unit: '1.25 L',
    mrp: 70,
    price: 64,
    stock: 55,
    description: 'Medium family bottle of Coca-Cola. Uplifting fizzy refreshment for lunch or parties.',
    groupCode: 'COCA-COLA-BOTTLE',
    image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop'
  },
  {
    name: 'Coca-Cola Sparkling Soft Drink',
    category: 'beverages',
    unit: '2.25 L',
    mrp: 100,
    price: 89,
    stock: 40,
    description: 'Large party size bottle of Coca-Cola. Sparkling cola satisfaction for celebrations.',
    groupCode: 'COCA-COLA-BOTTLE',
    image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop'
  },
  {
    name: 'Thums Up Charged Strong Cola',
    category: 'beverages',
    unit: '750 ml',
    mrp: 40,
    price: 38,
    stock: 80,
    description: 'Taste the Thunder! India’s bold, spicy, and extra fizzy strong cola beverage.',
    groupCode: 'THUMS-UP-BOTTLE',
    image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop'
  },
  {
    name: 'Thums Up Charged Strong Cola',
    category: 'beverages',
    unit: '1.25 L',
    mrp: 70,
    price: 64,
    stock: 55,
    description: 'Thums Up 1.25L bottle. Strong carbonation and punchy taste for biryani and snack pairings.',
    groupCode: 'THUMS-UP-BOTTLE',
    image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop'
  },
  {
    name: 'Sprite Crisp Lemon-Lime Soda',
    category: 'beverages',
    unit: '750 ml',
    mrp: 40,
    price: 38,
    stock: 75,
    description: 'Clear, crisp, and refreshing lemon-lime fizzy soda. Clear hai!',
    groupCode: 'SPRITE-BOTTLE',
    image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop'
  },
  {
    name: 'Sprite Crisp Lemon-Lime Soda',
    category: 'beverages',
    unit: '2.25 L',
    mrp: 100,
    price: 89,
    stock: 40,
    description: 'Party pack bottle of refreshing Sprite. Cleanses palate and cools down thirst instantly.',
    groupCode: 'SPRITE-BOTTLE',
    image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop'
  },
  {
    name: 'Frooti Fresh Mango Drink',
    category: 'beverages',
    unit: '160 ml',
    mrp: 10,
    price: 10,
    stock: 120,
    description: 'The real taste of juicy totapuri mangoes in a handy tetra pack with straw. Kid favorite.',
    groupCode: 'FROOTI-MANGO',
    image: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=600&auto=format&fit=crop'
  },
  {
    name: 'Frooti Fresh Mango Drink',
    category: 'beverages',
    unit: '1.2 L',
    mrp: 75,
    price: 66,
    stock: 45,
    description: '1.2 L family pet bottle of Frooti mango drink. Thick, pulpy, and tropical sweetness.',
    groupCode: 'FROOTI-MANGO',
    image: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=600&auto=format&fit=crop'
  },
  {
    name: 'Maaza Real Mango Pulp Drink',
    category: 'beverages',
    unit: '600 ml',
    mrp: 42,
    price: 38,
    stock: 60,
    description: 'Rich, thick, and indulgent mango beverage crafted from real Alphonso mango pulp.',
    groupCode: 'MAAZA-MANGO',
    image: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=600&auto=format&fit=crop'
  },
  {
    name: 'Maaza Real Mango Pulp Drink',
    category: 'beverages',
    unit: '1.2 L',
    mrp: 80,
    price: 69,
    stock: 45,
    description: 'Large 1.2 L bottle of Maaza. Delicious summer fruit flavor all year round.',
    groupCode: 'MAAZA-MANGO',
    image: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=600&auto=format&fit=crop'
  },
  {
    name: 'Real Fruit Power Mixed Fruit Juice',
    category: 'beverages',
    unit: '1 L',
    mrp: 140,
    price: 115,
    stock: 50,
    description: 'Nourishing blend of 9 delicious fruits packed with essential vitamins and no added preservatives.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=600&auto=format&fit=crop'
  },
  {
    name: 'Real Fruit Power Pomegranate Juice',
    category: 'beverages',
    unit: '1 L',
    mrp: 150,
    price: 122,
    stock: 40,
    description: '100% natural goodness of ripe pomegranates. Rich in antioxidant polyphenols for active vitality.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=600&auto=format&fit=crop'
  },
  {
    name: 'Tata Tea Gold Premium Assam Blend',
    category: 'beverages',
    unit: '250 g',
    mrp: 175,
    price: 148,
    stock: 55,
    description: 'Exquisite blend of strong CTC tea grains and 15% gently rolled long tea leaves for rich aroma.',
    groupCode: 'TATA-TEA-GOLD',
    image: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&auto=format&fit=crop'
  },
  {
    name: 'Tata Tea Gold Premium Assam Blend',
    category: 'beverages',
    unit: '500 g',
    mrp: 340,
    price: 285,
    stock: 45,
    description: '500 g pack of Tata Tea Gold. Delightful golden liquor with refreshing aroma for tea lovers.',
    groupCode: 'TATA-TEA-GOLD',
    image: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&auto=format&fit=crop'
  },
  {
    name: 'Brooke Bond Red Label Natural Care',
    category: 'beverages',
    unit: '250 g',
    mrp: 165,
    price: 140,
    stock: 50,
    description: 'Black tea infused with 5 Ayurvedic ingredients: Ashwagandha, Mulethi, Tulsi, Cardamom, and Ginger.',
    groupCode: 'RED-LABEL-TEA',
    image: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&auto=format&fit=crop'
  },
  {
    name: 'Nescafe Classic Instant Coffee',
    category: 'beverages',
    unit: '50 g',
    mrp: 195,
    price: 175,
    stock: 50,
    description: '100% pure roasted Robusta coffee beans. Distinctive bold taste and unmistakable rich aroma.',
    groupCode: 'NESCAFE-CLASSIC',
    image: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop'
  },
  {
    name: 'Nescafe Classic Instant Coffee',
    category: 'beverages',
    unit: '100 g',
    mrp: 360,
    price: 320,
    stock: 40,
    description: '100 g glass jar of Nescafe Classic instant coffee. Awakening morning energy in every single cup.',
    groupCode: 'NESCAFE-CLASSIC',
    image: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop'
  },
  {
    name: 'Bisleri Packaged Drinking Water',
    category: 'beverages',
    unit: '1 L',
    mrp: 20,
    price: 18,
    stock: 120,
    description: 'Ozonised mineral-enriched safe packaged drinking water. Treated with multi-stage purification.',
    groupCode: 'BISLERI-WATER',
    image: 'https://images.unsplash.com/photo-1559839914-17aae19cec71?w=600&auto=format&fit=crop'
  },
  {
    name: 'Bisleri Packaged Drinking Water',
    category: 'beverages',
    unit: '5 L',
    mrp: 75,
    price: 68,
    stock: 40,
    description: 'Large 5 litre jar with handle. Clean and pure drinking water for travel and home use.',
    groupCode: 'BISLERI-WATER',
    image: 'https://images.unsplash.com/photo-1559839914-17aae19cec71?w=600&auto=format&fit=crop'
  },

  // ==========================================
  // 7. Bakery (bakery) - 15 items
  // ==========================================
  {
    name: 'Harvest Gold Regular White Bread',
    category: 'bakery',
    unit: '400 g',
    mrp: 45,
    price: 42,
    stock: 50,
    description: 'Super soft, fresh baked sandwich white bread with golden crust. Perfect for sandwiches and toasts.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&auto=format&fit=crop'
  },
  {
    name: 'Harvest Gold 100% Whole Wheat Bread',
    category: 'bakery',
    unit: '400 g',
    mrp: 55,
    price: 50,
    stock: 45,
    description: 'Baked using 100% whole wheat atta without added maida. Rich in bran fibre for wholesome digestion.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&auto=format&fit=crop'
  },
  {
    name: 'English Oven Soft Brown Bread',
    category: 'bakery',
    unit: '400 g',
    mrp: 50,
    price: 46,
    stock: 40,
    description: 'Nutritious brown bread slices enriched with malted barley and whole grains. Ideal for club sandwiches.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&auto=format&fit=crop'
  },
  {
    name: 'English Oven Multigrain Bread',
    category: 'bakery',
    unit: '400 g',
    mrp: 65,
    price: 58,
    stock: 35,
    description: 'Artisanal loaf loaded with flax seeds, sunflower seeds, oats, and sesame. Superfood fibre breakfast.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&auto=format&fit=crop'
  },
  {
    name: 'English Oven Soft Burger Buns',
    category: 'bakery',
    unit: '2 pcs',
    mrp: 30,
    price: 26,
    stock: 40,
    description: 'Soft and airy burger buns with smooth sesame topping. Holds patty and sauces without getting soggy.',
    groupCode: 'BURGER-BUNS',
    image: 'https://images.unsplash.com/photo-1586444248902-2f64eddc13df?w=600&auto=format&fit=crop'
  },
  {
    name: 'English Oven Soft Burger Buns',
    category: 'bakery',
    unit: '4 pcs',
    mrp: 55,
    price: 48,
    stock: 30,
    description: 'Pack of 4 fresh bakery burger buns. Perfect for homemade veg burgers and aloo tikki sliders.',
    groupCode: 'BURGER-BUNS',
    image: 'https://images.unsplash.com/photo-1586444248902-2f64eddc13df?w=600&auto=format&fit=crop'
  },
  {
    name: 'English Oven Fresh Pav Buns',
    category: 'bakery',
    unit: '6 pcs',
    mrp: 40,
    price: 34,
    stock: 50,
    description: 'Feather-light, pillowy ladi pav. Warm with Amul butter for authentic Mumbai Pav Bhaji or Vada Pav.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1586444248902-2f64eddc13df?w=600&auto=format&fit=crop'
  },
  {
    name: 'Britannia Fresh Fruit Cake Slice',
    category: 'bakery',
    unit: '120 g',
    mrp: 40,
    price: 36,
    stock: 50,
    description: 'Moist golden sponge cake studded with candied tutti frutti. Sweet tea-time snack for all ages.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=600&auto=format&fit=crop'
  },
  {
    name: 'Britannia Chocolate Muffins',
    category: 'bakery',
    unit: '6 pcs',
    mrp: 60,
    price: 52,
    stock: 40,
    description: 'Soft chocolate cupcakes filled with decadent chocolate center. Indulgent sweet treat for kids.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=600&auto=format&fit=crop'
  },
  {
    name: 'Bauli Moonfils Chocolate Croissant',
    category: 'bakery',
    unit: '45 g',
    mrp: 20,
    price: 19,
    stock: 60,
    description: 'Italian style crescent puff pastry baked with natural sourdough and filled with rich chocolate cream.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=600&auto=format&fit=crop'
  },
  {
    name: 'Bonn Whole Wheat Pizza Base',
    category: 'bakery',
    unit: '2 pcs',
    mrp: 45,
    price: 38,
    stock: 35,
    description: 'Pre-baked 8-inch round pizza bases made from whole wheat flour. Ready for cheese and toppings.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&auto=format&fit=crop'
  },
  {
    name: 'Winkies Vanilla Swiss Roll',
    category: 'bakery',
    unit: '180 g',
    mrp: 75,
    price: 65,
    stock: 30,
    description: 'Rolled sponge cake layer with velvety vanilla buttercream filling. Sliced and ready to serve.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=600&auto=format&fit=crop'
  },
  {
    name: 'English Oven Garlic Herb Loaf',
    category: 'bakery',
    unit: '250 g',
    mrp: 60,
    price: 52,
    stock: 30,
    description: 'Flavoursome artisanal loaf infused with roasted garlic flakes and fragrant Italian herbs.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&auto=format&fit=crop'
  },
  {
    name: 'Harvest Gold Sweet Milk Bread',
    category: 'bakery',
    unit: '400 g',
    mrp: 50,
    price: 45,
    stock: 45,
    description: 'Enriched with fresh dairy milk for extra softness and subtle sweetness. Kids love it with butter.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&auto=format&fit=crop'
  },
  {
    name: 'Elite Butter Rusk Toast',
    category: 'bakery',
    unit: '200 g',
    mrp: 50,
    price: 42,
    stock: 45,
    description: 'Twice-baked crunchy crispy rusks with real butter and aromatic cardamom. Dip into hot milk or chai.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&auto=format&fit=crop'
  },

  // ==========================================
  // 8. Instant Food (instant) - 15 items
  // ==========================================
  {
    name: 'Maggi 2-Minute Masala Instant Noodles',
    category: 'instant',
    unit: '70 g',
    mrp: 14,
    price: 14,
    stock: 120,
    description: 'India’s favourite 2-minute instant noodles with the unmistakable Tastemaker spice blend and real spices.',
    groupCode: 'MAGGI-MASALA-NOODLES',
    image: 'https://images.unsplash.com/photo-1612927601601-6638404737ce?w=600&auto=format&fit=crop'
  },
  {
    name: 'Maggi 2-Minute Masala Instant Noodles',
    category: 'instant',
    unit: '140 g',
    mrp: 28,
    price: 27,
    stock: 90,
    description: '2-pack of Maggi Masala Noodles. Quick comfort food ready in minutes for study breaks and hunger pangs.',
    groupCode: 'MAGGI-MASALA-NOODLES',
    image: 'https://images.unsplash.com/photo-1612927601601-6638404737ce?w=600&auto=format&fit=crop'
  },
  {
    name: 'Maggi 2-Minute Masala Instant Noodles',
    category: 'instant',
    unit: '280 g',
    mrp: 56,
    price: 52,
    stock: 75,
    description: '4-pack family pack of Maggi 2-Minute Masala Noodles. Iron fortified wholesome noodles.',
    groupCode: 'MAGGI-MASALA-NOODLES',
    image: 'https://images.unsplash.com/photo-1612927601601-6638404737ce?w=600&auto=format&fit=crop'
  },
  {
    name: 'Maggi 2-Minute Masala Instant Noodles',
    category: 'instant',
    unit: '560 g',
    mrp: 110,
    price: 99,
    stock: 50,
    description: 'Super saver 8-pack of Maggi Masala Noodles with 8 Tastemakers included. Best value.',
    groupCode: 'MAGGI-MASALA-NOODLES',
    image: 'https://images.unsplash.com/photo-1612927601601-6638404737ce?w=600&auto=format&fit=crop'
  },
  {
    name: 'Sunfeast Yippee Magic Masala Noodles',
    category: 'instant',
    unit: '65 g',
    mrp: 14,
    price: 13,
    stock: 80,
    description: 'Round noodle block that does not lump or break. Loaded with real veggies and vibrant masala.',
    groupCode: 'YIPPEE-MAGIC-MASALA',
    image: 'https://images.unsplash.com/photo-1612927601601-6638404737ce?w=600&auto=format&fit=crop'
  },
  {
    name: 'Sunfeast Yippee Magic Masala Noodles',
    category: 'instant',
    unit: '240 g',
    mrp: 52,
    price: 46,
    stock: 55,
    description: '4-in-1 pack of Sunfeast Yippee long slurpy noodles. Stays non-sticky even after 30 minutes.',
    groupCode: 'YIPPEE-MAGIC-MASALA',
    image: 'https://images.unsplash.com/photo-1612927601601-6638404737ce?w=600&auto=format&fit=crop'
  },
  {
    name: 'Ching’s Secret Hakka Noodles',
    category: 'instant',
    unit: '150 g',
    mrp: 40,
    price: 34,
    stock: 60,
    description: 'Authentic desi Chinese style noodles that boil non-sticky. Perfect for veg chowmein and stir fry.',
    groupCode: 'CHINGS-HAKKA-NOODLES',
    image: 'https://images.unsplash.com/photo-1612927601601-6638404737ce?w=600&auto=format&fit=crop'
  },
  {
    name: 'Ching’s Secret Hakka Noodles',
    category: 'instant',
    unit: '600 g',
    mrp: 120,
    price: 102,
    stock: 40,
    description: 'Jumbo party pack of Ching’s Hakka Noodles. Contains 4 noodle cakes for Chinese dinner banquets.',
    groupCode: 'CHINGS-HAKKA-NOODLES',
    image: 'https://images.unsplash.com/photo-1612927601601-6638404737ce?w=600&auto=format&fit=crop'
  },
  {
    name: 'Ching’s Secret Schezwan Chutney',
    category: 'instant',
    unit: '250 g',
    mrp: 90,
    price: 78,
    stock: 50,
    description: 'Spicy fiery Szechuan dipping sauce packed with red chillies, garlic, and ginger. Dip, spread, or cook.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600&auto=format&fit=crop'
  },
  {
    name: 'Kissan Fresh Tomato Ketchup',
    category: 'instant',
    unit: '500 g',
    mrp: 85,
    price: 72,
    stock: 65,
    description: 'Sweet and tangy tomato sauce prepared from 100% real juicy farm tomatoes. Squeeze pouch with cap.',
    groupCode: 'KISSAN-TOMATO-KETCHUP',
    image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600&auto=format&fit=crop'
  },
  {
    name: 'Kissan Fresh Tomato Ketchup',
    category: 'instant',
    unit: '950 g',
    mrp: 155,
    price: 129,
    stock: 45,
    description: 'Value refill pack of Kissan tomato ketchup. Classic accompaniment for samosas, pakodas, and fries.',
    groupCode: 'KISSAN-TOMATO-KETCHUP',
    image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600&auto=format&fit=crop'
  },
  {
    name: 'Veeba Truly Eggless Mayonnaise',
    category: 'instant',
    unit: '250 g',
    mrp: 89,
    price: 76,
    stock: 45,
    description: 'Thick, creamy, and vegetarian eggless mayonnaise. Ideal spread for burgers, sandwiches, and rolls.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600&auto=format&fit=crop'
  },
  {
    name: 'FunFoods Creamy Peanut Butter',
    category: 'instant',
    unit: '400 g',
    mrp: 175,
    price: 148,
    stock: 40,
    description: 'Made with slow-roasted Gujarat peanuts. Packed with 26% natural plant protein and healthy fats.',
    groupCode: 'FUNFOODS-PEANUT-BUTTER',
    image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600&auto=format&fit=crop'
  },
  {
    name: 'FunFoods Creamy Peanut Butter',
    category: 'instant',
    unit: '900 g',
    mrp: 350,
    price: 295,
    stock: 25,
    description: 'Large 900 g jar of smooth peanut butter. Excellent workout fuel for gym enthusiasts and protein shakes.',
    groupCode: 'FUNFOODS-PEANUT-BUTTER',
    image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600&auto=format&fit=crop'
  },
  {
    name: 'Nutella Hazelnut Cocoa Spread',
    category: 'instant',
    unit: '350 g',
    mrp: 395,
    price: 345,
    stock: 35,
    description: 'Delicious creamy spread with premium roasted hazelnuts and skimmed milk cocoa. Spread over warm rotis and toast.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600&auto=format&fit=crop'
  },

  // ==========================================
  // 9. Household Care (household) - 20 items
  // ==========================================
  {
    name: 'Surf Excel Easy Wash Detergent Powder',
    category: 'household',
    unit: '500 g',
    mrp: 75,
    price: 68,
    stock: 70,
    description: 'Dissolves quickly in water to remove tough grease, tea, and curry stains without rigorous scrubbing.',
    groupCode: 'SURF-EXCEL-EASYWASH',
    image: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=600&auto=format&fit=crop'
  },
  {
    name: 'Surf Excel Easy Wash Detergent Powder',
    category: 'household',
    unit: '1 kg',
    mrp: 145,
    price: 128,
    stock: 65,
    description: 'Super stain removal powder engineered with smart enzyme formula. Keeps clothes bright and fragrant.',
    groupCode: 'SURF-EXCEL-EASYWASH',
    image: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=600&auto=format&fit=crop'
  },
  {
    name: 'Surf Excel Easy Wash Detergent Powder',
    category: 'household',
    unit: '3 kg',
    mrp: 410,
    price: 360,
    stock: 40,
    description: 'Value bucket saver 3 kg pack of Surf Excel Easy Wash. Ultimate everyday laundry detergent for families.',
    groupCode: 'SURF-EXCEL-EASYWASH',
    image: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=600&auto=format&fit=crop'
  },
  {
    name: 'Surf Excel Matic Front Load Liquid',
    category: 'household',
    unit: '1 L',
    mrp: 235,
    price: 198,
    stock: 45,
    description: 'Advanced liquid detergent designed for washing machines. 100% stain removal without leaving chalky residue.',
    groupCode: 'SURF-EXCEL-MATIC',
    image: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=600&auto=format&fit=crop'
  },
  {
    name: 'Surf Excel Matic Front Load Liquid',
    category: 'household',
    unit: '2 L',
    mrp: 440,
    price: 375,
    stock: 30,
    description: 'Refill pouch of Surf Excel Matic liquid. Protects fabric fibers and machine parts from scale buildup.',
    groupCode: 'SURF-EXCEL-MATIC',
    image: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=600&auto=format&fit=crop'
  },
  {
    name: 'Ariel Complete Washing Powder',
    category: 'household',
    unit: '1 kg',
    mrp: 155,
    price: 135,
    stock: 55,
    description: 'Deep clean technology removes tough stains in 1 wash. Leaves clothes with long-lasting floral freshness.',
    groupCode: 'ARIEL-COMPLETE-POWDER',
    image: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=600&auto=format&fit=crop'
  },
  {
    name: 'Ariel Complete Washing Powder',
    category: 'household',
    unit: '2 kg',
    mrp: 300,
    price: 255,
    stock: 35,
    description: 'Economy 2 kg pack of Ariel Complete. Delivers brilliant white glow to whites and protects coloured clothes.',
    groupCode: 'ARIEL-COMPLETE-POWDER',
    image: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=600&auto=format&fit=crop'
  },
  {
    name: 'Tide Plus Double Power Lemon & Mint',
    category: 'household',
    unit: '1 kg',
    mrp: 125,
    price: 108,
    stock: 60,
    description: 'Outstanding whiteness and dirt removal powered by lemon and mint fragrance enzymes.',
    groupCode: 'TIDE-PLUS-LEMON',
    image: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=600&auto=format&fit=crop'
  },
  {
    name: 'Tide Plus Double Power Lemon & Mint',
    category: 'household',
    unit: '5 kg',
    mrp: 580,
    price: 495,
    stock: 30,
    description: 'Bulk 5 kg bag of Tide Plus. Supreme lather and white glow for large laundry loads.',
    groupCode: 'TIDE-PLUS-LEMON',
    image: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=600&auto=format&fit=crop'
  },
  {
    name: 'Vim Dishwash Gel with Lemon',
    category: 'household',
    unit: '250 ml',
    mrp: 65,
    price: 55,
    stock: 75,
    description: 'Degreasing gel with power of 100 lemons. 1 spoon of Vim gel cleans an entire sinkful of oily vessels.',
    groupCode: 'VIM-GEL-LEMON',
    image: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=600&auto=format&fit=crop'
  },
  {
    name: 'Vim Dishwash Gel with Lemon',
    category: 'household',
    unit: '500 ml',
    mrp: 125,
    price: 105,
    stock: 55,
    description: '500 ml squeeze bottle with dispensing cap. Gentle on hands while tough on burnt oil and spices.',
    groupCode: 'VIM-GEL-LEMON',
    image: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=600&auto=format&fit=crop'
  },
  {
    name: 'Vim Dishwash Bar with Polycoat',
    category: 'household',
    unit: '125 g',
    mrp: 15,
    price: 14,
    stock: 90,
    description: 'Waterproof polycoated soap bar that prevents wastage and melting. Cleans burnt pots effortlessly.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=600&auto=format&fit=crop'
  },
  {
    name: 'Colin Glass and Surface Cleaner Spray',
    category: 'household',
    unit: '500 ml',
    mrp: 110,
    price: 94,
    stock: 50,
    description: 'Streak-free shine spray for mirrors, windshields, kitchen counters, and TV panels. Shine boosters included.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=600&auto=format&fit=crop'
  },
  {
    name: 'Harpic Power Plus Disinfectant Toilet Cleaner',
    category: 'household',
    unit: '500 ml',
    mrp: 99,
    price: 86,
    stock: 65,
    description: 'Thick blue liquid formula kills 99.9% germs, removes stubborn limescale, yellow stains, and bad odor.',
    groupCode: 'HARPIC-POWER-PLUS',
    image: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=600&auto=format&fit=crop'
  },
  {
    name: 'Harpic Power Plus Disinfectant Toilet Cleaner',
    category: 'household',
    unit: '1 L',
    mrp: 185,
    price: 158,
    stock: 45,
    description: '1 L economy bottle with curved nozzle for deep under-rim reach. Leaves toilet bowl sparkling clean.',
    groupCode: 'HARPIC-POWER-PLUS',
    image: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=600&auto=format&fit=crop'
  },
  {
    name: 'Lizol Disinfectant Floor Cleaner Citrus',
    category: 'household',
    unit: '500 ml',
    mrp: 110,
    price: 95,
    stock: 60,
    description: '10x better germ kill than standard phenyls. Safe on marble, granite, and tiles with refreshing citrus aroma.',
    groupCode: 'LIZOL-FLOOR-CLEANER',
    image: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=600&auto=format&fit=crop'
  },
  {
    name: 'Lizol Disinfectant Floor Cleaner Citrus',
    category: 'household',
    unit: '1 L',
    mrp: 205,
    price: 175,
    stock: 40,
    description: '1 litre economy pack of Lizol floor cleaner. Recommended by the Indian Medical Association.',
    groupCode: 'LIZOL-FLOOR-CLEANER',
    image: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=600&auto=format&fit=crop'
  },
  {
    name: 'Comfort After Wash Morning Fresh',
    category: 'household',
    unit: '860 ml',
    mrp: 230,
    price: 195,
    stock: 40,
    description: 'Fabric conditioner that infuses long-lasting floral fragrance and feather softness into washed clothes.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=600&auto=format&fit=crop'
  },
  {
    name: 'Good Knight Gold Flash Liquid Mosquito Refill',
    category: 'household',
    unit: '45 ml',
    mrp: 85,
    price: 74,
    stock: 60,
    description: 'Automatic flash vapourizing system against dengue and malaria mosquitoes. 60 nights of uninterrupted sleep.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=600&auto=format&fit=crop'
  },
  {
    name: 'All Out Ultra Power+ Liquid Refill',
    category: 'household',
    unit: '45 ml',
    mrp: 85,
    price: 74,
    stock: 55,
    description: 'Powerful mosquito knockdown formula with thermal sensor fan technology. Knock out pests safely.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=600&auto=format&fit=crop'
  },

  // ==========================================
  // 10. Personal Care (personal) - 15 items
  // ==========================================
  {
    name: 'Dettol Original Germ Protection Bath Soap',
    category: 'personal',
    unit: '75 g',
    mrp: 42,
    price: 36,
    stock: 80,
    description: 'Classic pine fragrance antiseptic soap recommended by doctors. 100% better protection against illness germs.',
    groupCode: 'DETTOL-BATH-SOAP',
    image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop'
  },
  {
    name: 'Dettol Original Germ Protection Bath Soap',
    category: 'personal',
    unit: '125 g',
    mrp: 68,
    price: 58,
    stock: 65,
    description: 'Large 125 g bathing bar of Dettol Original. Keeps skin cleansed, hygienic, and odor-free all day.',
    groupCode: 'DETTOL-BATH-SOAP',
    image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop'
  },
  {
    name: 'Dove Cream Beauty Bathing Bar',
    category: 'personal',
    unit: '75 g',
    mrp: 65,
    price: 56,
    stock: 70,
    description: 'Enriched with 1/4th moisturizing cream and mild cleansers. Keeps skin soft, smooth, and glowing.',
    groupCode: 'DOVE-BEAUTY-BAR',
    image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop'
  },
  {
    name: 'Dove Cream Beauty Bathing Bar',
    category: 'personal',
    unit: '125 g',
    mrp: 98,
    price: 84,
    stock: 55,
    description: 'Dove beauty bar does not dry skin like regular soap. pH neutral, dermatologically approved.',
    groupCode: 'DOVE-BEAUTY-BAR',
    image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop'
  },
  {
    name: 'Pears Pure & Gentle Glycerin Soap',
    category: 'personal',
    unit: '125 g',
    mrp: 85,
    price: 72,
    stock: 50,
    description: 'Transparent amber bar enriched with 98% pure glycerin and natural oils. Deeply hydrates sensitive skin.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop'
  },
  {
    name: 'Head & Shoulders Anti-Dandruff Shampoo',
    category: 'personal',
    unit: '180 ml',
    mrp: 195,
    price: 165,
    stock: 45,
    description: 'Clinically proven Zinc Pyrithione formula eliminates up to 100% visible dandruff flakes and relieves scalp itching.',
    groupCode: 'HNS-SHAMPOO',
    image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop'
  },
  {
    name: 'Head & Shoulders Anti-Dandruff Shampoo',
    category: 'personal',
    unit: '340 ml',
    mrp: 360,
    price: 305,
    stock: 35,
    description: 'Smooth and silky conditioning shampoo that leaves hair soft, manageable, and flake-free.',
    groupCode: 'HNS-SHAMPOO',
    image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop'
  },
  {
    name: 'Pantene Advanced Hairfall Control Shampoo',
    category: 'personal',
    unit: '180 ml',
    mrp: 180,
    price: 152,
    stock: 45,
    description: 'Pro-Vitamin B5 and fermented rice water strengthen hair strands from root to tip, cutting breakage by 98%.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop'
  },
  {
    name: 'Colgate Strong Teeth Calcium Toothpaste',
    category: 'personal',
    unit: '100 g',
    mrp: 65,
    price: 56,
    stock: 80,
    description: 'Amino Shakti formula adds natural calcium back into tooth enamel, making teeth 2x stronger against cavities.',
    groupCode: 'COLGATE-STRONG-TEETH',
    image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&auto=format&fit=crop'
  },
  {
    name: 'Colgate Strong Teeth Calcium Toothpaste',
    category: 'personal',
    unit: '200 g',
    mrp: 125,
    price: 106,
    stock: 65,
    description: 'Economy 200 g family pack of Colgate Strong Teeth. Clean minty breath and strong gums for everyone.',
    groupCode: 'COLGATE-STRONG-TEETH',
    image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&auto=format&fit=crop'
  },
  {
    name: 'Colgate MaxFresh Spicy Fresh Toothpaste',
    category: 'personal',
    unit: '150 g',
    mrp: 115,
    price: 98,
    stock: 50,
    description: 'Infused with cooling crystal beads that dissolve as you brush. Long-lasting fresh spicy mint breath.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&auto=format&fit=crop'
  },
  {
    name: 'Sensodyne Fresh Mint Sensitive Toothpaste',
    category: 'personal',
    unit: '75 g',
    mrp: 145,
    price: 128,
    stock: 45,
    description: 'Daily sensitivity toothpaste clinically proven to build round-the-clock protection against hot and cold sensations.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&auto=format&fit=crop'
  },
  {
    name: 'Dettol Skincare Liquid Handwash Refill',
    category: 'personal',
    unit: '750 ml',
    mrp: 135,
    price: 115,
    stock: 55,
    description: 'Moisturizing formula enriched with skin-conditioning glycerin. 100% protection from illness germs.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop'
  },
  {
    name: 'Nivea Soft Light Moisturiser Cream',
    category: 'personal',
    unit: '100 ml',
    mrp: 190,
    price: 160,
    stock: 45,
    description: 'Non-greasy, fast-absorbing daily moisturizing cream with Jojoba oil and Vitamin E for fresh, supple skin.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&auto=format&fit=crop'
  },
  {
    name: 'Vaseline Deep Moisture Body Lotion',
    category: 'personal',
    unit: '400 ml',
    mrp: 360,
    price: 295,
    stock: 35,
    description: 'Contains micro-droplets of Vaseline petroleum jelly to lock in moisture for 48 hours. Clinically proven hydration.',
    groupCode: '',
    image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&auto=format&fit=crop'
  }
];

console.log('Total products defined:', rawProducts.length);

// Format rows into the required columns
const rows = rawProducts.map(p => ({
  name: p.name,
  category: p.category,
  unit: p.unit,
  mrp: p.mrp,
  price: p.price,
  stock: p.stock,
  description: p.description,
  groupCode: p.groupCode || '',
  image: p.image,
  imageFile: '',
  status: 'ACTIVE'
}));

// Validate using the backend validator!
const categories = await prisma.category.findMany();
console.log('Active categories loaded:', categories.length);

// We simulate validating against an empty existing product list (since fake products will be cleared)
const validationResult = validateImport(rows, categories, []);
const invalid = validationResult.filter(r => !r.valid);

if (invalid.length > 0) {
  console.error('Validation failed for', invalid.length, 'rows:');
  console.error(JSON.stringify(invalid.slice(0, 5), null, 2));
  process.exit(1);
} else {
  console.log('SUCCESS! All', validationResult.length, 'rows are 100% valid!');
}

// Generate CSV content
const csvLines = [];
csvLines.push(columns.map(escapeCsv).join(','));

for (const row of rows) {
  csvLines.push([
    row.name,
    row.category,
    row.unit,
    row.mrp,
    row.price,
    row.stock,
    row.description,
    row.groupCode,
    row.image,
    row.imageFile,
    row.status
  ].map(escapeCsv).join(','));
}

const csvContent = csvLines.join('\r\n');

// Write to files
const outPath1 = path.resolve('..', 'R2Cart-products-200.csv');
const outPath2 = path.resolve('..', 'R2Cart-Web', 'public', 'R2Cart-products-200.csv');
fs.writeFileSync(outPath1, csvContent, 'utf8');
fs.writeFileSync(outPath2, csvContent, 'utf8');

console.log('Saved CSV to:', outPath1);
console.log('Saved CSV to:', outPath2);
console.log('File size:', fs.statSync(outPath1).size, 'bytes');

await prisma.$disconnect();
process.exit(0);
