import {prisma} from '../config/prisma.js';
import {AppError,asyncHandler,created,ok} from '../utils/response.js';
import {importProducts,previewProductImport,exportProductsData} from '../services/product-import.service.js';
import {invalidateProducts} from '../services/cache.service.js';
import {resolveUserCategoryScope} from '../utils/category-scope.js';

export const preview=asyncHandler(async(req,res)=>{
  const scope=await resolveUserCategoryScope(req.user);
  const result=await previewProductImport(req.body.rows);
  if(scope.isScoped){
    for(const item of result){
      if(item.data?.categoryId&&!scope.categoryIds.includes(item.data.categoryId)){
        throw new AppError(`Access denied: You are not authorized to import products into this category`,403);
      }
    }
  }
  ok(res,result,'Import preview ready');
});

export const save=asyncHandler(async(req,res)=>{
  const scope=await resolveUserCategoryScope(req.user);
  if(scope.isScoped){
    const previewResult=await previewProductImport(req.body.rows);
    for(const item of previewResult){
      if(item.data?.categoryId&&!scope.categoryIds.includes(item.data.categoryId)){
        throw new AppError(`Access denied: You are not authorized to import products into this category`,403);
      }
    }
  }
  const result=await importProducts(req.body.rows);
  invalidateProducts();
  created(res,result,'Products imported');
});

export const exportData=asyncHandler(async(req,res)=>{
  const scope=await resolveUserCategoryScope(req.user);
  if(scope.isScoped&&req.query.category){
    const cat=await prisma.category.findUnique({where:{slug:req.query.category},select:{id:true}});
    if(!cat||!scope.categoryIds.includes(cat.id)){
      throw new AppError('Access denied: You are not authorized to export products from this category',403);
    }
  }
  ok(res,await exportProductsData(req.query.category,scope.isScoped?scope.categoryIds:null),'Products exported');
});
