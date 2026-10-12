import {prisma} from '../config/prisma.js';
import {catalogRepository} from '../repositories/catalog.repository.js';
import {AppError,asyncHandler,ok} from '../utils/response.js';
import {productDto} from '../utils/order.js';
export const categories=asyncHandler(async(req,res)=>ok(res,await catalogRepository.categories()));
export const banners=asyncHandler(async(req,res)=>ok(res,await catalogRepository.banners()));
export const products=asyncHandler(async(req,res)=>{
 const page=Math.max(1,parseInt(req.query.page,10)||1),limit=Math.min(50,Math.max(1,parseInt(req.query.limit,10)||20));
 // Inactive products are available only through authenticated admin endpoints.
 const where={deletedAt:null,status:'ACTIVE',...(req.query.category&&{category:{slug:req.query.category}}),...(req.query.available==='true'&&{stock:{gt:0}}),...(req.query.q&&{name:{contains:req.query.q}})};
 const orderBy=req.query.sort==='low'?{price:'asc'}:req.query.sort==='high'?{price:'desc'}:req.query.sort==='discount'?{featured:'desc'}:{bestSeller:'desc'};
 const include={category:true,ratings:true,images:{orderBy:{position:'asc'}}};
 const [rows,total]=await Promise.all([prisma.product.findMany({where,include,orderBy,skip:(page-1)*limit,take:limit}),prisma.product.count({where})]);
 const groups=[...new Set(rows.map(row=>row.variantGroupId).filter(Boolean))];
 const packs=groups.length?await prisma.product.findMany({where:{deletedAt:null,status:'ACTIVE',variantGroupId:{in:groups}},include,orderBy:{price:'asc'}}):[];
 ok(res,rows.map(row=>({...productDto(row),variants:row.variantGroupId?packs.filter(pack=>pack.variantGroupId===row.variantGroupId).map(productDto):[]})),'Products fetched',{page,limit,total,pages:Math.ceil(total/limit)});
});
export const product=asyncHandler(async(req,res)=>{const row=await catalogRepository.product(req.params.id);if(!row)throw new AppError('Product not found',404);ok(res,productDto(row))});
export const suggestions=asyncHandler(async(req,res)=>{const q=String(req.query.q||'');const rows=await prisma.product.findMany({where:{name:{contains:q},status:'ACTIVE',deletedAt:null},select:{id:true,name:true},take:8});if(req.user&&q)await prisma.searchHistory.create({data:{userId:req.user.id,query:q}});ok(res,rows)});
export const delivery=asyncHandler(async(req,res)=>ok(res,await prisma.deliveryArea.findMany({where:{status:'ACTIVE'}})));
export const settings=asyncHandler(async(req,res)=>ok(res,await prisma.storeSetting.findUnique({where:{id:1}})));
