import { prisma } from '../config/prisma.js';

// Convert a JS Date to Asia/Kolkata date & time strings
export function getKolkataDateTime(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(date);
  const partMap = {};
  for (const p of parts) partMap[p.type] = p.value;

  const ymd = `${partMap.year}-${partMap.month}-${partMap.day}`;
  const time = `${partMap.hour}:${partMap.minute}`;
  const totalMinutes = parseInt(partMap.hour, 10) * 60 + parseInt(partMap.minute, 10);

  // Day of week in lowercase: 'monday', 'tuesday', etc.
  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long'
  });
  const weekday = dayFormatter.format(date).toLowerCase();

  return { ymd, time, totalMinutes, weekday, originalDate: date };
}

// Convert "HH:mm" to minutes from midnight
export function timeStringToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Format minutes from midnight to "hh:mm AM/PM"
export function minutesToTimeString(minutes) {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const mm = m < 10 ? `0${m}` : m;
  return `${h12}:${mm} ${period}`;
}

/**
 * Deterministic Store Schedule Resolver
 * Evaluates priority:
 * 1. Emergency restrictions
 * 2. Date-specific special schedules
 * 3. Active seasonal schedules
 * 4. Weekly operating schedule
 * 5. Global default schedule
 */
export async function resolveEffectiveStoreSchedule({ targetDateStr, targetTimeStr, prismaClient = prisma } = {}) {
  const currentNow = new Date();
  const currentKolkata = getKolkataDateTime(currentNow);

  const evalDateStr = targetDateStr || currentKolkata.ymd;
  const isTargetingFuture = targetDateStr && targetDateStr !== currentKolkata.ymd;

  let evalTimeMinutes = currentKolkata.totalMinutes;
  let evalTimeStr = currentKolkata.time;
  if (targetTimeStr) {
    evalTimeMinutes = timeStringToMinutes(targetTimeStr);
    evalTimeStr = targetTimeStr;
  }

  // Calculate day of week for evalDateStr
  const [y, m, d] = evalDateStr.split('-').map(Number);
  const targetDateObj = new Date(y, m - 1, d, 12, 0, 0);
  const weekday = targetDateObj.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

  const settings = await prismaClient.storeSetting.findUnique({
    where: { id: 1 }
  });

  const globalDefault = {
    openingTime: settings?.openingTime || '07:00',
    closingTime: settings?.closingTime || '21:00',
    isSchedulingEnabled: settings?.isSchedulingEnabled ?? true,
    allowAfterHoursScheduledOrders: settings?.allowAfterHoursScheduledOrders ?? true,
    advanceBookingDays: settings?.advanceBookingDays || 4,
    sameDayCutoffMinutes: settings?.sameDayCutoffMinutes || 60,
    prepTimeMinutes: settings?.prepTimeMinutes || 30
  };

  // 1. Check Emergency Restrictions (and auto-expiration)
  let emergency = settings?.emergencySettings || null;
  if (emergency && typeof emergency === 'string') {
    try { emergency = JSON.parse(emergency); } catch { emergency = null; }
  }

  // Also check legacy policies.emergencyPause
  const legacyPause = settings?.policies?.emergencyPause;
  if (!emergency && legacyPause?.isPaused) {
    emergency = {
      isActive: true,
      type: 'ALL_ORDERS',
      reason: legacyPause.reason || 'HIGH_VOLUME',
      message: legacyPause.message || 'Store orders are temporarily paused.',
      startTime: legacyPause.pausedAt || null,
      endTime: legacyPause.resumesAt || null,
      autoExpire: true,
      affectedVillageIds: []
    };
  }

  let isEmergencyActive = Boolean(emergency?.isActive);
  if (isEmergencyActive && emergency?.autoExpire && emergency?.endTime) {
    const end = new Date(emergency.endTime);
    if (currentNow >= end) {
      // Auto-expired
      isEmergencyActive = false;
      emergency.isActive = false;
      await prismaClient.storeSetting.update({
        where: { id: 1 },
        data: {
          emergencySettings: emergency,
          isOrderPaused: false,
          policies: {
            ...(settings.policies || {}),
            emergencyPause: { isPaused: false }
          }
        }
      }).catch(() => {});

      await prismaClient.emergencyLog?.create?.({
        data: {
          action: 'AUTO_EXPIRE',
          type: emergency.type || 'ALL_ORDERS',
          reason: emergency.reason || 'AUTO_EXPIRED',
          message: 'Emergency restriction expired automatically at scheduled end time.',
          endTime: end
        }
      }).catch(() => {});
    }
  }

  // Check if holiday matches
  const holidays = Array.isArray(settings?.holidays) ? settings.holidays : [];
  const holidayMatch = holidays.find(h => (typeof h === 'string' ? h === evalDateStr : h.date === evalDateStr));

  // Determine Effective Hours and Responsible Rule
  let ruleSource = 'GLOBAL_DEFAULT';
  let ruleDetails = 'Store default hours (07:00 AM – 09:00 PM)';
  let effectiveOpenStr = globalDefault.openingTime;
  let effectiveCloseStr = globalDefault.closingTime;
  let isStoreClosedDay = false;
  let closedReason = null;

  // Check Priority 2: Special Date Schedule
  const specialDays = Array.isArray(settings?.specialDaySchedules) ? settings.specialDaySchedules : [];
  const specialDayMatch = specialDays.find(s => s.date === evalDateStr && s.status !== 'INACTIVE' && s.isActive !== false);

  // Check Priority 3: Seasonal Schedule
  const seasons = Array.isArray(settings?.seasonalSchedules) ? settings.seasonalSchedules : [];
  const activeSeasonMatch = seasons
    .filter(s => (s.status === 'ACTIVE' || s.isActive === true || (!s.status && s.isActive !== false)) && s.startDate && s.endDate && evalDateStr >= s.startDate && evalDateStr <= s.endDate)
    .sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0))[0];

  // Check Priority 4: Weekly Schedule
  const weekdayHours = settings?.weekdayHours || {};
  const currentDayConfig = weekdayHours[weekday];

  if (holidayMatch) {
    isStoreClosedDay = true;
    closedReason = typeof holidayMatch === 'object' && holidayMatch.name ? `Store Holiday: ${holidayMatch.name}` : 'Store Holiday';
    ruleSource = 'PLANNED_HOLIDAY';
    ruleDetails = closedReason;
  } else if (specialDayMatch) {
    ruleSource = 'SPECIAL_DATE';
    ruleDetails = `Special date schedule: ${specialDayMatch.name || evalDateStr}`;
    if (specialDayMatch.isClosed) {
      isStoreClosedDay = true;
      closedReason = specialDayMatch.reason || `Closed on ${evalDateStr}`;
    } else {
      effectiveOpenStr = specialDayMatch.openingTime || effectiveOpenStr;
      effectiveCloseStr = specialDayMatch.closingTime || effectiveCloseStr;
    }
  } else if (activeSeasonMatch) {
    ruleSource = 'SEASONAL';
    ruleDetails = `Active seasonal schedule: ${activeSeasonMatch.name}`;
    effectiveOpenStr = activeSeasonMatch.openingTime || effectiveOpenStr;
    effectiveCloseStr = activeSeasonMatch.closingTime || effectiveCloseStr;
  } else if (currentDayConfig) {
    ruleSource = 'WEEKLY';
    ruleDetails = `Regular weekly schedule for ${weekday.toUpperCase()}`;
    if (currentDayConfig.isOpen === false) {
      isStoreClosedDay = true;
      closedReason = `Store closed on ${weekday.charAt(0).toUpperCase() + weekday.slice(1)}s`;
    } else {
      effectiveOpenStr = currentDayConfig.open || effectiveOpenStr;
      effectiveCloseStr = currentDayConfig.close || effectiveCloseStr;
    }
  }

  const effectiveOpenMinutes = timeStringToMinutes(effectiveOpenStr);
  const effectiveCloseMinutes = timeStringToMinutes(effectiveCloseStr);

  // Status calculation
  let storeStatus = 'OPEN';
  let allowImmediateOrders = true;
  let allowScheduledOrders = globalDefault.isSchedulingEnabled;
  let statusReason = 'Store is currently open for business.';
  const nextAvailableOpening = {
    date: evalDateStr,
    time: effectiveOpenStr,
    label: `${evalDateStr} at ${minutesToTimeString(effectiveOpenMinutes)}`
  };

  // Evaluate Emergency Overrides (Priority 1)
  if (isEmergencyActive) {
    ruleSource = 'EMERGENCY';
    ruleDetails = `Emergency restriction: ${emergency.reason || 'Operations pause'}`;
    const emType = emergency.type || 'ALL_ORDERS';

    if (emType === 'STORE_CLOSE' || emType === 'ALL_ORDERS') {
      storeStatus = 'EMERGENCY_PAUSED';
      allowImmediateOrders = false;
      allowScheduledOrders = false;
      statusReason = emergency.message || 'Store orders are temporarily paused due to emergency conditions.';
    } else if (emType === 'IMMEDIATE_ONLY') {
      storeStatus = 'SCHEDULED_ONLY';
      allowImmediateOrders = false;
      allowScheduledOrders = globalDefault.isSchedulingEnabled;
      statusReason = emergency.message || 'Immediate orders temporarily paused. You can schedule your order for upcoming delivery.';
    } else if (emType === 'SCHEDULED_ONLY') {
      storeStatus = 'OPEN';
      allowImmediateOrders = true;
      allowScheduledOrders = false;
      statusReason = emergency.message || 'Advance scheduled ordering is temporarily paused. Immediate orders are being accepted.';
    }
  } else if (isStoreClosedDay) {
    storeStatus = globalDefault.allowAfterHoursScheduledOrders && globalDefault.isSchedulingEnabled ? 'SCHEDULED_ONLY' : 'CLOSED';
    allowImmediateOrders = false;
    allowScheduledOrders = globalDefault.allowAfterHoursScheduledOrders && globalDefault.isSchedulingEnabled;
    statusReason = closedReason || 'Store is closed today.';
  } else {
    // Normal operational hours evaluation
    const isWithinHours = evalTimeMinutes >= effectiveOpenMinutes && evalTimeMinutes < effectiveCloseMinutes;

    if (isWithinHours) {
      storeStatus = 'OPEN';
      allowImmediateOrders = true;
      allowScheduledOrders = globalDefault.isSchedulingEnabled;
      statusReason = 'Store is currently open for immediate and scheduled deliveries.';
    } else {
      // Outside operating hours
      if (globalDefault.allowAfterHoursScheduledOrders && globalDefault.isSchedulingEnabled) {
        storeStatus = 'SCHEDULED_ONLY';
        allowImmediateOrders = false;
        allowScheduledOrders = true;
        statusReason = 'Store is currently closed. You can schedule your order for the next available delivery slot.';
      } else {
        storeStatus = 'CLOSED';
        allowImmediateOrders = false;
        allowScheduledOrders = false;
        statusReason = `Store is currently closed (Operating hours: ${minutesToTimeString(effectiveOpenMinutes)} – ${minutesToTimeString(effectiveCloseMinutes)}).`;
      }
    }
  }

  return {
    evaluatedAt: currentKolkata,
    targetDate: evalDateStr,
    targetTime: evalTimeStr,
    isTargetingFuture,
    status: storeStatus,
    storeStatus,
    isOpenNow: storeStatus === 'OPEN',
    allowImmediateOrders,
    allowScheduledOrders,
    statusReason,
    effectiveHours: {
      open: effectiveOpenStr,
      close: effectiveCloseStr,
      openingTime: effectiveOpenStr,
      closingTime: effectiveCloseStr,
      openFormatted: minutesToTimeString(effectiveOpenMinutes),
      closeFormatted: minutesToTimeString(effectiveCloseMinutes),
      isClosedDay: isStoreClosedDay
    },
    ruleSource,
    ruleDetails,
    nextAvailableOpening,
    isEmergencyActive,
    emergencyDetails: isEmergencyActive ? emergency : null,
    globalDefault,
    lastUpdated: settings?.updatedAt || null
  };
}
