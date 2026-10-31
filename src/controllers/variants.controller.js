import {randomUUID} from 'node:crypto';
import {prisma} from '../config/prisma.js';
import {AppError,asyncHandler,created,ok} from '../utils/response.js';
import {productDto} from '../utils/order.js';
import {variantData} from '../utils/variants.js';
import {invalidateProducts} from '../services/cache.service.js';
import {resolveUserCategoryScope} from '../utils/category-scope.js';

export const addVariant=asyncHandler(async(req,res)=>{
 const pack=variantData(req.body);
 const product=await prisma.$transaction(async tx=>{
  const base=await tx.product.findUnique({where:{id:req.params.id},include:{images:true}});
  if(!base||base.deletedAt)throw new AppError('Product not found',404);
  const scope=await resolveUserCategoryScope(req.user,tx);
  if(scope.isScoped&&!scope.categoryIds.includes(base.categoryId)){
    throw new AppError('Access denied: You are not authorized to add variants to products in this category',403);
  }
  const group=base.variantGroupId||base.id;
  if(await tx.product.findFirst({where:{deletedAt:null,unit:pack.unit,OR:[{id:base.id},{variantGroupId:group}]}}))throw new AppError('This pack size already exists for the product',409);
  await tx.product.update({where:{id:base.id},data:{variantGroupId:group}});
  const identifier=randomUUID();
  return tx.product.create({data:{...pack,id:`p-${identifier}`,sku:`R2C-${identifier.replaceAll('-','').toUpperCase()}`,slug:`${base.slug.slice(0,150)}-${identifier}`,variantGroupId:group,name:base.name,description:base.description,categoryId:base.categoryId,status:base.status,featured:base.featured,bestSeller:base.bestSeller,lowStockThreshold:base.lowStockThreshold,images:{create:base.images.map(image=>({url:image.url,alt:image.alt,position:image.position}))}},include:{category:true,images:true,ratings:true}});
 });
 invalidateProducts();
 created(res,productDto(product),'Pack size added');
});

export const listVariants=asyncHandler(async(req,res)=>{
 const base=await prisma.product.findUnique({where:{id:req.params.id}});
 if(!base||base.deletedAt)throw new AppError('Product not found',404);
 const scope=await resolveUserCategoryScope(req.user);
 if(scope.isScoped&&!scope.categoryIds.includes(base.categoryId)){
   throw new AppError('Access denied: You are not authorized to view variants for this category',403);
 }
 const rows=await prisma.product.findMany({where:{deletedAt:null,OR:[{id:base.id},{variantGroupId:base.variantGroupId||base.id}]},include:{category:true,images:true,ratings:true},orderBy:{price:'asc'}});
 ok(res,rows.map(productDto));
});

export const rateProduct=asyncHandler(async(req,res)=>{
 const score=Number(req.body.score);
 if(!Number.isInteger(score)||score<1||score>5)throw new AppError('Choose a rating between 1 and 5',422);
 const purchased=await prisma.orderItem.findFirst({where:{productId:req.params.id,order:{userId:req.user.id,status:'DELIVERED'}}});
 if(!purchased)throw new AppError('You can rate this pack after your order is delivered',403);
 await prisma.productRating.upsert({where:{userId_productId:{userId:req.user.id,productId:req.params.id}},create:{userId:req.user.id,productId:req.params.id,score},update:{score}});
 const product=await prisma.product.findUnique({where:{id:req.params.id},include:{category:true,images:true,ratings:true}});
 ok(res,productDto(product),'Your rating has been saved');
});
