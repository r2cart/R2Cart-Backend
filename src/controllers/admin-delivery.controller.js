import {prisma} from '../config/prisma.js';
import {AppError,asyncHandler,created,ok} from '../utils/response.js';
import {logAudit} from '../services/audit.service.js';
import {resolveVillageDeliveryRules} from '../services/delivery-resolution.service.js';


const villageData = (body) => {
  const name = String(body.name || '').trim();
  if (!name) throw new AppError('Village name is required', 422);

  const deliveryFee = Number(body.deliveryFee);
  if (body.deliveryFee === '' || body.deliveryFee == null || !Number.isFinite(deliveryFee) || deliveryFee < 0) {
    throw new AppError('Delivery fee must be zero or more', 422);
  }

  const minimumOrder = Number(body.minimumOrder);
  if (body.minimumOrder === '' || body.minimumOrder == null || !Number.isFinite(minimumOrder) || minimumOrder < 0) {
    throw new AppError('Minimum order amount must be zero or more', 422);
  }

  const freeDeliveryThreshold = Number(body.freeDeliveryThreshold);
  if (body.freeDeliveryThreshold === '' || body.freeDeliveryThreshold == null || !Number.isFinite(freeDeliveryThreshold) || freeDeliveryThreshold < 0) {
    throw new AppError('Free delivery threshold must be zero or more', 422);
  }

  const radiusKm = body.radiusKm !== undefined && body.radiusKm !== '' ? Number(body.radiusKm) : 5.0;
  if (radiusKm !== null && (!Number.isFinite(radiusKm) || radiusKm <= 0)) {
    throw new AppError('Delivery radius must be greater than zero', 422);
  }

  const status = String(body.status || 'ACTIVE').trim().toUpperCase();
  const overrideMode = ['COMPLETE', 'PARTIAL'].includes(String(body.overrideMode || '').toUpperCase())
    ? String(body.overrideMode).toUpperCase()
    : 'COMPLETE';

  return {
    name,
    pincode: body.pincode ? String(body.pincode).trim() : null,
    overrideMode,
    deliveryFee,
    minimumOrder,
    freeDeliveryThreshold,
    radiusKm,
    schedule: body.schedule ? String(body.schedule).trim() : null,
    deliveryHours: body.deliveryHours || null,
    customSlots: body.customSlots || null,
    allowCod: body.allowCod !== undefined ? Boolean(body.allowCod) : true,
    allowScheduled: body.allowScheduled !== undefined ? Boolean(body.allowScheduled) : true,
    estimatedMinutes: body.estimatedMinutes ? Number(body.estimatedMinutes) : 30,
    emergencyRestrictions: body.emergencyRestrictions || null,
    seasonalRules: body.seasonalRules || null,
    notes: body.notes ? String(body.notes).trim() : null,
    isPaused: Boolean(body.isPaused),
    status,
    areaId: body.areaId ? String(body.areaId) : null
  };
};

import {resolveEffectiveStoreSchedule} from '../services/store-operations.service.js';

