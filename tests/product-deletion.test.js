import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({destroy:vi.fn(),prisma:{product:{findUnique:vi.fn(),update:vi.fn()},productImage:{findMany:vi.fn()},category:{findMany:vi.fn()},banner:{findMany:vi.fn()},storeSetting:{findUnique:vi.fn()}}}));
vi.mock('../src/config/prisma.js',()=>({prisma:mocks.prisma}));
vi.mock('../src/services/image.service.js',()=>({deleteProductImage:mocks.destroy,productImagePublicId:url=>url?.includes('R2Cart/Categories/')?url.slice(url.indexOf('R2Cart/Categories/')).replace('.png',''):null}));
import {deleteProduct} from '../src/services/product-deletion.service.js';
const url='https://res.cloudinary.com/store/image/upload/v123/R2Cart/Categories/dairy/milk.png';
describe('product deletion and shared pack images',()=>{
 beforeEach(()=>{vi.resetAllMocks();mocks.prisma.product.findUnique.mockResolvedValue({id:'pack1',images:[{url},{url}],deletedAt:null});mocks.prisma.productImage.findMany.mockResolvedValue([]);mocks.prisma.category.findMany.mockResolvedValue([]);mocks.prisma.banner.findMany.mockResolvedValue([]);mocks.prisma.storeSetting.findUnique.mockResolvedValue(null);mocks.destroy.mockResolvedValue(undefined)});
 it('deletes each unused image once and archives the product afterwards',async()=>{
  await deleteProduct('pack1');expect(mocks.destroy).toHaveBeenCalledOnce();expect(mocks.destroy).toHaveBeenCalledWith('R2Cart/Categories/dairy/milk');expect(mocks.prisma.product.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:'INACTIVE',variantGroupId:null})}));
 });
 it('preserves an image still referenced by another pack',async()=>{
  mocks.prisma.productImage.findMany.mockResolvedValue([{url}]);await deleteProduct('pack1');expect(mocks.destroy).not.toHaveBeenCalled();expect(mocks.prisma.product.update).toHaveBeenCalledOnce();
 });
 it('preserves an image also used by a category',async()=>{
  mocks.prisma.category.findMany.mockResolvedValue([{image:url}]);await deleteProduct('pack1');expect(mocks.destroy).not.toHaveBeenCalled();
 });
 it('leaves the listing available for retry when Cloudinary fails',async()=>{
  mocks.destroy.mockRejectedValue(new Error('Provider unavailable'));await expect(deleteProduct('pack1')).rejects.toThrow('Provider unavailable');expect(mocks.prisma.product.update).not.toHaveBeenCalled();
 });
 it('returns not found without provider writes for an unknown product',async()=>{
  mocks.prisma.product.findUnique.mockResolvedValue(null);await expect(deleteProduct('unknown')).rejects.toMatchObject({status:404});expect(mocks.destroy).not.toHaveBeenCalled();
 });
});
