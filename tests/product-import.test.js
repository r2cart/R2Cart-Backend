import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
const db=vi.hoisted(()=>({category:{findMany:vi.fn()},product:{findMany:vi.fn(),findUnique:vi.fn(),create:vi.fn(),update:vi.fn()},$transaction:vi.fn()}));
vi.mock('../src/config/prisma.js',()=>({prisma:db}));
import {validateImport,importProducts} from '../src/services/product-import.service.js';
import {columns,parseCsv,readProductFile,readImageZip} from '../../R2Cart-Web/src/services/product-import.service.js';
const frontendRequire=createRequire(new URL('../../R2Cart-Web/package.json',import.meta.url));
const categories=[{id:'cat1',slug:'dairy',name:'Dairy',status:'ACTIVE'}];
const row={name:'Amul Milk',category:'dairy',unit:'500 ml',mrp:32,price:30,stock:10,description:'Fresh milk',groupCode:'MILK',image:'https://example.com/milk.png'};
describe('bulk product validation',()=>{
 it('accepts independent pack prices and a common group code',()=>{
  const result=validateImport([row,{...row,unit:'1 L',price:60,mrp:64}],categories,[]);expect(result.every(item=>item.valid)).toBe(true);
 });
 it('flags existing and duplicate packs, ignoring spaces and case',()=>{
  const existing=[{name:row.name,categoryId:'cat1',unit:'500ml'}];expect(validateImport([row],categories,existing)[0].valid).toBe(false);
  expect(validateImport([row,{...row,unit:'500ML'}],categories,[])[1].errors.join()).toContain('Duplicate');
 });
 it('flags bad prices, missing stock and unknown categories',()=>{
  const result=validateImport([{...row,stock:'',price:50,category:'missing'}],categories,[])[0];expect(result.errors.length).toBeGreaterThanOrEqual(3);
 });
 it('rejects inconsistent product groups and unsafe image URLs',()=>{
  const result=validateImport([row,{...row,name:'Eggs',unit:'6 pcs',image:'javascript:bad'}],categories,[])[1];expect(result.errors.join()).toContain('same product name');expect(result.errors.join()).toContain('https://');
 });
 it('enforces maximum rows and requires an image source',()=>{
  expect(()=>validateImport(Array(201).fill(row),categories,[])).toThrow('200');expect(validateImport([{...row,image:''}],categories,[])[0].valid).toBe(false);
 });
});
describe('bulk import persistence',()=>{
 beforeEach(()=>{vi.resetAllMocks();db.category.findMany.mockResolvedValue(categories);db.product.findMany.mockResolvedValue([]);db.product.findUnique.mockResolvedValue(null);db.product.create.mockImplementation(async({data})=>data);db.$transaction.mockImplementation(callback=>callback(db))});
 it('saves packs in a single transaction with distinct SKUs and shared group',async()=>{
  const result=await importProducts([row,{...row,unit:'1 L',mrp:64,price:60}]);expect(result.count).toBe(2);expect(db.$transaction).toHaveBeenCalledOnce();expect(result.products[0].sku).not.toBe(result.products[1].sku);expect(result.products[0].variantGroupId).toBe(result.products[1].variantGroupId);
 });
 it('does not start a write when any row is invalid',async()=>{
  await expect(importProducts([row,{...row,unit:'1 L',price:99}])).rejects.toMatchObject({status:422});expect(db.$transaction).not.toHaveBeenCalled();
 });
 it('requires ZIP files to be uploaded before saving',async()=>{
  await expect(importProducts([{...row,image:'',imageFile:'milk.png'}])).rejects.toMatchObject({status:422});expect(db.$transaction).not.toHaveBeenCalled();
 });
 it('returns a friendly conflict on concurrent duplicate imports',async()=>{
  db.product.create.mockRejectedValue({code:'P2002'});await expect(importProducts([row])).rejects.toMatchObject({status:409});
 });
});
describe('spreadsheet file reading',()=>{
 it('handles CSV commas, newlines and escaped quotes',()=>{
  expect(parseCsv('Name,Description\r\nMilk,"Fresh, \"\"daily\"\"\nneeds"')).toEqual([['Name','Description'],['Milk','Fresh, "daily"\nneeds']]);
 });
 it('rejects malformed CSV',()=>{expect(()=>parseCsv('Name,"oops')).toThrow('unclosed')});
 it('maps CSV template headers to API fields',async()=>{
  const content=columns.join(',')+'\nMilk,dairy,500 ml,32,30,10,Fresh milk,MILK,https://example.com/milk.png,,ACTIVE';
  const rows=await readProductFile(new File([content],'products.csv'));expect(rows[0]).toMatchObject({name:'Milk',unit:'500 ml',price:'30',groupCode:'MILK'});
 });
 it('rejects unsupported formats and wrong headers',async()=>{
  await expect(readProductFile(new File(['test'],'products.xls'))).rejects.toThrow('.xlsx');await expect(readProductFile(new File(['name\nMilk'],'products.csv'))).rejects.toThrow('headers');
 });
 it('reads the actual Excel workbook format',async()=>{
  const {Workbook}=frontendRequire('exceljs'),book=new Workbook(),sheet=book.addWorksheet('Products');sheet.addRow(columns);sheet.addRow(['Milk','dairy','500 ml',32,30,10,'Fresh milk','MILK','https://example.com/milk.png','','ACTIVE']);
  const rows=await readProductFile(new File([await book.xlsx.writeBuffer()],'products.xlsx'));expect(rows[0]).toMatchObject({name:'Milk',price:'30',unit:'500 ml'});
 },60000);
 it('extracts ZIP images by filename while excluding unrelated files',async()=>{
  const {zipSync}=frontendRequire('fflate'),bytes=zipSync({'photos/milk.png':new Uint8Array([1,2,3]),'readme.txt':new Uint8Array([4])});
  const images=await readImageZip(new File([bytes],'images.zip'));expect(Object.keys(images)).toEqual(['milk.png']);expect(images['milk.png'].type).toBe('image/png');
 });
 it('rejects duplicate ZIP filenames',async()=>{
  const {zipSync}=frontendRequire('fflate'),bytes=zipSync({'a/milk.png':new Uint8Array([1]),'b/milk.png':new Uint8Array([2])});await expect(readImageZip(new File([bytes],'images.zip'))).rejects.toThrow('Duplicate ZIP filename');
 });
});
