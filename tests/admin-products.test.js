import {beforeEach,describe,expect,it,vi} from 'vitest';
const db=vi.hoisted(()=>({product:{fields:{lowStockThreshold:'saved-threshold'},findMany:vi.fn(),findFirst:vi.fn(),count:vi.fn()}}));
vi.mock('../src/config/prisma.js',()=>({prisma:db}));
import {get,list,productFilters} from '../src/controllers/admin-products.controller.js';
import {products as customerProducts} from '../src/controllers/catalog.controller.js';
describe('admin product APIs',()=>{
 beforeEach(()=>{vi.resetAllMocks();db.product.findMany.mockResolvedValue([]);db.product.count.mockResolvedValue(0)});
 it('searches both product name and SKU and uses real category/status/threshold filters',()=>{
  expect(productFilters({q:'R2C-',category:'milk',status:'INACTIVE',stock:'low'},'saved-threshold')).toEqual({deletedAt:null,OR:[{name:{contains:'R2C-'}},{sku:{contains:'R2C-'}}],category:{slug:'milk'},status:'INACTIVE',stock:{gt:0,lte:'saved-threshold'}});
 });
 it('rejects unsupported filters',()=>{expect(()=>productFilters({status:'FAKE'})).toThrow('status');expect(()=>productFilters({stock:'FAKE'})).toThrow('stock')});
 it('returns server pagination for all matching records',async()=>{
  db.product.count.mockResolvedValue(125);const res={json:vi.fn()},next=vi.fn();await list({query:{page:'2',limit:'20'}},res,next);expect(next).not.toHaveBeenCalled();expect(db.product.findMany.mock.calls[0][0]).toMatchObject({skip:20,take:20});expect(res.json.mock.calls[0][0].data.pagination).toMatchObject({pages:7,total:125,page:2});
 });
 it('loads inactive packs by their exact database ID',async()=>{
  db.product.findFirst.mockResolvedValue({id:'p1',status:'INACTIVE',mrp:'30',price:'28',images:[],ratings:[]});const res={json:vi.fn()},next=vi.fn();await get({params:{id:'p1'}},res,next);expect(next).not.toHaveBeenCalled();expect(db.product.findFirst.mock.calls[0][0].where).toEqual({id:'p1',deletedAt:null});expect(res.json.mock.calls[0][0].data.status).toBe('INACTIVE');
 });
 it('returns 404 for missing or deleted packs',async()=>{
  db.product.findFirst.mockResolvedValue(null);const next=vi.fn();await get({params:{id:'missing'}},{json:vi.fn()},next);expect(next.mock.calls[0][0].status).toBe(404);
 });
 it('never exposes inactive products through the customer includeInactive query',async()=>{
  const next=vi.fn();await customerProducts({query:{includeInactive:'true'}},{json:vi.fn()},next);expect(next).not.toHaveBeenCalled();expect(db.product.findMany.mock.calls[0][0].where.status).toBe('ACTIVE');
 });
});
