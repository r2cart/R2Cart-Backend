import {prisma} from '../config/prisma.js';
import {AppError,asyncHandler,ok} from '../utils/response.js';
import {resolveUserCategoryScope} from '../utils/category-scope.js';

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
 ok(res,{ids},'Display order saved');
});
