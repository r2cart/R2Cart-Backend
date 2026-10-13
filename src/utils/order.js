import {ratingSummary} from './variants.js';
export const orderNumber=()=>`GR${Date.now().toString().slice(-8)}${Math.floor(Math.random()*90+10)}`;
export const ticketNumber=()=>`TKT${Date.now().toString().slice(-7)}`;
export const moneyNumber=value=>Number(value||0);
export function productDto(p){const {ratings,...product}=p;return {...product,...ratingSummary(ratings),mrp:moneyNumber(p.mrp),price:moneyNumber(p.price),image:p.images?.[0]?.url||null,images:p.images?.map(x=>x.url)||[],category:p.category?.slug||p.categoryId,categoryName:p.category?.name||null}}
const statusLabel={NEW:'New',CONFIRMED:'Confirmed',PACKING:'Packing',OUT_FOR_DELIVERY:'Out for Delivery',DELIVERED:'Delivered',CANCELLED:'Cancelled'};
export function orderDto(o){return {...o,status:statusLabel[o.status]||o.status,deliveryType:o.deliveryType||'INSTANT',deliveryDate:o.deliveryDate||null,deliverySlot:o.deliverySlot||null,total:moneyNumber(o.grandTotal),itemTotal:moneyNumber(o.itemTotal),productDiscount:moneyNumber(o.productDiscount),couponDiscount:moneyNumber(o.couponDiscount),deliveryFee:moneyNumber(o.deliveryFee),handlingFee:moneyNumber(o.handlingFee),date:o.createdAt,customer:o.user?.name||o.addressSnapshot?.name,mobile:o.addressSnapshot?.mobile||o.user?.mobile||null,address:o.addressSnapshot,items:o.items?.map(i=>({...i,mrp:moneyNumber(i.mrp),price:moneyNumber(i.price)}))}}
