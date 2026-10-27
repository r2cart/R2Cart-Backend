import {ratingSummary} from './variants.js';
import {optimizeCloudinaryUrl} from '../services/image.service.js';

export const orderNumber=()=>`GR${Date.now().toString().slice(-8)}${Math.floor(Math.random()*90+10)}`;
export const ticketNumber=()=>`TKT${Date.now().toString().slice(-7)}`;
export const moneyNumber=value=>Number(value||0);

export function productDto(p){
  const {ratings,...product}=p;
  const rawImage = p.images?.[0]?.url||null;
  return {
    ...product,
    ...ratingSummary(ratings),
    mrp:moneyNumber(p.mrp),
    price:moneyNumber(p.price),
    costPrice:moneyNumber(p.costPrice),
    image:optimizeCloudinaryUrl(rawImage, { width: 800 }),
    images:p.images?.map(x=>optimizeCloudinaryUrl(x.url, { width: 800 }))||[],
    category:p.category?.slug||p.categoryId,
    categorySlug:p.category?.slug||null,
    categoryName:p.category?.name||null
  };
}

const statusLabel={NEW:'New',CONFIRMED:'Confirmed',PACKING:'Packing',OUT_FOR_DELIVERY:'Out for Delivery',DELIVERED:'Delivered',CANCELLED:'Cancelled'};

export function orderDto(o){
  let snap=o.addressSnapshot;
  if(typeof snap==='string'){try{snap=JSON.parse(snap)}catch{snap={}}}
  snap=snap||{};

  // Find delivered timestamp and delivery personnel
  const assignments = Array.isArray(o.deliveryAssignments) ? o.deliveryAssignments : [];
  const deliveredAssignment = assignments.find(a => a.status === 'DELIVERED' || a.deliveredAt);
  const deliveredHistory = (o.history || []).find(h => h.status === 'DELIVERED');
  const deliveredAt = o.deliveredAt || deliveredAssignment?.deliveredAt || deliveredHistory?.createdAt || (o.status === 'DELIVERED' ? o.updatedAt : null);

  const activeAssignment = assignments.find(a => a.isCurrent) || assignments[0] || null;
  const deliveryStaff = deliveredAssignment?.deliveryPerson || activeAssignment?.deliveryPerson || null;
  const proof = deliveredAssignment?.proofs?.[0] || o.deliveryProofs?.[0] || null;

  return {
    ...o,
    status: statusLabel[o.status] || o.status,
    deliveryType: o.deliveryType || 'INSTANT',
    deliveryDate: o.deliveryDate || null,
    deliverySlot: o.deliverySlot || null,
    deliveryInstruction: o.deliveryInstruction || null,
    total: moneyNumber(o.grandTotal),
    itemTotal: moneyNumber(o.itemTotal),
    productDiscount: moneyNumber(o.productDiscount),
    couponDiscount: moneyNumber(o.couponDiscount),
    deliveryFee: moneyNumber(o.deliveryFee),
    handlingFee: moneyNumber(o.handlingFee),
    date: o.createdAt,
    deliveredAt: deliveredAt,
    deliveryPerson: deliveryStaff ? {
      id: deliveryStaff.id,
      name: deliveryStaff.name,
      mobile: deliveryStaff.mobile,
      vehicleType: deliveryStaff.vehicleType || null,
      vehicleNumber: deliveryStaff.vehicleNumber || null
    } : null,
    deliveryProof: proof ? {
      id: proof.id,
      cloudinaryUrl: optimizeCloudinaryUrl(proof.cloudinaryUrl, { width: 900 }),
      recipientName: proof.recipientName || null,
      recipientPhone: proof.recipientPhone || null,
      notes: proof.notes || null,
      createdAt: proof.createdAt || null
    } : null,
    customer: snap.name || o.user?.name || 'Customer',
    mobile: snap.mobile || o.user?.mobile || null,
    address: snap,
    items: o.items?.map(i => ({
      ...i,
      image: optimizeCloudinaryUrl(i.image, { width: 400 }),
      mrp: moneyNumber(i.mrp),
      price: moneyNumber(i.price)
    }))
  };
}
