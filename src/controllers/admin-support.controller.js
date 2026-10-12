import {prisma} from '../config/prisma.js';
import {AppError,asyncHandler,ok} from '../utils/response.js';
const include={user:{select:{id:true,name:true,email:true,mobile:true}},messages:{orderBy:{createdAt:'asc'}}};
export const list=asyncHandler(async(req,res)=>ok(res,await prisma.supportTicket.findMany({include,orderBy:{createdAt:'desc'}})));
export const reply=asyncHandler(async(req,res)=>{
 const status=String(req.body.status||'').toUpperCase(),message=String(req.body.message||'').trim();
 if(!['OPEN','PENDING','RESOLVED'].includes(status))throw new AppError('Invalid ticket status',422);
 if(message.length>5000)throw new AppError('Response must be 5000 characters or fewer',422);
 const ticket=await prisma.supportTicket.findUnique({where:{id:req.params.id},select:{id:true,status:true}});if(!ticket)throw new AppError('Support ticket not found',404);
 if(!message&&ticket.status===status)throw new AppError('Write a response or change the status',422);
 ok(res,await prisma.supportTicket.update({where:{id:ticket.id},data:{status,...(message&&{messages:{create:{message,isAdmin:true,senderId:req.user.id}}})},include}),'Response saved and ticket updated');
});
