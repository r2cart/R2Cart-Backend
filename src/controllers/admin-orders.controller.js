import {prisma} from '../config/prisma.js';
import {AppError,asyncHandler,ok} from '../utils/response.js';
import {orderDto} from '../utils/order.js';
import {notifyCustomerOrderStatusUpdate} from '../services/notification.service.js';

export const orderStatuses=['NEW','CONFIRMED','PACKING','OUT_FOR_DELIVERY','DELIVERED','CANCELLED'];
export function normalizeOrderStatus(value){const status=String(value||'').trim().toUpperCase().replaceAll(' ','_');if(!orderStatuses.includes(status))throw new AppError('Invalid order status',422);return status}
const include={user:{select:{id:true,name:true,email:true,mobile:true}},items:true,history:{orderBy:{createdAt:'asc'}},payment:true,coupon:true};
export const orders={
 list:asyncHandler(async(req,res)=>{
  const where=req.query.status?{status:normalizeOrderStatus(req.query.status)}:{};
  const page=Math.max(1,parseInt(req.query.page,10)||1),limit=Math.min(100,Math.max(1,parseInt(req.query.limit,10)||20));
  const [rows,total]=await Promise.all([prisma.order.findMany({where,include,orderBy:[{createdAt:'desc'},{id:'asc'}],skip:(page-1)*limit,take:limit}),prisma.order.count({where})]);
  ok(res,{orders:rows.map(orderDto),pagination:{page,limit,total,pages:Math.max(1,Math.ceil(total/limit))}});
 }),
 get:asyncHandler(async(req,res)=>{const row=await prisma.order.findFirst({where:{OR:[{id:req.params.id},{orderNumber:req.params.id}]},include});if(!row)throw new AppError('Order not found',404);ok(res,orderDto(row))}),
 status:asyncHandler(async(req,res)=>{
  const status=normalizeOrderStatus(req.body.status);
  const row=await prisma.$transaction(async tx=>{
   const current=await tx.order.findUnique({where:{id:req.params.id},include:{items:true}});
   if(!current)throw new AppError('Order not found',404);
   if(current.status===status)return tx.order.findUnique({where:{id:current.id},include});
   if(['DELIVERED','CANCELLED'].includes(current.status))throw new AppError('Delivered and cancelled orders cannot be changed',409);
   const changed=await tx.order.updateMany({where:{id:current.id,status:current.status},data:{status}});
   if(changed.count!==1)throw new AppError('Order changed in another session. Refresh and retry.',409);
   if(status==='CANCELLED')for(const item of current.items)await tx.product.update({where:{id:item.productId},data:{stock:{increment:item.quantity}}});
   await tx.orderStatusHistory.create({data:{orderId:current.id,status,note:String(req.body.note||'').trim()||'Status updated by store admin'}});
   return tx.order.findUnique({where:{id:current.id},include});
  });
  ok(res,orderDto(row),'Order status updated');
  notifyCustomerOrderStatusUpdate(row,status,req.body.note).catch(e=>console.error('Customer status push error:',e.message));
 })
};
