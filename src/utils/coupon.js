import {AppError} from './response.js';
export function couponData(body){
 const code=String(body.code||'').trim().toUpperCase(),type=String(body.type||'').toUpperCase(),status=String(body.status||'ACTIVE').toUpperCase();
 if(!/^[A-Z0-9_-]{3,40}$/.test(code))throw new AppError('Coupon code must contain 3–40 letters, numbers, hyphens or underscores',422);
 if(!['FIXED','PERCENTAGE'].includes(type)||!['ACTIVE','INACTIVE'].includes(status))throw new AppError('Choose a valid discount type and status',422);
 const number=(key,nullable=false)=>{if(nullable&&(body[key]===''||body[key]==null))return null;const value=Number(body[key]);if(body[key]===''||body[key]==null||!Number.isFinite(value)||value<0)throw new AppError(`Enter a valid ${key}`,422);return value};
 const discount=number('discount'),minimumOrder=number('minimumOrder'),maximumDiscount=number('maximumDiscount',true),usageLimit=number('usageLimit',true),perUserLimit=number('perUserLimit');
 if(discount<=0||type==='PERCENTAGE'&&discount>100)throw new AppError('Percentage discounts must be between 0 and 100; fixed discounts must be positive',422);
 if(!Number.isInteger(perUserLimit)||perUserLimit<1||usageLimit!==null&&(!Number.isInteger(usageLimit)||usageLimit<1))throw new AppError('Usage limits must be positive whole numbers',422);
 const startsAt=new Date(body.startsAt),expiresAt=new Date(body.expiresAt);if(Number.isNaN(startsAt.getTime())||Number.isNaN(expiresAt.getTime())||expiresAt<=startsAt)throw new AppError('Expiry must be after the start date',422);
 return {code,type,status,discount,minimumOrder,maximumDiscount,usageLimit,perUserLimit,startsAt,expiresAt};
}
