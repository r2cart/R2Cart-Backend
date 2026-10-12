import {prisma} from '../config/prisma.js';
import {AppError,asyncHandler,ok} from '../utils/response.js';

export const customers=asyncHandler(async(req,res)=>{
 const where={role:'CUSTOMER'};
 if(req.query.q)where.OR=[{name:{contains:String(req.query.q)}},{email:{contains:String(req.query.q)}},{mobile:{contains:String(req.query.q)}}];
 if(req.query.status){if(!['ACTIVE','INACTIVE'].includes(req.query.status))throw new AppError('Invalid customer status',422);where.status=req.query.status}
 const rows=await prisma.user.findMany({where,select:{id:true,name:true,email:true,mobile:true,status:true,createdAt:true,addresses:true,orders:{select:{id:true,orderNumber:true,grandTotal:true,status:true,createdAt:true}}},orderBy:{createdAt:'desc'}});
 ok(res,rows.map(user=>({...user,totalOrders:user.orders.length,totalSpent:user.orders.filter(order=>order.status==='DELIVERED').reduce((sum,order)=>sum+Number(order.grandTotal),0)})));
});
export const setCustomerStatus=asyncHandler(async(req,res)=>{
 const status=String(req.body.status||'').toUpperCase();if(!['ACTIVE','INACTIVE'].includes(status))throw new AppError('Invalid customer status',422);
 const user=await prisma.user.findFirst({where:{id:req.params.id,role:'CUSTOMER'},select:{id:true}});if(!user)throw new AppError('Customer not found',404);
 await prisma.user.update({where:{id:user.id},data:{status}});ok(res,{id:user.id,status},'Customer status updated');
});
