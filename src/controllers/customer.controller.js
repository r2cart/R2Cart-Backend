import {prisma} from '../config/prisma.js';
import {AppError,asyncHandler,created,ok} from '../utils/response.js';
import {orderDto,orderNumber,productDto,ticketNumber} from '../utils/order.js';
import {calculateCart,resolveDeliveryRules} from '../services/pricing.service.js';
import {sendSupportTicketEmail} from '../services/mail.service.js';
import {notifyAdminsNewOrder,notifyCustomerOrderPlaced,notifyCustomerOrderStatusUpdate} from '../services/notification.service.js';
import {sendFcmToAdminsNewOrder,sendFcmToCustomerOrderPlaced,sendFcmToCustomerStatusUpdate} from '../services/fcm.service.js';
import {logAudit} from '../services/audit.service.js';
import {getAvailableCustomerSlots} from './admin-scheduling.controller.js';
import {consumeFifoBatches, reverseFifoAllocations} from '../services/fifo.service.js';
import {invalidateAdminDashboard, invalidateProducts} from '../services/cache.service.js';
const profileDto=user=>({id:user.id,name:user.name,email:user.email,mobile:user.mobile,role:user.role,status:user.status});
export const profile={get:asyncHandler(async(req,res)=>ok(res,profileDto(req.user))),update:asyncHandler(async(req,res)=>{const name=String(req.body.name||'').trim(),mobile=String(req.body.mobile||'').replace(/\D/g,'');if(name.length<2)throw new AppError('Enter a valid full name',422);if(!/^\d{10}$/.test(mobile))throw new AppError('Enter a valid 10-digit mobile number',422);const existing=await prisma.user.findFirst({where:{mobile,id:{not:req.user.id}}});if(existing)throw new AppError('This mobile number is already linked to another account',409);ok(res,profileDto(await prisma.user.update({where:{id:req.user.id},data:{name,mobile}})),'Profile updated')})};
const verifyDeliveryArea=area=>resolveDeliveryRules(prisma,area);
const ALLOWED_ADDRESS_FIELDS = [
  'name',
  'mobile',
  'house',
  'street',
  'landmark',
  'area',
  'city',
  'district',
  'state',
  'pin',
  'type',
  'isDefault'
];

function pickAddressFields(source = {}, isUpdate = false) {
  const result = {};
  for (const field of ALLOWED_ADDRESS_FIELDS) {
    if (source[field] !== undefined) {
      if (typeof source[field] === 'string') {
        result[field] = source[field].trim();
      } else {
        result[field] = source[field];
      }
    }
  }

  if (result.mobile !== undefined) {
    result.mobile = String(result.mobile).replace(/\D/g, '');
  }
  if (result.isDefault !== undefined) {
    result.isDefault = Boolean(result.isDefault);
  }
  if (!isUpdate) {
    result.city = result.city || 'Hathua';
    result.state = result.state || 'Bihar';
    result.type = result.type || 'Home';
    result.house = result.house || '';
    result.street = result.street || '';
    result.landmark = result.landmark || '';
    result.district = result.district || '';
    result.pin = result.pin || '';
  }
  return result;
}

