import { prisma } from '../config/prisma.js';
import { AppError, asyncHandler, ok, created } from '../utils/response.js';
import { logAudit } from '../services/audit.service.js';
import { resolveEffectiveStoreSchedule } from '../services/store-operations.service.js';

export const emergency = {
  // Get current emergency status and active restrictions
  getStatus: asyncHandler(async (req, res) => {
    const schedule = await resolveEffectiveStoreSchedule();
    const settings = await prisma.storeSetting.findUnique({
      where: { id: 1 },
      select: { emergencySettings: true, isOrderPaused: true, orderPauseMessage: true }
    });

    const villages = await prisma.deliveryVillage.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, isPaused: true, notes: true }
    });

    const activeEmergency = schedule.isEmergencyActive ? schedule.emergencyDetails : null;

    ok(res, {
      isActive: schedule.isEmergencyActive,
      emergency: activeEmergency,
      storeStatus: schedule.status,
      statusReason: schedule.statusReason,
      villages
    });
  }),

  // Activate an emergency restriction
  activate: asyncHandler(async (req, res) => {
    const {
      type = 'ALL_ORDERS', // 'IMMEDIATE_ONLY' | 'SCHEDULED_ONLY' | 'ALL_ORDERS' | 'SELECTED_AREAS' | 'STORE_CLOSE'
      reason = 'HIGH_VOLUME', // 'WEATHER' | 'STAFF_SHORTAGE' | 'HIGH_VOLUME' | 'VEHICLE_BREAKDOWN' | 'CURFEW' | 'STOCK_EMERGENCY' | 'OTHER'
      customReason,
      message,
      affectedVillageIds = [],
      startTime,
      endTime,
      autoExpire = true
    } = req.body;

    const validTypes = ['IMMEDIATE_ONLY', 'SCHEDULED_ONLY', 'ALL_ORDERS', 'SELECTED_AREAS', 'STORE_CLOSE'];
    if (!validTypes.includes(type)) {
      throw new AppError(`Invalid emergency type. Must be one of: ${validTypes.join(', ')}`, 422);
    }

    const defaultMsg = message?.trim() || `Store orders temporarily paused due to ${customReason || reason.replace(/_/g, ' ').toLowerCase()}.`;
    const start = startTime ? new Date(startTime) : new Date();
    const end = endTime ? new Date(endTime) : null;

    const current = await prisma.storeSetting.findUnique({ where: { id: 1 } });
    const existingPolicies = current?.policies && typeof current.policies === 'object' ? current.policies : {};

    const emergencyPayload = {
      isActive: true,
      type,
      reason,
      customReason: customReason ? String(customReason).trim() : null,
      message: defaultMsg,
      affectedVillageIds: Array.isArray(affectedVillageIds) ? affectedVillageIds : [],
      startTime: start.toISOString(),
      endTime: end ? end.toISOString() : null,
      autoExpire: Boolean(autoExpire),
      activatedBy: req.user?.name || 'Administrator',
      activatedAt: new Date().toISOString()
    };

    // Update Store Setting & sync legacy pause structure
    const updated = await prisma.storeSetting.update({
      where: { id: 1 },
      data: {
        emergencySettings: emergencyPayload,
        isOrderPaused: type === 'ALL_ORDERS' || type === 'STORE_CLOSE',
        orderPauseMessage: defaultMsg,
        policies: {
          ...existingPolicies,
          emergencyPause: {
            isPaused: type === 'ALL_ORDERS' || type === 'STORE_CLOSE',
            reason,
            message: defaultMsg,
            pausedAt: start.toISOString(),
            resumesAt: end ? end.toISOString() : null,
            updatedAt: new Date().toISOString()
          }
        }
      }
    });

    // Record in EmergencyLog
    await prisma.emergencyLog.create({
      data: {
        action: 'ACTIVATE',
        type,
        reason,
        customReason: customReason || null,
        message: defaultMsg,
        affectedAreas: affectedVillageIds,
        startTime: start,
        endTime: end,
        adminId: req.user?.id || null,
        adminName: req.user?.name || 'Administrator'
      }
    }).catch(() => {});

    logAudit(req, {
      module: 'EMERGENCY',
      action: 'EMERGENCY_ACTIVATE',
      resourceId: '1',
      resourceName: `Emergency: ${type} (${reason})`,
      details: emergencyPayload
    });

    ok(res, emergencyPayload, 'Emergency restrictions activated successfully');
  }),

  // Deactivate emergency restrictions
  deactivate: asyncHandler(async (req, res) => {
    const current = await prisma.storeSetting.findUnique({ where: { id: 1 } });
    const existingPolicies = current?.policies && typeof current.policies === 'object' ? current.policies : {};

    const emergencyPayload = {
      isActive: false,
      type: null,
      reason: null,
      customReason: null,
      message: null,
      affectedVillageIds: [],
      startTime: null,
      endTime: null,
      autoExpire: true,
      deactivatedBy: req.user?.name || 'Administrator',
      deactivatedAt: new Date().toISOString()
    };

    await prisma.storeSetting.update({
      where: { id: 1 },
      data: {
        emergencySettings: emergencyPayload,
        isOrderPaused: false,
        orderPauseMessage: null,
        policies: {
          ...existingPolicies,
          emergencyPause: {
            isPaused: false,
            updatedAt: new Date().toISOString()
          }
        }
      }
    });

    await prisma.emergencyLog.create({
      data: {
        action: 'DEACTIVATE',
        type: 'ALL_ORDERS',
        reason: 'MANUAL_DEACTIVATION',
        message: 'Emergency restrictions lifted manually by administrator.',
        adminId: req.user?.id || null,
        adminName: req.user?.name || 'Administrator'
      }
    }).catch(() => {});

    logAudit(req, {
      module: 'EMERGENCY',
      action: 'EMERGENCY_DEACTIVATE',
      resourceId: '1',
      resourceName: 'Emergency Restrictions Lifted',
      details: { deactivatedAt: new Date().toISOString() }
    });

    ok(res, emergencyPayload, 'Emergency restrictions deactivated. Normal store operations resumed.');
  }),

  // Get emergency activity log history
  getHistory: asyncHandler(async (req, res) => {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));

    const [rows, total] = await Promise.all([
      prisma.emergencyLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum
      }),
      prisma.emergencyLog.count()
    ]);

    ok(res, {
      history: rows,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.max(1, Math.ceil(total / limitNum))
      }
    });
  })
};
