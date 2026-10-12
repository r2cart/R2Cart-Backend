import {AppError} from './response.js';

export function variantData(body){
 const unit=String(body.unit||'').trim();
 const mrp=Number(body.mrp),price=Number(body.price),stock=Number(body.stock);
 if(!unit||unit.length>80)throw new AppError('Enter a pack size, such as 500 g or 1 L',422);
 if(!Number.isFinite(mrp)||!Number.isFinite(price)||mrp<=0||price<=0||price>mrp)throw new AppError('Enter valid pack prices. Selling price must not exceed MRP.',422);
 if(!Number.isInteger(stock)||stock<0)throw new AppError('Stock must be a non-negative whole number',422);
 return {unit,mrp,price,stock};
}

export function ratingSummary(ratings=[]){
 const count=ratings.length;
 return {ratingCount:count,rating:count?Math.round(ratings.reduce((sum,row)=>sum+row.score,0)/count*10)/10:null};
}
