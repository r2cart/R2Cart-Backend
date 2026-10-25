import {prisma} from '../config/prisma.js';
import {AppError,asyncHandler,ok} from '../utils/response.js';
import {productDto} from '../utils/order.js';

export function productFilters(query,threshold){
 const where={deletedAt:null};
 const q=String(query.q||'').trim();if(q)where.OR=[{name:{contains:q}},{sku:{contains:q}}];
 if(query.category)where.category={slug:String(query.category)};
 if(query.status){if(!['ACTIVE','INACTIVE'].includes(query.status))throw new AppError('Invalid product status filter',422);where.status=query.status}
 if(query.stock==='low')where.stock={gt:0,lte:threshold};
 else if(query.stock==='out')where.stock=0;
 else if(query.stock&&query.stock!=='all')throw new AppError('Invalid stock filter',422);
 return where;
}
const include={category:true,ratings:true,images:{orderBy:{position:'asc'}}};

export const list=asyncHandler(async(req,res)=>{
 const page=Math.max(1,parseInt(req.query.page,10)||1),limit=Math.min(100,Math.max(1,parseInt(req.query.limit,10)||20));
 const where=productFilters(req.query,prisma.product.fields.lowStockThreshold);
 const [allRows,rawTotalPacks]=await Promise.all([
   prisma.product.findMany({where,include,orderBy:[{createdAt:'desc'},{id:'asc'}]}),
   prisma.product.count({where:{deletedAt:null}})
 ]);

 const groupMap=new Map();
 for(const row of allRows){
   const key=row.variantGroupId||row.id;
   if(!groupMap.has(key)){
     groupMap.set(key,[row]);
   }else{
     groupMap.get(key).push(row);
   }
 }

 const uniqueList=[];
 for(const [key,variants] of groupMap.entries()){
   variants.sort((a,b)=>{
     if(a.id===a.variantGroupId)return -1;
     if(b.id===b.variantGroupId)return 1;
     return Number(a.price)-Number(b.price);
   });
   const primary=variants[0];
   uniqueList.push({
     ...productDto(primary),
     packCount:variants.length,
     packs:variants.map(v=>({
       id:v.id,
       unit:v.unit,
       price:Number(v.price),
       mrp:Number(v.mrp),
       stock:v.stock,
       status:v.status
     }))
   });
 }

 const total=uniqueList.length;
 const pagedProducts=uniqueList.slice((page-1)*limit,page*limit);
 ok(res,{
   products:pagedProducts,
   pagination:{page,limit,total,pages:Math.max(1,Math.ceil(total/limit))},
   totalProducts:rawTotalPacks,
   totalUniqueProducts:total
 },'Admin products fetched');
});

export const get=asyncHandler(async(req,res)=>{
 const row=await prisma.product.findFirst({where:{id:req.params.id,deletedAt:null},include});
 if(!row)throw new AppError('Product not found',404);
 const groupKey=row.variantGroupId||row.id;
 const variants=await prisma.product.findMany({
   where:{deletedAt:null,OR:[{id:row.id},{variantGroupId:groupKey}]},
   include,
   orderBy:{price:'asc'}
 });
 ok(res,{
   ...productDto(row),
   packCount:variants.length,
   packs:variants.map(productDto)
 },'Admin product fetched');
});
