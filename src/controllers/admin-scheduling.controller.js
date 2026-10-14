import {prisma} from '../config/prisma.js';
import {AppError,asyncHandler,created,ok} from '../utils/response.js';
import {orderDto} from '../utils/order.js';
import {logAudit} from '../services/audit.service.js';
import {resolveEffectiveStoreSchedule} from '../services/store-operations.service.js';

export const scheduling = {
  getStoreSchedule: asyncHandler(async (req, res) => {
    const setting = await prisma.storeSetting.findUnique({
      where: { id: 1 },
      select: {
        openingTime: true,
        closingTime: true,
        weekdayHours: true,
        holidays: true,
        isOrderPaused: true,
        orderPauseMessage: true,
        prepTimeMinutes: true,
        seasonalSchedules: true,
        specialDaySchedules: true,
        allowAfterHoursScheduledOrders: true,
        isSchedulingEnabled: true,
        advanceBookingDays: true,
        sameDayCutoffMinutes: true,
        emergencySettings: true,
        policies: true,
        updatedAt: true
      }
    });

    const slots = await prisma.deliverySlot.findMany({
      orderBy: [{ position: 'asc' }, { startTime: 'asc' }]
    });

    const effectiveStatus = await resolveEffectiveStoreSchedule();

    ok(res, {
      openingTime: setting?.openingTime || '07:00',
      closingTime: setting?.closingTime || '21:00',
      weekdayHours: setting?.weekdayHours || {
        monday: { open: '07:00', close: '21:00', isOpen: true },
        tuesday: { open: '07:00', close: '21:00', isOpen: true },
        wednesday: { open: '07:00', close: '21:00', isOpen: true },
        thursday: { open: '07:00', close: '21:00', isOpen: true },
        friday: { open: '07:00', close: '21:00', isOpen: true },
        saturday: { open: '07:00', close: '21:00', isOpen: true },
        sunday: { open: '07:00', close: '21:00', isOpen: true }
      },
      holidays: Array.isArray(setting?.holidays) ? setting.holidays : [],
      seasonalSchedules: Array.isArray(setting?.seasonalSchedules) ? setting.seasonalSchedules : [],
      specialDaySchedules: Array.isArray(setting?.specialDaySchedules) ? setting.specialDaySchedules : [],
      allowAfterHoursScheduledOrders: setting?.allowAfterHoursScheduledOrders ?? true,
      isSchedulingEnabled: setting?.isSchedulingEnabled ?? true,
      advanceBookingDays: setting?.advanceBookingDays || 4,
      sameDayCutoffMinutes: setting?.sameDayCutoffMinutes || 60,
      isOrderPaused: Boolean(setting?.isOrderPaused || setting?.policies?.emergencyPause?.isPaused),
      orderPauseMessage: setting?.orderPauseMessage || setting?.policies?.emergencyPause?.message || '',
      prepTimeMinutes: setting?.prepTimeMinutes || 30,
      slots,
      effectiveStatus,
      lastUpdated: setting?.updatedAt || null
    });
  }),

  updateHours: asyncHandler(async (req, res) => {
    const {
      openingTime,
      closingTime,
      weekdayHours,
      prepTimeMinutes,
      advanceBookingDays,
      sameDayCutoffMinutes,
      allowAfterHoursScheduledOrders,
      isSchedulingEnabled
    } = req.body;
    const data = {};

    if (openingTime) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(openingTime)) throw new AppError('Invalid opening time format (HH:MM)', 422);
      data.openingTime = openingTime;
    }
    if (closingTime) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(closingTime)) throw new AppError('Invalid closing time format (HH:MM)', 422);
      data.closingTime = closingTime;
    }
    if (weekdayHours && typeof weekdayHours === 'object') {
      data.weekdayHours = weekdayHours;
    }
    if (prepTimeMinutes !== undefined) {
      const prep = Number(prepTimeMinutes);
      if (!Number.isInteger(prep) || prep < 0) throw new AppError('Preparation time must be a positive integer', 422);
      data.prepTimeMinutes = prep;
    }
    if (advanceBookingDays !== undefined) {
      data.advanceBookingDays = Math.max(1, Math.min(30, parseInt(advanceBookingDays, 10) || 4));
    }
    if (sameDayCutoffMinutes !== undefined) {
      data.sameDayCutoffMinutes = Math.max(0, parseInt(sameDayCutoffMinutes, 10) || 60);
    }
    if (allowAfterHoursScheduledOrders !== undefined) {
      data.allowAfterHoursScheduledOrders = Boolean(allowAfterHoursScheduledOrders);
    }
    if (isSchedulingEnabled !== undefined) {
      data.isSchedulingEnabled = Boolean(isSchedulingEnabled);
    }

    const updated = await prisma.storeSetting.update({
      where: { id: 1 },
      data
    });

    logAudit(req, {
      module: 'OPERATIONS',
      action: 'UPDATE_STORE_HOURS',
      resourceId: '1',
      resourceName: 'Store Operations Configuration',
      details: data
    });

    ok(res, updated, 'Store operations and hours updated successfully');
  }),

  // Seasonal schedules CRUD
  seasonal: {
    list: asyncHandler(async (req, res) => {
      const setting = await prisma.storeSetting.findUnique({ where: { id: 1 }, select: { seasonalSchedules: true } });
      ok(res, Array.isArray(setting?.seasonalSchedules) ? setting.seasonalSchedules : []);
    }),

    save: asyncHandler(async (req, res) => {
      const { id, name, startDate, endDate, openingTime, closingTime, priority = 1, status = 'ACTIVE' } = req.body;
      if (!name || !startDate || !endDate || !openingTime || !closingTime) {
        throw new AppError('Name, start date, end date, opening time, and closing time are required', 422);
      }

      const setting = await prisma.storeSetting.findUnique({ where: { id: 1 }, select: { seasonalSchedules: true } });
      const current = Array.isArray(setting?.seasonalSchedules) ? [...setting.seasonalSchedules] : [];

      const recordId = id || `season_${Date.now()}`;
      const payload = {
        id: recordId,
        name: name.trim(),
        startDate,
        endDate,
        openingTime,
        closingTime,
        priority: Number(priority) || 1,
        status: status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
        updatedAt: new Date().toISOString()
      };

      const existingIndex = current.findIndex(s => s.id === recordId);
      if (existingIndex >= 0) {
        current[existingIndex] = payload;
      } else {
        current.push(payload);
      }

      await prisma.storeSetting.update({
        where: { id: 1 },
        data: { seasonalSchedules: current }
      });

      logAudit(req, {
        module: 'OPERATIONS',
        action: 'SEASONAL_SCHEDULE_SAVE',
        resourceId: recordId,
        resourceName: payload.name,
        details: payload
      });

      ok(res, current, 'Seasonal schedule saved');
    }),

    remove: asyncHandler(async (req, res) => {
      const setting = await prisma.storeSetting.findUnique({ where: { id: 1 }, select: { seasonalSchedules: true } });
      const current = Array.isArray(setting?.seasonalSchedules) ? [...setting.seasonalSchedules] : [];
      const filtered = current.filter(s => s.id !== req.params.id);

      await prisma.storeSetting.update({
        where: { id: 1 },
        data: { seasonalSchedules: filtered }
      });

      logAudit(req, {
        module: 'OPERATIONS',
        action: 'SEASONAL_SCHEDULE_DELETE',
        resourceId: req.params.id,
        resourceName: 'Seasonal Schedule',
        details: { id: req.params.id }
      });

      ok(res, filtered, 'Seasonal schedule removed');
    })
  },

  // Special Day schedules CRUD
  specialDays: {
    list: asyncHandler(async (req, res) => {
      const setting = await prisma.storeSetting.findUnique({ where: { id: 1 }, select: { specialDaySchedules: true } });
      ok(res, Array.isArray(setting?.specialDaySchedules) ? setting.specialDaySchedules : []);
    }),

    save: asyncHandler(async (req, res) => {
      const { id, date, name, openingTime, closingTime, isClosed = false, reason } = req.body;
      if (!date) throw new AppError('Date is required (YYYY-MM-DD)', 422);

      const setting = await prisma.storeSetting.findUnique({ where: { id: 1 }, select: { specialDaySchedules: true } });
      const current = Array.isArray(setting?.specialDaySchedules) ? [...setting.specialDaySchedules] : [];

      const recordId = id || `special_${date}`;
      const payload = {
        id: recordId,
        date,
        name: (name || date).trim(),
        openingTime: openingTime || '07:00',
        closingTime: closingTime || '21:00',
        isClosed: Boolean(isClosed),
        reason: reason ? reason.trim() : null,
        updatedAt: new Date().toISOString()
      };

      const existingIndex = current.findIndex(s => s.id === recordId || s.date === date);
      if (existingIndex >= 0) {
        current[existingIndex] = payload;
      } else {
        current.push(payload);
      }

      await prisma.storeSetting.update({
        where: { id: 1 },
        data: { specialDaySchedules: current }
      });

      logAudit(req, {
        module: 'OPERATIONS',
        action: 'SPECIAL_DATE_SAVE',
        resourceId: recordId,
        resourceName: payload.name,
        details: payload
      });

      ok(res, current, 'Special day schedule saved');
    }),

    remove: asyncHandler(async (req, res) => {
      const setting = await prisma.storeSetting.findUnique({ where: { id: 1 }, select: { specialDaySchedules: true } });
      const current = Array.isArray(setting?.specialDaySchedules) ? [...setting.specialDaySchedules] : [];
      const filtered = current.filter(s => s.id !== req.params.id && s.date !== req.params.id);

      await prisma.storeSetting.update({
        where: { id: 1 },
        data: { specialDaySchedules: filtered }
      });

      logAudit(req, {
        module: 'OPERATIONS',
        action: 'SPECIAL_DATE_DELETE',
        resourceId: req.params.id,
        resourceName: 'Special Date',
        details: { id: req.params.id }
      });

      ok(res, filtered, 'Special day schedule removed');
    })
  },

  // Live Effective Status and Future Date Preview
  preview: asyncHandler(async (req, res) => {
    const { date, time } = req.query;
    const previewResult = await resolveEffectiveStoreSchedule({
      targetDateStr: date,
      targetTimeStr: time
    });
    ok(res, previewResult);
  }),

  updateHolidays: asyncHandler(async (req, res) => {
    const holidays = Array.isArray(req.body.holidays) ? req.body.holidays : [];
    const updated = await prisma.storeSetting.update({
      where: { id: 1 },
      data: { holidays }
    });

    logAudit(req, {
      module: 'OPERATIONS',
      action: 'UPDATE_HOLIDAYS',
      resourceId: '1',
      resourceName: 'Holiday Calendar',
      details: { holidays }
    });

    ok(res, updated.holidays, 'Holiday calendar updated');
  }),

  pauseOrders: asyncHandler(async (req, res) => {
    const isPaused = Boolean(req.body.isPaused);
    const message = String(req.body.message || '').trim();
    const current = await prisma.storeSetting.findUnique({ where: { id: 1 } });

    const existingPolicies = typeof current?.policies === 'object' && current?.policies !== null ? current.policies : {};
    const updatedPolicies = {
      ...existingPolicies,
      emergencyPause: {
        isPaused,
        message: message || (isPaused ? 'Store is temporarily paused for new orders.' : null),
        updatedAt: new Date().toISOString()
      }
    };

    const updated = await prisma.storeSetting.update({
      where: { id: 1 },
      data: {
        isOrderPaused: isPaused,
        orderPauseMessage: message || null,
        policies: updatedPolicies
      }
    });

    logAudit(req, {
      module: 'SCHEDULING',
      action: isPaused ? 'PAUSE_STORE_ORDERS' : 'RESUME_STORE_ORDERS',
      resourceId: '1',
      resourceName: 'Store Ordering Status',
      details: { isPaused, message }
    });

    ok(res, { isOrderPaused: isPaused, orderPauseMessage: message }, isPaused ? 'Store orders paused' : 'Store orders resumed');
  }),

  slots: {
    list: asyncHandler(async (req, res) => {
      const rows = await prisma.deliverySlot.findMany({
        orderBy: [{ position: 'asc' }, { startTime: 'asc' }]
      });
      ok(res, rows);
    }),

    create: asyncHandler(async (req, res) => {
      const label = String(req.body.label || '').trim();
      if (!label) throw new AppError('Slot label is required (e.g., Morning 8 AM - 11 AM)', 422);

      const startTime = String(req.body.startTime || '').trim();
      const endTime = String(req.body.endTime || '').trim();
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)) {
        throw new AppError('Enter valid start and end times in HH:MM format', 422);
      }

      const maxOrders = Math.max(1, parseInt(req.body.maxOrders, 10) || 20);
      const cutoffMinutes = Math.max(0, parseInt(req.body.cutoffMinutes, 10) || 60);
      const position = Number(req.body.position || 0);

      const slot = await prisma.deliverySlot.create({
        data: {
          label,
          startTime,
          endTime,
          maxOrders,
          cutoffMinutes,
          daysOfWeek: Array.isArray(req.body.daysOfWeek) ? req.body.daysOfWeek : null,
          position,
          status: req.body.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE'
        }
      });

      logAudit(req, {
        module: 'SCHEDULING',
        action: 'SLOT_CREATE',
        resourceId: slot.id,
        resourceName: slot.label,
        details: { slot }
      });

      created(res, slot, 'Delivery slot created');
    }),

    update: asyncHandler(async (req, res) => {
      const current = await prisma.deliverySlot.findUnique({ where: { id: req.params.id } });
      if (!current) throw new AppError('Delivery slot not found', 404);

      const data = {};
      if (req.body.label) data.label = String(req.body.label).trim();
      if (req.body.startTime) data.startTime = String(req.body.startTime).trim();
      if (req.body.endTime) data.endTime = String(req.body.endTime).trim();
      if (req.body.maxOrders !== undefined) data.maxOrders = Math.max(1, parseInt(req.body.maxOrders, 10));
      if (req.body.cutoffMinutes !== undefined) data.cutoffMinutes = Math.max(0, parseInt(req.body.cutoffMinutes, 10));
      if (req.body.position !== undefined) data.position = Number(req.body.position);
      if (req.body.status) data.status = req.body.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
      if (req.body.daysOfWeek !== undefined) data.daysOfWeek = Array.isArray(req.body.daysOfWeek) ? req.body.daysOfWeek : null;

      const updated = await prisma.deliverySlot.update({
        where: { id: req.params.id },
        data
      });

      logAudit(req, {
        module: 'SCHEDULING',
        action: 'SLOT_UPDATE',
        resourceId: updated.id,
        resourceName: updated.label,
        details: { before: current, after: updated }
      });

      ok(res, updated, 'Delivery slot updated');
    }),

    status: asyncHandler(async (req, res) => {
      const status = String(req.body.status || '').toUpperCase();
      if (!['ACTIVE', 'INACTIVE'].includes(status)) throw new AppError('Status must be ACTIVE or INACTIVE', 422);

      const updated = await prisma.deliverySlot.update({
        where: { id: req.params.id },
        data: { status }
      });

      logAudit(req, {
        module: 'SCHEDULING',
        action: status === 'ACTIVE' ? 'SLOT_ACTIVATE' : 'SLOT_DEACTIVATE',
        resourceId: updated.id,
        resourceName: updated.label,
        details: { status }
      });

      ok(res, updated, status === 'ACTIVE' ? 'Delivery slot enabled' : 'Delivery slot disabled');
    }),

    remove: asyncHandler(async (req, res) => {
      const current = await prisma.deliverySlot.findUnique({ where: { id: req.params.id } });
      if (!current) throw new AppError('Delivery slot not found', 404);

      await prisma.deliverySlot.delete({ where: { id: req.params.id } });

      logAudit(req, {
        module: 'SCHEDULING',
        action: 'SLOT_DELETE',
        resourceId: current.id,
        resourceName: current.label,
        details: { deletedSlot: current }
      });

      ok(res, null, 'Delivery slot deleted');
    })
  },

  getScheduledOrders: asyncHandler(async (req, res) => {
    const { date, slot, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

    const where = {
      deliveryType: 'SCHEDULED'
    };
    if (date) where.deliveryDate = String(date);
    if (slot) where.deliverySlot = { contains: String(slot) };

    const [rows, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, mobile: true } },
          items: true,
          history: { orderBy: { createdAt: 'desc' }, take: 1 }
        },
        orderBy: [{ deliveryDate: 'asc' }, { createdAt: 'desc' }],
        skip: (pageNum - 1) * limitNum,
        take: limitNum
      }),
      prisma.order.count({ where })
    ]);

    ok(res, {
      orders: rows.map(orderDto),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.max(1, Math.ceil(total / limitNum))
      }
    });
  })
};

