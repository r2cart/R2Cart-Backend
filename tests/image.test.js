import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({config:vi.fn(),uploadStream:vi.fn(),end:vi.fn(),destroy:vi.fn()}));
vi.mock('cloudinary',()=>({v2:{config:mocks.config,uploader:{upload_stream:mocks.uploadStream,destroy:mocks.destroy}}}));
import {uploadProductImage,productImagePublicId,deleteProductImage} from '../src/services/image.service.js';

describe('Cloudinary product uploads',()=>{
 beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('CLOUDINARY_CLOUD_NAME','test-cloud');vi.stubEnv('CLOUDINARY_API_KEY','test-key');vi.stubEnv('CLOUDINARY_API_SECRET','test-secret')});
 it('returns a secure URL and sends the image buffer to the product folder',async()=>{
  mocks.uploadStream.mockImplementation((options,callback)=>({end:buffer=>{mocks.end(buffer);callback(null,{secure_url:'https://res.cloudinary.com/test-cloud/image/upload/sample.jpg',public_id:'r2cart/products/sample'})}}));
  const buffer=Buffer.from('sample-image');
  const result=await uploadProductImage(buffer,'snacks');
  expect(result.publicId).toBe('r2cart/products/sample');
  expect(result.url).toMatch(/^https:/);
  expect(mocks.end).toHaveBeenCalledWith(buffer);
  expect(mocks.uploadStream).toHaveBeenCalledWith(expect.objectContaining({asset_folder:'R2Cart/Categories/snacks',use_asset_folder_as_public_id_prefix:true,resource_type:'image'}),expect.any(Function));
 });
 it('reports missing configuration without uploading',async()=>{
  vi.stubEnv('CLOUDINARY_API_SECRET','');
  await expect(uploadProductImage(Buffer.from('image'))).rejects.toMatchObject({status:503});
  expect(mocks.uploadStream).not.toHaveBeenCalled();
 });
 it('does not expose provider errors or credentials to customers',async()=>{
  mocks.uploadStream.mockImplementation((options,callback)=>({end:()=>callback(new Error('private provider details'))}));
  await expect(uploadProductImage(Buffer.from('image'),'snacks')).rejects.toMatchObject({status:502,message:expect.not.stringContaining('private provider details')});
 });
 it('rejects category folder traversal before contacting Cloudinary',async()=>{
  await expect(uploadProductImage(Buffer.from('image'),'../snacks')).rejects.toMatchObject({status:422});
  expect(mocks.uploadStream).not.toHaveBeenCalled();
 });
 it('extracts the full product public ID from versioned or transformed URLs',()=>{
  expect(productImagePublicId('https://res.cloudinary.com/test-cloud/image/upload/c_fill,w_200/v123/R2Cart/Categories/dairy/milk.png')).toBe('R2Cart/Categories/dairy/milk');
  expect(productImagePublicId('https://res.cloudinary.com/test-cloud/image/upload/R2Cart/Categories/dairy/milk.png')).toBe('R2Cart/Categories/dairy/milk');
 });
 it('does not delete external or unrelated Cloudinary assets',()=>{
  expect(productImagePublicId('https://example.com/milk.png')).toBeNull();
  expect(productImagePublicId('https://res.cloudinary.com/other-cloud/image/upload/v123/R2Cart/Categories/dairy/milk.png')).toBeNull();
  expect(productImagePublicId('https://res.cloudinary.com/test-cloud/image/upload/v123/private/milk.png')).toBeNull();
 });
 it('destroys unused assets with CDN invalidation and accepts retries',async()=>{
  mocks.destroy.mockResolvedValueOnce({result:'ok'}).mockResolvedValueOnce({result:'not found'});
  await deleteProductImage('R2Cart/Categories/dairy/milk');
  await deleteProductImage('R2Cart/Categories/dairy/milk');
  expect(mocks.destroy).toHaveBeenCalledWith('R2Cart/Categories/dairy/milk',expect.objectContaining({invalidate:true,resource_type:'image'}));
 });
 it('surfaces provider deletion failures without exposing credentials',async()=>{
  mocks.destroy.mockRejectedValue(new Error('private secret'));
  await expect(deleteProductImage('R2Cart/Categories/dairy/milk')).rejects.toMatchObject({status:502,message:expect.not.stringContaining('private secret')});
 });
});