export const villages = {
  list: asyncHandler(async (req, res) => {
    const { query, status, isPaused, areaId } = req.query;
    const where = {};

    if (query) {
      where.OR = [
        { name: { contains: String(query).trim() } },
        { pincode: { contains: String(query).trim() } }
      ];
    }
    if (status && ['ACTIVE', 'INACTIVE'].includes(status.toUpperCase())) {
      where.status = status.toUpperCase();
    }
    if (isPaused !== undefined && isPaused !== '') {
      where.isPaused = isPaused === 'true';
    }
    if (areaId) {
      where.areaId = areaId;
    }

    const [rows, schedule] = await Promise.all([
      prisma.deliveryVillage.findMany({
        where,
        include: { area: { select: { id: true, name: true } } },
        orderBy: [{ isPaused: 'asc' }, { name: 'asc' }]
      }),
      resolveEffectiveStoreSchedule()
    ]);

    const activeEmergency = schedule?.isEmergencyActive ? schedule?.emergencyDetails : null;
    const affectedSet = new Set(
      (activeEmergency?.type === 'SELECTED_AREAS' && Array.isArray(activeEmergency?.affectedVillageIds)
        ? activeEmergency.affectedVillageIds
        : []
      ).map(x => String(x).trim().toLowerCase())
    );

    const mergedRows = rows.map(r => {
      const isSuspended = affectedSet.has(String(r.id).toLowerCase()) || affectedSet.has(String(r.name).toLowerCase());
      return {
        ...r,
        isPaused: Boolean(r.isPaused || isSuspended),
        notes: isSuspended ? (activeEmergency?.message || r.notes) : r.notes
      };
    });

    ok(res, mergedRows);
  }),

  get: asyncHandler(async (req, res) => {
    const row = await prisma.deliveryVillage.findUnique({
      where: { id: req.params.id },
      include: { area: true }
    });
    if (!row) throw new AppError('Delivery village not found', 404);
    ok(res, row);
  }),

  create: asyncHandler(async (req, res) => {
    const data = villageData(req.body);
    const existing = await prisma.deliveryVillage.findFirst({
      where: { name: data.name }
    });
    if (existing) throw new AppError(`Village "${data.name}" already exists`, 409);

    const createdVillage = await prisma.deliveryVillage.create({
      data,
      include: { area: { select: { id: true, name: true } } }
    });

    logAudit(req, {
      module: 'DELIVERY',
      action: 'VILLAGE_CREATE',
      resourceId: createdVillage.id,
      resourceName: createdVillage.name,
      details: { village: createdVillage }
    });

    created(res, createdVillage, 'Delivery village added successfully');
  }),

  update: asyncHandler(async (req, res) => {
    const current = await prisma.deliveryVillage.findUnique({ where: { id: req.params.id } });
    if (!current) throw new AppError('Delivery village not found', 404);

    const data = villageData(req.body);
    const updated = await prisma.deliveryVillage.update({
      where: { id: req.params.id },
      data,
      include: { area: { select: { id: true, name: true } } }
    });

    logAudit(req, {
      module: 'DELIVERY',
      action: 'VILLAGE_UPDATE',
      resourceId: updated.id,
      resourceName: updated.name,
      details: { before: current, after: updated }
    });

    ok(res, updated, 'Delivery village updated successfully');
  }),

  status: asyncHandler(async (req, res) => {
    const status = String(req.body.status || '').toUpperCase();
    if (!['ACTIVE', 'INACTIVE'].includes(status)) throw new AppError('Status must be ACTIVE or INACTIVE', 422);

    const updated = await prisma.deliveryVillage.update({
      where: { id: req.params.id },
      data: { status }
    });

    logAudit(req, {
      module: 'DELIVERY',
      action: status === 'ACTIVE' ? 'VILLAGE_ACTIVATE' : 'VILLAGE_DEACTIVATE',
      resourceId: updated.id,
      resourceName: updated.name,
      details: { status }
    });

    ok(res, updated, status === 'ACTIVE' ? 'Village enabled for delivery' : 'Village disabled');
  }),

  pause: asyncHandler(async (req, res) => {
    const isPaused = Boolean(req.body.isPaused);
    const updated = await prisma.deliveryVillage.update({
      where: { id: req.params.id },
      data: { isPaused }
    });

    logAudit(req, {
      module: 'DELIVERY',
      action: isPaused ? 'VILLAGE_PAUSE' : 'VILLAGE_RESUME',
      resourceId: updated.id,
      resourceName: updated.name,
      details: { isPaused, reason: req.body.reason || null }
    });

    ok(res, updated, isPaused ? 'Orders temporarily paused for this village' : 'Orders resumed for this village');
  }),

  remove: asyncHandler(async (req, res) => {
    const current = await prisma.deliveryVillage.findUnique({ where: { id: req.params.id } });
    if (!current) throw new AppError('Delivery village not found', 404);

    await prisma.deliveryVillage.delete({ where: { id: req.params.id } });

    logAudit(req, {
      module: 'DELIVERY',
      action: 'VILLAGE_DELETE',
      resourceId: current.id,
      resourceName: current.name,
      details: { deletedVillage: current }
    });

    ok(res, null, `Village "${current.name}" deleted successfully`);
  }),

  preview: asyncHandler(async (req, res) => {
    const { villageId, name, date, time } = req.query;
    const target = villageId || name;
    if (!target) throw new AppError('Village ID or Name is required', 422);
    const result = await resolveVillageDeliveryRules({
      villageIdOrName: target,
      targetDateStr: date,
      targetTimeStr: time
    });
    ok(res, result);
  }),

  bulk: asyncHandler(async (req, res) => {
    const list = Array.isArray(req.body.villages) ? req.body.villages : [];
    if (!list.length) throw new AppError('No delivery villages provided in payload', 422);

    let createdCount = 0;
    let updatedCount = 0;
    const errors = [];

    // Find all existing delivery areas
    const allAreas = await prisma.deliveryArea.findMany({ select: { id: true, name: true, pincodes: true } });
    const areaMap = new Map();
    const areaLocalitiesMap = new Map();

    allAreas.forEach(a => {
      areaMap.set(a.name.trim().toLowerCase(), a.id);
      const existingLocs = Array.isArray(a.pincodes)
        ? a.pincodes.map(v => typeof v === 'string' ? v.trim() : (v?.name || '').trim()).filter(Boolean)
        : [];
      areaLocalitiesMap.set(a.id, new Set(existingLocs));
    });

    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const name = String(item.name || '').trim();
      if (!name) {
        errors.push({ row: i + 1, error: 'Name is required' });
        continue;
      }

      // Resolve Zone Name (from row, or default Hathua)
      const rawZoneName = String(item.zoneName || item.zone || item.areaName || req.body.defaultZoneName || 'Hathua').trim();
      const zoneKey = rawZoneName.toLowerCase();

      let areaId = item.areaId || (zoneKey ? areaMap.get(zoneKey) : null);

      // If zone does not exist yet, AUTO-CREATE IT so villages belong to the zone!
      if (!areaId && rawZoneName) {
        const newArea = await prisma.deliveryArea.create({
          data: {
            name: rawZoneName,
            pincodes: [name],
            radiusKm: 5.0,
            minimumOrder: 150,
            deliveryFee: 30,
            freeDeliveryThreshold: 499,
            estimatedMinutes: 30,
            status: 'ACTIVE',
            isPaused: false
          }
        });
        areaId = newArea.id;
        areaMap.set(zoneKey, newArea.id);
        areaLocalitiesMap.set(newArea.id, new Set([name]));
      } else if (areaId) {
        if (!areaLocalitiesMap.has(areaId)) {
          areaLocalitiesMap.set(areaId, new Set());
        }
        areaLocalitiesMap.get(areaId).add(name);
      }

      const fee = Number(item.deliveryFee);
      const minOrd = Number(item.minimumOrder);
      const freeThresh = Number(item.freeDeliveryThreshold);
      const rad = Number(item.radiusKm);
      const estMins = Number(item.estimatedMinutes);

      const parsedData = {
        name,
        pincode: item.pincode ? String(item.pincode).trim() : null,
        overrideMode: ['COMPLETE', 'PARTIAL'].includes(String(item.overrideMode || '').toUpperCase())
          ? String(item.overrideMode).toUpperCase()
          : 'COMPLETE',
        deliveryFee: Number.isFinite(fee) && fee >= 0 ? fee : 30,
        minimumOrder: Number.isFinite(minOrd) && minOrd >= 0 ? minOrd : 150,
        freeDeliveryThreshold: Number.isFinite(freeThresh) && freeThresh >= 0 ? freeThresh : 499,
        radiusKm: Number.isFinite(rad) && rad > 0 ? rad : 5.0,
        schedule: item.schedule ? String(item.schedule).trim() : null,
        allowCod: item.allowCod !== false && String(item.allowCod).toUpperCase() !== 'NO',
        allowScheduled: item.allowScheduled !== false && String(item.allowScheduled).toUpperCase() !== 'NO',
        estimatedMinutes: Number.isFinite(estMins) && estMins > 0 ? estMins : 30,
        notes: item.notes ? String(item.notes).trim() : null,
        status: String(item.status || 'ACTIVE').toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
        areaId: areaId || null
      };

      const existing = await prisma.deliveryVillage.findFirst({
        where: { name }
      });

      if (existing) {
        await prisma.deliveryVillage.update({
          where: { id: existing.id },
          data: parsedData
        });
        updatedCount++;
      } else {
        await prisma.deliveryVillage.create({
          data: parsedData
        });
        createdCount++;
      }
    }

    // Sync all touched DeliveryAreas with the complete list of localities
    for (const [targetAreaId, localitiesSet] of areaLocalitiesMap.entries()) {
      const mergedList = Array.from(localitiesSet).filter(Boolean);
      await prisma.deliveryArea.update({
        where: { id: targetAreaId },
        data: { pincodes: mergedList }
      });
    }

    logAudit(req, {
      module: 'DELIVERY',
      action: 'VILLAGES_BULK_IMPORT',
      resourceName: 'Delivery Villages Excel Import',
      details: { createdCount, updatedCount, totalProcessed: list.length }
    });

    ok(res, {
      createdCount,
      updatedCount,
      totalProcessed: list.length,
      errors
    }, `Bulk import complete: ${createdCount} added, ${updatedCount} updated.`);
  }),

  clearDemo: asyncHandler(async (req, res) => {
    const demoVillages = [
      'Rasulpur', 'Hathua', 'Hathwa Gaon', 'Ratan Chak', 'Rupan Chak', 'Ekdanga',
      'Mani Chhapar', 'Munrera', 'Sainik School Hathua', 'Doma Hata', 'Mali Tola',
      'Chhotki Baghi', 'Badki Baghi', 'Pritam Tola', 'Khansama Tola', 'Hathua Market',
      'Chicktoli', 'Barwa', 'Sawrezi'
    ];

    // Find demo delivery areas (e.g. Hathua Service Zone or any with demo names)
    const demoAreas = await prisma.deliveryArea.findMany({
      where: {
        OR: [
          { name: { contains: 'Hathua' } },
          { name: 'Hathua Service Zone' }
        ]
      },
      select: { id: true, name: true }
    });
    const demoAreaIds = demoAreas.map(a => a.id);

    // Delete villages linked to demo areas or having demo village names
    const delVillages = await prisma.deliveryVillage.deleteMany({
      where: {
        OR: [
          { name: { in: demoVillages } },
          { name: { contains: 'Hathua' } },
          ...(demoAreaIds.length ? [{ areaId: { in: demoAreaIds } }] : [])
        ]
      }
    });

    // Delete the demo delivery area(s)
    let delAreasCount = 0;
    if (demoAreaIds.length > 0) {
      const delAreasRes = await prisma.deliveryArea.deleteMany({
        where: { id: { in: demoAreaIds } }
      });
      delAreasCount = delAreasRes.count;
    }

    logAudit(req, {
      module: 'DELIVERY',
      action: 'CLEAR_DEMO_SEED',
      resourceName: 'Clear Demo Seeded Delivery Addresses',
      details: { deletedVillagesCount: delVillages.count, deletedAreasCount: delAreasCount }
    });

    ok(res, {
      deletedVillagesCount: delVillages.count,
      deletedAreasCount: delAreasCount
    }, `Cleared seeded demo delivery data (${delVillages.count} villages, ${delAreasCount} zones removed).`);
  })
};

