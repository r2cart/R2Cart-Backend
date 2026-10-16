import bcrypt from 'bcryptjs';
import {PrismaClient} from '@prisma/client';
import {serviceableLocalities} from '../src/data/serviceableLocalities.js';

const prisma=new PrismaClient();
const img=id=>`https://images.unsplash.com/${id}?auto=format&fit=crop&w=600&q=80`;

const categories=[
 ['fruits-vegetables','Fruits & Vegetables','photo-1610832958506-aa56368176cf','#EAF8E8'],
 ['dairy-breakfast','Dairy & Breakfast','photo-1550583724-b2692b85b150','#E9F5FF'],
 ['snacks','Snacks','photo-1566478989037-eec170784d0b','#FFF2DF'],
 ['beverages','Beverages','photo-1544145945-f90425340c7e','#FFEDED'],
 ['staples','Atta, Rice & Dal','photo-1586201375761-83865001e31c','#FFF6D9'],
 ['cooking','Cooking Essentials','photo-1474979266404-7eaacbcd87c5','#F9EDE0'],
 ['household','Household Care','photo-1585832770485-e68a5dbfad52','#EAF3FF'],
 ['personal','Personal Care','photo-1598440947619-2c35fc9aa908','#F7ECFF'],
 ['bakery','Bakery','photo-1509440159596-0249088772ff','#FFF0E4'],
 ['instant','Instant Food','photo-1612929633738-8fe44f7ec841','#FFF3D6']
];

const products=[
 ['p1','Fresh Tomato','fruits-vegetables','500 g',38,29,42,'photo-1546094096-0df4bcaaa337',1],
 ['p2','Farm Fresh Potato','fruits-vegetables','1 kg',48,39,68,'photo-1518977676601-b53f82aba655',1],
 ['p3','Fresh Onion','fruits-vegetables','1 kg',55,43,35,'photo-1508747703725-719777637510'],
 ['p4','Robusta Banana','fruits-vegetables','6 pcs',65,49,54,'photo-1603833665858-e61d17a86224',1],
 ['p5','Royal Gala Apple','fruits-vegetables','4 pcs',199,159,23,'photo-1560806887-1e4cd0b6cbd6'],
 ['p6','Amul Taaza Milk','dairy-breakfast','500 ml',29,28,90,'photo-1550583724-b2692b85b150',1],
 ['p7','Farm Fresh Eggs','dairy-breakfast','6 pcs',72,65,42,'photo-1506976785307-8732e854ad03'],
 ['p8','Whole Wheat Bread','bakery','400 g',55,49,25,'photo-1509440159596-0249088772ff'],
 ['p9','Aashirvaad Atta','staples','5 kg',310,275,32,'photo-1509440159596-0249088772ff',1],
 ['p10','India Gate Basmati Rice','staples','5 kg',699,579,18,'photo-1586201375761-83865001e31c'],
 ['p11','Tata Sampann Toor Dal','staples','1 kg',220,189,15,'photo-1515543904379-3d757afe72e4'],
 ['p12','Fortune Sunlite Oil','cooking','1 L',155,139,27,'photo-1474979266404-7eaacbcd87c5'],
 ['p13','Parle-G Biscuits','snacks','800 g',90,82,71,'photo-1558961363-fa8fdf82db35',1],
 ['p14','Classic Salted Chips','snacks','90 g',50,45,48,'photo-1566478989037-eec170784d0b'],
 ['p15','Coca-Cola Soft Drink','beverages','750 ml',45,42,30,'photo-1629203851122-3726ecdf080e'],
 ['p16','Real Mixed Fruit Juice','beverages','1 L',125,109,21,'photo-1600271886742-f049cd451bba'],
 ['p17','Surf Excel Matic','household','2 kg',430,365,8,'photo-1585832770485-e68a5dbfad52'],
 ['p18','Dove Cream Beauty Bar','personal','3 x 100 g',210,179,19,'photo-1600857544200-b2f666a9a2ec'],
 ['p19','Dove Daily Shine Shampoo','personal','340 ml',325,279,0,'photo-1598440947619-2c35fc9aa908'],
 ['p20','Maggi Masala Noodles','instant','12 x 70 g',168,154,60,'photo-1612929633738-8fe44f7ec841',1]
];

