import {beforeEach,describe,expect,it,vi} from 'vitest';
const prisma=vi.hoisted(()=>({$transaction:vi.fn(),category:{findUnique:vi.fn()},product:{findUnique:vi.fn(),create:vi.fn(),update:vi.fn()}}));
vi.mock('../src/config/prisma.js',()=>({prisma}));
import {products} from '../src/controllers/admin.controller.js';

describe('automatic product SKU',()=>{
 const body={name:'Milk',category:'dairy-breakfast',unit:'500 ml',description:'Fresh milk',mrp:30,price:28,stock:10};
 const response=()=>{const res={json:vi.fn()};res.status=vi.fn(()=>res);return res};
 beforeEach(()=>{vi.clearAllMocks();prisma.$transaction.mockImplementation(callback=>callback(prisma));prisma.category.findUnique.mockResolvedValue({id:'cat1'});prisma.product.findUnique.mockResolvedValue(null);prisma.product.create.mockImplementation(async({data})=>data);prisma.product.update.mockImplementation(async({data})=>({...data,sku:'EXISTING-SKU'}))});
 it('creates different server-generated SKUs without requiring a client SKU',async()=>{
  const next=vi.fn();
  await products.create({body},response(),next);
  await products.create({body:{...body,sku:'IGNORED'}},response(),next);
  expect(next).not.toHaveBeenCalled();
  const skus=prisma.product.create.mock.calls.map(([args])=>args.data.sku);
  expect(skus[0]).toMatch(/^R2C-[A-F0-9]{32}$/);
  expect(skus[1]).not.toBe(skus[0]);
  expect(skus[1]).not.toBe('IGNORED');
 });
 it('preserves the stored SKU on edit, even if a client sends another value',async()=>{
  prisma.product.findUnique.mockResolvedValue({id:'p1',deletedAt:null});
  const next=vi.fn();
  await products.update({params:{id:'p1'},body:{...body,sku:'REPLACEMENT'}},response(),next);
  expect(next).not.toHaveBeenCalled();
  expect(prisma.product.update.mock.calls[0][0].data).not.toHaveProperty('sku');
 });
 it('persists the chosen stock alert threshold',async()=>{
  const next=vi.fn();await products.create({body:{...body,lowStockThreshold:4}},response(),next);expect(next).not.toHaveBeenCalled();expect(prisma.product.create.mock.calls[0][0].data.lowStockThreshold).toBe(4);
 });
 it('does not edit deleted products',async()=>{
  prisma.product.findUnique.mockResolvedValue({id:'p1',deletedAt:new Date()});const next=vi.fn();await products.update({params:{id:'p1'},body},response(),next);expect(next.mock.calls[0][0].status).toBe(404);expect(prisma.product.update).not.toHaveBeenCalled();
 });
 it('saves two packs together with separate SKUs and stock in one transaction',async()=>{
  prisma.product.create.mockImplementation(async({data})=>({...data,images:data.images?[data.images.create]:[]}));
  const next=vi.fn();
  await products.create({body:{...body,image:'https://example.com/milk.png',packs:[{unit:'1 L',mrp:60,price:55,stock:7}]}},response(),next);
  expect(next).not.toHaveBeenCalled();
  expect(prisma.$transaction).toHaveBeenCalledOnce();
  const [first,second]=prisma.product.create.mock.calls.map(([args])=>args.data);
  expect(first.variantGroupId).toBe(second.variantGroupId);
  expect(first.sku).not.toBe(second.sku);
  expect(second).toMatchObject({unit:'1 L',price:55,stock:7,name:'Milk',categoryId:'cat1'});
  expect(second.images).toEqual(first.images);
 });
 it('rejects duplicate packs before writing anything',async()=>{
  const next=vi.fn();await products.create({body:{...body,packs:[{unit:'500ml',mrp:30,price:28,stock:5}]}},response(),next);
  expect(next.mock.calls[0][0].status).toBe(422);
  expect(prisma.product.create).not.toHaveBeenCalled();
 });
 it('rejects an invalid additional pack before writing the main product',async()=>{
  const next=vi.fn();await products.create({body:{...body,packs:[{unit:'1 L',mrp:60,price:80,stock:5}]}},response(),next);
  expect(next.mock.calls[0][0].status).toBe(422);
  expect(prisma.product.create).not.toHaveBeenCalled();
 });
});
