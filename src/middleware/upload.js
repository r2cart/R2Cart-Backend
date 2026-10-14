import multer from 'multer';
import {AppError} from '../utils/response.js';

const extensions={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'};

// Use memory storage for all uploads so they can be processed and sent directly to Cloudinary
const memoryUpload=()=>multer({
 storage:multer.memoryStorage(),
 limits:{fileSize:5*1024*1024,files:1},
 fileFilter:(req,file,done)=>extensions[file.mimetype]?done(null,true):done(new AppError('Only JPG, PNG and WebP images are allowed',422))
});

export const productImageUpload=memoryUpload();
export const bannerImageUpload=memoryUpload();
export const storeLogoUpload=memoryUpload();
export const adminAvatarUpload=memoryUpload();
export const categoryImageUpload=memoryUpload();
export const deliveryProofUpload=memoryUpload();
