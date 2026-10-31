import {prisma} from '../config/prisma.js';
import {catalogRepository} from '../repositories/catalog.repository.js';
import {AppError,asyncHandler,created,ok} from '../utils/response.js';
import {productDto,ticketNumber} from '../utils/order.js';
import {sendContactInquiryEmail} from '../services/mail.service.js';
import {getAvailableCustomerSlots} from './admin-scheduling.controller.js';
import {resolveEffectiveStoreSchedule} from '../services/store-operations.service.js';
import {smartSearchProducts} from '../services/search.service.js';
import {cache} from '../services/cache.service.js';

export const categories=asyncHandler(async(req,res)=>{
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
  const data = await cache.getOrSet('catalog:categories', () => catalogRepository.categories(), 900);
  ok(res, data);
});

export const banners=asyncHandler(async(req,res)=>{
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
  const data = await cache.getOrSet('catalog:banners', () => catalogRepository.banners(), 900);
  ok(res, data);
});

export const searchProducts=asyncHandler(async(req,res)=>{
  const result=await smartSearchProducts({
    q:req.query.q,
    category:req.query.category,
    available:req.query.available==='true',
    sort:req.query.sort,
    page:Math.max(1,parseInt(req.query.page,10)||1),
    limit:Math.min(50,Math.max(1,parseInt(req.query.limit,10)||20)),
    userId:req.user?.id||null
  });
  ok(res,result,'Search completed',{
    page:result.page,
    limit:result.limit,
    total:result.total,
    pages:result.pages
  });
});