export const addresses = {
  list: asyncHandler(async (req, res) => {
    const rows = await prisma.address.findMany({
      where: { userId: req.user.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }]
    });
    ok(res, rows);
  }),

  create: asyncHandler(async (req, res) => {
    const data = pickAddressFields(req.body, false);
    if (!data.name || data.name.length < 2) {
      throw new AppError('Enter a valid full name (at least 2 characters)', 422);
    }
    if (!data.mobile || data.mobile.length < 10) {
      throw new AppError('Enter a valid 10-digit mobile number', 422);
    }
    if (!data.area) {
      throw new AppError('Area / village is required', 422);
    }

    await verifyDeliveryArea(data.area);

    if (data.isDefault) {
      await prisma.address.updateMany({
        where: { userId: req.user.id },
        data: { isDefault: false }
      });
    }

    const createdAddress = await prisma.address.create({
      data: {
        ...data,
        userId: req.user.id
      }
    });

    created(res, createdAddress, 'Address saved');
  }),

  update: asyncHandler(async (req, res) => {
    const existing = await prisma.address.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!existing) {
      throw new AppError('Address not found', 404);
    }

    const data = pickAddressFields(req.body, true);
    if (Object.keys(data).length === 0) {
      throw new AppError('No valid address fields to update', 400);
    }

    if (data.name !== undefined && data.name.length < 2) {
      throw new AppError('Enter a valid full name (at least 2 characters)', 422);
    }
    if (data.mobile !== undefined && data.mobile.length < 10) {
      throw new AppError('Enter a valid 10-digit mobile number', 422);
    }
    if (data.area !== undefined) {
      await verifyDeliveryArea(data.area);
    }

    if (data.isDefault) {
      await prisma.address.updateMany({
        where: { userId: req.user.id },
        data: { isDefault: false }
      });
    }

    try {
      const updatedAddress = await prisma.address.update({
        where: { id: existing.id },
        data
      });
      ok(res, updatedAddress, 'Address updated');
    } catch (err) {
      if (err.code === 'P2025') {
        throw new AppError('Address not found', 404);
      }
      throw err;
    }
  }),

  remove: asyncHandler(async (req, res) => {
    const existing = await prisma.address.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!existing) {
      throw new AppError('Address not found', 404);
    }

    try {
      await prisma.address.delete({
        where: { id: existing.id }
      });
      ok(res, null, 'Address deleted');
    } catch (err) {
      if (err.code === 'P2025') {
        throw new AppError('Address not found', 404);
      }
      throw err;
    }
  }),

  makeDefault: asyncHandler(async (req, res) => {
    const existing = await prisma.address.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!existing) {
      throw new AppError('Address not found', 404);
    }

    try {
      await prisma.$transaction([
        prisma.address.updateMany({ where: { userId: req.user.id }, data: { isDefault: false } }),
        prisma.address.update({ where: { id: existing.id }, data: { isDefault: true } })
      ]);
      ok(res, null, 'Default address updated');
    } catch (err) {
      if (err.code === 'P2025') {
        throw new AppError('Address not found', 404);
      }
      throw err;
    }
  })
};
export const favorites={list:asyncHandler(async(req,res)=>{const rows=await prisma.favorite.findMany({where:{userId:req.user.id},include:{product:{include:{category:true,images:true}}}});ok(res,rows.map(x=>productDto(x.product)))}),add:asyncHandler(async(req,res)=>{await prisma.favorite.upsert({where:{userId_productId:{userId:req.user.id,productId:req.params.productId}},update:{},create:{userId:req.user.id,productId:req.params.productId}});ok(res,null,'Added to favourites')}),remove:asyncHandler(async(req,res)=>{await prisma.favorite.deleteMany({where:{userId:req.user.id,productId:req.params.productId}});ok(res,null,'Removed from favourites')})};
async function cartData(userId){const cart=await prisma.cart.findUnique({where:{userId},include:{items:{include:{product:{include:{category:true,images:true}}}}}});const items=(cart?.items||[]).map(i=>({...productDto(i.product),qty:i.quantity}));return{items,cart:Object.fromEntries(items.map(i=>[i.id,i.qty])),subtotal:items.reduce((s,p)=>s+p.price*p.qty,0),mrpTotal:items.reduce((s,p)=>s+p.mrp*p.qty,0)}}
export const cart={get:asyncHandler(async(req,res)=>ok(res,await cartData(req.user.id))),set:asyncHandler(async(req,res)=>{if(req.body.quantity>0){const [product,setting]=await Promise.all([prisma.product.findUnique({where:{id:req.body.productId},include:{category:true}}),prisma.storeSetting.findUnique({where:{id:1},select:{policies:true}})]);if(!product||product.deletedAt||product.status!=='ACTIVE')throw new AppError('This pack is unavailable',409);const comingSoon=setting?.policies?.homeLayout?.comingSoonCategories||[];if(product.category?.slug&&comingSoon.includes(product.category.slug)){throw new AppError(`"${product.name}" belongs to "${product.category.name}" which is coming soon and cannot be ordered yet.`,400);}if(product.stock<=0)throw new AppError(`${product.name} is currently out of stock`,409);if(product.stock<req.body.quantity)throw new AppError(`Only ${product.stock} remaining in stock`,409)}const c=await prisma.cart.upsert({where:{userId:req.user.id},update:{},create:{userId:req.user.id}});if(req.body.quantity===0)await prisma.cartItem.deleteMany({where:{cartId:c.id,productId:req.body.productId}});else await prisma.cartItem.upsert({where:{cartId_productId:{cartId:c.id,productId:req.body.productId}},update:{quantity:req.body.quantity},create:{cartId:c.id,productId:req.body.productId,quantity:req.body.quantity}});ok(res,await cartData(req.user.id),'Cart updated')}),clear:asyncHandler(async(req,res)=>{const c=await prisma.cart.findUnique({where:{userId:req.user.id}});if(c)await prisma.cartItem.deleteMany({where:{cartId:c.id}});ok(res,null,'Cart cleared')})};
export const searchHistory={list:asyncHandler(async(req,res)=>{const rows=await prisma.searchHistory.findMany({where:{userId:req.user.id},orderBy:{createdAt:'desc'},take:20});const unique=[...new Map(rows.map(row=>[row.query.toLowerCase(),row.query])).values()].slice(0,8);ok(res,unique)}),add:asyncHandler(async(req,res)=>{const query=req.body.query.trim();await prisma.$transaction(async tx=>{await tx.searchHistory.deleteMany({where:{userId:req.user.id,query}});await tx.searchHistory.create({data:{userId:req.user.id,query}});const stale=await tx.searchHistory.findMany({where:{userId:req.user.id},orderBy:{createdAt:'desc'},skip:20,select:{id:true}});if(stale.length)await tx.searchHistory.deleteMany({where:{id:{in:stale.map(row=>row.id)}}})});ok(res,{query},'Search saved')}),remove:asyncHandler(async(req,res)=>{const query=decodeURIComponent(req.params.query).trim();await prisma.searchHistory.deleteMany({where:{userId:req.user.id,query}});ok(res,null,'Search removed')}),clear:asyncHandler(async(req,res)=>{await prisma.searchHistory.deleteMany({where:{userId:req.user.id}});ok(res,null,'Search history cleared')})};
export const couponValidate=asyncHandler(async(req,res)=>{const totals=await prisma.$transaction(tx=>calculateCart(tx,req.user.id,req.body.code));ok(res,{code:totals.coupon.code,discount:totals.couponDiscount,grandTotal:totals.grandTotal},'Coupon applied')});
export const coupons=asyncHandler(async(req,res)=>{const now=new Date();const rows=await prisma.coupon.findMany({include:{usages:{where:{userId:req.user.id},select:{id:true}}},orderBy:{createdAt:'desc'}});ok(res,rows.map(({usages,...coupon})=>({...coupon,discount:Number(coupon.discount),minimumOrder:Number(coupon.minimumOrder),maximumDiscount:coupon.maximumDiscount===null?null:Number(coupon.maximumDiscount),displayStatus:coupon.status!=='ACTIVE'?'Inactive':coupon.startsAt>now?'Upcoming':coupon.expiresAt<now?'Expired':coupon.usageLimit!==null&&coupon.usageCount>=coupon.usageLimit?'Not eligible':usages.length>=coupon.perUserLimit?'Not eligible':'Available'})))});
import {resolveEffectiveStoreSchedule} from '../services/store-operations.service.js';

