import {createHash,randomUUID} from 'node:crypto';
import {prisma} from '../config/prisma.js';
import {AppError} from '../utils/response.js';
import {variantData} from '../utils/variants.js';
import {uploadProductImage} from './image.service.js';

const clean=value=>String(value??'').trim();
const normalized=value=>clean(value).toLowerCase().replace(/\s+/g,'');
const identity=row=>`${normalized(row.name)}|${row.categoryId}|${normalized(row.unit)}`;

export function validateImport(rows,categories,existing=[]){
 if(!Array.isArray(rows)||!rows.length||rows.length>200)throw new AppError('Upload between 1 and 200 product rows',422);
 if(rows.some(row=>!row||typeof row!=='object'||Array.isArray(row)))throw new AppError('Each import row must contain product fields',422);

 const existingById=new Map();
 const existingBySku=new Map();
 const stored=new Set();

 for(const item of existing){
  if(item.id)existingById.set(clean(item.id),item);
  if(item.sku)existingBySku.set(clean(item.sku).toUpperCase(),item);
  stored.add(identity(item));
 }

 const seenNewKeys=new Set();
 const seenUpdatedIds=new Set();
 const groups=new Map();

 return rows.map((row,index)=>{
  const errors=[];let pack={};
  try{pack=variantData(row)}catch(error){errors.push(error.message)}
  if(row.stock===undefined||clean(row.stock)==='')errors.push('Stock is required; enter 0 for an out-of-stock pack');
  
  const rawCat = clean(row.category||row.categorySlug||row.categoryName);
  const resolvedSlug = {
    'dairy-breakfast': 'dairy-bread-eggs',
    'staples': 'atta-rice-dal-oil',
    'cooking': 'masala-dry-fruits',
    'beverages': 'cold-drinks-juices',
    'bakery': 'biscuits-bakery',
    'instant': 'packaged-food',
    'instant-food': 'packaged-food'
  }[rawCat.toLowerCase()] || rawCat;

  const category=categories.find(cat=>cat.slug===rawCat||cat.slug===resolvedSlug||normalized(cat.name)===normalized(rawCat));
  if(!category||category.status==='INACTIVE')errors.push('Choose an existing active category name or slug');

  const rowId=clean(row.id);
  const rowSku=clean(row.sku).toUpperCase();

  // If row has an explicit ID or SKU that matches an existing product, it is an UPDATE
  const matchedExisting = (rowId && existingById.get(rowId)) || (rowSku && existingBySku.get(rowSku)) || null;
  const isUpdate = Boolean(matchedExisting);
  const action = isUpdate ? 'UPDATE' : 'CREATE';

  const name=clean(row.name),description=clean(row.description),groupCode=clean(row.groupCode),image=clean(row.image),imageFile=clean(row.imageFile);
  const lowStockThreshold=Number(row.lowStockThreshold)>0?Number(row.lowStockThreshold):10;

  if(!name||name.length>191)errors.push('Product name is required (maximum 191 characters)');

  if(!isUpdate){
   if(!description||description.length>2000)errors.push('Description is required (maximum 2000 characters)');
   if(!image&&!imageFile)errors.push('Provide an image URL or an image filename from your ZIP');
  }else{
   if(description&&description.length>2000)errors.push('Description must be at most 2000 characters');
  }

  if(groupCode.length>100)errors.push('Product Group Code must be at most 100 characters');
  if(image.length>2048)errors.push('Image URL must be at most 2048 characters');
  const status=clean(row.status||matchedExisting?.status||'ACTIVE').toUpperCase();
  if(!['ACTIVE','INACTIVE'].includes(status))errors.push('Status must be ACTIVE or INACTIVE');

  if(image){
   try{
    const url=new URL(image);
    if(!['https:','http:'].includes(url.protocol))throw new Error();
   }catch{
    errors.push('Image URL must start with https:// or http://');
   }
  }
  if(image&&imageFile)errors.push('Use either Image URL or Image Filename, not both');

  const data={
   id:matchedExisting?matchedExisting.id:null,
   sku:matchedExisting?matchedExisting.sku:(rowSku||null),
   name,
   description:description||matchedExisting?.description||`${name} (${pack.unit||''})`,
   ...pack,
   lowStockThreshold,
   categoryId:category?.id,
   category:category?.slug,
   categoryName:category?.name,
   groupCode,
   image,
   imageFile,
   status,
   action,
   currentValues:matchedExisting?{
    mrp:Number(matchedExisting.mrp),
    price:Number(matchedExisting.price),
    costPrice:Number(matchedExisting.costPrice||0),
    stock:matchedExisting.stock,
    unit:matchedExisting.unit
   }:null,
   featured:false,
   bestSeller:false
  };

  const key=identity(data);
  if(isUpdate){
   if(seenUpdatedIds.has(data.id)){
    errors.push(`Duplicate row for product ID "${data.id}" in this sheet`);
   }
   seenUpdatedIds.add(data.id);
  }else{
   if(stored.has(key))errors.push('This product and pack size already exist');
   if(seenNewKeys.has(key))errors.push('Duplicate product and pack size in this file');
   seenNewKeys.add(key);
  }

  if(groupCode){
   const groupKey=normalized(groupCode),groupIdentity=`${normalized(name)}|${category?.id}`;
   if(groups.has(groupKey)&&groups.get(groupKey)!==groupIdentity)errors.push('A Product Group Code must use the same product name and category');
   else groups.set(groupKey,groupIdentity);
  }

  return {rowNumber:index+2,data,errors,valid:errors.length===0};
 });
}

