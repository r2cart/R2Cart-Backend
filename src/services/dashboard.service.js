import {prisma} from '../config/prisma.js';
import {orderDto} from '../utils/order.js';

const labels={NEW:'New',CONFIRMED:'Confirmed',PACKING:'Packing',OUT_FOR_DELIVERY:'Out for Delivery',DELIVERED:'Delivered',CANCELLED:'Cancelled'};
const colors={NEW:'#f59e0b',CONFIRMED:'#3b82f6',PACKING:'#8b5cf6',OUT_FOR_DELIVERY:'#06b6d4',DELIVERED:'#168447',CANCELLED:'#ef4444'};
// Reporting days use the store's India timezone, independent of server timezone.
export function reportingDates(now=new Date()){
 const offset=330*60000,local=new Date(now.getTime()+offset);
 const today=new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate())-offset);
 return {today,tomorrow:new Date(today.getTime()+86400000),week:new Date(today.getTime()-6*86400000),month:new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),1)-offset)};
}
export function salesSeries(rows,start){
 return Array.from({length:7},(_,index)=>{const date=new Date(start.getTime()+index*86400000),end=new Date(date.getTime()+86400000);return {d:date.toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short'}),v:rows.filter(row=>new Date(row.createdAt)>=date&&new Date(row.createdAt)<end).reduce((sum,row)=>sum+Number(row.grandTotal),0)}});
}
export async function getDashboard(now=new Date()){
 const {today,tomorrow,week,month}=reportingDates(now);
 const todayRange={gte:today,lt:tomorrow};
 const lowWhere={deletedAt:null,stock:{gt:0,lte:prisma.product.fields.lowStockThreshold}};
 const [todayOrders,pending,totalOrders,totalCustomers,totalProducts,lowStock,outOfStock,revenue,todayRevenue,recentOrders,recentCustomers,weeklySales,statusCounts,topGroups,lowStockProducts]=await Promise.all([
  prisma.order.count({where:{createdAt:todayRange}}),
  prisma.order.count({where:{status:{in:['NEW','CONFIRMED','PACKING','OUT_FOR_DELIVERY']}}}),
  prisma.order.count(),prisma.user.count({where:{role:'CUSTOMER'}}),prisma.product.count({where:{deletedAt:null}}),
  prisma.product.count({where:lowWhere}),prisma.product.count({where:{deletedAt:null,stock:0}}),
  prisma.order.aggregate({_sum:{grandTotal:true},where:{status:'DELIVERED'}}),
  prisma.order.aggregate({_sum:{grandTotal:true},where:{status:'DELIVERED',createdAt:todayRange}}),
  prisma.order.findMany({take:8,orderBy:{createdAt:'desc'},include:{items:true,user:{select:{name:true,mobile:true}}}}),
  prisma.user.findMany({where:{role:'CUSTOMER'},take:6,orderBy:{createdAt:'desc'},select:{id:true,name:true,email:true,createdAt:true,_count:{select:{orders:true}}}}),
  prisma.order.findMany({where:{status:'DELIVERED',createdAt:{gte:week,lt:tomorrow}},select:{createdAt:true,grandTotal:true}}),
  prisma.order.groupBy({by:['status'],where:{createdAt:{gte:month,lt:tomorrow}},_count:{_all:true}}),
  prisma.orderItem.groupBy({by:['productId','name','unit','price'],where:{order:{status:'DELIVERED',createdAt:{gte:month,lt:tomorrow}}},_sum:{quantity:true}}),
  prisma.product.findMany({where:{deletedAt:null,OR:[{stock:0},lowWhere]},take:6,orderBy:{stock:'asc'},select:{id:true,name:true,unit:true,stock:true,lowStockThreshold:true,images:{take:1,orderBy:{position:'asc'},select:{url:true}}}})
 ]);
 const totals=new Map();for(const row of topGroups){const units=row._sum.quantity||0,current=totals.get(row.productId)||{id:row.productId,name:row.name,unit:row.unit,unitsSold:0,revenue:0};current.unitsSold+=units;current.revenue+=Number(row.price)*units;totals.set(row.productId,current)}
 const topProducts=[...totals.values()].sort((a,b)=>b.unitsSold-a.unitsSold).slice(0,5);
 const images=topProducts.length?await prisma.product.findMany({where:{id:{in:topProducts.map(row=>row.id)}},select:{id:true,images:{take:1,orderBy:{position:'asc'},select:{url:true}}}}):[];
 return {
  generatedAt:now.toISOString(),timezone:'Asia/Kolkata',
  stats:{todayOrders,pending,totalOrders,totalCustomers,totalProducts,lowStock,outOfStock,todayRevenue:Number(todayRevenue._sum.grandTotal||0),totalRevenue:Number(revenue._sum.grandTotal||0)},
  sales:salesSeries(weeklySales,week),
  orderStatus:statusCounts.map(row=>({name:labels[row.status]||row.status,value:row._count._all,color:colors[row.status]||'#94a3b8'})),
  recentOrders:recentOrders.map(orderDto),
  recentCustomers:recentCustomers.map(row=>({id:row.id,name:row.name,email:row.email,joinedAt:row.createdAt,orders:row._count.orders})),
  topProducts:topProducts.map(row=>({...row,image:images.find(image=>image.id===row.id)?.images[0]?.url||null})),
  lowStockProducts:lowStockProducts.map(({images,...row})=>({...row,image:images[0]?.url||null}))
 };
}
