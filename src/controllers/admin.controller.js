import bcrypt from 'bcryptjs';
import {randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {variantData} from '../utils/variants.js';
import {prisma} from '../config/prisma.js';
import {env} from '../config/env.js';
import {AppError,asyncHandler,created,ok} from '../utils/response.js';
import {productDto} from '../utils/order.js';
import {deleteProduct,deleteAllProducts,deleteProductsByCategory} from '../services/product-deletion.service.js';
import {couponData} from '../utils/coupon.js';
import {uploadProductImage as uploadProductMedia,uploadMedia,relocateProductImage,isCloudinaryConfigured,productImagePublicId,deleteProductImage} from '../services/image.service.js';
import {logAudit} from '../services/audit.service.js';
import {invalidateProducts,invalidateCategories,invalidateBanners,invalidateSettings} from '../services/cache.service.js';

const saveLocalFallback=(buffer,folder)=>{
 const dir=resolve(env.uploadDir,folder);
 mkdirSync(dir,{recursive:true});
 const filename=`${Date.now()}-${randomUUID()}.jpg`;
 writeFileSync(resolve(dir,filename),buffer);
 return filename;
};

export const uploadProductImage=asyncHandler(async(req,res)=>{
 if(!req.file)throw new AppError('Choose an image to upload',422);
 const slug=String(req.body.category||'').trim();
 if(!slug)throw new AppError('Select a category before uploading the product image',422);
 const category=await prisma.category.findUnique({where:{slug},select:{slug:true}});
 if(!category)throw new AppError('Product category not found',404);
 if(isCloudinaryConfigured()){
  const result=await uploadProductMedia(req.file.buffer,category.slug);
  return created(res,result,'Product image uploaded to Cloudinary');
 }
 const filename=saveLocalFallback(req.file.buffer,'products');
 created(res,{url:`${req.protocol}://${req.get('host')}/uploads/products/${filename}`},'Product image uploaded locally');
});

export const uploadCategoryImage=asyncHandler(async(req,res)=>{
 if(!req.file)throw new AppError('Choose an image to upload',422);
 if(isCloudinaryConfigured()){
  const result=await uploadMedia(req.file.buffer,'Categories');
  return created(res,{url:result.url,publicId:result.publicId},'Category image uploaded to Cloudinary');
 }
 const filename=saveLocalFallback(req.file.buffer,'categories');
 created(res,{url:`${req.protocol}://${req.get('host')}/uploads/categories/${filename}`},'Category image uploaded locally');
});

export const uploadBannerImage=asyncHandler(async(req,res)=>{
 if(!req.file)throw new AppError('Choose an image to upload',422);
 if(isCloudinaryConfigured()){
  const result=await uploadMedia(req.file.buffer,'Banners');
  return created(res,{url:result.url,publicId:result.publicId},'Banner image uploaded to Cloudinary');
 }
 const filename=saveLocalFallback(req.file.buffer,'banners');
 created(res,{url:`${req.protocol}://${req.get('host')}/uploads/banners/${filename}`},'Banner image uploaded locally');
});

export const uploadStoreLogo=asyncHandler(async(req,res)=>{
 if(!req.file)throw new AppError('Choose a logo to upload',422);
 if(isCloudinaryConfigured()){
  const result=await uploadMedia(req.file.buffer,'Settings');
  return created(res,{url:result.url,publicId:result.publicId},'Store logo uploaded to Cloudinary');
 }
 const filename=saveLocalFallback(req.file.buffer,'settings');
 created(res,{url:`${req.protocol}://${req.get('host')}/uploads/settings/${filename}`},'Store logo uploaded locally');
});
const productData=body=>{
 const status=String(body.status||'ACTIVE').trim().toUpperCase();
 if(!['ACTIVE','INACTIVE'].includes(status))throw new AppError('Invalid product status',422);
 const threshold=body.lowStockThreshold===undefined?undefined:Number(body.lowStockThreshold);
 if(threshold!==undefined&&(!Number.isInteger(threshold)||threshold<0||threshold>2147483647))throw new AppError('Enter a valid whole-number stock alert threshold',422);
 return {name:String(body.name||'').trim(),description:String(body.description||'').trim(),...variantData(body),...(threshold!==undefined&&{lowStockThreshold:threshold}),status,featured:Boolean(body.featured),bestSeller:Boolean(body.bestSeller)};
};
const productInclude={category:true,ratings:true,images:{orderBy:{position:'asc'}}};
async function uniqueProductSlug(name){const base=name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||`product-${Date.now()}`;let slug=base,index=2;while(await prisma.product.findUnique({where:{slug},select:{id:true}}))slug=`${base}-${index++}`;return slug}
export const products={
 create:asyncHandler(async(req,res)=>{
  const {category}=req.body;
  const rawImages=Array.isArray(req.body.images)?req.body.images:(req.body.image?[req.body.image]:[]);
  const imageUrls=rawImages.map(img=>String(img||'').trim()).filter(Boolean);
  if(!imageUrls.length)throw new AppError('At least 1 product image is required (Cover image)',422);
  if(imageUrls.length>8)throw new AppError('Maximum 8 product images allowed',422);

  const data=productData(req.body);
  const cat=await prisma.category.findUnique({where:{slug:category}});
  if(!cat)throw new AppError('Category not found',404);
  if(!data.name||!data.description||!data.unit)throw new AppError('Complete all required product fields',422);
  const slug=await uniqueProductSlug(data.name);
  const sku=`R2C-${randomUUID().replaceAll('-','').toUpperCase()}`;
  if(req.body.packs!==undefined&&!Array.isArray(req.body.packs))throw new AppError('Pack sizes must be a list',422);
  if((req.body.packs||[]).length>20)throw new AppError('Add no more than 20 additional packs at once',422);
  const packs=(req.body.packs||[]).map(variantData);
  const units=[data.unit,...packs.map(pack=>pack.unit)].map(unit=>unit.toLowerCase().replace(/\s+/g,''));
  if(new Set(units).size!==units.length)throw new AppError('Each pack size must be different',422);
  const baseId=`p-${randomUUID()}`,variantGroupId=packs.length?baseId:null;
  const imageCreateData={create:imageUrls.map((url,position)=>({url,position}))};
  const saved=await prisma.$transaction(async tx=>{
   const base=await tx.product.create({data:{...data,sku,id:baseId,slug,variantGroupId,categoryId:cat.id,images:imageCreateData},include:productInclude});
   for(const pack of packs){const identifier=randomUUID();await tx.product.create({data:{...data,...pack,id:`p-${identifier}`,sku:`R2C-${identifier.replaceAll('-','').toUpperCase()}`,slug:`${slug.slice(0,150)}-${identifier}`,variantGroupId,categoryId:cat.id,images:imageCreateData}})}
   return base;
  });
  invalidateProducts();
  created(res,productDto(saved),'Product and all pack sizes saved');
  logAudit(req, {
    module: 'PRODUCTS',
    action: 'PRODUCT_CREATE',
    resourceId: saved.id,
    resourceName: saved.name,
    details: { name: saved.name, sku: saved.sku, price: Number(saved.price), stock: saved.stock }
  });
 }),
 update:asyncHandler(async(req,res)=>{
  const existing=await prisma.product.findUnique({where:{id:req.params.id},include:{images:{orderBy:{position:'asc'}}}});
  if(!existing||existing.deletedAt)throw new AppError('Product not found',404);
  const {category}=req.body;
  let imageUrls=null;
  if(req.body.images!==undefined||req.body.image!==undefined){
    const rawImages=Array.isArray(req.body.images)?req.body.images:(req.body.image?[req.body.image]:[]);
    imageUrls=rawImages.map(img=>String(img||'').trim()).filter(Boolean);
    if(!imageUrls.length)throw new AppError('At least 1 product image is required (Cover image)',422);
    if(imageUrls.length>8)throw new AppError('Maximum 8 product images allowed',422);
  }
  const data=productData(req.body);
  const cat=await prisma.category.findUnique({where:{slug:category}});
  if(!cat)throw new AppError('Category not found',404);
  if(!data.name||!data.description||!data.unit)throw new AppError('Complete all required product fields',422);

  if(existing.categoryId!==cat.id){
    if(imageUrls&&imageUrls.length>0){
      imageUrls=await Promise.all(imageUrls.map(url=>relocateProductImage(url,cat.slug)));
    }else if(existing.images&&existing.images.length>0){
      const moved=await Promise.all(existing.images.map(img=>relocateProductImage(img.url,cat.slug)));
      imageUrls=moved;
    }
  }

  let packsToProcess = null;
  if(req.body.packs!==undefined){
    if(!Array.isArray(req.body.packs))throw new AppError('Pack sizes must be a list',422);
    if(req.body.packs.length>20)throw new AppError('Add no more than 20 additional packs at once',422);
    packsToProcess = req.body.packs.map(p => ({
      id: p.id && !String(p.id).startsWith('new-') ? String(p.id) : null,
      ...variantData(p),
      status: p.status && ['ACTIVE','INACTIVE'].includes(String(p.status).toUpperCase()) ? String(p.status).toUpperCase() : data.status
    }));
    const units=[data.unit,...packsToProcess.map(p=>p.unit)].map(u=>String(u||'').toLowerCase().replace(/\s+/g,''));
    if(new Set(units).size!==units.length)throw new AppError('Each pack size must be different',422);
  }

  const updated = await prisma.$transaction(async tx => {
    let groupId = existing.variantGroupId;
    if (!groupId && packsToProcess && packsToProcess.length > 0) {
      groupId = existing.id;
    }

    const base = await tx.product.update({
      where: { id: req.params.id },
      data: {
        ...data,
        categoryId: cat.id,
        variantGroupId: packsToProcess ? (packsToProcess.length > 0 ? groupId : null) : existing.variantGroupId,
        ...(imageUrls && { images: { deleteMany: {}, create: imageUrls.map((url, position) => ({ url, position })) } })
      },
      include: productInclude
    });

    if (packsToProcess !== null) {
      const effectiveGroupId = groupId || existing.id;
      const existingVariants = await tx.product.findMany({
        where: {
          deletedAt: null,
          id: { not: existing.id },
          variantGroupId: { in: [effectiveGroupId, ...(existing.variantGroupId ? [existing.variantGroupId] : [])] }
        }
      });

      const incomingIds = new Set(packsToProcess.map(p => p.id).filter(Boolean));
      const toRemove = existingVariants.filter(ev => !incomingIds.has(ev.id));
      for (const rem of toRemove) {
        await tx.product.update({
          where: { id: rem.id },
          data: { deletedAt: new Date(), status: 'INACTIVE', variantGroupId: null }
        });
      }

      for (const pack of packsToProcess) {
        if (pack.id && existingVariants.some(ev => ev.id === pack.id)) {
          await tx.product.update({
            where: { id: pack.id },
            data: {
              unit: pack.unit,
              mrp: pack.mrp,
              price: pack.price,
              stock: pack.stock,
              status: pack.status,
              name: data.name,
              description: data.description,
              categoryId: cat.id,
              featured: data.featured,
              bestSeller: data.bestSeller,
              ...(data.lowStockThreshold !== undefined && { lowStockThreshold: data.lowStockThreshold }),
              variantGroupId: effectiveGroupId,
              ...(imageUrls && { images: { deleteMany: {}, create: imageUrls.map((url, position) => ({ url, position })) } })
            }
          });
        } else {
          const identifier = randomUUID();
          await tx.product.create({
            data: {
              ...data,
              unit: pack.unit,
              mrp: pack.mrp,
              price: pack.price,
              stock: pack.stock,
              status: pack.status,
              id: `p-${identifier}`,
              sku: `R2C-${identifier.replaceAll('-','').toUpperCase()}`,
              slug: `${existing.slug.slice(0,150)}-${identifier}`,
              variantGroupId: effectiveGroupId,
              categoryId: cat.id,
              images: imageUrls ? { create: imageUrls.map((url, position) => ({ url, position })) } : (existing.images?.length ? { create: existing.images.map(img => ({ url: img.url, position: img.position })) } : undefined)
            }
          });
        }
      }

      if (packsToProcess.length === 0 && existing.variantGroupId) {
        await tx.product.update({
          where: { id: existing.id },
          data: { variantGroupId: null }
        });
      }
    } else if (existing.variantGroupId) {
      await tx.product.updateMany({
        where: {
          variantGroupId: existing.variantGroupId,
          id: { not: existing.id },
          deletedAt: null
        },
        data: {
          name: data.name,
          description: data.description,
          categoryId: cat.id,
          featured: data.featured,
          bestSeller: data.bestSeller,
          ...(data.lowStockThreshold !== undefined && { lowStockThreshold: data.lowStockThreshold })
        }
      });
      if (imageUrls) {
        const siblings = await tx.product.findMany({
          where: { variantGroupId: existing.variantGroupId, id: { not: existing.id }, deletedAt: null },
          select: { id: true }
        });
        for (const sib of siblings) {
          await tx.product.update({
            where: { id: sib.id },
            data: { images: { deleteMany: {}, create: imageUrls.map((url, position) => ({ url, position })) } }
          });
        }
      }
    }

    return base;
  });

  logAudit(req,{
    module:'PRODUCTS',
    action:'PRODUCT_UPDATE',
    resourceId:updated.id,
    resourceName:updated.name,
    details:{name:updated.name,price:Number(updated.price),stock:updated.stock}
  });
  invalidateProducts();
  ok(res,productDto(updated),'Product and all pack sizes updated');
 }),
 status:asyncHandler(async(req,res)=>{const status=String(req.body.status||'').trim().toUpperCase();if(!['ACTIVE','INACTIVE'].includes(status))throw new AppError('Status must be ACTIVE or INACTIVE',422);const product=await prisma.product.findUnique({where:{id:req.params.id},select:{id:true}});if(!product)throw new AppError('Product not found',404);const updatedProduct=await prisma.product.update({where:{id:req.params.id},data:{status},include:productInclude});invalidateProducts();ok(res,productDto(updatedProduct),status==='ACTIVE'?'Product activated':'Product deactivated')}),
 remove:asyncHandler(async(req,res)=>{await deleteProduct(req.params.id);invalidateProducts();ok(res,null,'Product deleted; unused Cloudinary images removed')}),
 removeAll:asyncHandler(async(req,res)=>{const result=await deleteAllProducts();invalidateProducts();ok(res,result,`All ${result.count} products deleted successfully`)}),
  removeByCategory:asyncHandler(async(req,res)=>{const result=await deleteProductsByCategory(req.params.categoryId);invalidateProducts();ok(res,result,`All ${result.count} products in ${result.categoryName||'category'} deleted successfully`)}),
 stock:asyncHandler(async(req,res)=>{
  const current=await prisma.product.findUnique({where:{id:req.params.id}});if(!current||current.deletedAt)throw new AppError('Product not found',404);
  const stock=Number(req.body.stock),lowStockThreshold=req.body.lowStockThreshold===undefined?current.lowStockThreshold:Number(req.body.lowStockThreshold);
  if(req.body.stock===''||!Number.isInteger(stock)||stock<0||stock>2147483647||!Number.isInteger(lowStockThreshold)||lowStockThreshold<0||lowStockThreshold>2147483647)throw new AppError('Stock and threshold must be valid whole numbers',422);
  const product=await prisma.product.update({where:{id:req.params.id},data:{stock,lowStockThreshold},include:productInclude});
  invalidateProducts();
  logAudit(req,{module:'INVENTORY',action:'STOCK_UPDATE',resourceId:product.id,resourceName:product.name,details:{previousStock:current.stock,newStock:stock,lowStockThreshold}});
  ok(res,{...productDto(product),stockStatus:stock===0?'OUT_OF_STOCK':stock<=lowStockThreshold?'LOW_STOCK':'IN_STOCK'},'Stock updated');
 }),
 comingSoon:asyncHandler(async(req,res)=>{
  const productId=req.params.id;
  const currentProduct=await prisma.product.findUnique({
    where:{id:productId},
    include:{category:true}
  });
  if(!currentProduct||currentProduct.deletedAt)throw new AppError('Product not found',404);

  const setting=await prisma.storeSetting.findUnique({where:{id:1}});
  const policies=setting?.policies||{};
  const homeLayout=policies.homeLayout||{};
  const comingSoonCats=Array.isArray(homeLayout.comingSoonCategories)?homeLayout.comingSoonCategories:[];
  const comingSoonProducts=new Set(homeLayout.comingSoonProducts||[]);
  const comingSoonExemptions=new Set(homeLayout.comingSoonExemptions||[]);

  // Include all variant packs of this product so variants stay in sync
  const allRelatedProducts=await prisma.product.findMany({
    where:{
      deletedAt:null,
      OR:[
        {id:productId},
        ...(currentProduct.variantGroupId?[{variantGroupId:currentProduct.variantGroupId}]:[{variantGroupId:productId}])
      ]
    },
    select:{id:true}
  });
  const allIds=Array.from(new Set([productId,...allRelatedProducts.map(p=>p.id)]));

  // Calculate current effective coming soon status
  const catSlug=currentProduct.category?.slug;
  const isCatSoon=Boolean(catSlug&&comingSoonCats.includes(catSlug));
  let currentEffectiveSoon=false;
  if(comingSoonProducts.has(productId)){
    currentEffectiveSoon=true;
  }else if(comingSoonExemptions.has(productId)){
    currentEffectiveSoon=false;
  }else if(isCatSoon){
    currentEffectiveSoon=true;
  }else{
    currentEffectiveSoon=Boolean(currentProduct.isSoon);
  }

  const targetSoon=req.body.isSoon!==undefined?Boolean(req.body.isSoon):!currentEffectiveSoon;

  if(targetSoon){
    allIds.forEach(id=>{
      comingSoonProducts.add(id);
      comingSoonExemptions.delete(id);
    });
  }else{
    allIds.forEach(id=>{
      comingSoonProducts.delete(id);
      if(isCatSoon){
        comingSoonExemptions.add(id);
      }else{
        comingSoonExemptions.delete(id);
      }
    });
  }

  const updatedList=Array.from(comingSoonProducts);
  const updatedExemptions=Array.from(comingSoonExemptions);
  const updatedPolicies={
    ...policies,
    homeLayout:{
      ...homeLayout,
      comingSoonProducts:updatedList,
      comingSoonExemptions:updatedExemptions
    }
  };

  await prisma.storeSetting.upsert({
    where:{id:1},
    update:{policies:updatedPolicies},
    create:{
      id:1,
      storeName:'R2Cart',
      contactNumber:'+91 80000 10001',
      email:'support@r2cart.in',
      address:'Hathua',
      openingTime:'06:00',
      closingTime:'22:00',
      minimumOrder:0,
      deliveryFee:0,
      freeDeliveryThreshold:499,
      estimatedDelivery:'15-25 mins',
      notifications:{orders:true,stock:true,customers:true},
      policies:updatedPolicies
    }
  });

  invalidateSettings();
  invalidateProducts();

  logAudit(req,{
    module:'PRODUCTS',
    action:'PRODUCT_COMING_SOON_TOGGLE',
    resourceId:productId,
    resourceName:currentProduct.name,
    details:{productId,isSoon:targetSoon,name:currentProduct.name}
  });

  ok(res,{
    id:productId,
    isSoon:targetSoon,
    comingSoonProducts:updatedList,
    comingSoonExemptions:updatedExemptions,
    policies:updatedPolicies
  },targetSoon?`"${currentProduct.name}" marked as Coming Soon`:`"${currentProduct.name}" marked as Available`);
 })
};
const categoryData=body=>{
 const name=String(body.name||'').trim();
 if(!name)throw new AppError('Category name is required',422);
 const slug=String(body.slug||name).trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
 if(!slug)throw new AppError('Please enter a valid category name',422);
 const status=String(body.status||'ACTIVE').toUpperCase();
 if(!['ACTIVE','INACTIVE'].includes(status))throw new AppError('Invalid category status',422);
 return {name,slug,image:String(body.image||'').trim()||null,color:String(body.color||'').trim()||'#EAF8E8',position:Number(body.position||0),status,parentId:body.parentId||null};
};
const categoryInclude={parent:{select:{id:true,name:true}},children:{select:{id:true,name:true,status:true},orderBy:{position:'asc'}},_count:{select:{products:{where:{deletedAt:null}}}}};
export const categories={
 list:asyncHandler(async(req,res)=>ok(res,await prisma.category.findMany({include:categoryInclude,orderBy:[{position:'asc'},{name:'asc'}]}))),
 create:asyncHandler(async(req,res)=>{const createdCat=await prisma.category.create({data:categoryData(req.body),include:categoryInclude});invalidateCategories();created(res,createdCat,'Category created')}),
 update:asyncHandler(async(req,res)=>{
  if(req.body.parentId===req.params.id)throw new AppError('A category cannot be its own parent',422);
  const existing=await prisma.category.findUnique({where:{id:req.params.id}});
  if(!existing)throw new AppError('Category not found',404);
  const nextData=categoryData(req.body);
  const updated=await prisma.category.update({where:{id:req.params.id},data:nextData,include:categoryInclude});
  if(existing.image && existing.image !== nextData.image){
    const oldPubId = productImagePublicId(existing.image);
    if(oldPubId && isCloudinaryConfigured()){
      try{ await deleteProductImage(oldPubId); }catch(e){ console.warn('Old category image cleanup notice:', e.message); }
    }
  }
  invalidateCategories();
  ok(res,updated,'Category updated');
 }),
 remove:asyncHandler(async(req,res)=>{
  const category=await prisma.category.findUnique({where:{id:req.params.id},include:{_count:{select:{products:{where:{deletedAt:null}},children:true}}}});
  if(!category)throw new AppError('Category not found',404);
  if(category._count.products||category._count.children)throw new AppError('Remove this category’s products and subcategories before deleting it.',409);
  await prisma.category.delete({where:{id:req.params.id}});
  if(category.image){
    const oldPubId = productImagePublicId(category.image);
    if(oldPubId && isCloudinaryConfigured()){
      try{ await deleteProductImage(oldPubId); }catch(e){ console.warn('Category image cleanup notice:', e.message); }
    }
  }
  invalidateCategories();
  ok(res,null,'Category deleted');
 })
};
export const coupons={
 list:asyncHandler(async(req,res)=>ok(res,await prisma.coupon.findMany({orderBy:{createdAt:'desc'}}))),
 create:asyncHandler(async(req,res)=>created(res,await prisma.coupon.create({data:couponData(req.body)}),'Coupon created')),
 update:asyncHandler(async(req,res)=>ok(res,await prisma.coupon.update({where:{id:req.params.id},data:couponData(req.body)}),'Coupon updated')),
 status:asyncHandler(async(req,res)=>{const status=String(req.body.status||'').toUpperCase();if(!['ACTIVE','INACTIVE'].includes(status))throw new AppError('Status must be ACTIVE or INACTIVE',422);ok(res,await prisma.coupon.update({where:{id:req.params.id},data:{status}}),status==='ACTIVE'?'Coupon activated':'Coupon deactivated')}),
 remove:asyncHandler(async(req,res)=>{const coupon=await prisma.coupon.findUnique({where:{id:req.params.id},select:{id:true}});if(!coupon)throw new AppError('Coupon not found',404);await prisma.$transaction([prisma.couponUsage.deleteMany({where:{couponId:req.params.id}}),prisma.order.updateMany({where:{couponId:req.params.id},data:{couponId:null}}),prisma.coupon.delete({where:{id:req.params.id}})]);ok(res,null,'Coupon permanently deleted')})
};
const bannerData=body=>{
 const heading=String(body.heading||'').trim();
 if(!heading)throw new AppError('Banner heading is required',422);
 const status=String(body.status||'ACTIVE').trim().toUpperCase();
 if(!['ACTIVE','INACTIVE'].includes(status))throw new AppError('Status must be ACTIVE or INACTIVE',422);
 return {kicker:String(body.kicker||'').trim()||null,heading,subtitle:String(body.subtitle||'').trim()||null,image:String(body.image||'').trim()||null,ctaText:String(body.ctaText||'Shop now').trim()||'Shop now',destination:String(body.destination||'/').trim()||'/',position:Math.max(0,Number(body.position)||0),status};
};
export const banners={
 list:asyncHandler(async(req,res)=>ok(res,await prisma.banner.findMany({orderBy:[{position:'asc'},{createdAt:'desc'}]}))),
 create:asyncHandler(async(req,res)=>{const b=await prisma.banner.create({data:bannerData(req.body)});invalidateBanners();created(res,b,'Banner created')}),
 update:asyncHandler(async(req,res)=>{const b=await prisma.banner.update({where:{id:req.params.id},data:bannerData(req.body)});invalidateBanners();ok(res,b,'Banner updated')}),
 status:asyncHandler(async(req,res)=>{const status=String(req.body.status||'').toUpperCase();if(!['ACTIVE','INACTIVE'].includes(status))throw new AppError('Status must be ACTIVE or INACTIVE',422);const b=await prisma.banner.update({where:{id:req.params.id},data:{status}});invalidateBanners();ok(res,b,status==='ACTIVE'?'Banner activated':'Banner deactivated')}),
 remove:asyncHandler(async(req,res)=>{await prisma.banner.delete({where:{id:req.params.id}});invalidateBanners();ok(res,null,'Banner permanently deleted')})
};
export const inventory=asyncHandler(async(req,res)=>{
 const rows=await prisma.product.findMany({where:{deletedAt:null},include:{category:true,images:{take:1}},orderBy:{stock:'asc'}});
 const data=rows.map(product=>({...productDto(product),stockStatus:product.stock===0?'OUT_OF_STOCK':product.stock<=product.lowStockThreshold?'LOW_STOCK':'IN_STOCK'}));
 ok(res,data);
});
const deliveryData=body=>{
 const name=String(body.name||'').trim();if(!name)throw new AppError('Delivery zone name is required',422);
 const localities=[...new Set((Array.isArray(body.localities)?body.localities:body.pincodes||[]).map(value=>String(value).trim()).filter(Boolean))];
 if(!localities.length)throw new AppError('Select at least one serviceable locality',422);
 const number=(key,label,{nullable=false}={})=>{if(nullable&&(body[key]===''||body[key]==null))return null;const value=Number(body[key]);if(!Number.isFinite(value)||value<0)throw new AppError(`${label} must be zero or more`,422);return value};
 const status=String(body.status||'ACTIVE').toUpperCase();if(!['ACTIVE','INACTIVE'].includes(status))throw new AppError('Status must be ACTIVE or INACTIVE',422);
 const estimatedMinutes=number('estimatedMinutes','Estimated delivery time');if(!Number.isInteger(estimatedMinutes)||estimatedMinutes<1)throw new AppError('Estimated delivery time must be at least 1 minute',422);
 return {name,pincodes:localities,radiusKm:number('radiusKm','Delivery radius',{nullable:true}),minimumOrder:number('minimumOrder','Minimum order'),deliveryFee:number('deliveryFee','Delivery fee'),freeDeliveryThreshold:number('freeDeliveryThreshold','Free delivery threshold'),estimatedMinutes,status};
};
const deliveryView=area=>({...area,localities:Array.isArray(area.pincodes)?area.pincodes:[]});
export const delivery={
 defaults:asyncHandler(async(req,res)=>{
  const data={};for(const key of ['minimumOrder','deliveryFee','freeDeliveryThreshold']){const value=Number(req.body[key]);if(req.body[key]===''||req.body[key]==null||!Number.isFinite(value)||value<0)throw new AppError(`Enter a valid ${key}`,422);data[key]=value}
  data.estimatedDelivery=String(req.body.estimatedDelivery||'').trim();if(!data.estimatedDelivery)throw new AppError('Delivery estimate is required',422);
  if(!await prisma.storeSetting.findUnique({where:{id:1},select:{id:true}}))throw new AppError('Configure store settings first',409);
  const updatedSetting=await prisma.storeSetting.update({where:{id:1},data});
  invalidateSettings();
  ok(res,updatedSetting,'Default delivery rules saved');
 }),
 list:asyncHandler(async(req,res)=>ok(res,(await prisma.deliveryArea.findMany({orderBy:{name:'asc'}})).map(deliveryView))),
 create:asyncHandler(async(req,res)=>{const createdZone=deliveryView(await prisma.deliveryArea.create({data:deliveryData(req.body)}));invalidateSettings();created(res,createdZone,'Delivery zone created')}),
 update:asyncHandler(async(req,res)=>{const updatedZone=deliveryView(await prisma.deliveryArea.update({where:{id:req.params.id},data:deliveryData(req.body)}));invalidateSettings();ok(res,updatedZone,'Delivery zone updated')}),
 status:asyncHandler(async(req,res)=>{const status=String(req.body.status||'').toUpperCase();if(!['ACTIVE','INACTIVE'].includes(status))throw new AppError('Status must be ACTIVE or INACTIVE',422);const updatedZone=deliveryView(await prisma.deliveryArea.update({where:{id:req.params.id},data:{status}}));invalidateSettings();ok(res,updatedZone,status==='ACTIVE'?'Delivery zone activated':'Delivery zone paused')}),
 remove:asyncHandler(async(req,res)=>{await prisma.deliveryArea.delete({where:{id:req.params.id}});invalidateSettings();ok(res,null,'Delivery zone permanently deleted')})
};
export const support={
 list:asyncHandler(async(req,res)=>{
  const tickets=await prisma.supportTicket.findMany({
   include:{
    user:{
     select:{
      id:true,
      name:true,
      email:true,
      mobile:true,
      addresses:{take:1,select:{mobile:true}}
     }
    },
    messages:{orderBy:{createdAt:'asc'}}
   },
   orderBy:{createdAt:'desc'}
  });

  const orderIds=tickets.map(t=>t.orderId).filter(Boolean);
  let orderMap=new Map();
  if(orderIds.length>0){
   const orders=await prisma.order.findMany({
    where:{id:{in:orderIds}},
    select:{id:true,orderNumber:true,addressSnapshot:true}
   });
   orders.forEach(o=>orderMap.set(o.id,o));
  }

  const result=tickets.map(t=>{
   const order=t.orderId?orderMap.get(t.orderId):null;
   const orderAddressMobile=order?.addressSnapshot?.mobile||order?.addressSnapshot?.phone||null;
   const descPhoneMatch=(t.description||'').match(/(?:Contact (?:Phone|Mobile)|Phone|Mobile):\s*([+0-9\s-]{10,15})/i);
   const descPhone=descPhoneMatch?descPhoneMatch[1].trim():null;
   const customerPhone=t.user?.mobile||orderAddressMobile||t.user?.addresses?.[0]?.mobile||descPhone||null;
   return {
    ...t,
    customerPhone,
    orderNumber:order?.orderNumber||null
   };
  });

  ok(res,result);
 }),
 reply:asyncHandler(async(req,res)=>{
  const status=req.body.status?String(req.body.status).toUpperCase():undefined;
  if(status&&!['OPEN','PENDING','RESOLVED'].includes(status))throw new AppError('Invalid ticket status',422);
  const message=String(req.body.message||'').trim();
  const ticket=await prisma.supportTicket.update({
   where:{id:req.params.id},
   data:{status,messages:message?{create:{message,isAdmin:true,senderId:req.user.id}}:undefined},
   include:{
    user:{
     select:{
      id:true,
      name:true,
      email:true,
      mobile:true,
      addresses:{take:1,select:{mobile:true}}
     }
    },
    messages:{orderBy:{createdAt:'asc'}}
   }
  });

  let orderNumber=null;
  const descPhoneMatch=(ticket.description||'').match(/(?:Contact (?:Phone|Mobile)|Phone|Mobile):\s*([+0-9\s-]{10,15})/i);
  const descPhone=descPhoneMatch?descPhoneMatch[1].trim():null;
  let customerPhone=ticket.user?.mobile||ticket.user?.addresses?.[0]?.mobile||descPhone||null;
  if(ticket.orderId){
   const order=await prisma.order.findUnique({where:{id:ticket.orderId},select:{orderNumber:true,addressSnapshot:true}});
   orderNumber=order?.orderNumber||null;
   customerPhone=customerPhone||order?.addressSnapshot?.mobile||order?.addressSnapshot?.phone||null;
  }

  ok(res,{...ticket,customerPhone,orderNumber},'Ticket updated');
 })
};
export const settings={
 get:asyncHandler(async(req,res)=>ok(res,await prisma.storeSetting.findUnique({where:{id:1}}))),
 save:asyncHandler(async(req,res)=>{
  const current=await prisma.storeSetting.findUnique({where:{id:1}});
  const text=(key,label)=>{const value=String(req.body[key]||'').trim();if(!value)throw new AppError(`${label} is required`,422);return value};
  const money=(key,label)=>{const value=Number(req.body[key]===undefined?current?.[key]:req.body[key]);if(!Number.isFinite(value)||value<0)throw new AppError(`${label} must be zero or more`,422);return value};
  const openingTime=text('openingTime','Opening time'),closingTime=text('closingTime','Closing time');
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(openingTime)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(closingTime))throw new AppError('Enter valid store opening and closing times',422);
  const email=text('email','Email');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new AppError('Enter a valid store email',422);
  const notifications=req.body.notifications&&typeof req.body.notifications==='object'?req.body.notifications:{};
  if(req.body.estimatedDelivery===undefined)req.body.estimatedDelivery=current?.estimatedDelivery;
  const policies=req.body.policies!==undefined?(typeof req.body.policies==='object'&&req.body.policies!==null?req.body.policies:null):(current?.policies||null);
  const globalDeliveryRadius=req.body.globalDeliveryRadius!==undefined?Math.max(0.1,Number(req.body.globalDeliveryRadius)||5.0):(current?.globalDeliveryRadius?Number(current.globalDeliveryRadius):5.0);
  const data={storeName:text('storeName','Store name'),logo:String(req.body.logo||'').trim()||null,contactNumber:text('contactNumber','Contact number'),email,address:text('address','Store address'),openingTime,closingTime,currency:String(req.body.currency||'INR').trim().toUpperCase(),minimumOrder:money('minimumOrder','Minimum order'),deliveryFee:money('deliveryFee','Delivery fee'),freeDeliveryThreshold:money('freeDeliveryThreshold','Free delivery threshold'),estimatedDelivery:text('estimatedDelivery','Estimated delivery'),globalDeliveryRadius,notifications:{orders:Boolean(notifications.orders),stock:Boolean(notifications.stock),customers:Boolean(notifications.customers)},policies};
  const savedSetting = await prisma.storeSetting.upsert({where:{id:1},update:data,create:{id:1,...data}});
  invalidateSettings();
  logAudit(req,{module:'SETTINGS',action:'STORE_SETTINGS_UPDATE',resourceId:'1',resourceName:'Store Settings',details:{storeName:data.storeName,openingTime:data.openingTime,closingTime:data.closingTime,minimumOrder:data.minimumOrder,deliveryFee:data.deliveryFee,globalDeliveryRadius:data.globalDeliveryRadius}});
  ok(res,savedSetting,'Store settings saved');
 }),
 emergencyPause:asyncHandler(async(req,res)=>{
  const current=await prisma.storeSetting.findUnique({where:{id:1}});
  if(!current)throw new AppError('Store settings not found',404);
  const isPaused=Boolean(req.body.isPaused);
  const reason=String(req.body.reason||'').trim();
  const message=String(req.body.message||'').trim();
  const resumesAt=req.body.resumesAt?new Date(req.body.resumesAt).toISOString():null;
  const holidayDates=Array.isArray(req.body.holidayDates)?req.body.holidayDates.map(String):[];
  const existingPolicies=(typeof current.policies==='object'&&current.policies!==null)?current.policies:{};
  const updatedPolicies={
   ...existingPolicies,
   emergencyPause:{
    isPaused,
    reason:reason||null,
    message:message||null,
    resumesAt,
    holidayDates,
    updatedAt:new Date().toISOString()
   }
  };
  const updated=await prisma.storeSetting.update({
   where:{id:1},
   data:{policies:updatedPolicies}
  });
  invalidateSettings();
  logAudit(req,{module:'SETTINGS',action:isPaused?'EMERGENCY_PAUSE_ACTIVATED':'EMERGENCY_PAUSE_DEACTIVATED',resourceId:'1',resourceName:'Emergency Pause',details:{isPaused,reason,message,resumesAt}});
  ok(res,updated,isPaused?'Store orders paused':'Store orders resumed');
 })
};