export async function previewProductImport(rows){
 const [categories,existing]=await Promise.all([
  prisma.category.findMany(),
  prisma.product.findMany({
   where:{deletedAt:null},
   select:{id:true,sku:true,name:true,unit:true,categoryId:true,mrp:true,price:true,costPrice:true,stock:true,status:true,description:true}
  })
 ]);
 return validateImport(rows,categories,existing);
}

export async function exportProductsData(categorySlug){
 const where={deletedAt:null};
 const cleanCat=String(categorySlug||'').trim();
 if(cleanCat&&cleanCat!=='all'){
  where.category={slug:cleanCat};
 }
 const products=await prisma.product.findMany({
  where,
  include:{
   category:{select:{id:true,name:true,slug:true}},
   images:{orderBy:{position:'asc'},take:1,select:{url:true}}
  },
  orderBy:[{category:{name:'asc'}},{name:'asc'},{price:'asc'}]
 });

 const rows=products.map(p=>({
  id:p.id,
  sku:p.sku,
  name:p.name,
  categoryName:p.category?.name||'',
  categorySlug:p.category?.slug||'',
  unit:p.unit,
  costPrice:Number(p.costPrice||0),
  mrp:Number(p.mrp||0),
  price:Number(p.price||0),
  stock:p.stock,
  lowStockThreshold:p.lowStockThreshold||10,
  status:p.status,
  description:p.description||'',
  groupCode:p.variantGroupId||'',
  image:p.images?.[0]?.url||''
 }));

 return {count:rows.length,category:cleanCat||'all',products:rows};
}

export async function importProducts(rows){
 const preview=await previewProductImport(rows);
 if(preview.some(row=>!row.valid||(row.data.imageFile&&row.data.action==='CREATE'))){
  throw new AppError('Resolve all row errors and upload ZIP images before importing',422,preview);
 }

 const uploadedUrls=new Map();
 for(const {data} of preview){
  if(data.image&&!data.image.includes('res.cloudinary.com')){
   const key=`${data.category}|${data.image}`;
   if(!uploadedUrls.has(key)){
    try{
     const res=await uploadProductImage(data.image,data.category);
     uploadedUrls.set(key,res.url);
    }catch(err){
     uploadedUrls.set(key,data.image);
    }
   }
   data.image=uploadedUrls.get(key);
  }
 }

 const groups=new Map();
 let updatedCount=0;
 let createdCount=0;

 const saved=await prisma.$transaction(async tx=>{
  const result=[];
  for(const {data} of preview){
   if(data.action==='UPDATE'&&data.id){
    const updateData={
     name:data.name,
     unit:data.unit,
     mrp:data.mrp,
     price:data.price,
     costPrice:data.costPrice??0,
     stock:data.stock,
     status:data.status,
     ...(data.lowStockThreshold!==undefined?{lowStockThreshold:data.lowStockThreshold}:{}),
     ...(data.description?{description:data.description}:{}),
     ...(data.categoryId?{categoryId:data.categoryId}:{})
    };
    const updated=await tx.product.update({
     where:{id:data.id},
     data:updateData,
     select:{id:true,sku:true,name:true,unit:true,price:true,mrp:true,costPrice:true,stock:true}
    });
    if(data.image){
     const existingImg=await tx.productImage.findFirst({where:{productId:data.id}});
     if(existingImg){
      await tx.productImage.update({where:{id:existingImg.id},data:{url:data.image}});
     }else{
      await tx.productImage.create({data:{productId:data.id,url:data.image,position:0}});
     }
    }
    updatedCount++;
    result.push({...updated,action:'UPDATE'});
   }else{
    const {category,groupCode,image,imageFile,action,currentValues,id:incomingId,categoryName,...product}=data;
    const id=`p-${randomUUID()}`;
    const groupKey=groupCode?normalized(groupCode):null;
    if(groupKey&&!groups.has(groupKey))groups.set(groupKey,id);
    const slug=`bulk-${createHash('sha256').update(identity(data)).digest('hex')}`;
    const archived=await tx.product.findUnique({where:{slug},select:{id:true,deletedAt:true}});
    if(archived?.deletedAt)await tx.product.update({where:{id:archived.id},data:{slug:`archived-${randomUUID()}`}});
    try{
     const created=await tx.product.create({
      data:{
       ...product,
       id,
       slug,
       sku:`R2C-${randomUUID().replaceAll('-','').toUpperCase()}`,
       variantGroupId:groupKey?groups.get(groupKey):null,
       images:image?{create:{url:image}}:undefined
      },
      select:{id:true,sku:true,name:true,unit:true,price:true,mrp:true,costPrice:true,stock:true}
     });
     createdCount++;
     result.push({...created,action:'CREATE'});
    }catch(error){
     if(error.code==='P2002')throw new AppError('A product pack was already imported. Recheck the preview before retrying.',409);
     throw error;
    }
   }
  }
  return result;
 },{maxWait:15000,timeout:120000});

 return {count:saved.length,updated:updatedCount,created:createdCount,products:saved};
}