const bannerData=[
 ['FRESH FROM THE FARM','Good food starts with fresh choices.','Up to 30% off on fruits & vegetables','/category/fruits-vegetables',0,'photo-1610832958506-aa56368176cf','Shop fresh'],
 ['BREAKFAST ESSENTIALS','Mornings made delicious.','Milk, eggs, bread and more in minutes','/category/dairy-breakfast',1,'photo-1550583724-b2692b85b150','Explore breakfast'],
 ['MONTHLY SAVINGS','Fill your pantry for less.','Value packs on atta, rice and dals','/category/staples',2,'photo-1586201375761-83865001e31c','Stock up'],
 ['CRUNCH TIME','Snacks for every mood.','Chips, biscuits and more at special prices','/category/snacks',3,'photo-1566478989037-eec170784d0b','Grab snacks'],
 ['CHILL & SIP','Refreshment delivered chilled.','Juices and soft drinks for every gathering','/category/beverages',4,'photo-1544145945-f90425340c7e','Shop beverages'],
 ['CLEAN HOME','A brighter home, every day.','Save on trusted household essentials','/category/household',5,'photo-1585832770485-e68a5dbfad52','Clean & save'],
 ['SELF CARE','Everyday care, made easy.','Personal care favourites delivered fast','/category/personal',6,'photo-1598440947619-2c35fc9aa908','Explore care'],
 ['BAKED FRESH','Fresh bakes for happy breaks.','Bread and bakery picks for your table','/category/bakery',7,'photo-1509440159596-0249088772ff','Shop bakery'],
 ['READY IN MINUTES','Quick meals for busy days.','Instant favourites whenever hunger strikes','/category/instant',8,'photo-1612929633738-8fe44f7ec841','Get cooking'],
 ['KITCHEN ESSENTIALS','Cook better. Save smarter.','Oils, spices and everyday cooking needs','/category/cooking',9,'photo-1474979266404-7eaacbcd87c5','Shop essentials'],
 ['FRUIT FESTIVAL','Naturally sweet weekend picks.','Colourful seasonal fruits at fresh prices','/category/fruits-vegetables',10,'photo-1619566636858-adf3ef46400b','Pick fruits'],
 ['EXTRA VALUE','More groceries, fewer delivery charges.','Unlock free delivery on orders above ₹499','/search',11,'photo-1542838132-92c53300491e','Start shopping']
];

export async function seedIfEmpty(){
 console.log('Checking database status...');
 const categoryCount=await prisma.category.count();
 const productCount=await prisma.product.count({where:{deletedAt:null}});
 
 if(categoryCount>0||productCount>0){
  console.log(`[Safe Seed] Database is active (${categoryCount} categories, ${productCount} products). Skipping seed to preserve all existing admin content.`);
  return;
 }

 console.log('[Safe Seed] Fresh database detected. Performing initial idempotent bootstrap...');
 await runSeed();
}

