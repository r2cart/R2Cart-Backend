import { prisma } from '../config/prisma.js';
import { resolveEffectiveStoreSchedule } from './store-operations.service.js';

/**
 * Deterministic Delivery Resolution Service
 * Supports:
 * - Global delivery defaults
 * - Mode A: Complete Village Override (all settings come from village)
 * - Mode B: Individual Field Override (selected overrides, others inherit global defaults)
 * - Explicit 0 values, false values, and empty values handled correctly
 * - 5km serviceability boundary check
 * - Village-specific emergency and temporary pause
 */
export async function resolveVillageDeliveryRules({
  villageIdOrName,
  targetDateStr,
  targetTimeStr,
  prismaClient = prisma
}) {
  const normKey = String(villageIdOrName || '').trim().toLowerCase();

  const [settings, allVillages, allAreas] = await Promise.all([
    prismaClient.storeSetting.findUnique({ where: { id: 1 } }),
    prismaClient.deliveryVillage.findMany({ where: { status: 'ACTIVE' } }),
    prismaClient.deliveryArea.findMany({ where: { status: 'ACTIVE' } })
  ]);

  const globalDefaults = {
    deliveryFee: Number(settings?.deliveryFee ?? 20),
    minimumOrder: Number(settings?.minimumOrder ?? 199),
    freeDeliveryThreshold: Number(settings?.freeDeliveryThreshold ?? 499),
    handlingFee: Number(settings?.handlingFee ?? 0),
    estimatedDelivery: settings?.estimatedDelivery || '15-30 minutes',
    estimatedMinutes: 30,
    radiusKm: Number(settings?.globalDeliveryRadius ?? 5.0),
    allowCod: settings?.allowCod ?? true,
    allowScheduled: settings?.allowScheduled ?? true,
    isActive: true
  };

  // Find Village Match by ID or Name
  let matchedVillage = allVillages.find(v => v.id === villageIdOrName || v.name.toLowerCase() === normKey);
  let matchedArea = null;

  if (!matchedVillage) {
    // Check if matches an Area by ID or Name or Pincode
    matchedArea = allAreas.find(a => {
      if (a.id === villageIdOrName || a.name.toLowerCase() === normKey) return true;
      const pins = Array.isArray(a.pincodes) ? a.pincodes : [];
      return pins.some(p => String(p).toLowerCase() === normKey);
    });
  }

  // Also check Store-wide Operational & Emergency Status
  const storeSchedule = await resolveEffectiveStoreSchedule({ targetDateStr, targetTimeStr, prismaClient });

  // If no village or area matches
  if (!matchedVillage && !matchedArea) {
    return {
      isServiceable: false,
      isPaused: false,
      pauseReason: 'Village or delivery area is outside our current delivery network.',
      villageId: null,
      villageName: villageIdOrName || 'Unknown area',
      overrideMode: 'GLOBAL_DEFAULT',
      appliedConfiguration: 'Unserviceable Area',
      deliveryFee: globalDefaults.deliveryFee,
      minimumOrder: globalDefaults.minimumOrder,
      freeDeliveryThreshold: globalDefaults.freeDeliveryThreshold,
      estimatedDelivery: globalDefaults.estimatedDelivery,
      estimatedMinutes: globalDefaults.estimatedMinutes,
      radiusKm: globalDefaults.radiusKm,
      allowCod: false,
      allowScheduled: false,
      sources: {
        deliveryFee: 'UNSERVICEABLE',
        minimumOrder: 'UNSERVICEABLE',
        freeDeliveryThreshold: 'UNSERVICEABLE',
        allowCod: 'UNSERVICEABLE',
        allowScheduled: 'UNSERVICEABLE'
      },
      storeSchedule
    };
  }

  // If matched an Area directly (legacy compatibility)
  if (!matchedVillage && matchedArea) {
    let isPaused = Boolean(matchedArea.isPaused);
    let pauseReason = isPaused ? (matchedArea.pauseReason || matchedArea.notes || 'Delivery area is temporarily paused.') : null;

    const emergencySettings = storeSchedule.emergencyDetails;
    if (emergencySettings && emergencySettings.isActive) {
      const affectedIds = Array.isArray(emergencySettings.affectedVillageIds) ? emergencySettings.affectedVillageIds : [];
      const isTargetAffected = affectedIds.some(id => {
        const idLower = String(id).trim().toLowerCase();
        return idLower === String(matchedArea.id).trim().toLowerCase() ||
               idLower === String(matchedArea.name).trim().toLowerCase() ||
               idLower === normKey;
      });

      if (emergencySettings.type === 'SELECTED_AREAS' && isTargetAffected) {
        isPaused = true;
        pauseReason = emergencySettings.message || 'Delivery paused in this area due to an active emergency.';
      } else if (emergencySettings.type === 'ALL_ORDERS' || emergencySettings.type === 'STORE_CLOSE') {
        isPaused = true;
        pauseReason = emergencySettings.message || 'Store orders temporarily paused.';
      }
    }

    const areaHasFee = matchedArea.deliveryFee !== null && matchedArea.deliveryFee !== undefined;
    const areaHasMin = matchedArea.minimumOrder !== null && matchedArea.minimumOrder !== undefined;
    const areaHasFree = matchedArea.freeDeliveryThreshold !== null && matchedArea.freeDeliveryThreshold !== undefined;

    const areaHasHours = Boolean(matchedArea.openingTime && matchedArea.closingTime);
    const areaOpenStr = areaHasHours ? String(matchedArea.openingTime).trim() : (globalDefaults.openingTime || '07:00');
    const areaCloseStr = areaHasHours ? String(matchedArea.closingTime).trim() : (globalDefaults.closingTime || '22:00');
    const areaHoursSource = areaHasHours ? 'AREA_OVERRIDE' : 'GLOBAL_DEFAULT';

    const areaStoreSchedule = await resolveEffectiveStoreSchedule({
      targetDateStr,
      targetTimeStr,
      prismaClient,
      customOpeningTime: areaOpenStr,
      customClosingTime: areaCloseStr,
      customRuleSource: areaHoursSource,
      customRuleDetails: `${areaHoursSource === 'AREA_OVERRIDE' ? 'Delivery Area' : 'Store Default'} operating hours (${areaOpenStr} – ${areaCloseStr})`
    });

    return {
      isServiceable: !isPaused,
      isPaused,
      pauseReason,
      villageId: matchedArea.id,
      villageName: matchedArea.name,
      areaId: matchedArea.id,
      areaName: matchedArea.name,
      overrideMode: 'AREA_OVERRIDE',
      appliedConfiguration: areaHasFee || areaHasMin || areaHasFree ? 'Delivery Area Override' : 'Global Default Delivery',
      deliveryFee: Number(matchedArea.deliveryFee ?? globalDefaults.deliveryFee),
      minimumOrder: Number(matchedArea.minimumOrder ?? globalDefaults.minimumOrder),
      freeDeliveryThreshold: Number(matchedArea.freeDeliveryThreshold ?? globalDefaults.freeDeliveryThreshold),
      handlingFee: matchedArea.handlingFee !== null && matchedArea.handlingFee !== undefined ? Number(matchedArea.handlingFee) : globalDefaults.handlingFee,
      estimatedDelivery: matchedArea.estimatedMinutes ? `${matchedArea.estimatedMinutes} minutes` : globalDefaults.estimatedDelivery,
      estimatedMinutes: matchedArea.estimatedMinutes || 30,
      openingTime: areaOpenStr,
      closingTime: areaCloseStr,
      hoursSource: areaHoursSource,
      radiusKm: Number(matchedArea.radiusKm || globalDefaults.radiusKm),
      allowCod: globalDefaults.allowCod,
      allowScheduled: globalDefaults.allowScheduled,
      sources: {
        deliveryFee: areaHasFee ? 'AREA_OVERRIDE' : 'GLOBAL_DEFAULT',
        minimumOrder: areaHasMin ? 'AREA_OVERRIDE' : 'GLOBAL_DEFAULT',
        freeDeliveryThreshold: areaHasFree ? 'AREA_OVERRIDE' : 'GLOBAL_DEFAULT',
        operatingHours: areaHoursSource,
        allowCod: 'GLOBAL_DEFAULT',
        allowScheduled: 'GLOBAL_DEFAULT'
      },
      storeSchedule: areaStoreSchedule,
      isOpenNow: areaStoreSchedule.isOpenNow,
      storeStatus: areaStoreSchedule.storeStatus
    };
  }

  // At this point, matchedVillage is confirmed
  const v = matchedVillage;
  const overrideMode = (v.overrideMode || 'COMPLETE').toUpperCase(); // 'COMPLETE' or 'PARTIAL'

  // Check 5km serviceability boundary
  const effectiveRadius = Number(v.radiusKm ?? globalDefaults.radiusKm);
  const exceedsStandardBoundary = effectiveRadius > 5.0;

  // Check Temporary Pauses
  let isPaused = Boolean(v.isPaused);
  let pauseReason = v.isPaused ? (v.pauseReason || v.notes || 'Delivery is temporarily paused in this village.') : null;

  // Check Emergency Restrictions specific to this village
  const emergencySettings = storeSchedule.emergencyDetails;
  if (emergencySettings && emergencySettings.isActive) {
    const affectedIds = Array.isArray(emergencySettings.affectedVillageIds) ? emergencySettings.affectedVillageIds : [];
    const isTargetAffected = affectedIds.some(id => {
      const idLower = String(id).trim().toLowerCase();
      return idLower === String(v.id).trim().toLowerCase() ||
             idLower === String(v.name).trim().toLowerCase() ||
             idLower === normKey;
    });

    if (emergencySettings.type === 'SELECTED_AREAS' && isTargetAffected) {
      isPaused = true;
      pauseReason = emergencySettings.message || 'Delivery paused in this village due to an active emergency.';
    } else if (emergencySettings.type === 'ALL_ORDERS' || emergencySettings.type === 'STORE_CLOSE') {
      isPaused = true;
      pauseReason = emergencySettings.message || 'Store orders temporarily paused.';
    }
  }

  // Check Village-Specific Emergency restrictions in record
  if (v.emergencyRestrictions && v.emergencyRestrictions.isPaused) {
    isPaused = true;
    pauseReason = v.emergencyRestrictions.reason || pauseReason || 'Emergency restrictions active in this village.';
  }

  // Determine Effective Values & Sources based on Override Mode
  const sources = {};
  let effectiveFee;
  let effectiveMinOrder;
  let effectiveFreeThreshold;
  let effectiveEstMinutes;
  let effectiveAllowCod;
  let effectiveAllowScheduled;

  const rawFee = v.deliveryFee !== undefined && v.deliveryFee !== null ? v.deliveryFee : v.deliveryCharge;
  const rawMin = v.minimumOrder;
  const rawFree = v.freeDeliveryThreshold !== undefined && v.freeDeliveryThreshold !== null ? v.freeDeliveryThreshold : v.freeDeliveryAbove;
  const rawHandling = v.handlingFee;
  const effectiveHandlingFee = (rawHandling !== null && rawHandling !== undefined && String(rawHandling).trim() !== '')
    ? Number(rawHandling)
    : globalDefaults.handlingFee;

  if (overrideMode === 'COMPLETE') {
    // Mode A: Complete Village Override
    effectiveFee = rawFee !== null && rawFee !== undefined ? Number(rawFee) : globalDefaults.deliveryFee;
    effectiveMinOrder = rawMin !== null && rawMin !== undefined ? Number(rawMin) : globalDefaults.minimumOrder;
    effectiveFreeThreshold = rawFree !== null && rawFree !== undefined ? Number(rawFree) : globalDefaults.freeDeliveryThreshold;
    effectiveEstMinutes = v.estimatedMinutes || 30;
    effectiveAllowCod = v.allowCod ?? true;
    effectiveAllowScheduled = v.allowScheduled ?? true;

    sources.deliveryFee = 'VILLAGE_OVERRIDE';
    sources.minimumOrder = 'VILLAGE_OVERRIDE';
    sources.freeDeliveryThreshold = 'VILLAGE_OVERRIDE';
    sources.estimatedDelivery = 'VILLAGE_OVERRIDE';
    sources.allowCod = 'VILLAGE_OVERRIDE';
    sources.allowScheduled = 'VILLAGE_OVERRIDE';
  } else {
    // Mode B: Individual Field Override (PARTIAL)
    // Non-overridden fields inherit global defaults
    // Explicit 0 values, false values must NOT be treated as missing

    // Delivery Fee
    if (rawFee !== null && rawFee !== undefined && String(rawFee).trim() !== '') {
      effectiveFee = Number(rawFee);
      sources.deliveryFee = 'VILLAGE_OVERRIDE';
    } else {
      effectiveFee = globalDefaults.deliveryFee;
      sources.deliveryFee = 'GLOBAL_DEFAULT';
    }

    // Minimum Order
    if (rawMin !== null && rawMin !== undefined && String(rawMin).trim() !== '') {
      effectiveMinOrder = Number(rawMin);
      sources.minimumOrder = 'VILLAGE_OVERRIDE';
    } else {
      effectiveMinOrder = globalDefaults.minimumOrder;
      sources.minimumOrder = 'GLOBAL_DEFAULT';
    }

    // Free Delivery Threshold
    if (rawFree !== null && rawFree !== undefined && String(rawFree).trim() !== '') {
      effectiveFreeThreshold = Number(rawFree);
      sources.freeDeliveryThreshold = 'VILLAGE_OVERRIDE';
    } else {
      effectiveFreeThreshold = globalDefaults.freeDeliveryThreshold;
      sources.freeDeliveryThreshold = 'GLOBAL_DEFAULT';
    }

    // Estimated Minutes
    if (v.estimatedMinutes !== null && v.estimatedMinutes !== undefined) {
      effectiveEstMinutes = Number(v.estimatedMinutes);
      sources.estimatedDelivery = 'VILLAGE_OVERRIDE';
    } else {
      effectiveEstMinutes = globalDefaults.estimatedMinutes;
      sources.estimatedDelivery = 'GLOBAL_DEFAULT';
    }

    // Allow COD
    if (v.allowCod !== null && v.allowCod !== undefined) {
      effectiveAllowCod = Boolean(v.allowCod);
      sources.allowCod = 'VILLAGE_OVERRIDE';
    } else {
      effectiveAllowCod = globalDefaults.allowCod;
      sources.allowCod = 'GLOBAL_DEFAULT';
    }

    // Allow Scheduled
    if (v.allowScheduled !== null && v.allowScheduled !== undefined) {
      effectiveAllowScheduled = Boolean(v.allowScheduled);
      sources.allowScheduled = 'VILLAGE_OVERRIDE';
    } else {
      effectiveAllowScheduled = globalDefaults.allowScheduled;
      sources.allowScheduled = 'GLOBAL_DEFAULT';
    }
  }

    // 3-Tier Priority Operating Hours Resolution
    // Priority 1: Village Level -> Priority 2: Area Level -> Priority 3: Global Setting
    const parentArea = v.areaId ? allAreas.find(a => a.id === v.areaId) : allAreas.find(a => Array.isArray(a.pincodes) && a.pincodes.some(p => String(p).toLowerCase() === normKey));

    let effectiveOpenStr = null;
    let effectiveCloseStr = null;
    let hoursSource = 'GLOBAL_DEFAULT';

    if (v.openingTime && v.closingTime && String(v.openingTime).trim() && String(v.closingTime).trim()) {
      effectiveOpenStr = String(v.openingTime).trim();
      effectiveCloseStr = String(v.closingTime).trim();
      hoursSource = 'VILLAGE_OVERRIDE';
    } else if (parentArea && parentArea.openingTime && parentArea.closingTime && String(parentArea.openingTime).trim() && String(parentArea.closingTime).trim()) {
      effectiveOpenStr = String(parentArea.openingTime).trim();
      effectiveCloseStr = String(parentArea.closingTime).trim();
      hoursSource = 'AREA_OVERRIDE';
    } else {
      effectiveOpenStr = globalDefaults.openingTime || '07:00';
      effectiveCloseStr = globalDefaults.closingTime || '22:00';
      hoursSource = 'GLOBAL_DEFAULT';
    }
    sources.operatingHours = hoursSource;

    const villageStoreSchedule = await resolveEffectiveStoreSchedule({
      targetDateStr,
      targetTimeStr,
      prismaClient,
      customOpeningTime: effectiveOpenStr,
      customClosingTime: effectiveCloseStr,
      customRuleSource: hoursSource,
      customRuleDetails: `${hoursSource === 'VILLAGE_OVERRIDE' ? 'Village' : hoursSource === 'AREA_OVERRIDE' ? 'Delivery Area' : 'Store Default'} operating hours (${effectiveOpenStr} – ${effectiveCloseStr})`
    });

    const effectiveEstimatedDelivery = `${effectiveEstMinutes} minutes`;

    return {
      isServiceable: !isPaused,
      isPaused,
      pauseReason,
      villageId: v.id,
      villageName: v.name,
      pincode: v.pincode || null,
      areaId: v.areaId || null,
      overrideMode,
      appliedConfiguration: overrideMode === 'COMPLETE' ? 'Complete Village Override' : 'Individual Field Override',
      deliveryFee: effectiveFee,
      minimumOrder: effectiveMinOrder,
      freeDeliveryThreshold: effectiveFreeThreshold,
      handlingFee: effectiveHandlingFee,
      estimatedDelivery: effectiveEstimatedDelivery,
      estimatedMinutes: effectiveEstMinutes,
      openingTime: effectiveOpenStr,
      closingTime: effectiveCloseStr,
      hoursSource,
      radiusKm: effectiveRadius,
      exceedsStandardBoundary,
      allowCod: effectiveAllowCod,
      allowScheduled: effectiveAllowScheduled,
      sources,
      customSlots: v.customSlots || null,
      deliveryHours: v.deliveryHours || null,
      scheduleNote: v.schedule || null,
      storeSchedule: villageStoreSchedule,
      isOpenNow: villageStoreSchedule.isOpenNow,
      storeStatus: villageStoreSchedule.storeStatus
    };
}
