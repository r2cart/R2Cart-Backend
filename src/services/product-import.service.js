import {createHash,randomUUID} from 'node:crypto';
import {prisma} from '../config/prisma.js';
import {AppError} from '../utils/response.js';
import {variantData} from '../utils/variants.js';
import {uploadProductImage} from './image.service.js';

const clean=value=>String(value??'').trim();
const normalized=value=>clean(value).toLowerCase().replace(/\s+/g,'');
const identity=row=>`${normalized(row.name)}|${row.categoryId}|${normalized(row.unit)}`;
export function validateImport(rows,categories,existing){
 if(!Array.isArray(rows)||!rows.length||rows.length>200)throw new AppError('Upload between 1 and 200 product rows',422);
 if(rows.some(row=>!row||typeof row!=='object'||Array.isArray(row)))throw new AppError('Each import row must contain product fields',422);
 const seen=new Set(),stored=new Set(existing.map(identity)),groups=new Map();
 return rows.map((row,index)=>{
  const errors=[];let pack={};
  try{pack=variantData(row)}catch(error){errors.push(error.message)}
  if(row.stock===undefined||clean(row.stock)==='')errors.push('Stock is required; enter 0 for an out-of-stock pack');
  const rawCat = clean(row.category);
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
  const name=clean(row.name),description=clean(row.description),groupCode=clean(row.groupCode),image=clean(row.image),imageFile=clean(row.imageFile);
  if(!name||name.length>191)errors.push('Product name is required (maximum 191 characters)');
  if(!description||description.length>2000)errors.push('Description is required (maximum 2000 characters)');
  if(groupCode.length>100)errors.push('Product Group Code must be at most 100 characters');
  if(image.length>2048)errors.push('Image URL must be at most 2048 characters');
  const status=clean(row.status||'ACTIVE').toUpperCase();if(!['ACTIVE','INACTIVE'].includes(status))errors.push('Status must be ACTIVE or INACTIVE');
  if(image){try{const url=new URL(image);if(!['https:','http:'].includes(url.protocol))throw new Error()}catch{errors.push('Image URL must start with https:// or http://')}}
  if(image&&imageFile)errors.push('Use either Image URL or Image Filename, not both');
  if(!image&&!imageFile)errors.push('Provide an image URL or an image filename from your ZIP');
  const data={name,description,...pack,categoryId:category?.id,category:category?.slug,groupCode,image,imageFile,status,featured:false,bestSeller:false};
  const key=identity(data);if(stored.has(key))errors.push('This product and pack size already exist');if(seen.has(key))errors.push('Duplicate product and pack size in this file');seen.add(key);
  if(groupCode){const groupKey=normalized(groupCode),groupIdentity=`${normalized(name)}|${category?.id}`;if(groups.has(groupKey)&&groups.get(groupKey)!==groupIdentity)errors.push('A Product Group Code must use the same product name and category');else groups.set(groupKey,groupIdentity)}
  return {rowNumber:index+2,data,errors,valid:errors.length===0};
 });
}
export async function previewProductImport(rows){
 const [categories,existing]=await Promise.all([prisma.category.findMany(),prisma.product.findMany({where:{deletedAt:null},select:{name:true,unit:true,categoryId:true}})]);
 return validateImport(rows,categories,existing);
}
export async function importProducts(rows){
 const preview=await previewProductImport(rows);
 if(preview.some(row=>!row.valid||row.data.imageFile))throw new AppError('Resolve all row errors and upload ZIP images before importing',422,preview);

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
 const saved=await prisma.$transaction(async tx=>{
  const result=[];
  for(const {data} of preview){
   const {category,groupCode,image,imageFile,...product}=data;
   const id=`p-${randomUUID()}`;
   const groupKey=groupCode?normalized(groupCode):null;
   if(groupKey&&!groups.has(groupKey))groups.set(groupKey,id);
   // Stable import slugs also prevent duplicate inserts on retries or concurrent imports.
   const slug=`bulk-${createHash('sha256').update(identity(data)).digest('hex')}`;
   const archived=await tx.product.findUnique({where:{slug},select:{id:true,deletedAt:true}});
   if(archived?.deletedAt)await tx.product.update({where:{id:archived.id},data:{slug:`archived-${randomUUID()}`}});
   try{result.push(await tx.product.create({data:{...product,id,slug,sku:`R2C-${randomUUID().replaceAll('-','').toUpperCase()}`,variantGroupId:groupKey?groups.get(groupKey):null,images:{create:{url:image}}},select:{id:true,name:true,unit:true}}))}catch(error){if(error.code==='P2002')throw new AppError('A product pack was already imported. Recheck the preview before retrying.',409);throw error}
  }
  return result;
 },{maxWait:10000,timeout:60000});
 return {count:saved.length,products:saved};
}
