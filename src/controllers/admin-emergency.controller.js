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

    const [villages, areas] = await Promise.all([
      prisma.deliveryVillage.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true, isPaused: true, notes: true }
      }),
      prisma.deliveryArea.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true, pincodes: true, isPaused: true }
      })
    ]);

    const activeEmergency = schedule.isEmergencyActive ? schedule.emergencyDetails : null;
    const affectedSet = new Set(
      (activeEmergency?.type === 'SELECTED_AREAS' && Array.isArray(activeEmergency?.affectedVillageIds)
        ? activeEmergency.affectedVillageIds
        : []
      ).map(x => String(x).trim().toLowerCase())
    );

    const combinedVillages = [
      ...villages.map(v => {
        const isSuspended = affectedSet.has(String(v.id).toLowerCase()) || affectedSet.has(String(v.name).toLowerCase());
        return {
          id: v.id,
          name: v.name,
          isPaused: Boolean(v.isPaused || isSuspended),
          isVillageOverride: true
        };
      })
    ];
    const seenNames = new Set(combinedVillages.map(v => v.name.toLowerCase()));

    areas.forEach(a => {
      const locs = Array.isArray(a.pincodes) ? a.pincodes : [];
      locs.forEach(loc => {
        const clean = String(loc || '').trim();
        if (clean && !seenNames.has(clean.toLowerCase())) {
          seenNames.add(clean.toLowerCase());
          const isSuspended = affectedSet.has(clean.toLowerCase());
          combinedVillages.push({
            id: clean,
            name: clean,
            isPaused: Boolean(a.isPaused || isSuspended),
            isVillageOverride: false,
            zoneName: a.name
          });
        }
      });
    });

    combinedVillages.sort((a, b) => a.name.localeCompare(b.name));

    ok(res, {
      isActive: schedule.isEmergencyActive,
      emergency: activeEmergency,
      storeStatus: schedule.status,
      statusReason: schedule.statusReason,
      villages: combinedVillages
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

    const defaultMsg = message?.trim() || `Store deliveries are temporarily paused due to ${customReason || reason.replace(/_/g, ' ').toLowerCase()}.`;
    const start = startTime ? new Date(startTime) : new Date();
    const end = endTime ? new Date(endTime) : null;

    // Resolve both IDs and Names for all selected villages/areas
    const [allVillagesInDb, allAreasInDb] = await Promise.all([
      prisma.deliveryVillage.findMany({ select: { id: true, name: true } }),
      prisma.deliveryArea.findMany({ select: { id: true, name: true, pincodes: true } })
    ]);
    const normalizedAffected = new Set();
    (Array.isArray(affectedVillageIds) ? affectedVillageIds : []).forEach(item => {
      const str = String(item).trim();
      if (!str) return;
      normalizedAffected.add(str);
      const vMatch = allVillagesInDb.find(v => v.id === str || v.name.toLowerCase() === str.toLowerCase());
      if (vMatch) {
        normalizedAffected.add(vMatch.id);
        normalizedAffected.add(vMatch.name);
      }
      const aMatch = allAreasInDb.find(a => a.id === str || a.name.toLowerCase() === str.toLowerCase() || (Array.isArray(a.pincodes) && a.pincodes.some(p => String(p).toLowerCase() === str.toLowerCase())));
      if (aMatch && (aMatch.id === str || aMatch.name.toLowerCase() === str.toLowerCase())) {
        normalizedAffected.add(aMatch.id);
        normalizedAffected.add(aMatch.name);
      }
    });
    const finalAffectedVillageIds = Array.from(normalizedAffected);

    const current = await prisma.storeSetting.findUnique({ where: { id: 1 } });
    const existingPolicies = current?.policies && typeof current.policies === 'object' ? current.policies : {};

    const emergencyPayload = {
      isActive: true,
      type,
      reason,
      customReason: customReason ? String(customReason).trim() : null,
      message: defaultMsg,
      affectedVillageIds: type === 'SELECTED_AREAS' ? finalAffectedVillageIds : [],
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

    // If SELECTED_AREAS, also mark matching deliveryVillage records as paused
    if (type === 'SELECTED_AREAS' && finalAffectedVillageIds.length > 0) {
      await prisma.deliveryVillage.updateMany({
        where: {
          OR: [
            { id: { in: finalAffectedVillageIds } },
            { name: { in: finalAffectedVillageIds } }
          ]
        },
        data: {
          isPaused: true,
          notes: defaultMsg
        }
      }).catch(() => {});
    }

    // Record in EmergencyLog
    await prisma.emergencyLog.create({
      data: {
        action: 'ACTIVATE',
        type,
        reason,
        customReason: customReason || null,
        message: defaultMsg,
        affectedAreas: finalAffectedVillageIds,
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

    // Unpause any paused delivery villages
    await prisma.deliveryVillage.updateMany({
      where: { isPaused: true },
      data: { isPaused: false }
    }).catch(() => {});

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
