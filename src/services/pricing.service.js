import {AppError} from '../utils/response.js';

const containsLocality=(zone,area)=>Array.isArray(zone.pincodes)&&zone.pincodes.some(locality=>String(locality).toLowerCase()===String(area||'').trim().toLowerCase());

export async function resolveDeliveryRules(tx,area){
 const settings=await tx.storeSetting.findUnique({where:{id:1}});
 if(!settings)throw new AppError('Store delivery settings are not configured',503);
 let zone=null;
 if(area){
  const zones=await tx.deliveryArea.findMany({where:{status:'ACTIVE'},orderBy:{name:'asc'}});
  zone=zones.find(item=>containsLocality(item,area));
  if(!zone)throw new AppError(`Delivery is currently unavailable in ${area}`,422);
 }
 return {zoneId:zone?.id||null,zoneName:zone?.name||null,minimumOrder:Number(zone?.minimumOrder??settings.minimumOrder),deliveryFee:Number(zone?.deliveryFee??settings.deliveryFee),freeDeliveryThreshold:Number(zone?.freeDeliveryThreshold??settings.freeDeliveryThreshold),estimatedDelivery:zone?`${zone.estimatedMinutes} minutes`:settings.estimatedDelivery};
}

export async function calculateCart(tx,userId,couponCode,rules){
 const cart=await tx.cart.findUnique({where:{userId},include:{items:{include:{product:{include:{images:{take:1}}}}}}});
 if(!cart?.items.length)throw new AppError('Your cart is empty',400);
 let itemTotal=0,subtotal=0;
 for(const item of cart.items){
  if(item.product.status!=='ACTIVE'||item.product.stock<item.quantity){if(item.product.stock<=0)throw new AppError(`${item.product.name} is currently out of stock`,409);throw new AppError(`${item.product.name} has only ${item.product.stock} remaining in stock`,409);}
  itemTotal+=Number(item.product.mrp)*item.quantity;subtotal+=Number(item.product.price)*item.quantity;
 }
 const delivery=rules||await resolveDeliveryRules(tx);
 if(subtotal<delivery.minimumOrder)throw new AppError(`Minimum order for delivery is ₹${delivery.minimumOrder}`,422);
 let coupon=null,couponDiscount=0;
 if(couponCode){
  coupon=await tx.coupon.findUnique({where:{code:couponCode.toUpperCase()}});const now=new Date();
  if(!coupon||coupon.status!=='ACTIVE'||coupon.startsAt>now||coupon.expiresAt<now)throw new AppError('Coupon is unavailable or expired',422);
  if(coupon.usageLimit!==null&&coupon.usageCount>=coupon.usageLimit)throw new AppError('Coupon usage limit reached',422);
  if(subtotal<Number(coupon.minimumOrder))throw new AppError(`Minimum order is ₹${coupon.minimumOrder}`,422);
  const used=await tx.couponUsage.count({where:{couponId:coupon.id,userId}});if(used>=coupon.perUserLimit)throw new AppError('Coupon usage limit reached',422);
  couponDiscount=coupon.type==='FIXED'?Number(coupon.discount):subtotal*Number(coupon.discount)/100;if(coupon.maximumDiscount)couponDiscount=Math.min(couponDiscount,Number(coupon.maximumDiscount));
 }
 const productDiscount=itemTotal-subtotal,deliveryFee=subtotal>=delivery.freeDeliveryThreshold?0:delivery.deliveryFee,handlingFee=0,grandTotal=Math.max(0,subtotal+deliveryFee-couponDiscount);
 return{cart,coupon,itemTotal,subtotal,productDiscount,couponDiscount,deliveryFee,handlingFee,grandTotal,delivery};
}