export const products=asyncHandler(async(req,res)=>{
  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=120, stale-while-revalidate=300');
  const page=Math.max(1,parseInt(req.query.page,10)||1),limit=Math.min(100,Math.max(1,parseInt(req.query.limit,10)||20));
  if(req.query.q){
    const searchRes=await smartSearchProducts({
      q:req.query.q,
      category:req.query.category,
      available:req.query.available==='true',
      sort:req.query.sort,
      page,
      limit,
      userId:req.user?.id||null
    });
    return ok(res,searchRes.results,'Products fetched',{
      page:searchRes.page,
      limit:searchRes.limit,
      total:searchRes.total,
      pages:searchRes.pages,
      scenario:searchRes.scenario,
      exactProduct:searchRes.exactProduct,
      similarProducts:searchRes.similarProducts,
      suggestions:searchRes.suggestions,
      inStockCount:searchRes.inStockCount,
      hasAvailable:searchRes.hasAvailable
    });
  }

  const catKey = req.query.category || 'all';
  const sortKey = req.query.sort || 'default';
  const availKey = req.query.available || 'all';
  const cacheKey = `catalog:products:${page}:${limit}:${catKey}:${sortKey}:${availKey}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    return ok(res, cached.data, 'Products fetched', cached.meta);
  }

  const setting = await cache.getOrSet('catalog:setting:stock', () => prisma.storeSetting?.findUnique?.({where:{id:1},select:{autoHideOutOfStock:true}}), 600);
  const hideOos=Boolean(setting?.autoHideOutOfStock);
  const where={deletedAt:null,status:'ACTIVE',...(req.query.category&&{category:{slug:req.query.category}}),...((req.query.available==='true'||hideOos)&&{stock:{gt:0}})};
  const orderBy=req.query.sort==='low'?{price:'asc'}:req.query.sort==='high'?{price:'desc'}:req.query.sort==='discount'?{featured:'desc'}:{bestSeller:'desc'};
  const include={category:true,ratings:true,images:{orderBy:{position:'asc'}}};
  const [rows,total]=await Promise.all([prisma.product.findMany({where,include,orderBy,skip:(page-1)*limit,take:limit}),prisma.product.count({where})]);
  const groups=[...new Set(rows.map(row=>row.variantGroupId).filter(Boolean))];
  const packs=groups.length?await prisma.product.findMany({where:{deletedAt:null,status:'ACTIVE',variantGroupId:{in:groups}},include,orderBy:{price:'asc'}}):[];
  const formattedRows = rows.map(row=>({...productDto(row),variants:row.variantGroupId?packs.filter(pack=>pack.variantGroupId===row.variantGroupId).map(productDto):[]}));
  const meta = {page,limit,total,pages:Math.ceil(total/limit)};

  cache.set(cacheKey, { data: formattedRows, meta }, 300);

  ok(res,formattedRows,'Products fetched',meta);
});

export const product=asyncHandler(async(req,res)=>{
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
  const id = req.params.id;
  const row = await cache.getOrSet(`catalog:product:${id}`, () => catalogRepository.product(id), 600);
  if(!row)throw new AppError('Product not found',404);
  ok(res,productDto(row));
});
export const suggestions=asyncHandler(async(req,res)=>{
  const q=String(req.query.q||'').trim();
  if(!q)return ok(res,[]);
  const rows=await prisma.product.findMany({
    where:{name:{contains:q},status:'ACTIVE',deletedAt:null},
    select:{id:true,name:true,unit:true,price:true,stock:true,images:{take:1,select:{url:true}}},
    take:8
  });
  if(req.user&&q)await prisma.searchHistory.create({data:{userId:req.user.id,query:q}}).catch(()=>{});
  ok(res,rows.map(r=>({id:r.id,name:r.name,unit:r.unit,price:Number(r.price),stock:r.stock,image:r.images?.[0]?.url||null})));
});
export const delivery=asyncHandler(async(req,res)=>{
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
  const cachedData = await cache.getOrSet('catalog:delivery', async () => {
    const [areas,villages,settings,schedule]=await Promise.all([
      prisma.deliveryArea.findMany({where:{status:'ACTIVE'}}),
      prisma.deliveryVillage.findMany({where:{status:'ACTIVE'}}),
      prisma.storeSetting.findUnique({where:{id:1}}),
      resolveEffectiveStoreSchedule()
    ]);

    const activeEmergency = schedule?.isEmergencyActive ? schedule?.emergencyDetails : null;
    const isEmergencyActive = Boolean(schedule?.isEmergencyActive);
    const emergencyType = activeEmergency?.type;
    const affectedList = (Array.isArray(activeEmergency?.affectedVillageIds) ? activeEmergency.affectedVillageIds : []).map(x => String(x).trim().toLowerCase());
    const affectedSet = new Set(affectedList);

    const activeVillages=villages.map(v=>{
      const fee = v.deliveryFee !== null && v.deliveryFee !== undefined && v.deliveryFee !== ''
        ? Number(v.deliveryFee)
        : Number(settings?.deliveryFee || 20);
      const minOrder = v.minimumOrder !== null && v.minimumOrder !== undefined && v.minimumOrder !== ''
        ? Number(v.minimumOrder)
        : Number(settings?.minimumOrder || 199);
      const freeThresh = v.freeDeliveryThreshold !== null && v.freeDeliveryThreshold !== undefined && v.freeDeliveryThreshold !== ''
        ? Number(v.freeDeliveryThreshold)
        : Number(settings?.freeDeliveryThreshold || 499);
      const estMins = v.estimatedMinutes ? Number(v.estimatedMinutes) : 30;

      const isVillageSuspended = Boolean(
        v.isPaused ||
        (isEmergencyActive && (
          emergencyType === 'ALL_ORDERS' ||
          emergencyType === 'STORE_CLOSE' ||
          (emergencyType === 'SELECTED_AREAS' && (
            affectedSet.has(String(v.id).toLowerCase()) ||
            affectedSet.has(String(v.name).toLowerCase())
          ))
        ))
      );

      return {
        id:v.id,
        name:v.name,
        pincode:v.pincode,
        deliveryFee:fee,
        minimumOrder:minOrder,
        freeDeliveryThreshold:freeThresh,
        radiusKm:Number(v.radiusKm||settings?.globalDeliveryRadius||5),
        estimatedMinutes:estMins,
        schedule:v.schedule,
        allowCod:v.allowCod ?? true,
        allowScheduled:v.allowScheduled ?? true,
        isVillage:true,
        isPaused:isVillageSuspended,
        pauseReason:isVillageSuspended ? (activeEmergency?.message || v.notes || 'Deliveries to this village are temporarily paused.') : null
      };
    });

    const activeAreas=areas.map(a=>{
      const locs = Array.isArray(a.pincodes) ? a.pincodes : [];
      const suspendedLocalities = locs.filter(loc => affectedSet.has(String(loc).trim().toLowerCase()));
      const isAreaSuspended = Boolean(
        a.isPaused ||
        (isEmergencyActive && (
          emergencyType === 'ALL_ORDERS' ||
          emergencyType === 'STORE_CLOSE' ||
          (emergencyType === 'SELECTED_AREAS' && (
            affectedSet.has(String(a.id).toLowerCase()) ||
            affectedSet.has(String(a.name).toLowerCase())
          ))
        ))
      );

      return {
        id:a.id,
        name:a.name,
        localities:locs,
        deliveryFee:Number(a.deliveryFee),
        minimumOrder:Number(a.minimumOrder),
        freeDeliveryThreshold:Number(a.freeDeliveryThreshold),
        estimatedMinutes:a.estimatedMinutes,
        radiusKm:Number(a.radiusKm||settings?.globalDeliveryRadius||5),
        isVillage:false,
        isPaused:isAreaSuspended,
        pauseReason:isAreaSuspended ? (activeEmergency?.message || a.notes || 'Deliveries to this area are temporarily paused.') : null,
        suspendedLocalities
      };
    });

    return {
      villages:activeVillages,
      areas:activeAreas,
      globalRadius:Number(settings?.globalDeliveryRadius||5.0),
      minimumOrder:Number(settings?.minimumOrder||0),
      deliveryFee:Number(settings?.deliveryFee||0),
      freeDeliveryThreshold:Number(settings?.freeDeliveryThreshold||0),
      estimatedDelivery:settings?.estimatedDelivery||'15-30 minutes'
    };
  }, 180);

  ok(res, cachedData);
});
export const deliverySlots=asyncHandler(async(req,res)=>ok(res,await getAvailableCustomerSlots(req.query.date)));
export const settings=asyncHandler(async(req,res)=>{
  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=120, stale-while-revalidate=300');
  const cachedSettings = await cache.getOrSet('catalog:store-settings', async () => {
    const [setting, effectiveStatus] = await Promise.all([
      prisma.storeSetting.findUnique({where:{id:1}}),
      resolveEffectiveStoreSchedule()
    ]);
    return {
      ...(setting || {}),
      effectiveStatus
    };
  }, 300);
  ok(res, cachedSettings);
});
export const contactInquiry=asyncHandler(async(req,res)=>{
 const name=String(req.body.name||'').trim();
 const email=String(req.body.email||'').trim().toLowerCase();
 const phone=String(req.body.phone||req.body.mobile||'').trim();
 const subject=String(req.body.subject||'').trim();
 const message=String(req.body.message||'').trim();

 if(name.length<2)throw new AppError('Please provide your full name',422);
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new AppError('Please provide a valid email address',422);
 if(subject.length<3)throw new AppError('Subject must be at least 3 characters',422);
 if(message.length<5)throw new AppError('Message must be at least 5 characters',422);

 let user=await prisma.user.findUnique({where:{email}});
 if(!user){
  user=await prisma.user.create({
   data:{
    name,
    email,
    mobile:phone||null,
    role:'CUSTOMER',
    status:'ACTIVE'
   }
  });
 }else if(phone&&!user.mobile){
  user=await prisma.user.update({
   where:{id:user.id},
   data:{mobile:phone}
  });
 }

 const ticket=await prisma.supportTicket.create({
  data:{
   ticketNumber:ticketNumber(),
   userId:user.id,
   issueType:'Contact Inquiry',
   subject:`[Contact Us] ${subject}`,
   description:phone?`Inquiry from ${name} (${email}, Contact Phone: ${phone}):\n\n${message}`:`Inquiry from ${name} (${email}):\n\n${message}`,
   status:'OPEN',
   messages:{
    create:{
     message,
     isAdmin:false,
     senderId:user.id
    }
   }
  },
  include:{
   user:{select:{id:true,name:true,email:true,mobile:true}}
  }
 });

 let emailNotificationSent=false;
 try{
  emailNotificationSent=await sendContactInquiryEmail({
   name,
   email,
   subject,
   message,
   ticketNumber:ticket.ticketNumber
  });
 }catch(error){
  console.error(`Contact inquiry email notification failed for ${ticket.ticketNumber}:`,error.message);
 }

 created(res,{ticketNumber:ticket.ticketNumber,emailNotificationSent},'Your message has been sent successfully. Our support team will get back to you shortly.');
});

export const submitProductEnquiry = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, phone, email, message } = req.body;

  if (!name || !name.trim()) {
    throw new AppError('Your name is required to submit a contact request', 422);
  }

  const cleanPhone = String(phone || '').replace(/\D/g, '');
  if (!cleanPhone || cleanPhone.length < 10) {
    throw new AppError('Please provide a valid 10-digit phone number so we can reach you', 422);
  }

  const product = await prisma.product.findFirst({
    where: {
      OR: [{ id }, { slug: id }],
      status: 'ACTIVE'
    },
    include: {
      category: true
    }
  });

  if (!product) {
    throw new AppError('Product not found or unavailable', 404);
  }

  const enquiry = await prisma.productEnquiry.create({
    data: {
      productId: product.id,
      userId: req.user?.id || null,
      name: name.trim(),
      phone: cleanPhone,
      email: email ? String(email).trim().toLowerCase() : null,
      message: message ? String(message).trim() : null,
      status: 'PENDING'
    },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          price: true,
          unit: true,
          category: { select: { name: true } }
        }
      }
    }
  });

  res.status(201).json({
    success: true,
    message: 'Your inquiry has been submitted! Our specialist will contact you shortly.',
    data: enquiry
  });
});

