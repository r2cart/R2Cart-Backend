import {prisma} from '../config/prisma.js';
import {AppError} from '../utils/response.js';
import {deleteProductImage,deleteProductImages,productImagePublicId} from './image.service.js';

export async function deleteProduct(id){
 const product=await prisma.product.findUnique({where:{id},include:{images:true}});
 if(!product)throw new AppError('Product not found',404);
 const ids=[...new Set(product.images.map(image=>productImagePublicId(image.url)).filter(Boolean))];
 if(ids.length){
  // Inactive packs still own their images and may later be enabled again.
  const [images,categories,banners,store]=await Promise.all([
   prisma.productImage.findMany({where:{productId:{not:id},product:{deletedAt:null}},select:{url:true}}),
   prisma.category.findMany({select:{image:true}}),
   prisma.banner.findMany({select:{image:true}}),
   prisma.storeSetting.findUnique({where:{id:1},select:{logo:true}})
  ]);
  const retained=new Set([...images.map(image=>image.url),...categories.map(category=>category.image),...banners.map(banner=>banner.image),store?.logo].map(productImagePublicId).filter(Boolean));
  // Finish provider cleanup before reporting success. Failures leave the listing
  // available for retry; "not found" is safe after partial cleanup or retries.
  for(const publicId of ids)if(!retained.has(publicId))await deleteProductImage(publicId);
 }
 await prisma.product.update({where:{id},data:{deletedAt:product.deletedAt||new Date(),status:'INACTIVE',variantGroupId:null}});
}

export async function deleteAllProducts(){
 const active=await prisma.product.findMany({where:{deletedAt:null},include:{images:true}});
 if(!active.length)return {count:0};
 const ids=[...new Set(active.flatMap(p=>p.images.map(image=>productImagePublicId(image.url))).filter(Boolean))];
 if(ids.length){
  const [categories,banners,store]=await Promise.all([
   prisma.category.findMany({select:{image:true}}),
   prisma.banner.findMany({select:{image:true}}),
   prisma.storeSetting.findUnique({where:{id:1},select:{logo:true}})
  ]);
  const retained=new Set([...categories.map(c=>c.image),...banners.map(b=>b.image),store?.logo].map(productImagePublicId).filter(Boolean));
  const toDelete=ids.filter(id=>!retained.has(id));
  await deleteProductImages(toDelete);
 }
 const result=await prisma.product.updateMany({
  where:{deletedAt:null},
  data:{deletedAt:new Date(),status:'INACTIVE',variantGroupId:null}
 });
 return {count:result.count};
}

export async function deleteProductsByCategory(categoryId){
  const category=await prisma.category.findFirst({
    where:{
      OR:[
        {id:categoryId},
        {slug:categoryId}
      ]
    }
  });
  if(!category)throw new AppError('Category not found',404);

  const active=await prisma.product.findMany({
    where:{categoryId:category.id,deletedAt:null},
    include:{images:true}
  });
  if(!active.length)return {count:0,categoryName:category.name};

  const ids=[...new Set(active.flatMap(p=>p.images.map(image=>productImagePublicId(image.url))).filter(Boolean))];
  if(ids.length){
    const [otherImages,categories,banners,store]=await Promise.all([
      prisma.productImage.findMany({
        where:{product:{categoryId:{not:category.id},deletedAt:null}},
        select:{url:true}
      }),
      prisma.category.findMany({select:{image:true}}),
      prisma.banner.findMany({select:{image:true}}),
      prisma.storeSetting.findUnique({where:{id:1},select:{logo:true}})
    ]);
    const retained=new Set([...otherImages.map(i=>i.url),...categories.map(c=>c.image),...banners.map(b=>b.image),store?.logo].map(productImagePublicId).filter(Boolean));
    const toDelete=ids.filter(id=>!retained.has(id));
    await deleteProductImages(toDelete);
  }

  const result=await prisma.product.updateMany({
    where:{categoryId:category.id,deletedAt:null},
    data:{deletedAt:new Date(),status:'INACTIVE',variantGroupId:null}
  });
  return {count:result.count,categoryName:category.name};
}