// Customer facing slot resolver: calculates availability, cutoffs, and remaining capacities
export async function getAvailableCustomerSlots(targetDateStr) {
  const now = new Date();
  // Format current time in Asia/Kolkata
  const kolkataNowStr = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(now);

  const [datePart, timePart] = kolkataNowStr.split(', ');
  const [day, month, year] = datePart.split('/');
  const todayYmd = `${year}-${month}-${day}`;
  const isToday = !targetDateStr || targetDateStr === todayYmd;

  const currentMinutes = parseInt(timePart.split(':')[0], 10) * 60 + parseInt(timePart.split(':')[1], 10);

  let slots = await prisma.deliverySlot.findMany({
    where: { status: 'ACTIVE' },
    orderBy: [{ position: 'asc' }, { startTime: 'asc' }]
  });

  if (slots.length === 0) {
    const defaultSlots = [
      { label: 'Morning Slot (07:00 AM - 10:00 AM)', startTime: '07:00', endTime: '10:00', maxOrders: 20, cutoffMinutes: 60, position: 1 },
      { label: 'Midday Slot (10:00 AM - 01:00 PM)', startTime: '10:00', endTime: '13:00', maxOrders: 25, cutoffMinutes: 60, position: 2 },
      { label: 'Afternoon Slot (01:00 PM - 04:00 PM)', startTime: '13:00', endTime: '16:00', maxOrders: 25, cutoffMinutes: 60, position: 3 },
      { label: 'Evening Slot (04:00 PM - 07:00 PM)', startTime: '16:00', endTime: '19:00', maxOrders: 30, cutoffMinutes: 60, position: 4 },
      { label: 'Night Slot (07:00 PM - 10:00 PM)', startTime: '19:00', endTime: '22:00', maxOrders: 20, cutoffMinutes: 60, position: 5 }
    ];
    for (const d of defaultSlots) {
      await prisma.deliverySlot.create({ data: d }).catch(() => {});
    }
    slots = await prisma.deliverySlot.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ position: 'asc' }, { startTime: 'asc' }]
    });
  }

  const bookedCounts = await prisma.order.groupBy({
    by: ['deliverySlot'],
    where: {
      deliveryDate: targetDateStr || todayYmd,
      status: { not: 'CANCELLED' }
    },
    _count: { id: true }
  });

  const bookedMap = Object.fromEntries(bookedCounts.map(b => [b.deliverySlot, b._count.id]));

  return slots.map(slot => {
    const [startH, startM] = slot.startTime.split(':').map(Number);
    const slotStartMinutes = startH * 60 + startM;
    const cutoffThreshold = slotStartMinutes - slot.cutoffMinutes;

    const isCutoffPassed = isToday && currentMinutes >= cutoffThreshold;
    const booked = bookedMap[slot.label] || 0;
    const remaining = Math.max(0, slot.maxOrders - booked);
    const isFull = remaining <= 0;

    const isAvailable = !isCutoffPassed && !isFull;

    return {
      id: slot.id,
      label: slot.label,
      startTime: slot.startTime,
      endTime: slot.endTime,
      maxOrders: slot.maxOrders,
      bookedOrders: booked,
      remainingOrders: remaining,
      isCutoffPassed,
      isFull,
      isAvailable
    };
  });
}
