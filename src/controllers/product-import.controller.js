import {asyncHandler,created,ok} from '../utils/response.js';
import {importProducts,previewProductImport,exportProductsData} from '../services/product-import.service.js';

export const preview=asyncHandler(async(req,res)=>ok(res,await previewProductImport(req.body.rows),'Import preview ready'));
export const save=asyncHandler(async(req,res)=>created(res,await importProducts(req.body.rows),'Products imported'));
export const exportData=asyncHandler(async(req,res)=>ok(res,await exportProductsData(req.query.category),'Products exported'));