export const checkout=asyncHandler(async(req,res)=>{
  const addressId=req.body.addressId?String(req.body.addressId).trim():'';
  if(!addressId||addressId==='undefined')throw new AppError('Delivery address is required',422);
  const deliveryType=req.body.deliveryType==='SCHEDULED'?'SCHEDULED':'INSTANT';
  const deliveryDate=req.body.deliveryDate?String(req.body.deliveryDate).trim():null;
  const deliverySlot=req.body.deliverySlot?String(req.body.deliverySlot).trim():null;

  // Resolve Store Schedule & Operational Status
  const storeSchedule=await resolveEffectiveStoreSchedule();

  if(storeSchedule.storeStatus==='EMERGENCY_PAUSED'){
    throw new AppError(storeSchedule.statusReason||'Store orders are temporarily paused.',423);
  }

  if(deliveryType==='INSTANT'){
    if(!storeSchedule.allowImmediateOrders){
      const errStatus=storeSchedule.ruleSource==='EMERGENCY'?423:422;
      throw new AppError(storeSchedule.statusReason||'Store is currently closed. You can schedule your order for the next available delivery slot.',errStatus);
    }
  }

  if(deliveryType==='SCHEDULED'){
    if(!storeSchedule.allowScheduledOrders){
      const errStatus=storeSchedule.ruleSource==='EMERGENCY'?423:422;
      throw new AppError(storeSchedule.statusReason||'Scheduled deliveries are temporarily unavailable.',errStatus);
    }
    if(!deliveryDate||!deliverySlot)throw new AppError('Delivery date and time slot are required for scheduled delivery',422);
    
    // Validate that deliveryDate is within advance booking window
    const storeSetting = await prisma.storeSetting.findUnique({ where: { id: 1 }, select: { advanceBookingDays: true } });
    const maxAdvance = Math.max(1, storeSetting?.advanceBookingDays || 4);
    const kolkataNow = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const [curD, curM, curY] = kolkataNow.split('/');
    const todayYmd = `${curY}-${curM}-${curD}`;
    const [tY, tM, tD] = todayYmd.split('-').map(Number);
    const [dY, dM, dD] = deliveryDate.split('-').map(Number);
    const diffDays = Math.round((new Date(dY, dM - 1, dD) - new Date(tY, tM - 1, tD)) / 86400000);
    if (diffDays < 0 || diffDays >= maxAdvance) {
      throw new AppError(`Delivery date is outside the allowed booking window (Max ${maxAdvance} days in advance)`, 422);
    }

    // Check if target scheduled date is a store closure / holiday
    const targetSchedule=await resolveEffectiveStoreSchedule({targetDateStr:deliveryDate});
    if(targetSchedule.effectiveHours.isClosedDay){
      throw new AppError(targetSchedule.statusReason||`Deliveries are closed on ${deliveryDate}`,422);
    }

    const slots=await getAvailableCustomerSlots(deliveryDate);
    const matched=slots.find(s=>s.label===deliverySlot||s.id===deliverySlot);
    if(!matched)throw new AppError('The selected delivery slot is not active',422);
    if(matched.isOutOfWindow)throw new AppError(`The selected delivery date is outside the advance booking window`,422);
    if(matched.isCutoffPassed)throw new AppError(`The cutoff time for "${matched.label}" has passed for today`,422);
    if(matched.isFull)throw new AppError(`The slot "${matched.label}" is fully booked (${matched.maxOrders} orders max). Please choose another slot.`,422);
    if(!matched.isAvailable)throw new AppError(`The slot "${matched.label}" is not available`,422);
  }

  const address=await prisma.address.findFirst({where:{id:addressId,userId:req.user.id}});
  if(!address)throw new AppError('Delivery address not found',404);

  const rules=await resolveDeliveryRules(prisma,address.area);

  if (storeSchedule.isEmergencyActive) {
    const em = storeSchedule.emergencyDetails;
    if (em?.type === 'ALL_ORDERS' || em?.type === 'STORE_CLOSE') {
      throw new AppError(em.message || 'Store orders are temporarily paused.', 423);
    }
    if (em?.type === 'SELECTED_AREAS') {
      const affected = (Array.isArray(em.affectedVillageIds) ? em.affectedVillageIds : []).map(x => String(x).trim().toLowerCase());
      const addrArea = String(address.area || '').trim().toLowerCase();
      const vName = String(rules.villageName || '').trim().toLowerCase();
      const vId = String(rules.villageId || '').trim().toLowerCase();
      const zId = String(rules.zoneId || '').trim().toLowerCase();

      if (affected.includes(addrArea) || affected.includes(vName) || affected.includes(vId) || affected.includes(zId)) {
        throw new AppError(em.message || `Deliveries to ${rules.villageName || address.area} are temporarily suspended.`, 423);
      }
    }
  }

  if(req.body.paymentMethod==='COD'&&rules.allowCod===false){
    throw new AppError(`Cash on Delivery is currently unavailable for ${rules.villageName||address.area}.`,422);
  }

  // If active items sent from client checkout, sync database cart to eliminate any stale ghost items
  if (Array.isArray(req.body.items) && req.body.items.length > 0) {
    const userCart = await prisma.cart.upsert({
      where: { userId: req.user.id },
      update: {},
      create: { userId: req.user.id }
    });
    await prisma.cartItem.deleteMany({ where: { cartId: userCart.id } });
    for (const itm of req.body.items) {
      if (itm.productId && Number(itm.quantity) > 0) {
        await prisma.cartItem.create({
          data: {
            cartId: userCart.id,
            productId: itm.productId,
            quantity: Number(itm.quantity)
          }
        }).catch(() => {});
      }
    }
  }

  const addressSnapshot={id:address.id,name:address.name,fullName:address.name,mobile:address.mobile,house:address.house,street:address.street||'',landmark:address.landmark||'',area:address.area,villageName:rules.villageName||address.area,villageId:rules.villageId||rules.zoneId||null,city:address.city,district:address.district||'',state:address.state||'',pin:address.pin||'',pincode:address.pin||'',type:address.type||'Home',deliveryZone:{id:rules.villageId||rules.zoneId,name:rules.villageName||rules.zoneName,estimatedDelivery:rules.estimatedDelivery}};
  const result = await prisma.$transaction(async tx => {
    const t = await calculateCart(tx, req.user.id, req.body.couponCode, rules);
    const order = await tx.order.create({
      data: {
        orderNumber: orderNumber(),
        userId: req.user.id,
        couponId: t.coupon?.id || null,
        status: 'NEW',
        paymentMethod: 'COD',
        paymentStatus: 'PENDING',
        itemTotal: t.itemTotal,
        productDiscount: t.productDiscount,
        couponDiscount: t.couponDiscount,
        deliveryFee: t.deliveryFee,
        handlingFee: t.handlingFee,
        grandTotal: t.grandTotal,
        addressSnapshot,
        deliveryInstruction: req.body.deliveryInstruction || null,
        deliveryType,
        deliveryDate,
        deliverySlot,
        items: {
          create: t.cart.items.map(i => ({
            productId: i.productId,
            name: i.product.name,
            sku: i.product.sku,
            unit: i.product.unit,
            image: i.product.images[0]?.url || null,
            mrp: i.product.mrp,
            price: i.product.price,
            costPrice: i.product.costPrice || 0,
            quantity: i.quantity
          }))
        },
        history: {
          create: {
            status: 'NEW',
            note: deliveryType === 'SCHEDULED' ? `Order placed (Scheduled for ${deliveryDate}, ${deliverySlot})` : 'Order placed'
          }
        },
        payment: {
          create: {
            method: 'COD',
            status: 'PENDING',
            amount: t.grandTotal
          }
        }
      },
      include: { items: true, history: true }
    });

    // Deterministic item order by productId to prevent deadlocks across concurrent checkouts
    const sortedItems = [...t.cart.items].sort((a, b) => String(a.productId).localeCompare(String(b.productId)));

    for (const item of sortedItems) {
      const qty = Number(item.quantity);
      if (qty <= 0) continue;

      // Atomic conditional decrement — locks row and fails immediately if stock < qty (prevents oversell race condition)
      const updateResult = await tx.product.updateMany({
        where: {
          id: item.productId,
          stock: { gte: qty },
          deletedAt: null
        },
        data: {
          stock: { decrement: qty }
        }
      });

      if (updateResult.count === 0) {
        const current = await tx.product.findUnique({
          where: { id: item.productId },
          select: { id: true, name: true, stock: true }
        });
        throw new AppError(
          `Insufficient stock for ${current?.name || item.product?.name || 'item'}. Only ${current?.stock || 0} remaining.`,
          409
        );
      }

      const updatedProduct = await tx.product.findUnique({
        where: { id: item.productId },
        select: { stock: true }
      });
      const newStock = updatedProduct?.stock ?? 0;
      const previousStock = newStock + qty;

      if (tx.inventoryLog?.create) {
        await tx.inventoryLog.create({
          data: {
            productId: item.productId,
            type: 'ORDER_DEDUCT',
            previousStock,
            newStock,
            quantityDiff: -qty,
            reason: `Order placed #${order.orderNumber}`,
            orderId: order.id
          }
        });
      }
    }

    try {
      await consumeFifoBatches(tx, { orderId: order.id, orderNumber: order.orderNumber, items: t.cart.items });
    } catch (fifoErr) {
      console.error('[FIFO] Non-fatal FIFO allocation error on order', order.orderNumber, ':', fifoErr?.message);
    }

    if (t.coupon) {
      const willExhaust = t.coupon.usageLimit !== null && (t.coupon.usageCount + 1) >= t.coupon.usageLimit;
      await tx.coupon.update({
        where: { id: t.coupon.id },
        data: { usageCount: { increment: 1 }, ...(willExhaust ? { status: 'INACTIVE' } : {}) }
      });
      await tx.couponUsage.create({
        data: { couponId: t.coupon.id, userId: req.user.id, orderId: order.id }
      });
    }

    await tx.cartItem.deleteMany({ where: { cartId: t.cart.id } });
    return order;
  }, { maxWait: 15000, timeout: 30000 });created(res,orderDto(result),'Order placed successfully');invalidateAdminDashboard();invalidateProducts();notifyAdminsNewOrder(result).catch(e=>console.error('Admin order push error:',e.message));notifyCustomerOrderPlaced(result).catch(e=>console.error('Customer order push error:',e.message));sendFcmToAdminsNewOrder(result).catch(e=>console.error('Admin FCM order push error:',e.message));sendFcmToCustomerOrderPlaced(result).catch(e=>console.error('Customer FCM order push error:',e.message))});
