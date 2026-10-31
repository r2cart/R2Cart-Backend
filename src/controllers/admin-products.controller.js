import {prisma} from '../config/prisma.js';
import {AppError,asyncHandler,ok} from '../utils/response.js';
import {productDto} from '../utils/order.js';
import {resolveUserCategoryScope} from '../utils/category-scope.js';

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
 const scope=await resolveUserCategoryScope(req.user);
 const where=productFilters(req.query,prisma.product.fields.lowStockThreshold);
 const countWhere={deletedAt:null};

 if(scope.isScoped){
   if(where.category){
     const requestedCat=await prisma.category.findUnique({where:{slug:where.category.slug},select:{id:true}});
     if(!requestedCat||!scope.categoryIds.includes(requestedCat.id)){
       where.categoryId={in:[]};
       countWhere.categoryId={in:[]};
     }else{
       where.categoryId=requestedCat.id;
       delete where.category;
       countWhere.categoryId=requestedCat.id;
     }
   }else{
     where.categoryId={in:scope.categoryIds};
     countWhere.categoryId={in:scope.categoryIds};
   }
 }

 const [allRows,rawTotalPacks,storeSetting]=await Promise.all([
   prisma.product.findMany({where,include,orderBy:[{createdAt:'desc'},{id:'asc'}]}),
   prisma.product.count({where:countWhere}),
   prisma.storeSetting.findUnique({where:{id:1},select:{policies:true}}).catch(()=>null)
 ]);

 const comingSoonCats=storeSetting?.policies?.homeLayout?.comingSoonCategories||[];
 const comingSoonProducts=storeSetting?.policies?.homeLayout?.comingSoonProducts||[];
 const comingSoonExemptions=storeSetting?.policies?.homeLayout?.comingSoonExemptions||[];

 const calcIsSoon=(prod)=>{
   if(!prod)return false;
   if(comingSoonProducts.includes(prod.id))return true;
   if(comingSoonExemptions.includes(prod.id))return false;
   const catSlug=prod.category?.slug;
   if(catSlug&&comingSoonCats.includes(catSlug))return true;
   return Boolean(prod.isSoon);
 };

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
   const isSoon=calcIsSoon(primary);
   uniqueList.push({
     ...productDto(primary),
     isSoon,
     packCount:variants.length,
     packs:variants.map(v=>({
       id:v.id,
       unit:v.unit,
       price:Number(v.price),
       mrp:Number(v.mrp),
       stock:v.stock,
       status:v.status,
       isSoon:calcIsSoon(v)
     }))
   });
 }

 const total=uniqueList.length;
 const pagedProducts=uniqueList.slice((page-1)*limit,page*limit);
 ok(res,{
   products:pagedProducts,
   comingSoonProducts,
   comingSoonExemptions,
   pagination:{page,limit,total,pages:Math.max(1,Math.ceil(total/limit))},
   totalProducts:rawTotalPacks,
   totalUniqueProducts:total
 },'Admin products fetched');
});

export const get=asyncHandler(async(req,res)=>{
 const [row,storeSetting]=await Promise.all([
   prisma.product.findFirst({where:{id:req.params.id,deletedAt:null},include}),
   prisma.storeSetting.findUnique({where:{id:1},select:{policies:true}}).catch(()=>null)
 ]);
 if(!row)throw new AppError('Product not found',404);

 const scope=await resolveUserCategoryScope(req.user);
 if(scope.isScoped&&!scope.categoryIds.includes(row.categoryId)){
   throw new AppError('Access denied: You are not authorized to view products in this category',403);
 }
 const comingSoonCats=storeSetting?.policies?.homeLayout?.comingSoonCategories||[];
 const comingSoonProducts=storeSetting?.policies?.homeLayout?.comingSoonProducts||[];
 const comingSoonExemptions=storeSetting?.policies?.homeLayout?.comingSoonExemptions||[];

 const calcIsSoon=(prod)=>{
   if(!prod)return false;
   if(comingSoonProducts.includes(prod.id))return true;
   if(comingSoonExemptions.includes(prod.id))return false;
   const catSlug=prod.category?.slug;
   if(catSlug&&comingSoonCats.includes(catSlug))return true;
   return Boolean(prod.isSoon);
 };

 const groupKey=row.variantGroupId||row.id;
 const variants=await prisma.product.findMany({
   where:{deletedAt:null,OR:[{id:row.id},{variantGroupId:groupKey}]},
   include,
   orderBy:{price:'asc'}
 });
 ok(res,{
   ...productDto(row),
   isSoon:calcIsSoon(row),
   packCount:variants.length,
   packs:variants.map(v=>({...productDto(v),isSoon:calcIsSoon(v)}))
 },'Admin product fetched');
});
