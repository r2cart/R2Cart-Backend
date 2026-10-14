import { prisma } from '../config/prisma.js';
import { AppError, asyncHandler, created, ok } from '../utils/response.js';
import { logAudit } from '../services/audit.service.js';
import { getDeliveryProofUrl } from '../services/image.service.js';

export const adminDeliveryAssignments = {
  // 1. List Delivery Staff with Workload & Availability
  listStaff: asyncHandler(async (req, res) => {
    const { villageId, dutyStatus, search } = req.query;

    const where = {
      OR: [
        { role: 'DELIVERY_PERSON' },
        { staffRole: 'DELIVERY_PERSON' }
      ]
    };

    if (dutyStatus) {
      where.dutyStatus = String(dutyStatus).toUpperCase();
    }

    if (search) {
      where.OR = [
        { name: { contains: String(search).trim() } },
        { email: { contains: String(search).trim() } },
        { mobile: { contains: String(search).trim() } }
      ];
    }

    const staffMembers = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        mobile: true,
        role: true,
        staffRole: true,
        dutyStatus: true,
        assignedVillageIds: true,
        vehicleType: true,
        vehicleNumber: true,
        currentLatitude: true,
        currentLongitude: true,
        isStaffActive: true,
        lastLoginAt: true,
        createdAt: true
      },
      orderBy: [{ name: 'asc' }]
    });

    // Query active and delivered counts for each staff member
    const staffIds = staffMembers.map(s => s.id);
    const [activeCounts, deliveredCounts] = await Promise.all([
      prisma.deliveryAssignment.groupBy({
        by: ['deliveryPersonId'],
        where: {
          deliveryPersonId: { in: staffIds },
          isCurrent: true,
          status: { in: ['ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERY_PROOF_PENDING'] }
        },
        _count: { id: true }
      }),
      prisma.deliveryAssignment.groupBy({
        by: ['deliveryPersonId'],
        where: {
          deliveryPersonId: { in: staffIds },
          status: 'DELIVERED'
        },
        _count: { id: true }
      })
    ]);

    const activeMap = Object.fromEntries(activeCounts.map(c => [c.deliveryPersonId, c._count.id]));
    const deliveredMap = Object.fromEntries(deliveredCounts.map(c => [c.deliveryPersonId, c._count.id]));

    // Query pending COD handover
    const pendingCod = await prisma.codCollection.groupBy({
      by: ['deliveryPersonId'],
      where: {
        deliveryPersonId: { in: staffIds },
        settlementStatus: 'PENDING'
      },
      _sum: { collectedAmount: true }
    });
    const pendingCodMap = Object.fromEntries(pendingCod.map(c => [c.deliveryPersonId, Number(c._sum.collectedAmount || 0)]));

    let result = staffMembers.map(s => ({
      ...s,
      activeAssignmentsCount: activeMap[s.id] || 0,
      completedAssignmentsCount: deliveredMap[s.id] || 0,
      pendingCodAmount: pendingCodMap[s.id] || 0
    }));

    if (villageId) {
      result = result.filter(s => {
        const vIds = Array.isArray(s.assignedVillageIds) ? s.assignedVillageIds : [];
        return vIds.includes(villageId);
      });
    }

    ok(res, result);
  }),

  // 2. List Unassigned Orders (Pending Delivery Assignment)
  listUnassignedOrders: asyncHandler(async (req, res) => {
    const { villageId, search, date } = req.query;

    const where = {
      status: { in: ['NEW', 'CONFIRMED', 'PACKING'] },
      deliveryAssignments: {
        none: {
          isCurrent: true,
          status: { in: ['ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERY_PROOF_PENDING'] }
        }
      }
    };

    if (search) {
      where.OR = [
        { orderNumber: { contains: String(search).trim() } }
      ];
    }

    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      where.createdAt = { gte: start, lte: end };
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, mobile: true, email: true } },
        items: { select: { id: true, name: true, quantity: true, unit: true, image: true } }
      },
      orderBy: [{ createdAt: 'desc' }]
    });

    let formatted = orders.map(o => {
      const addr = typeof o.addressSnapshot === 'object' && o.addressSnapshot ? o.addressSnapshot : {};
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        customerName: addr.fullName || o.user?.name || 'Customer',
        customerMobile: addr.mobile || o.user?.mobile || '',
        addressLine: [addr.street, addr.landmark, addr.villageName, addr.city, addr.pincode].filter(Boolean).join(', '),
        villageName: addr.villageName || '',
        villageId: addr.villageId || null,
        grandTotal: Number(o.grandTotal),
        paymentMethod: o.paymentMethod,
        paymentStatus: o.paymentStatus,
        deliverySlot: o.deliverySlot,
        deliveryDate: o.deliveryDate,
        deliveryInstruction: o.deliveryInstruction,
        itemCount: o.items.reduce((acc, it) => acc + it.quantity, 0),
        items: o.items,
        createdAt: o.createdAt
      };
    });

    if (villageId) {
      formatted = formatted.filter(o => o.villageId === villageId || o.villageName?.toLowerCase().includes(villageId.toLowerCase()));
    }

    ok(res, formatted);
  }),

  // 3. List Delivery Assignments with Comprehensive Filters
  listAssignments: asyncHandler(async (req, res) => {
    const {
      status,
      deliveryPersonId,
      orderId,
      isCurrent,
      page = 1,
      limit = 50,
      search
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

    const where = {};

    if (status) {
      where.status = String(status).toUpperCase();
    }
    if (deliveryPersonId) {
      where.deliveryPersonId = deliveryPersonId;
    }
    if (orderId) {
      where.orderId = orderId;
    }
    if (isCurrent !== undefined) {
      where.isCurrent = String(isCurrent) === 'true';
    }
    if (search) {
      where.order = {
        orderNumber: { contains: String(search).trim() }
      };
    }

    const [rows, total] = await Promise.all([
      prisma.deliveryAssignment.findMany({
        where,
        include: {
          order: {
            include: {
              user: { select: { id: true, name: true, mobile: true, email: true } },
              items: { select: { id: true, name: true, quantity: true, unit: true, image: true, price: true } }
            }
          },
          deliveryPerson: {
            select: { id: true, name: true, mobile: true, email: true, vehicleType: true, vehicleNumber: true }
          },
          assignedBy: {
            select: { id: true, name: true, email: true }
          },
          proofs: {
            select: {
              id: true,
              cloudinaryUrl: true,
              cloudinaryPublicId: true,
              verificationStatus: true,
              recipientName: true,
              recipientPhone: true,
              createdAt: true
            }
          },
          codCollection: {
            select: {
              id: true,
              expectedAmount: true,
              collectedAmount: true,
              settlementStatus: true,
              collectedAt: true
            }
          }
        },
        orderBy: [{ assignedAt: 'desc' }],
        skip: (pageNum - 1) * limitNum,
        take: limitNum
      }),
      prisma.deliveryAssignment.count({ where })
    ]);

    const formatted = rows.map(r => {
      const addr = typeof r.order?.addressSnapshot === 'object' && r.order?.addressSnapshot ? r.order.addressSnapshot : {};
      return {
        id: r.id,
        orderId: r.orderId,
        orderNumber: r.order?.orderNumber,
        status: r.status,
        isCurrent: r.isCurrent,
        assignedAt: r.assignedAt,
        acceptedAt: r.acceptedAt,
        pickedUpAt: r.pickedUpAt,
        outForDeliveryAt: r.outForDeliveryAt,
        deliveredAt: r.deliveredAt,
        failedAt: r.failedAt,
        failureReason: r.failureReason,
        failureNotes: r.failureNotes,
        notes: r.notes,
        orderStatus: r.order?.status,
        grandTotal: Number(r.order?.grandTotal || 0),
        paymentMethod: r.order?.paymentMethod,
        paymentStatus: r.order?.paymentStatus,
        customerName: addr.fullName || r.order?.user?.name || 'Customer',
        customerMobile: addr.mobile || r.order?.user?.mobile || '',
        deliveryAddress: [addr.street, addr.landmark, addr.villageName, addr.city, addr.pincode].filter(Boolean).join(', '),
        villageName: addr.villageName || '',
        deliverySlot: r.order?.deliverySlot,
        deliveryDate: r.order?.deliveryDate,
        deliveryPerson: r.deliveryPerson,
        assignedBy: r.assignedBy,
        proofs: (r.proofs || []).map(p => ({
          ...p,
          signedUrl: getDeliveryProofUrl(p.cloudinaryPublicId, p.cloudinaryUrl)
        })),
        codCollection: r.codCollection ? {
          ...r.codCollection,
          expectedAmount: Number(r.codCollection.expectedAmount),
          collectedAmount: Number(r.codCollection.collectedAmount)
        } : null,
        items: r.order?.items || []
      };
    });

    ok(res, {
      assignments: formatted,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.max(1, Math.ceil(total / limitNum))
      }
    });
  }),

  // 4. Assign Order to Delivery Person
  assignOrder: asyncHandler(async (req, res) => {
    const { orderId, deliveryPersonId, notes } = req.body;

    if (!orderId || !deliveryPersonId) {
      throw new AppError('Order ID and Delivery Person ID are required', 422);
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        deliveryAssignments: {
          where: {
            isCurrent: true,
            status: { in: ['ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERY_PROOF_PENDING'] }
          }
        }
      }
    });

    if (!order) throw new AppError('Order not found', 404);
    if (order.status === 'DELIVERED') throw new AppError('Order has already been delivered', 400);
    if (order.status === 'CANCELLED') throw new AppError('Cannot assign a cancelled order', 400);

    if (order.deliveryAssignments.length > 0) {
      throw new AppError('This order already has an active delivery assignment. Please use reassign if you want to switch delivery staff.', 409);
    }

    const staff = await prisma.user.findUnique({ where: { id: deliveryPersonId } });
    if (!staff || !['DELIVERY_PERSON', 'ADMIN', 'SUPER_ADMIN'].includes(staff.role) && staff.staffRole !== 'DELIVERY_PERSON') {
      throw new AppError('Selected user is not recognized as delivery personnel', 422);
    }
    if (staff.isStaffActive === false) {
      throw new AppError('This delivery staff member is currently deactivated', 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create delivery assignment
      const assignment = await tx.deliveryAssignment.create({
        data: {
          orderId,
          deliveryPersonId,
          assignedById: req.user.id,
          status: 'ASSIGNED',
          isCurrent: true,
          notes: notes ? String(notes).trim() : null
        }
      });

      // 2. Create initial delivery status log
      await tx.deliveryStatusLog.create({
        data: {
          assignmentId: assignment.id,
          orderId,
          staffId: req.user.id,
          previousStatus: null,
          newStatus: 'ASSIGNED',
          metadata: { assignedBy: req.user.name, deliveryPerson: staff.name }
        }
      });

      // 3. Update order status to CONFIRMED if it was NEW
      if (order.status === 'NEW') {
        await tx.order.update({
          where: { id: orderId },
          data: { status: 'CONFIRMED' }
        });
      }

      return assignment;
    });

    logAudit(req, {
      module: 'DELIVERY',
      action: 'ORDER_ASSIGNED',
      resourceId: result.id,
      resourceName: order.orderNumber,
      details: {
        orderId,
        orderNumber: order.orderNumber,
        deliveryPersonId,
        deliveryPersonName: staff.name
      }
    });

    created(res, result, `Order ${order.orderNumber} assigned to ${staff.name}`);
  }),

  // 5. Reassign Order to Another Delivery Person (Preserves Full History)
  reassignOrder: asyncHandler(async (req, res) => {
    const { orderId, newDeliveryPersonId, reason, notes } = req.body;

    if (!orderId || !newDeliveryPersonId) {
      throw new AppError('Order ID and New Delivery Person ID are required', 422);
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        deliveryAssignments: {
          where: { isCurrent: true },
          include: { deliveryPerson: true }
        }
      }
    });

    if (!order) throw new AppError('Order not found', 404);
    if (order.status === 'DELIVERED') throw new AppError('Order has already been delivered', 400);

    const activeAssignment = order.deliveryAssignments[0];
    if (!activeAssignment) {
      throw new AppError('No active assignment found for this order. Use normal assign instead.', 400);
    }

    if (activeAssignment.deliveryPersonId === newDeliveryPersonId) {
      throw new AppError('Order is already assigned to this delivery staff member', 400);
    }

    const newStaff = await prisma.user.findUnique({ where: { id: newDeliveryPersonId } });
    if (!newStaff || newStaff.isStaffActive === false) {
      throw new AppError('Target delivery staff member is invalid or deactivated', 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the new assignment
      const newAssignment = await tx.deliveryAssignment.create({
        data: {
          orderId,
          deliveryPersonId: newDeliveryPersonId,
          assignedById: req.user.id,
          status: 'ASSIGNED',
          isCurrent: true,
          notes: notes ? String(notes).trim() : null
        }
      });

      // 2. Mark previous assignment as not current and record reassigned pointer
      await tx.deliveryAssignment.update({
        where: { id: activeAssignment.id },
        data: {
          isCurrent: false,
          reassignedToId: newAssignment.id,
          notes: activeAssignment.notes
            ? `${activeAssignment.notes} | Reassigned: ${reason || 'Admin reassign'}`
            : `Reassigned: ${reason || 'Admin reassign'}`
        }
      });

      // 3. Log status transition
      await tx.deliveryStatusLog.create({
        data: {
          assignmentId: newAssignment.id,
          orderId,
          staffId: req.user.id,
          previousStatus: activeAssignment.status,
          newStatus: 'REASSIGNED',
          metadata: {
            fromDeliveryPerson: activeAssignment.deliveryPerson.name,
            toDeliveryPerson: newStaff.name,
            reason: reason || 'Operational reassignment'
          }
        }
      });

      return newAssignment;
    });

    logAudit(req, {
      module: 'DELIVERY',
      action: 'ORDER_REASSIGNED',
      resourceId: result.id,
      resourceName: order.orderNumber,
      details: {
        orderId,
        fromStaff: activeAssignment.deliveryPerson.name,
        toStaff: newStaff.name,
        reason
      }
    });

    ok(res, result, `Order ${order.orderNumber} successfully reassigned to ${newStaff.name}`);
  }),

  // 6. Delivery Proofs Verification Queue
  listVerifications: asyncHandler(async (req, res) => {
    const { verificationStatus, deliveryPersonId, orderId, search, page = 1, limit = 50 } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

    const where = {};
    if (verificationStatus) {
      where.verificationStatus = String(verificationStatus).toUpperCase();
    }
    if (deliveryPersonId) {
      where.deliveryPersonId = deliveryPersonId;
    }
    if (orderId) {
      where.orderId = orderId;
    }
    if (search) {
      where.order = {
        orderNumber: { contains: String(search).trim() }
      };
    }

    const [rows, total] = await Promise.all([
      prisma.deliveryProof.findMany({
        where,
        include: {
          order: {
            include: {
              user: { select: { id: true, name: true, mobile: true } }
            }
          },
          deliveryPerson: {
            select: { id: true, name: true, mobile: true, email: true }
          },
          verifiedBy: {
            select: { id: true, name: true, email: true }
          },
          assignment: {
            select: {
              id: true,
              status: true,
              deliveredAt: true,
              assignedAt: true
            }
          }
        },
        orderBy: [{ createdAt: 'desc' }],
        skip: (pageNum - 1) * limitNum,
        take: limitNum
      }),
      prisma.deliveryProof.count({ where })
    ]);

    const formatted = rows.map(r => {
      const addr = typeof r.order?.addressSnapshot === 'object' && r.order?.addressSnapshot ? r.order.addressSnapshot : {};
      return {
        id: r.id,
        orderId: r.orderId,
        orderNumber: r.order?.orderNumber,
        assignmentId: r.assignmentId,
        deliveryPerson: r.deliveryPerson,
        customerName: addr.fullName || r.order?.user?.name || 'Customer',
        customerMobile: addr.mobile || r.order?.user?.mobile || '',
        deliveryAddress: [addr.street, addr.villageName, addr.city].filter(Boolean).join(', '),
        cloudinaryPublicId: r.cloudinaryPublicId,
        cloudinaryUrl: r.cloudinaryUrl,
        signedUrl: getDeliveryProofUrl(r.cloudinaryPublicId, r.cloudinaryUrl),
        verificationStatus: r.verificationStatus,
        verifiedBy: r.verifiedBy,
        verifiedAt: r.verifiedAt,
        verificationNotes: r.verificationNotes,
        recipientName: r.recipientName,
        recipientPhone: r.recipientPhone,
        customerOtp: r.customerOtp,
        notes: r.notes,
        deliveredAt: r.assignment?.deliveredAt,
        grandTotal: Number(r.order?.grandTotal || 0),
        createdAt: r.createdAt
      };
    });

    ok(res, {
      proofs: formatted,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.max(1, Math.ceil(total / limitNum))
      }
    });
  }),

  // 7. Verify or Flag Delivery Proof
  verifyDeliveryProof: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { verificationStatus, notes } = req.body;

    const validStatuses = ['VERIFIED', 'FLAGGED', 'INVESTIGATING', 'PENDING'];
    if (!validStatuses.includes(String(verificationStatus).toUpperCase())) {
      throw new AppError('Invalid verification status. Must be VERIFIED, FLAGGED, or INVESTIGATING.', 422);
    }

    const proof = await prisma.deliveryProof.findUnique({
      where: { id },
      include: { order: true, deliveryPerson: true }
    });

    if (!proof) throw new AppError('Delivery proof record not found', 404);

    const updated = await prisma.deliveryProof.update({
      where: { id },
      data: {
        verificationStatus: String(verificationStatus).toUpperCase(),
        verifiedById: req.user.id,
        verifiedAt: new Date(),
        verificationNotes: notes ? String(notes).trim() : null
      }
    });

    logAudit(req, {
      module: 'DELIVERY',
      action: 'PROOF_VERIFIED',
      resourceId: updated.id,
      resourceName: proof.order?.orderNumber,
      details: {
        orderId: proof.orderId,
        proofId: proof.id,
        status: updated.verificationStatus,
        deliveryPerson: proof.deliveryPerson?.name,
        notes
      }
    });

    ok(res, updated, `Delivery proof status updated to ${updated.verificationStatus}`);
  }),

  // 8. COD Collections List & Aggregates
  listCodCollections: asyncHandler(async (req, res) => {
    const { deliveryPersonId, settlementStatus, search, page = 1, limit = 50 } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

    const where = {};
    if (deliveryPersonId) {
      where.deliveryPersonId = deliveryPersonId;
    }
    if (settlementStatus) {
      where.settlementStatus = String(settlementStatus).toUpperCase();
    }
    if (search) {
      where.order = {
        orderNumber: { contains: String(search).trim() }
      };
    }

    const [rows, total, aggregates] = await Promise.all([
      prisma.codCollection.findMany({
        where,
        include: {
          order: {
            select: { id: true, orderNumber: true, grandTotal: true, createdAt: true, addressSnapshot: true }
          },
          deliveryPerson: {
            select: { id: true, name: true, mobile: true, email: true }
          },
          settlement: {
            select: { id: true, settlementNumber: true, settledAt: true }
          }
        },
        orderBy: [{ collectedAt: 'desc' }],
        skip: (pageNum - 1) * limitNum,
        take: limitNum
      }),
      prisma.codCollection.count({ where }),
      prisma.codCollection.aggregate({
        where,
        _sum: {
          expectedAmount: true,
          collectedAmount: true
        }
      })
    ]);

    const formatted = rows.map(r => {
      const addr = typeof r.order?.addressSnapshot === 'object' && r.order?.addressSnapshot ? r.order.addressSnapshot : {};
      return {
        id: r.id,
        orderId: r.orderId,
        orderNumber: r.order?.orderNumber,
        deliveryPerson: r.deliveryPerson,
        expectedAmount: Number(r.expectedAmount),
        collectedAmount: Number(r.collectedAmount),
        discrepancy: Number(r.collectedAmount) - Number(r.expectedAmount),
        settlementStatus: r.settlementStatus,
        settlementNumber: r.settlement?.settlementNumber || null,
        settledAt: r.settlement?.settledAt || null,
        discrepancyNote: r.discrepancyNote,
        customerName: addr.fullName || 'Customer',
        collectedAt: r.collectedAt,
        createdAt: r.createdAt
      };
    });

    ok(res, {
      collections: formatted,
      summary: {
        totalExpected: Number(aggregates._sum.expectedAmount || 0),
        totalCollected: Number(aggregates._sum.collectedAmount || 0),
        pendingHandoverCount: rows.filter(r => r.settlementStatus === 'PENDING').length
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.max(1, Math.ceil(total / limitNum))
      }
    });
  }),

  // 9. Record COD Cash Settlement (Super Admin & Authorized Admin)
  settleCodCollections: asyncHandler(async (req, res) => {
    const { deliveryPersonId, collectionIds, settleAllPending, notes, settledAmount } = req.body;

    if (!deliveryPersonId) {
      throw new AppError('Delivery Person ID is required for COD settlement', 422);
    }

    const where = {
      deliveryPersonId,
      settlementStatus: 'PENDING'
    };

    if (!settleAllPending && Array.isArray(collectionIds) && collectionIds.length > 0) {
      where.id = { in: collectionIds };
    }

    const pendingCollections = await prisma.codCollection.findMany({ where });

    if (pendingCollections.length === 0) {
      throw new AppError('No pending COD collections found to settle for this delivery staff', 400);
    }

    const totalExpected = pendingCollections.reduce((acc, c) => acc + Number(c.expectedAmount), 0);
    const totalCollected = pendingCollections.reduce((acc, c) => acc + Number(c.collectedAmount), 0);
    const actualSettled = settledAmount !== undefined ? Number(settledAmount) : totalCollected;
    const discrepancy = actualSettled - totalCollected;

    const staff = await prisma.user.findUnique({ where: { id: deliveryPersonId } });

    // Generate settlement identifier
    const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const settlementNumber = `SETTLE-${datePrefix}-${randomSuffix}`;

    const settlement = await prisma.$transaction(async (tx) => {
      // 1. Create COD settlement record
      const s = await tx.codSettlement.create({
        data: {
          settlementNumber,
          deliveryPersonId,
          settledById: req.user.id,
          totalOrders: pendingCollections.length,
          totalExpectedAmount: totalExpected,
          totalCollectedAmount: totalCollected,
          totalSettledAmount: actualSettled,
          discrepancyAmount: discrepancy,
          notes: notes ? String(notes).trim() : null
        }
      });

      // 2. Mark all collections as SETTLED
      await tx.codCollection.updateMany({
        where: { id: { in: pendingCollections.map(c => c.id) } },
        data: {
          settlementStatus: 'SETTLED',
          settlementId: s.id
        }
      });

      return s;
    });

    logAudit(req, {
      module: 'FINANCE',
      action: 'COD_SETTLEMENT_RECORDED',
      resourceId: settlement.id,
      resourceName: settlement.settlementNumber,
      details: {
        settlementNumber,
        deliveryPerson: staff?.name,
        ordersCount: pendingCollections.length,
        totalExpected,
        totalCollected,
        actualSettled,
        discrepancy
      }
    });

    created(res, settlement, `Settlement ${settlementNumber} recorded successfully for ${staff?.name || 'staff'}`);
  }),

  // 10. List Settlement Records History
  listSettlements: asyncHandler(async (req, res) => {
    const { deliveryPersonId, page = 1, limit = 50 } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

    const where = {};
    if (deliveryPersonId) where.deliveryPersonId = deliveryPersonId;

    const [rows, total] = await Promise.all([
      prisma.codSettlement.findMany({
        where,
        include: {
          deliveryPerson: { select: { id: true, name: true, mobile: true, email: true } },
          settledBy: { select: { id: true, name: true, email: true } }
        },
        orderBy: [{ settledAt: 'desc' }],
        skip: (pageNum - 1) * limitNum,
        take: limitNum
      }),
      prisma.codSettlement.count({ where })
    ]);

    ok(res, {
      settlements: rows.map(r => ({
        ...r,
        totalExpectedAmount: Number(r.totalExpectedAmount),
        totalCollectedAmount: Number(r.totalCollectedAmount),
        totalSettledAmount: Number(r.totalSettledAmount),
        discrepancyAmount: Number(r.discrepancyAmount)
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.max(1, Math.ceil(total / limitNum))
      }
    });
  })
};