export const orders={
  list:asyncHandler(async(req,res)=>{
    const rows=await prisma.order.findMany({
      where:{userId:req.user.id},
      include:{
        items:true,
        history:{orderBy:{createdAt:'asc'}},
        deliveryAssignments:{
          orderBy:{createdAt:'desc'},
          include:{
            deliveryPerson:{select:{id:true,name:true,mobile:true,vehicleType:true,vehicleNumber:true}},
            proofs:{select:{id:true,cloudinaryUrl:true,cloudinaryPublicId:true,recipientName:true,recipientPhone:true,notes:true,createdAt:true}}
          }
        }
      },
      orderBy:{createdAt:'desc'}
    });
    ok(res,rows.map(orderDto));
  }),
  get:asyncHandler(async(req,res)=>{
    const row=await prisma.order.findFirst({
      where:{OR:[{id:req.params.id},{orderNumber:req.params.id}],userId:req.user.id},
      include:{
        items:true,
        history:{orderBy:{createdAt:'asc'}},
        payment:true,
        deliveryAssignments:{
          orderBy:{createdAt:'desc'},
          include:{
            deliveryPerson:{select:{id:true,name:true,mobile:true,vehicleType:true,vehicleNumber:true}},
            proofs:{select:{id:true,cloudinaryUrl:true,cloudinaryPublicId:true,recipientName:true,recipientPhone:true,notes:true,createdAt:true}}
          }
        }
      }
    });
    if(!row)throw new AppError('Order not found',404);
    ok(res,orderDto(row));
  }),
  cancel:asyncHandler(async(req,res)=>{
    const reason=String(req.body?.reason||'').trim()||'Cancelled by customer';
    const orderId=req.params.id;
    const row=await prisma.$transaction(async tx=>{
      const current=await tx.order.findFirst({
        where:{OR:[{id:orderId},{orderNumber:orderId}],userId:req.user.id},
        include:{items:true,history:true,payment:true}
      });
      if(!current)throw new AppError('Order not found',404);
      if(current.status==='CANCELLED')throw new AppError('This order is already cancelled',409);
      if(['OUT_FOR_DELIVERY','DELIVERED'].includes(current.status)){
        throw new AppError('Order cannot be cancelled once it is out for delivery',409);
      }
      if(!['NEW','CONFIRMED','PACKING'].includes(current.status)){
        throw new AppError(`Cannot cancel order in status ${current.status}`,409);
      }
      const changed=await tx.order.updateMany({
        where:{id:current.id,status:current.status},
        data:{status:'CANCELLED'}
      });
      if(changed.count!==1)throw new AppError('Order status changed in another session. Refresh and retry.',409);
      for(const item of current.items){
        let prevStock=0;
        if(typeof tx.product.findUnique==='function'){
          const prod=await tx.product.findUnique({where:{id:item.productId},select:{stock:true}});
          prevStock=prod?.stock||0;
        }
        await tx.product.update({where:{id:item.productId},data:{stock:{increment:item.quantity}}});
        if(tx.inventoryLog?.create){
          await tx.inventoryLog.create({
            data:{
              productId:item.productId,
              type:'ORDER_RESTORE',
              previousStock:prevStock,
              newStock:prevStock+item.quantity,
              quantityDiff:item.quantity,
              reason:`Customer cancellation #${current.orderNumber}: ${reason}`,
              orderId:current.id,
              adminId:null,
              adminName:req.user.name||'Customer'
            }
          });
        }
      }
      await reverseFifoAllocations(tx, { orderId: current.id, reason: `Customer cancellation #${current.orderNumber}: ${reason}` });
      await tx.orderStatusHistory.create({
        data:{
          orderId:current.id,
          status:'CANCELLED',
          note:`Cancelled by customer: ${reason}`
        }
      });
      return tx.order.findUnique({
        where:{id:current.id},
        include:{items:true,history:true,payment:true}
      });
    });
    ok(res,orderDto(row),'Order cancelled successfully');
    invalidateAdminDashboard();
    invalidateProducts();
    logAudit(req,{
      module:'ORDERS',
      action:'ORDER_CANCELLED_BY_CUSTOMER',
      resourceId:row.id,
      resourceName:`#${row.orderNumber}`,
      details:{orderNumber:row.orderNumber,reason,totalAmount:Number(row.grandTotal)}
    });
    notifyCustomerOrderStatusUpdate(row,'CANCELLED',reason).catch(e=>console.error('Customer status push error:',e.message));
    sendFcmToCustomerStatusUpdate(row,'CANCELLED',reason).catch(e=>console.error('Customer FCM status push error:',e.message));
  }),
  updateDetails: asyncHandler(async (req, res) => {
    const orderId = req.params.id;
    const {
      name,
      mobile,
      house,
      street,
      landmark,
      area,
      city,
      pin,
      deliveryInstruction,
      deliveryDate,
      deliverySlot,
      updateSavedAddress
    } = req.body;

    const row = await prisma.$transaction(async tx => {
      const current = await tx.order.findFirst({
        where: {
          OR: [{ id: orderId }, { orderNumber: orderId }],
          userId: req.user.id
        },
        include: { items: true, history: true, payment: true }
      });

      if (!current) throw new AppError('Order not found', 404);

      if (['OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'].includes(current.status)) {
        throw new AppError('Order cannot be modified once it is out for delivery, delivered, or cancelled', 409);
      }
      if (!['NEW', 'CONFIRMED', 'PACKING'].includes(current.status)) {
        throw new AppError(`Cannot modify order in status ${current.status}`, 409);
      }

      let snap = current.addressSnapshot;
      if (typeof snap === 'string') {
        try { snap = JSON.parse(snap); } catch { snap = {}; }
      }
      snap = snap || {};

      const trimmedName = String(name || snap.fullName || snap.name || req.user.name || '').trim();
      const cleanMobile = String(mobile || snap.mobile || req.user.mobile || '').replace(/\D/g, '');
      const trimmedHouse = String(house || snap.house || snap.street || 'Address on file').trim();
      const trimmedArea = String(area || snap.area || snap.villageName || 'Hathua').trim();
      const trimmedCity = String(city || snap.city || 'Hathua').trim();

      if (trimmedName.length < 2) {
        throw new AppError('Enter a valid recipient name (at least 2 characters)', 422);
      }
      if (cleanMobile.length < 7) {
        throw new AppError('Enter a valid mobile number', 422);
      }

      let rules = null;
      try {
        rules = await resolveDeliveryRules(prisma, trimmedArea);
      } catch {}

      const newSnapshot = {
        id: snap.id || null,
        name: trimmedName,
        fullName: trimmedName,
        mobile: cleanMobile,
        house: trimmedHouse,
        street: String(street || '').trim(),
        landmark: String(landmark || '').trim(),
        area: trimmedArea,
        villageName: rules?.villageName || trimmedArea,
        villageId: rules?.villageId || rules?.zoneId || snap.villageId || null,
        city: trimmedCity,
        pin: String(pin || '').trim(),
        pincode: String(pin || '').trim(),
        district: String(snap.district || '').trim(),
        state: String(snap.state || 'Bihar').trim(),
        type: snap.type || 'Home',
        deliveryZone: rules ? {
          id: rules.villageId || rules.zoneId,
          name: rules.villageName || rules.zoneName,
          estimatedDelivery: rules.estimatedDelivery
        } : (snap.deliveryZone || null)
      };

      let newDate = current.deliveryDate;
      let newSlot = current.deliverySlot;
      if (current.deliveryType === 'SCHEDULED' && deliveryDate) {
        newDate = String(deliveryDate).trim();
        if (deliverySlot) newSlot = String(deliverySlot).trim();
      }

      const changed = await tx.order.updateMany({
        where: { id: current.id, status: current.status },
        data: {
          addressSnapshot: newSnapshot,
          deliveryInstruction: typeof deliveryInstruction === 'string' ? deliveryInstruction.trim() : current.deliveryInstruction,
          ...(current.deliveryType === 'SCHEDULED' && {
            deliveryDate: newDate,
            deliverySlot: newSlot
          })
        }
      });

      if (changed.count !== 1) {
        throw new AppError('Order status changed in another session. Refresh and retry.', 409);
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId: current.id,
          status: current.status,
          note: `Delivery details updated by customer (Name: ${newSnapshot.name}, Mobile: +91 ${newSnapshot.mobile}, Address: ${newSnapshot.house}, ${newSnapshot.area})`
        }
      });

      if (updateSavedAddress && snap.id) {
        await tx.address.updateMany({
          where: { id: snap.id, userId: req.user.id },
          data: {
            name: newSnapshot.name,
            mobile: newSnapshot.mobile,
            house: newSnapshot.house,
            street: newSnapshot.street,
            landmark: newSnapshot.landmark,
            area: newSnapshot.area,
            city: newSnapshot.city,
            pin: newSnapshot.pin
          }
        }).catch(() => {});
      }

      return tx.order.findUnique({
        where: { id: current.id },
        include: { items: true, history: true, payment: true }
      });
    });

    ok(res, orderDto(row), 'Order delivery details updated successfully');

    logAudit(req, {
      module: 'ORDERS',
      action: 'ORDER_DETAILS_UPDATED_BY_CUSTOMER',
      resourceId: row.id,
      resourceName: `#${row.orderNumber}`,
      details: {
        orderNumber: row.orderNumber,
        updatedRecipient: row.customer,
        updatedMobile: row.mobile,
        area: trimmedArea
      }
    });
  })
};
export const support={
 list:asyncHandler(async(req,res)=>ok(res,await prisma.supportTicket.findMany({where:{userId:req.user.id},include:{messages:{orderBy:{createdAt:'asc'}}},orderBy:{createdAt:'desc'}}))),
 create:asyncHandler(async(req,res)=>{
  if(req.body.orderId){
   const order=await prisma.order.findFirst({where:{id:req.body.orderId,userId:req.user.id},select:{id:true}});
   if(!order)throw new AppError('Related order not found',404);
  }
  const mobile=String(req.body.mobile||req.body.phone||'').trim();
  if(mobile&&!req.user.mobile){
   await prisma.user.update({where:{id:req.user.id},data:{mobile}}).catch(()=>{});
  }
  const desc=String(req.body.description||'').trim();
  const description=mobile?`${desc}\n\n[Contact Mobile: ${mobile}]`:desc;
  const ticket=await prisma.supportTicket.create({
   data:{
    ticketNumber:ticketNumber(),
    userId:req.user.id,
    orderId:req.body.orderId||null,
    issueType:req.body.issueType,
    subject:req.body.subject,
    description
   }
  });
  let emailNotificationSent=false;
  try{
   emailNotificationSent=await sendSupportTicketEmail({...ticket,customer:req.user});
  }catch(error){
   console.error(`Support notification failed for ${ticket.ticketNumber}:`,error.message);
  }
  created(res,{...ticket,emailNotificationSent},'Ticket submitted');
 })
};
