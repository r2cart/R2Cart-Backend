import {prisma} from '../config/prisma.js';
import {catalogRepository} from '../repositories/catalog.repository.js';
import {AppError,asyncHandler,created,ok} from '../utils/response.js';
import {productDto,ticketNumber} from '../utils/order.js';
import {sendContactInquiryEmail} from '../services/mail.service.js';
import {getAvailableCustomerSlots} from './admin-scheduling.controller.js';
import {resolveEffectiveStoreSchedule} from '../services/store-operations.service.js';
import {smartSearchProducts} from '../services/search.service.js';
export const categories=asyncHandler(async(req,res)=>ok(res,await catalogRepository.categories()));
export const banners=asyncHandler(async(req,res)=>ok(res,await catalogRepository.banners()));
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
  const page=Math.max(1,parseInt(req.query.page,10)||1),limit=Math.min(50,Math.max(1,parseInt(req.query.limit,10)||20));
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
  const setting=await prisma.storeSetting?.findUnique?.({where:{id:1},select:{autoHideOutOfStock:true}});
  const hideOos=Boolean(setting?.autoHideOutOfStock);
  // Inactive products are available only through authenticated admin endpoints.
  const where={deletedAt:null,status:'ACTIVE',...(req.query.category&&{category:{slug:req.query.category}}),...((req.query.available==='true'||hideOos)&&{stock:{gt:0}})};
  const orderBy=req.query.sort==='low'?{price:'asc'}:req.query.sort==='high'?{price:'desc'}:req.query.sort==='discount'?{featured:'desc'}:{bestSeller:'desc'};
  const include={category:true,ratings:true,images:{orderBy:{position:'asc'}}};
  const [rows,total]=await Promise.all([prisma.product.findMany({where,include,orderBy,skip:(page-1)*limit,take:limit}),prisma.product.count({where})]);
  const groups=[...new Set(rows.map(row=>row.variantGroupId).filter(Boolean))];
  const packs=groups.length?await prisma.product.findMany({where:{deletedAt:null,status:'ACTIVE',variantGroupId:{in:groups}},include,orderBy:{price:'asc'}}):[];
  ok(res,rows.map(row=>({...productDto(row),variants:row.variantGroupId?packs.filter(pack=>pack.variantGroupId===row.variantGroupId).map(productDto):[]})),'Products fetched',{page,limit,total,pages:Math.ceil(total/limit)});
});
export const product=asyncHandler(async(req,res)=>{const row=await catalogRepository.product(req.params.id);if(!row)throw new AppError('Product not found',404);ok(res,productDto(row))});
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
  const [areas,villages,settings]=await Promise.all([
    prisma.deliveryArea.findMany({where:{status:'ACTIVE'}}),
    prisma.deliveryVillage.findMany({where:{status:'ACTIVE'}}),
    prisma.storeSetting.findUnique({where:{id:1}})
  ]);

  const activeVillages=villages.filter(v=>!v.isPaused).map(v=>{
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
      isVillage:true
    };
  });

  const activeAreas=areas.filter(a=>!a.isPaused).map(a=>({
    id:a.id,
    name:a.name,
    localities:Array.isArray(a.pincodes)?a.pincodes:[],
    deliveryFee:Number(a.deliveryFee),
    minimumOrder:Number(a.minimumOrder),
    freeDeliveryThreshold:Number(a.freeDeliveryThreshold),
    estimatedMinutes:a.estimatedMinutes,
    radiusKm:Number(a.radiusKm||settings?.globalDeliveryRadius||5),
    isVillage:false
  }));

  ok(res,{
    villages:activeVillages,
    areas:activeAreas,
    globalRadius:Number(settings?.globalDeliveryRadius||5.0),
    minimumOrder:Number(settings?.minimumOrder||0),
    deliveryFee:Number(settings?.deliveryFee||0),
    freeDeliveryThreshold:Number(settings?.freeDeliveryThreshold||0),
    estimatedDelivery:settings?.estimatedDelivery||'15-30 minutes'
  });
});
export const deliverySlots=asyncHandler(async(req,res)=>ok(res,await getAvailableCustomerSlots(req.query.date)));
export const settings=asyncHandler(async(req,res)=>{
  const [setting, effectiveStatus] = await Promise.all([
    prisma.storeSetting.findUnique({where:{id:1}}),
    resolveEffectiveStoreSchedule()
  ]);
  ok(res, {
    ...(setting || {}),
    effectiveStatus
  });
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

