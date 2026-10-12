import {beforeEach,describe,expect,it,vi} from 'vitest';
const db=vi.hoisted(()=>({order:{count:vi.fn(),aggregate:vi.fn(),findMany:vi.fn(),groupBy:vi.fn()},user:{count:vi.fn(),findMany:vi.fn()},product:{count:vi.fn(),findMany:vi.fn(),fields:{lowStockThreshold:'threshold-field'}},orderItem:{groupBy:vi.fn()}}));
vi.mock('../src/config/prisma.js',()=>({prisma:db}));
import {getDashboard,reportingDates,salesSeries} from '../src/services/dashboard.service.js';
describe('dashboard reporting dates',()=>{
 it('uses midnight in India even when the server date is UTC',()=>{
  const dates=reportingDates(new Date('2026-09-15T20:00:00Z'));expect(dates.today.toISOString()).toBe('2026-09-15T18:30:00.000Z');expect(dates.tomorrow.toISOString()).toBe('2026-09-16T18:30:00.000Z');
 });
 it('zero-fills missing chart days and assigns revenue at day boundaries',()=>{
  const start=new Date('2026-09-08T18:30:00Z');const sales=salesSeries([{createdAt:start,grandTotal:'55.50'},{createdAt:'2026-09-09T18:30:00Z',grandTotal:'10'}],start);expect(sales).toHaveLength(7);expect(sales[0].v).toBe(55.5);expect(sales[1].v).toBe(10);expect(sales[6].v).toBe(0);
 });
});
describe('live dashboard aggregates',()=>{
 beforeEach(()=>{vi.resetAllMocks();db.order.count.mockResolvedValue(0);db.user.count.mockResolvedValue(0);db.product.count.mockResolvedValue(0);db.order.aggregate.mockResolvedValue({_sum:{grandTotal:null}});db.order.findMany.mockResolvedValue([]);db.order.groupBy.mockResolvedValue([]);db.user.findMany.mockResolvedValue([]);db.product.findMany.mockResolvedValue([]);db.orderItem.groupBy.mockResolvedValue([])});
 it('returns honest zero and empty states for an empty store',async()=>{
  const result=await getDashboard(new Date('2026-09-15T12:00:00Z'));expect(Object.values(result.stats).every(value=>value===0)).toBe(true);expect(result.sales).toHaveLength(7);expect(result.topProducts).toEqual([]);expect(result.orderStatus).toEqual([]);
 });
 it('uses saved per-product thresholds and includes out-for-delivery pending orders',async()=>{
  await getDashboard();expect(db.product.count).toHaveBeenCalledWith({where:{deletedAt:null,stock:{gt:0,lte:'threshold-field'}}});expect(db.order.count).toHaveBeenCalledWith({where:{status:{in:['NEW','CONFIRMED','PACKING','OUT_FOR_DELIVERY']}}});
 });
 it('uses delivered order item prices and quantities rather than current catalogue prices',async()=>{
  db.orderItem.groupBy.mockResolvedValue([{productId:'milk',name:'Milk',unit:'500 ml',price:'30',_sum:{quantity:2}},{productId:'milk',name:'Milk',unit:'500 ml',price:'28',_sum:{quantity:3}}]);const result=await getDashboard();expect(result.topProducts[0]).toMatchObject({unitsSold:5,revenue:144});expect(db.orderItem.groupBy.mock.calls[0][0].where.order.status).toBe('DELIVERED');
 });
 it('returns status counts, actual customer order counts and no private customer fields',async()=>{
  db.order.groupBy.mockResolvedValue([{status:'DELIVERED',_count:{_all:3}},{status:'NEW',_count:{_all:1}}]);db.user.findMany.mockResolvedValue([{id:'u1',name:'Customer',email:'customer@example.com',createdAt:new Date(),_count:{orders:7},passwordHash:'private'}]);const result=await getDashboard();expect(result.orderStatus[0]).toMatchObject({name:'Delivered',value:3});expect(result.recentCustomers[0].orders).toBe(7);expect(result.recentCustomers[0]).not.toHaveProperty('passwordHash');
 });
});