export const areas = {
  list: asyncHandler(async (req, res) => {
    const rows = await prisma.deliveryArea.findMany({
      include: { villages: true },
      orderBy: { name: 'asc' }
    });
    ok(res, rows.map(area => ({
      ...area,
      localities: Array.isArray(area.pincodes) ? area.pincodes : []
    })));
  }),

  create: asyncHandler(async (req, res) => {
    const name = String(req.body.name || '').trim();
    if (!name) throw new AppError('Delivery area name is required', 422);

    const localities = [...new Set((Array.isArray(req.body.localities) ? req.body.localities : req.body.pincodes || []).map(v => String(v).trim()).filter(Boolean))];
    const minimumOrder = Number(req.body.minimumOrder || 0);
    const deliveryFee = Number(req.body.deliveryFee || 0);
    const freeDeliveryThreshold = Number(req.body.freeDeliveryThreshold || 0);
    const estimatedMinutes = Math.max(1, parseInt(req.body.estimatedMinutes, 10) || 30);
    const radiusKm = req.body.radiusKm ? Number(req.body.radiusKm) : 5.0;

    const createdArea = await prisma.deliveryArea.create({
      data: {
        name,
        pincodes: localities,
        radiusKm,
        minimumOrder,
        deliveryFee,
        freeDeliveryThreshold,
        estimatedMinutes,
        status: req.body.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
        isPaused: Boolean(req.body.isPaused)
      }
    });

    logAudit(req, {
      module: 'DELIVERY',
      action: 'AREA_CREATE',
      resourceId: createdArea.id,
      resourceName: createdArea.name,
      details: { area: createdArea }
    });

    created(res, { ...createdArea, localities }, 'Delivery area created');
  }),

  update: asyncHandler(async (req, res) => {
    const current = await prisma.deliveryArea.findUnique({ where: { id: req.params.id } });
    if (!current) throw new AppError('Delivery area not found', 404);

    const name = String(req.body.name || '').trim();
    if (!name) throw new AppError('Delivery area name is required', 422);

    const localities = [...new Set((Array.isArray(req.body.localities) ? req.body.localities : req.body.pincodes || []).map(v => String(v).trim()).filter(Boolean))];
    const minimumOrder = Number(req.body.minimumOrder ?? current.minimumOrder);
    const deliveryFee = Number(req.body.deliveryFee ?? current.deliveryFee);
    const freeDeliveryThreshold = Number(req.body.freeDeliveryThreshold ?? current.freeDeliveryThreshold);
    const estimatedMinutes = Math.max(1, parseInt(req.body.estimatedMinutes || current.estimatedMinutes, 10));
    const radiusKm = req.body.radiusKm !== undefined ? (req.body.radiusKm === '' ? null : Number(req.body.radiusKm)) : current.radiusKm;

    const updated = await prisma.deliveryArea.update({
      where: { id: req.params.id },
      data: {
        name,
        pincodes: localities,
        radiusKm,
        minimumOrder,
        deliveryFee,
        freeDeliveryThreshold,
        estimatedMinutes,
        status: req.body.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
        isPaused: req.body.isPaused !== undefined ? Boolean(req.body.isPaused) : current.isPaused
      }
    });

    logAudit(req, {
      module: 'DELIVERY',
      action: 'AREA_UPDATE',
      resourceId: updated.id,
      resourceName: updated.name,
      details: { before: current, after: updated }
    });

    ok(res, { ...updated, localities }, 'Delivery area updated');
  }),

  status: asyncHandler(async (req, res) => {
    const status = String(req.body.status || '').toUpperCase();
    if (!['ACTIVE', 'INACTIVE'].includes(status)) throw new AppError('Status must be ACTIVE or INACTIVE', 422);

    const updated = await prisma.deliveryArea.update({
      where: { id: req.params.id },
      data: { status }
    });

    logAudit(req, {
      module: 'DELIVERY',
      action: status === 'ACTIVE' ? 'AREA_ACTIVATE' : 'AREA_DEACTIVATE',
      resourceId: updated.id,
      resourceName: updated.name,
      details: { status }
    });

    ok(res, updated, status === 'ACTIVE' ? 'Delivery area activated' : 'Delivery area paused');
  }),

  pause: asyncHandler(async (req, res) => {
    const isPaused = Boolean(req.body.isPaused);
    const updated = await prisma.deliveryArea.update({
      where: { id: req.params.id },
      data: { isPaused }
    });

    logAudit(req, {
      module: 'DELIVERY',
      action: isPaused ? 'AREA_PAUSE' : 'AREA_RESUME',
      resourceId: updated.id,
      resourceName: updated.name,
      details: { isPaused }
    });

    ok(res, updated, isPaused ? 'Delivery area paused' : 'Delivery area resumed');
  }),

  remove: asyncHandler(async (req, res) => {
    const current = await prisma.deliveryArea.findUnique({ where: { id: req.params.id } });
    if (!current) throw new AppError('Delivery area not found', 404);

    await prisma.deliveryArea.delete({ where: { id: req.params.id } });

    logAudit(req, {
      module: 'DELIVERY',
      action: 'AREA_DELETE',
      resourceId: current.id,
      resourceName: current.name,
      details: { deletedArea: current }
    });

    ok(res, null, 'Delivery area permanently deleted');
  })
};

