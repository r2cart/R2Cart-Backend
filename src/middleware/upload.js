import multer from 'multer';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {env} from '../config/env.js';
import {AppError} from '../utils/response.js';

const extensions={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'};
const imageUpload=folder=>{
 const directory=resolve(env.uploadDir,folder);
 mkdirSync(directory,{recursive:true});
 const storage=multer.diskStorage({destination:directory,filename:(req,file,done)=>done(null,`${Date.now()}-${randomUUID()}${extensions[file.mimetype]}`)});
 return multer({storage,limits:{fileSize:5*1024*1024,files:1},fileFilter:(req,file,done)=>extensions[file.mimetype]?done(null,true):done(new AppError('Only JPG, PNG and WebP images are allowed',422))});
};
// Product images go directly to Cloudinary, without creating local files.
export const productImageUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1},fileFilter:(req,file,done)=>extensions[file.mimetype]?done(null,true):done(new AppError('Only JPG, PNG and WebP images are allowed',422))});
export const bannerImageUpload=imageUpload('banners');
export const storeLogoUpload=imageUpload('settings');
export const adminAvatarUpload=imageUpload('admins');