export async function runSeed(){
 // 1. Categories (Safe upsert with empty update: never overwrites existing category customizations)
 for(const [slug,name,imageId,color] of categories){
  await prisma.category.upsert({
   where:{slug},
   update:{},
   create:{slug,name,image:img(imageId),color,position:categories.findIndex(x=>x[0]===slug)}
  });
 }
 const cats=Object.fromEntries((await prisma.category.findMany()).map(c=>[c.slug,c.id]));

 // 2. Products (Safe upsert with empty update: never overwrites prices, stock, names or images)
 for(const [id,name,category,unit,mrp,price,stock,imageId,best=false] of products){
  await prisma.product.upsert({
   where:{id},
   update:{},
   create:{
    id,
    name,
    slug:name.toLowerCase().replace(/[^a-z0-9]+/g,'-'),
    description:`Fresh, quality ${name.toLowerCase()} selected for your everyday needs.`,
    unit,
    sku:`GRC-${id.toUpperCase()}`,
    mrp,
    price,
    stock,
    bestSeller:!!best,
    featured:!!best,
    categoryId:cats[category],
    images:{create:{url:img(imageId),alt:name}}
   }
  });
 }

 // 3. Admin & Super Admin Users
 const adminPasswordHash = await bcrypt.hash('Admin@123', 12);
 const superPasswordHash = await bcrypt.hash('Super@123', 12);

 await prisma.user.upsert({
  where:{email:'super@gmail.com'},
  update:{passwordHash:superPasswordHash,role:'SUPER_ADMIN',staffRole:'SUPER_ADMIN'},
  create:{
   name:'Platform Super Admin',
   email:'super@gmail.com',
   mobile:'9876543211',
   passwordHash:superPasswordHash,
   role:'SUPER_ADMIN',
   staffRole:'SUPER_ADMIN',
   status:'ACTIVE',
   isStaffActive:true,
   permissions:{all:true}
  }
 });

 await prisma.user.upsert({
  where:{email:'admin@gmail.com'},
  update:{passwordHash:adminPasswordHash,role:'ADMIN',staffRole:'ADMIN'},
  create:{
   name:'Store Admin',
   email:'admin@gmail.com',
   mobile:'9876543210',
   passwordHash:adminPasswordHash,
   role:'ADMIN',
   staffRole:'ADMIN',
   status:'ACTIVE',
   isStaffActive:true,
   permissions:{all:true}
  }
 });
 console.log('Admin accounts initialized: super@gmail.com & admin@gmail.com');

 // 4. Coupons (Safe upsert with empty update)
 for(const c of [{code:'FRESH50',type:'FIXED',discount:50,minimumOrder:499,maximumDiscount:50},{code:'WELCOME20',type:'PERCENTAGE',discount:20,minimumOrder:799,maximumDiscount:150}]){
  await prisma.coupon.upsert({
   where:{code:c.code},
   update:{},
   create:{...c,startsAt:new Date('2026-01-01'),expiresAt:new Date('2027-12-31')}
  });
 }

 // 5. Banners (Only seeds if banner table is completely empty)
 const bannerCount=await prisma.banner.count();
 if(bannerCount===0){
  for(const [kicker,heading,subtitle,destination,position,imageId,ctaText] of bannerData){
   await prisma.banner.create({
    data:{kicker,heading,subtitle,destination,position,image:img(imageId),ctaText,status:'ACTIVE'}
   });
  }
  console.log('Default storefront banners initialized.');
 }else{
  console.log(`Preserving existing ${bannerCount} storefront banners.`);
 }

 // 6. Store Settings (Only creates if id 1 does not exist)
 const existingSettings=await prisma.storeSetting.findUnique({where:{id:1}});
 if(!existingSettings){
  await prisma.storeSetting.create({
   data:{
    id:1,
    storeName:'R2Cart',
    contactNumber:'+91 80000 10001',
    email:'support@r2cart.in',
    address:'Bailey Road, Patna, Bihar 800001',
    openingTime:'07:00',
    closingTime:'23:00',
    currency:'INR',
    minimumOrder:199,
    deliveryFee:35,
    freeDeliveryThreshold:499,
    estimatedDelivery:'10–30 minutes',
    notifications:{orders:true,stock:true,customers:true}
   }
  });
  console.log('Default store settings initialized.');
 }else{
  console.log('Preserving existing store settings.');
 }

 // 7. Delivery Area (Only creates if no delivery area exists)
 const existingArea=await prisma.deliveryArea.findFirst();
 if(!existingArea){
  await prisma.deliveryArea.create({
   data:{
    name:'Hathua Service Zone',
    pincodes:serviceableLocalities,
    radiusKm:8,
    minimumOrder:199,
    deliveryFee:35,
    freeDeliveryThreshold:499,
    estimatedMinutes:20,
    status:'ACTIVE'
   }
  });
  console.log('Default delivery area initialized.');
 }else{
  console.log('Preserving existing delivery area configuration.');
 }

 console.log('Idempotent bootstrap complete.');
}

async function main(){
 await runSeed();
}

if(process.argv[1]?.endsWith('seed.js')){
 main().finally(()=>prisma.$disconnect());
}