export const deliveryConfig = {
  get: asyncHandler(async (req, res) => {
    const setting = await prisma.storeSetting.findUnique({ where: { id: 1 } });
    ok(res, {
      minimumOrder: Number(setting?.minimumOrder || 0),
      deliveryFee: Number(setting?.deliveryFee || 0),
      freeDeliveryThreshold: Number(setting?.freeDeliveryThreshold || 0),
      estimatedDelivery: setting?.estimatedDelivery || '15–30 minutes',
      globalDeliveryRadius: Number(setting?.globalDeliveryRadius || 5.0),
      allowCod: setting?.allowCod ?? true,
      allowScheduled: setting?.allowScheduled ?? true
    });
  }),

  update: asyncHandler(async (req, res) => {
    const data = {};
    if (req.body.minimumOrder !== undefined) data.minimumOrder = Number(req.body.minimumOrder);
    if (req.body.deliveryFee !== undefined) data.deliveryFee = Number(req.body.deliveryFee);
    if (req.body.freeDeliveryThreshold !== undefined) data.freeDeliveryThreshold = Number(req.body.freeDeliveryThreshold);
    if (req.body.estimatedDelivery) data.estimatedDelivery = String(req.body.estimatedDelivery).trim();
    if (req.body.globalDeliveryRadius !== undefined) data.globalDeliveryRadius = Number(req.body.globalDeliveryRadius);
    if (req.body.allowCod !== undefined) data.allowCod = Boolean(req.body.allowCod);
    if (req.body.allowScheduled !== undefined) data.allowScheduled = Boolean(req.body.allowScheduled);

    const updated = await prisma.storeSetting.update({
      where: { id: 1 },
      data
    });

    logAudit(req, {
      module: 'DELIVERY',
      action: 'GLOBAL_CONFIG_UPDATE',
      resourceId: '1',
      resourceName: 'Store Delivery Settings',
      details: { updated }
    });

    ok(res, updated, 'Global delivery configuration saved');
  })
};
