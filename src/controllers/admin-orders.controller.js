import {prisma} from '../config/prisma.js';
import {AppError,asyncHandler,ok} from '../utils/response.js';
import {orderDto} from '../utils/order.js';
import {notifyCustomerOrderStatusUpdate} from '../services/notification.service.js';
import {sendFcmToCustomerStatusUpdate} from '../services/fcm.service.js';
import {logAudit} from '../services/audit.service.js';
import {reverseFifoAllocations} from '../services/fifo.service.js';
import {invalidateAdminDashboard, invalidateProducts} from '../services/cache.service.js';

export const orderStatuses=['NEW','CONFIRMED','PACKING','OUT_FOR_DELIVERY','DELIVERED','CANCELLED'];
export function normalizeOrderStatus(value){const status=String(value||'').trim().toUpperCase().replaceAll(' ','_');if(!orderStatuses.includes(status))throw new AppError('Invalid order status',422);return status}
const include={
  user:{select:{id:true,name:true,email:true,mobile:true}},
  items:true,
  history:{orderBy:{createdAt:'asc'}},
  payment:true,
  coupon:true,
  deliveryAssignments:{
    orderBy:{createdAt:'desc'},
    include:{
      deliveryPerson:{select:{id:true,name:true,mobile:true,vehicleType:true,vehicleNumber:true}},
      proofs:{select:{id:true,cloudinaryUrl:true,cloudinaryPublicId:true,recipientName:true,recipientPhone:true,notes:true,createdAt:true}}
    }
  }
};
const orderDetailsInclude={
  ...include,
  deliveryProofs:{orderBy:{createdAt:'desc'}},
  codCollection:true
};
export const orders={
 list:asyncHandler(async(req,res)=>{
  const where={};
  if(req.query.status && req.query.status !== 'All') {
    where.status = normalizeOrderStatus(req.query.status);
  }
  if(req.query.deliveryType && req.query.deliveryType !== 'ALL') {
    where.deliveryType = String(req.query.deliveryType).trim().toUpperCase();
  }
  if(req.query.q && String(req.query.q).trim()) {
    const q = String(req.query.q).trim();
    where.OR = [
      { orderNumber: { contains: q } },
      { user: { name: { contains: q } } },
      { user: { mobile: { contains: q } } }
    ];
  }
  const page=Math.max(1,parseInt(req.query.page,10)||1),limit=Math.min(100,Math.max(1,parseInt(req.query.limit,10)||20));
  const baseStatusWhere = where.status ? { status: where.status } : {};
  const [rows,total,instantCount,scheduledCount,allCount]=await Promise.all([
    prisma.order.findMany({where,include,orderBy:[{createdAt:'desc'},{id:'asc'}],skip:(page-1)*limit,take:limit}),
    prisma.order.count({where}),
    prisma.order.count({where:{...baseStatusWhere, deliveryType:'INSTANT'}}),
    prisma.order.count({where:{...baseStatusWhere, deliveryType:'SCHEDULED'}}),
    prisma.order.count({where:baseStatusWhere})
  ]);
  ok(res,{orders:rows.map(orderDto),pagination:{page,limit,total,pages:Math.max(1,Math.ceil(total/limit))},counts:{all:allCount,instant:instantCount,scheduled:scheduledCount}});
 }),
 get:asyncHandler(async(req,res)=>{const row=await prisma.order.findFirst({where:{OR:[{id:req.params.id},{orderNumber:req.params.id}]},include:orderDetailsInclude});if(!row)throw new AppError('Order not found',404);ok(res,orderDto(row))}),
 status:asyncHandler(async(req,res)=>{
  const status=normalizeOrderStatus(req.body.status);
  const row=await prisma.$transaction(async tx=>{
   const current=await tx.order.findUnique({where:{id:req.params.id},include:{items:true}});
   if(!current)throw new AppError('Order not found',404);
   if(current.status===status)return tx.order.findUnique({where:{id:current.id},include});
   if(['DELIVERED','CANCELLED'].includes(current.status))throw new AppError('Delivered and cancelled orders cannot be changed',409);
   if(status==='CANCELLED'&&['OUT_FOR_DELIVERY','DELIVERED'].includes(current.status)){
    throw new AppError('Order cannot be cancelled once it is out for delivery',409);
   }
   const changed=await tx.order.updateMany({where:{id:current.id,status:current.status},data:{status}});
   if(changed.count!==1)throw new AppError('Order changed in another session. Refresh and retry.',409);
   if(status==='DELIVERED'){
    await tx.deliveryAssignment.updateMany({
      where:{orderId:current.id,isCurrent:true,deliveredAt:null},
      data:{status:'DELIVERED',deliveredAt:new Date()}
    });
   }
   if(status==='CANCELLED'){
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
        reason:`Order cancelled #${current.orderNumber}`,
        orderId:current.id,
        adminId:req.user?.id||null,
        adminName:req.user?.name||'Admin'
       }
      });
     }
    }
    await reverseFifoAllocations(tx, { orderId: current.id, reason: `Admin cancellation #${current.orderNumber}` });
   }
   await tx.orderStatusHistory.create({data:{orderId:current.id,status,note:String(req.body.note||'').trim()||'Status updated by store admin'}});
   return tx.order.findUnique({where:{id:current.id},include});
  });
  ok(res,orderDto(row),'Order status updated');
  invalidateAdminDashboard();
  if(status==='CANCELLED'){
    invalidateProducts();
  }
  logAudit(req, {
    module: 'ORDERS',
    action: status === 'CANCELLED' ? 'ORDER_CANCELLED' : 'ORDER_STATUS_UPDATE',
    resourceId: row.id,
    resourceName: `#${row.orderNumber}`,
    details: {
      orderNumber: row.orderNumber,
      status,
      totalAmount: Number(row.grandTotal),
      note: req.body.note || null
    }
  });
  notifyCustomerOrderStatusUpdate(row,status,req.body.note).catch(e=>console.error('Customer status push error:',e.message));
  sendFcmToCustomerStatusUpdate(row,status,req.body.note).catch(e=>console.error('Customer FCM status push error:',e.message));
 }),
 modifyItem:asyncHandler(async(req,res)=>{
  const {action='OUT_OF_STOCK',quantity,reason='Out of stock during store packing'}=req.body;
  const orderId=req.params.id;
  const itemId=req.params.itemId;

  const row=await prisma.$transaction(async tx=>{
   const current=await tx.order.findUnique({
    where:{id:orderId},
    include:{items:true,history:true,payment:true,user:true}
   });
   if(!current)throw new AppError('Order not found',404);
   if(['DELIVERED','CANCELLED'].includes(current.status)){
    throw new AppError('Cannot modify items of a finalised (delivered or cancelled) order',409);
   }
   if(current.status==='OUT_FOR_DELIVERY'){
    throw new AppError('Cannot modify items of an order that is out for delivery',409);
   }

   const item=current.items.find(i=>i.id===itemId);
   if(!item)throw new AppError('Order item not found',404);

   let deductedPriceTotal=0;
   let deductedMrpTotal=0;
   let actionNote='';

   if(action==='REDUCE_QUANTITY'){
    const targetQty=Number(quantity);
    if(!Number.isInteger(targetQty)||targetQty<1||targetQty>=item.quantity){
     throw new AppError(`Quantity must be between 1 and ${item.quantity-1}`,422);
    }
    const diff=item.quantity-targetQty;
    deductedPriceTotal=Number(item.price)*diff;
    deductedMrpTotal=Number(item.mrp)*diff;
    await tx.orderItem.update({
     where:{id:item.id},
     data:{quantity:targetQty}
    });
    actionNote=`[ITEM REDUCED] '${item.name} (${item.unit})' qty changed from ${item.quantity} to ${targetQty} (-₹${deductedPriceTotal}).`;
   }else{
    deductedPriceTotal=Number(item.price)*item.quantity;
    deductedMrpTotal=Number(item.mrp)*item.quantity;
    await tx.orderItem.delete({
     where:{id:item.id}
    });
    actionNote=`[OUT OF STOCK] '${item.name} (${item.unit})' x${item.quantity} marked out of stock (-₹${deductedPriceTotal}).`;
   }

   const remainingItemsCount=current.items.filter(i=>i.id!==item.id).length+(action==='REDUCE_QUANTITY'?1:0);
   const newItemTotal=Math.max(0,Number(current.itemTotal)-deductedPriceTotal);
   const newProductDiscount=Math.max(0,Number(current.productDiscount)-(deductedMrpTotal-deductedPriceTotal));
   const newGrandTotal=Math.max(0,Number(current.grandTotal)-deductedPriceTotal);

   const nextStatus=remainingItemsCount===0?'CANCELLED':current.status;
   const fullNote=`${actionNote} New total: ₹${newGrandTotal}. Reason: ${reason}`;

   await tx.order.update({
    where:{id:current.id},
    data:{
     itemTotal:newItemTotal,
     productDiscount:newProductDiscount,
     grandTotal:newGrandTotal,
     ...(remainingItemsCount===0&&{status:'CANCELLED'})
    }
   });

   if(current.payment){
    await tx.payment.update({
     where:{id:current.payment.id},
     data:{amount:newGrandTotal}
    });
   }

   await tx.orderStatusHistory.create({
    data:{
     orderId:current.id,
     status:nextStatus,
     note:fullNote
    }
   });

   return tx.order.findUnique({
    where:{id:current.id},
    include
   });
  });

  ok(res,orderDto(row),'Order item updated');
  invalidateAdminDashboard();
  if(row.status==='CANCELLED'){
    invalidateProducts();
  }
  notifyCustomerOrderStatusUpdate(row,row.status,`Item update: ${req.body.reason||'Order total adjusted'}`).catch(()=>{});
  sendFcmToCustomerStatusUpdate(row,row.status,`Order updated: Revised total is ₹${row.grandTotal}`).catch(()=>{});
 })
};
