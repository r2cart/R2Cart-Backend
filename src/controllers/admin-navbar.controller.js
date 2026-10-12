import {prisma} from '../config/prisma.js';
import {asyncHandler,ok} from '../utils/response.js';
export const search=asyncHandler(async(req,res)=>{
 const q=String(req.query.q||'').trim().slice(0,100);if(!q)return ok(res,[]);
 const [products,orders,customers,categories,tickets]=await Promise.all([
  prisma.product.findMany({where:{deletedAt:null,OR:[{name:{contains:q}},{sku:{contains:q}}]},select:{id:true,name:true,sku:true,images:{take:1,orderBy:{position:'asc'},select:{url:true}}},take:5}),
  prisma.order.findMany({where:{OR:[{orderNumber:{contains:q}},{user:{name:{contains:q}}}]},select:{id:true,orderNumber:true,status:true},take:5}),
  prisma.user.findMany({where:{role:'CUSTOMER',OR:[{name:{contains:q}},{email:{contains:q}},{mobile:{contains:q}}]},select:{id:true,name:true,email:true},take:5}),
  prisma.category.findMany({where:{name:{contains:q}},select:{id:true,name:true,image:true},take:5}),
  prisma.supportTicket.findMany({where:{OR:[{subject:{contains:q}},{ticketNumber:{contains:q}}]},select:{id:true,ticketNumber:true,subject:true},take:5})
 ]);
 ok(res,[...products.map(p=>({id:p.id,type:'Product',title:p.name,subtitle:p.sku,image:p.images[0]?.url,path:`/admin/products/${p.id}/edit`})),...orders.map(o=>({id:o.id,type:'Order',title:o.orderNumber,subtitle:o.status,path:`/admin/orders/${o.id}`})),...customers.map(c=>({id:c.id,type:'Customer',title:c.name,subtitle:c.email,path:`/admin/customers?q=${encodeURIComponent(c.email)}`})),...categories.map(c=>({id:c.id,type:'Category',title:c.name,image:c.image,path:'/admin/categories'})),...tickets.map(t=>({id:t.id,type:'Support',title:t.ticketNumber,subtitle:t.subject,path:'/admin/support'}))]);
});
export const notifications=asyncHandler(async(req,res)=>{
 const settings=await prisma.storeSetting.findUnique({where:{id:1},select:{notifications:true,logo:true,storeName:true}}),preferences=settings?.notifications||{};
 const [orders,stock,tickets]=await Promise.all([
  preferences.orders?prisma.order.findMany({where:{status:'NEW'},select:{id:true,orderNumber:true,createdAt:true},orderBy:{createdAt:'desc'},take:20}):[],
  preferences.stock?prisma.product.findMany({where:{deletedAt:null,status:'ACTIVE',stock:{lte:prisma.product.fields.lowStockThreshold}},select:{id:true,name:true,stock:true,updatedAt:true},orderBy:{stock:'asc'},take:20}):[],
  preferences.customers?prisma.supportTicket.findMany({where:{status:{in:['OPEN','PENDING']}},select:{id:true,ticketNumber:true,subject:true,updatedAt:true},orderBy:{updatedAt:'desc'},take:20}):[]
 ]);
 ok(res,{admin:{id:req.user.id,name:req.user.name,email:req.user.email,role:req.user.role,avatarUrl:req.user.avatarUrl},store:{name:settings?.storeName,logo:settings?.logo},notifications:[...orders.map(o=>({id:`order-${o.id}`,title:`New order ${o.orderNumber}`,text:'Waiting for confirmation',date:o.createdAt,path:`/admin/orders/${o.id}`})),...stock.map(p=>({id:`stock-${p.id}-${p.stock}`,title:p.name,text:`${p.stock} units remaining`,date:p.updatedAt,path:'/admin/inventory'})),...tickets.map(t=>({id:`ticket-${t.id}-${new Date(t.updatedAt).getTime()}`,title:t.ticketNumber,text:t.subject,date:t.updatedAt,path:'/admin/support'}))].sort((a,b)=>new Date(b.date)-new Date(a.date))});
});
