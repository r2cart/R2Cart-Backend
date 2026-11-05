import {prisma} from '../config/prisma.js';
import {AppError,asyncHandler,ok} from '../utils/response.js';
import {resolveUserCategoryScope} from '../utils/category-scope.js';
import {invalidateCategories, invalidateBanners, invalidateSettings} from '../services/cache.service.js';

export const reorder=model=>asyncHandler(async(req,res)=>{
 const ids=req.body.ids;
 if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string')) {
   throw new AppError('Provide a unique ordered list of IDs',422);
 }
 if(model==='category'){
   const scope=await resolveUserCategoryScope(req.user);
   if(scope.isScoped){
     throw new AppError('Category Admins cannot reorder store categories. Contact Super Admin.',403);
   }
 }
 const queries = ids.map((id, index) =>
   prisma[model].updateMany({
     where: { id },
     data: { position: index + 1 }
   })
 );
 await prisma.$transaction(queries, { timeout: 30000 });

 if(model==='category'){
   try {
     const updatedCategories = await prisma.category.findMany({
       where: { id: { in: ids } },
       select: { id: true, slug: true }
     });
     const slugMap = new Map(updatedCategories.map(c => [c.id, c.slug]));
     const newSlugOrder = ids.map(id => slugMap.get(id)).filter(Boolean);

     const storeSetting = await prisma.storeSetting.findFirst();
     if (storeSetting) {
       const policies = storeSetting.policies || {};
       const homeLayout = policies.homeLayout || {};
       homeLayout.categoryOrder = newSlugOrder;
       policies.homeLayout = homeLayout;
       await prisma.storeSetting.update({
         where: { id: storeSetting.id },
         data: { policies }
       });
     }
   } catch (e) {
     console.warn('[Reorder] Error syncing homeLayout.categoryOrder:', e.message);
   }
   invalidateCategories();
   invalidateSettings();
 } else if(model==='banner'){
   invalidateBanners();
 }

 ok(res,{ids},'Display order saved');
});
