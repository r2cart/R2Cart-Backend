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
 const [rows,total,totalProducts]=await Promise.all([prisma.product.findMany({where,include,orderBy:[{createdAt:'desc'},{id:'asc'}],skip:(page-1)*limit,take:limit}),prisma.product.count({where}),prisma.product.count({where:{deletedAt:null}})]);
 ok(res,{products:rows.map(productDto),pagination:{page,limit,total,pages:Math.max(1,Math.ceil(total/limit))},totalProducts},'Admin products fetched');
});
export const get=asyncHandler(async(req,res)=>{
 const row=await prisma.product.findFirst({where:{id:req.params.id,deletedAt:null},include});
 if(!row)throw new AppError('Product not found',404);
 ok(res,productDto(row),'Admin product fetched');
});
