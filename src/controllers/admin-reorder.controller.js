import {prisma} from '../config/prisma.js';
import {AppError,asyncHandler,ok} from '../utils/response.js';
export const reorder=model=>asyncHandler(async(req,res)=>{
 const ids=req.body.ids;
 if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string')) {
   throw new AppError('Provide a unique ordered list of IDs',422);
 }
 await prisma.$transaction(async tx=>{
   for(let position=0;position<ids.length;position++){
     await tx[model].updateMany({
       where:{id:ids[position]},
       data:{position:position+1}
     });
   }
 });
 ok(res,{ids},'Display order saved');
});
