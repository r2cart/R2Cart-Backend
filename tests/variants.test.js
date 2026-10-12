import {describe,expect,it} from 'vitest';
import {variantData,ratingSummary} from '../src/utils/variants.js';
describe('product packs and real ratings',()=>{
 it('normalizes valid independent pack pricing and stock',()=>{expect(variantData({unit:' 1 L ',mrp:'60',price:'56',stock:'10'})).toEqual({unit:'1 L',mrp:60,price:56,stock:10})});
 it.each([{unit:'',mrp:50,price:40,stock:1},{unit:'1 L',mrp:40,price:50,stock:1},{unit:'1 L',mrp:50,price:40,stock:-1},{unit:'1 L',mrp:50,price:40,stock:1.5}])('rejects invalid pack values',pack=>{expect(()=>variantData(pack)).toThrow()});
 it('does not fabricate ratings for unrated products',()=>{expect(ratingSummary()).toEqual({rating:null,ratingCount:0})});
 it('calculates average and count from database rating rows',()=>{expect(ratingSummary([{score:5},{score:4},{score:4}])).toEqual({rating:4.3,ratingCount:3})});
});
