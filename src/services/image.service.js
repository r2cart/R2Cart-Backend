import {v2 as cloudinary} from 'cloudinary';
import {AppError} from '../utils/response.js';

export function isCloudinaryConfigured(){
 return Boolean(process.env.CLOUDINARY_CLOUD_NAME?.trim()&&process.env.CLOUDINARY_API_KEY?.trim()&&process.env.CLOUDINARY_API_SECRET?.trim());
}

function configure(){
 const cloudName=process.env.CLOUDINARY_CLOUD_NAME?.trim();
 const apiKey=process.env.CLOUDINARY_API_KEY?.trim();
 const apiSecret=process.env.CLOUDINARY_API_SECRET?.trim();
 if(!cloudName||!apiKey||!apiSecret)throw new AppError('Cloudinary is not configured. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET to the backend .env.',503);
 cloudinary.config({cloud_name:cloudName,api_key:apiKey,api_secret:apiSecret,secure:true});
 return cloudName;
}

// Accept only images belonging to this store's configured Cloudinary folder.
export function productImagePublicId(value){
 try{
  const url=new URL(value),cloudName=process.env.CLOUDINARY_CLOUD_NAME?.trim();
  if(url.hostname!=='res.cloudinary.com'||!cloudName)return null;
  const prefix=`/${cloudName}/image/upload/`;
  if(!url.pathname.startsWith(prefix))return null;
  const path=decodeURIComponent(url.pathname.slice(prefix.length));
  const match=path.match(/^(?:.*\/)?v\d+\/(R2Cart\/.+)$/);
  const id=(match?.[1]||path).replace(/\.[a-z0-9]+$/i,'');
  return id.startsWith('R2Cart/')&&!id.split('/').some(part=>part==='..'||part==='.')?id:null;
 }catch{return null}
}

export async function deleteProductImage(publicId){
 if(!publicId?.startsWith('R2Cart/'))throw new AppError('Invalid image identifier',422);
 configure();
 try{
  const result=await cloudinary.uploader.destroy(publicId,{resource_type:'image',type:'upload',invalidate:true,timeout:60000});
  if(!['ok','not found'].includes(result?.result))throw new Error('Deletion not confirmed');
 }catch{throw new AppError('Cloudinary image deletion failed. Check your connection and retry.',502)}
}

export async function deleteProductImages(publicIds){
 const valid=publicIds.filter(id=>id?.startsWith('R2Cart/'));
 if(!valid.length)return;
 configure();
 try{
  for(let i=0;i<valid.length;i+=100){
   const chunk=valid.slice(i,i+100);
   await cloudinary.api.delete_resources(chunk,{resource_type:'image',type:'upload'});
  }
 }catch(err){
  for(let i=0;i<valid.length;i+=10){
   const chunk=valid.slice(i,i+10);
   await Promise.allSettled(chunk.map(id=>cloudinary.uploader.destroy(id,{resource_type:'image',type:'upload'})));
  }
 }
}

export async function uploadProductImage(source,categorySlug){
 configure();
 if(!source||(typeof source!=='string'&&!source.length))throw new AppError('Choose an image to upload',422);
 if(!/^[a-z0-9_-]+$/i.test(categorySlug||''))throw new AppError('Select a valid product category before uploading an image',422);
 const assetFolder=`R2Cart/Categories/${categorySlug}`;
 try{
  if(typeof source==='string'&&/^https?:\/\//i.test(source)){
   const existingId=productImagePublicId(source);
   if(existingId)return {url:source,publicId:existingId};
   const result=await cloudinary.uploader.upload(source,{resource_type:'image',asset_folder:assetFolder,use_asset_folder_as_public_id_prefix:true,timeout:60000});
   return {url:result.secure_url,publicId:result.public_id};
  }
  const result=await new Promise((resolve,reject)=>{
   const stream=cloudinary.uploader.upload_stream({resource_type:'image',asset_folder:assetFolder,use_asset_folder_as_public_id_prefix:true,timeout:60000},(error,result)=>error?reject(error):resolve(result));
   stream.end(source);
  });
  return {url:result.secure_url,publicId:result.public_id};
 }catch{
  throw new AppError('Product image upload failed. Check Cloudinary credentials and your connection, then try again.',502);
 }
}

export async function uploadMedia(source,folder='General'){
 configure();
 if(!source||(typeof source!=='string'&&!source.length))throw new AppError('Choose an image to upload',422);
 const cleanFolder=String(folder||'General').replace(/[^a-z0-9_-]/gi,'');
 const assetFolder=`R2Cart/${cleanFolder}`;
 try{
  if(typeof source==='string'&&/^https?:\/\//i.test(source)){
   const result=await cloudinary.uploader.upload(source,{resource_type:'image',asset_folder:assetFolder,use_asset_folder_as_public_id_prefix:true,timeout:60000});
   return {url:result.secure_url,publicId:result.public_id};
  }
  const result=await new Promise((resolve,reject)=>{
   const stream=cloudinary.uploader.upload_stream({resource_type:'image',asset_folder:assetFolder,use_asset_folder_as_public_id_prefix:true,timeout:60000},(error,result)=>error?reject(error):resolve(result));
   stream.end(source);
  });
  return {url:result.secure_url,publicId:result.public_id};
 }catch(err){
  throw new AppError(`Cloudinary media upload failed: ${err.message}`,502);
 }
}
