import {resolveVillageDeliveryRules} from './delivery-resolution.service.js';
import {AppError} from '../utils/response.js';

export async function resolveDeliveryRules(tx, area) {
  if (!area) {
    const settings = await tx.storeSetting.findUnique({ where: { id: 1 } });
    if (!settings) throw new AppError('Store delivery settings are not configured', 503);
    return {
      matchType: 'GLOBAL_DEFAULT',
      villageId: null,
      villageName: null,
      zoneId: null,
      zoneName: null,
      minimumOrder: Number(settings.minimumOrder || 0),
      deliveryFee: Number(settings.deliveryFee || 0),
      freeDeliveryThreshold: Number(settings.freeDeliveryThreshold || 0),
      estimatedDelivery: settings.estimatedDelivery || '15-30 minutes',
      schedule: null,
      allowCod: settings.allowCod ?? true,
      allowScheduled: settings.allowScheduled ?? true,
      sources: {}
    };
  }

  const resolved = await resolveVillageDeliveryRules({
    villageIdOrName: area,
    prismaClient: tx
  });

  if (!resolved.isServiceable) {
    if (resolved.isPaused) {
      throw new AppError(resolved.pauseReason || `Delivery orders are temporarily paused in ${resolved.villageName}. Please check back later.`, 422);
    }
    const radius = resolved.radiusKm || 5.0;
    throw new AppError(`Delivery is currently unavailable in "${area}". We only deliver to designated villages and areas within our active ${radius} km radius.`, 422);
  }

  const isVillage = Boolean(resolved.villageId && resolved.overrideMode !== 'AREA_OVERRIDE');

  return {
    matchType: isVillage ? 'VILLAGE' : 'AREA',
    villageId: isVillage ? resolved.villageId : null,
    villageName: isVillage ? resolved.villageName : null,
    zoneId: !isVillage ? resolved.villageId || resolved.areaId : null,
    zoneName: !isVillage ? resolved.villageName || resolved.areaName : null,
    minimumOrder: resolved.minimumOrder,
    deliveryFee: resolved.deliveryFee,
    freeDeliveryThreshold: resolved.freeDeliveryThreshold,
    estimatedDelivery: resolved.estimatedDelivery,
    schedule: resolved.scheduleNote || null,
    allowCod: resolved.allowCod,
    allowScheduled: resolved.allowScheduled,
    sources: resolved.sources,
    storeSchedule: resolved.storeSchedule
  };
}

export async function calculateCart(tx, userId, couponCode, rules) {
  const cart = await tx.cart.findUnique({
    where: { userId },
    include: { items: { include: { product: { include: { images: { take: 1 } } } } } }
  });

  if (!cart?.items.length) throw new AppError('Your cart is empty', 400);

  let itemTotal = 0;
  let subtotal = 0;
  const now = new Date();

  for (const item of cart.items) {
    if (!item.product || item.product.deletedAt || item.product.status !== 'ACTIVE' || item.product.stock < item.quantity) {
      if (!item.product || item.product.deletedAt || item.product.status !== 'ACTIVE') {
        throw new AppError(`${item.product?.name || 'Item'} is currently unavailable`, 409);
      }
      if (item.product.stock <= 0) {
        throw new AppError(`${item.product.name} is currently out of stock`, 409);
      }
      throw new AppError(`${item.product.name} has only ${item.product.stock} remaining in stock`, 409);
    }

    // Expiry date verification
    if (item.product.hasExpiry && item.product.expiryDate && new Date(item.product.expiryDate) <= now) {
      throw new AppError(`Cannot checkout: "${item.product.name}" has reached its expiration date and has been removed from sale.`, 409);
    }

    itemTotal += Number(item.product.mrp) * item.quantity;
    subtotal += Number(item.product.price) * item.quantity;
  }

  const delivery = rules || await resolveDeliveryRules(tx);
  if (subtotal < delivery.minimumOrder) {
    throw new AppError(`Minimum order for delivery to ${delivery.villageName || delivery.zoneName || 'your area'} is ₹${delivery.minimumOrder}`, 422);
  }

  let coupon = null;
  let couponDiscount = 0;

  if (couponCode) {
    coupon = await tx.coupon.findUnique({ where: { code: couponCode.toUpperCase() } });

    if (!coupon || coupon.status !== 'ACTIVE' || coupon.startsAt > now || coupon.expiresAt < now) {
      throw new AppError('Coupon is unavailable or expired', 422);
    }
    if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
      throw new AppError('Coupon overall usage limit has been reached', 422);
    }
    if (subtotal < Number(coupon.minimumOrder)) {
      throw new AppError(`Minimum order to use this coupon is ₹${coupon.minimumOrder}`, 422);
    }

    // Check customer-targeted coupon eligibility
    if (coupon.targetUserIds && Array.isArray(coupon.targetUserIds) && coupon.targetUserIds.length > 0) {
      if (!coupon.targetUserIds.includes(userId)) {
        throw new AppError('This coupon is not applicable to your account', 422);
      }
    }

    // Check first-order-only coupon eligibility
    if (coupon.isFirstOrderOnly) {
      const priorOrders = await tx.order.count({
        where: {
          userId,
          status: { not: 'CANCELLED' }
        }
      });
      if (priorOrders > 0) {
        throw new AppError('This coupon is valid only on your first order with us', 422);
      }
    }

    // Check per-user limit
    const used = await tx.couponUsage.count({ where: { couponId: coupon.id, userId } });
    if (used >= coupon.perUserLimit) {
      throw new AppError(`You have already used this coupon maximum (${coupon.perUserLimit}) times`, 422);
    }

    couponDiscount = coupon.type === 'FIXED'
      ? Number(coupon.discount)
      : (subtotal * Number(coupon.discount)) / 100;

    if (coupon.maximumDiscount) {
      couponDiscount = Math.min(couponDiscount, Number(coupon.maximumDiscount));
    }
  }

  const productDiscount = itemTotal - subtotal;
  const deliveryFee = subtotal >= delivery.freeDeliveryThreshold ? 0 : delivery.deliveryFee;
  const handlingFee = 0;
  const grandTotal = Math.max(0, subtotal + deliveryFee - couponDiscount);

  return {
    cart,
    coupon,
    itemTotal,
    subtotal,
    productDiscount,
    couponDiscount,
    deliveryFee,
    handlingFee,
    grandTotal,
    delivery
  };
}
