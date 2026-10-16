import { prisma } from '../config/prisma.js';
import { AppError, asyncHandler, created, ok } from '../utils/response.js';
import { logAudit } from '../services/audit.service.js';
import { uploadDeliveryProof, getDeliveryProofUrl } from '../services/image.service.js';

export const deliveryPortal = {
  // 1. Get Assigned Orders for the Logged-in Delivery Person
  getMyOrders: asyncHandler(async (req, res) => {
    const { status, tab = 'ALL', search } = req.query;
    const deliveryPersonId = req.user.id;

    const where = {
      deliveryPersonId,
      isCurrent: true
    };

    if (tab && tab !== 'ALL') {
      const upperTab = tab.toUpperCase();
      if (upperTab === 'PENDING') {
        where.status = { in: ['ASSIGNED', 'ACCEPTED'] };
      } else if (upperTab === 'IN_TRANSIT') {
        where.status = { in: ['PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERY_PROOF_PENDING'] };
      } else if (upperTab === 'DELIVERED') {
        where.status = 'DELIVERED';
      } else if (upperTab === 'FAILED') {
        where.status = 'DELIVERY_FAILED';
      } else {
        where.status = upperTab;
      }
    } else if (status) {
      where.status = String(status).toUpperCase();
    }

    if (search) {
      where.order = {
        orderNumber: { contains: String(search).trim() }
      };
    }

    const assignments = await prisma.deliveryAssignment.findMany({
      where,
      include: {
        order: {
          include: {
            user: { select: { id: true, name: true, mobile: true, email: true } },
            items: { select: { id: true, name: true, quantity: true, unit: true, image: true, price: true } }
          }
        },
        proofs: {
          select: { id: true, cloudinaryUrl: true, cloudinaryPublicId: true, verificationStatus: true, createdAt: true }
        },
        codCollection: {
          select: { id: true, expectedAmount: true, collectedAmount: true, settlementStatus: true }
        }
      },
      orderBy: [{ assignedAt: 'desc' }]
    });

    const formatted = assignments.map(a => {
      const addr = typeof a.order?.addressSnapshot === 'object' && a.order?.addressSnapshot ? a.order.addressSnapshot : {};
      const fullAddress = [addr.street, addr.landmark, addr.villageName, addr.city, addr.pincode].filter(Boolean).join(', ');
      const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;

      return {
        assignmentId: a.id,
        orderId: a.orderId,
        orderNumber: a.order?.orderNumber,
        status: a.status,
        orderStatus: a.order?.status,
        assignedAt: a.assignedAt,
        acceptedAt: a.acceptedAt,
        pickedUpAt: a.pickedUpAt,
        outForDeliveryAt: a.outForDeliveryAt,
        deliveredAt: a.deliveredAt,
        failedAt: a.failedAt,
        failureReason: a.failureReason,
        failureNotes: a.failureNotes,
        notes: a.notes,
        customerName: addr.fullName || a.order?.user?.name || 'Customer',
        customerPhone: addr.mobile || a.order?.user?.mobile || '',
        deliveryAddress: fullAddress,
        villageName: addr.villageName || '',
        googleMapsUrl,
        grandTotal: Number(a.order?.grandTotal || 0),
        paymentMethod: a.order?.paymentMethod,
        paymentStatus: a.order?.paymentStatus,
        codAmountToCollect: a.order?.paymentMethod === 'COD' ? Number(a.order?.grandTotal || 0) : 0,
        deliverySlot: a.order?.deliverySlot,
        deliveryDate: a.order?.deliveryDate,
        deliveryInstruction: a.order?.deliveryInstruction,
        itemCount: (a.order?.items || []).reduce((acc, it) => acc + it.quantity, 0),
        items: a.order?.items || [],
        proofs: (a.proofs || []).map(p => ({
          ...p,
          signedUrl: getDeliveryProofUrl(p.cloudinaryPublicId, p.cloudinaryUrl)
        })),
        codCollection: a.codCollection ? {
          ...a.codCollection,
          expectedAmount: Number(a.codCollection.expectedAmount),
          collectedAmount: Number(a.codCollection.collectedAmount)
        } : null
      };
    });

    ok(res, formatted);
  }),

  // 2. Get Single Order Details for Delivery Person
  getOrderDetails: asyncHandler(async (req, res) => {
    const { id } = req.params; // Can be assignmentId or orderId
    const deliveryPersonId = req.user.id;
    const isSuperOrAdmin = req.user.role === 'SUPER_ADMIN' || req.user.role === 'ADMIN' || req.user.staffRole === 'SUPER_ADMIN';

    const assignment = await prisma.deliveryAssignment.findFirst({
      where: {
        OR: [{ id }, { orderId: id }],
        isCurrent: true,
        ...(isSuperOrAdmin ? {} : { deliveryPersonId })
      },
      include: {
        order: {
          include: {
            user: { select: { id: true, name: true, mobile: true, email: true } },
            items: true
          }
        },
        proofs: true,
        codCollection: true,
        statusLogs: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!assignment) {
      throw new AppError('Assigned delivery not found or access denied', 404);
    }

    const addr = typeof assignment.order?.addressSnapshot === 'object' && assignment.order?.addressSnapshot ? assignment.order.addressSnapshot : {};
    const fullAddress = [addr.street, addr.landmark, addr.villageName, addr.city, addr.pincode].filter(Boolean).join(', ');
    const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;

    const responseData = {
      assignmentId: assignment.id,
      orderId: assignment.orderId,
      orderNumber: assignment.order?.orderNumber,
      status: assignment.status,
      orderStatus: assignment.order?.status,
      assignedAt: assignment.assignedAt,
      acceptedAt: assignment.acceptedAt,
      pickedUpAt: assignment.pickedUpAt,
      outForDeliveryAt: assignment.outForDeliveryAt,
      deliveredAt: assignment.deliveredAt,
      failedAt: assignment.failedAt,
      failureReason: assignment.failureReason,
      failureNotes: assignment.failureNotes,
      customerName: addr.fullName || assignment.order?.user?.name || 'Customer',
      customerPhone: addr.mobile || assignment.order?.user?.mobile || '',
      deliveryAddress: fullAddress,
      villageName: addr.villageName || '',
      googleMapsUrl,
      grandTotal: Number(assignment.order?.grandTotal || 0),
      paymentMethod: assignment.order?.paymentMethod,
      paymentStatus: assignment.order?.paymentStatus,
      codAmountToCollect: assignment.order?.paymentMethod === 'COD' ? Number(assignment.order?.grandTotal || 0) : 0,
      deliverySlot: assignment.order?.deliverySlot,
      deliveryDate: assignment.order?.deliveryDate,
      deliveryInstruction: assignment.order?.deliveryInstruction,
      items: assignment.order?.items || [],
      proofs: (assignment.proofs || []).map(p => ({
        ...p,
        signedUrl: getDeliveryProofUrl(p.cloudinaryPublicId, p.cloudinaryUrl)
      })),
      codCollection: assignment.codCollection ? {
        ...assignment.codCollection,
        expectedAmount: Number(assignment.codCollection.expectedAmount),
        collectedAmount: Number(assignment.codCollection.collectedAmount)
      } : null,
      statusLogs: assignment.statusLogs
    };

    ok(res, responseData);
  }),

  // 3. Update Delivery Progress (ACCEPTED, PICKED_UP, OUT_FOR_DELIVERY)
  updateStatus: asyncHandler(async (req, res) => {
    const { id } = req.params; // assignmentId
    const { status, notes } = req.body;
    const deliveryPersonId = req.user.id;
    const isSuperOrAdmin = req.user.role === 'SUPER_ADMIN' || req.user.role === 'ADMIN';

    const newStatus = String(status || '').toUpperCase();
    const allowedTransitions = ['ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY'];

    if (!allowedTransitions.includes(newStatus)) {
      throw new AppError(`Invalid progress status update. Must be one of: ${allowedTransitions.join(', ')}. Use upload-proof and complete-delivery to finalize.`, 422);
    }

    const assignment = await prisma.deliveryAssignment.findFirst({
      where: {
        id,
        isCurrent: true,
        ...(isSuperOrAdmin ? {} : { deliveryPersonId })
      },
      include: { order: true }
    });

    if (!assignment) {
      throw new AppError('Assigned delivery not found or access denied', 404);
    }

    if (assignment.status === 'DELIVERED') {
      throw new AppError('Order has already been marked as delivered', 400);
    }
    if (assignment.status === 'DELIVERY_FAILED') {
      throw new AppError('Cannot advance an order marked as delivery failed', 400);
    }

    // Enforce sequential transitions
    const validFlow = {
      ASSIGNED: ['ACCEPTED'],
      ACCEPTED: ['PICKED_UP'],
      PICKED_UP: ['OUT_FOR_DELIVERY'],
      OUT_FOR_DELIVERY: ['DELIVERY_PROOF_PENDING'],
      DELIVERY_PROOF_PENDING: ['DELIVERED']
    };

    if (!isSuperOrAdmin && validFlow[assignment.status] && !validFlow[assignment.status].includes(newStatus)) {
      throw new AppError(`Cannot jump from ${assignment.status} to ${newStatus}. Next allowed state is: ${validFlow[assignment.status].join(', ')}`, 400);
    }

    const data = {
      status: newStatus
    };
    if (notes) data.notes = notes;

    const now = new Date();
    if (newStatus === 'ACCEPTED') data.acceptedAt = now;
    if (newStatus === 'PICKED_UP') data.pickedUpAt = now;
    if (newStatus === 'OUT_FOR_DELIVERY') data.outForDeliveryAt = now;

    const updated = await prisma.$transaction(async (tx) => {
      const a = await tx.deliveryAssignment.update({
        where: { id: assignment.id },
        data
      });

      // Update order status if advancing to OUT_FOR_DELIVERY
      if (newStatus === 'OUT_FOR_DELIVERY') {
        await tx.order.update({
          where: { id: assignment.orderId },
          data: { status: 'OUT_FOR_DELIVERY' }
        });
      }

      // Record status log
      await tx.deliveryStatusLog.create({
        data: {
          assignmentId: assignment.id,
          orderId: assignment.orderId,
          staffId: req.user.id,
          previousStatus: assignment.status,
          newStatus,
          metadata: { notes }
        }
      });

      return a;
    });

    logAudit(req, {
      module: 'DELIVERY',
      action: 'DELIVERY_STATUS_CHANGED',
      resourceId: updated.id,
      resourceName: assignment.order?.orderNumber,
      details: {
        orderId: assignment.orderId,
        fromStatus: assignment.status,
        toStatus: newStatus
      }
    });

    ok(res, updated, `Delivery progress updated to ${newStatus}`);
  }),

  // 4. Upload Cloudinary Delivery Proof (MANDATORY before delivery completion)
  uploadProof: asyncHandler(async (req, res) => {
    const { id } = req.params; // assignmentId
    const deliveryPersonId = req.user.id;
    const isSuperOrAdmin = req.user.role === 'SUPER_ADMIN' || req.user.role === 'ADMIN';

    if (!req.file || !req.file.buffer) {
      throw new AppError('A valid image file (JPG, PNG, or WebP) is required as delivery proof', 422);
    }

    const assignment = await prisma.deliveryAssignment.findFirst({
      where: {
        id,
        isCurrent: true,
        ...(isSuperOrAdmin ? {} : { deliveryPersonId })
      },
      include: { order: true }
    });

    if (!assignment) {
      throw new AppError('Assigned delivery not found or access denied', 404);
    }

    if (assignment.status === 'DELIVERED') {
      throw new AppError('Order has already been delivered', 400);
    }

    // Generate clean unique proof identifier
    const proofId = `proof_${Date.now()}`;
    const cleanOrderId = assignment.order?.orderNumber || assignment.orderId;

    // Direct Cloudinary upload from memory buffer
    const cloudinaryResult = await uploadDeliveryProof(req.file.buffer, cleanOrderId, proofId);

    const { recipientName, recipientPhone, notes, customerOtp } = req.body;

    const proof = await prisma.$transaction(async (tx) => {
      // 1. Create DeliveryProof record
      const p = await tx.deliveryProof.create({
        data: {
          assignmentId: assignment.id,
          orderId: assignment.orderId,
          deliveryPersonId: assignment.deliveryPersonId,
          cloudinaryPublicId: cloudinaryResult.publicId,
          cloudinaryUrl: cloudinaryResult.url,
          cloudinaryFolder: `r2cart/delivery-proofs/${cleanOrderId}`,
          recipientName: recipientName ? String(recipientName).trim() : null,
          recipientPhone: recipientPhone ? String(recipientPhone).trim() : null,
          customerOtp: customerOtp ? String(customerOtp).trim() : null,
          notes: notes ? String(notes).trim() : null,
          verificationStatus: 'PENDING'
        }
      });

      // 2. Advance assignment status to DELIVERY_PROOF_PENDING
      await tx.deliveryAssignment.update({
        where: { id: assignment.id },
        data: { status: 'DELIVERY_PROOF_PENDING' }
      });

      // 3. Log status transition
      await tx.deliveryStatusLog.create({
        data: {
          assignmentId: assignment.id,
          orderId: assignment.orderId,
          staffId: req.user.id,
          previousStatus: assignment.status,
          newStatus: 'DELIVERY_PROOF_PENDING',
          metadata: { proofId: p.id, cloudinaryPublicId: cloudinaryResult.publicId }
        }
      });

      return p;
    });

    logAudit(req, {
      module: 'DELIVERY',
      action: 'PROOF_UPLOADED',
      resourceId: proof.id,
      resourceName: assignment.order?.orderNumber,
      details: {
        orderId: assignment.orderId,
        proofId: proof.id,
        publicId: cloudinaryResult.publicId
      }
    });

    created(res, {
      ...proof,
      signedUrl: getDeliveryProofUrl(proof.cloudinaryPublicId, proof.cloudinaryUrl)
    }, 'Delivery proof photo uploaded successfully to Cloudinary');
  }),

  // 5. Complete Delivery (Proof Mandatory + COD Record + Idempotent Transaction)
  completeDelivery: asyncHandler(async (req, res) => {
    const { id } = req.params; // assignmentId
    const { collectedAmount, recipientName, recipientPhone, customerOtp, notes } = req.body;
    const deliveryPersonId = req.user.id;
    const isSuperOrAdmin = req.user.role === 'SUPER_ADMIN' || req.user.role === 'ADMIN';

    const assignment = await prisma.deliveryAssignment.findFirst({
      where: {
        id,
        isCurrent: true,
        ...(isSuperOrAdmin ? {} : { deliveryPersonId })
      },
      include: {
        order: true,
        proofs: true,
        codCollection: true
      }
    });

    if (!assignment) {
      throw new AppError('Assigned delivery not found or access denied', 404);
    }

    if (assignment.status === 'DELIVERED') {
      throw new AppError('This order has already been marked as DELIVERED.', 409);
    }

    // MANDATORY PROOF CHECK: At least one proof record must exist
    if (!assignment.proofs || assignment.proofs.length === 0) {
      throw new AppError('Photo proof of delivery is mandatory. Please capture or upload a proof photo before completing delivery.', 422);
    }

    const order = assignment.order;
    const isCod = order.paymentMethod === 'COD';
    const expectedCod = isCod ? Number(order.grandTotal) : 0;
    const actualCollected = isCod
      ? (collectedAmount !== undefined ? Number(collectedAmount) : expectedCod)
      : 0;

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      // 1. Record COD Collection (if COD)
      let codRecord = assignment.codCollection;
      if (isCod) {
        if (codRecord) {
          codRecord = await tx.codCollection.update({
            where: { id: codRecord.id },
            data: {
              collectedAmount: actualCollected,
              expectedAmount: expectedCod,
              collectedAt: now
            }
          });
        } else {
          codRecord = await tx.codCollection.create({
            data: {
              assignmentId: assignment.id,
              orderId: order.id,
              deliveryPersonId: assignment.deliveryPersonId,
              expectedAmount: expectedCod,
              collectedAmount: actualCollected,
              settlementStatus: 'PENDING',
              collectedAt: now
            }
          });
        }
      }

      // 2. Mark DeliveryAssignment as DELIVERED
      const updatedAssignment = await tx.deliveryAssignment.update({
        where: { id: assignment.id },
        data: {
          status: 'DELIVERED',
          deliveredAt: now,
          notes: notes ? (assignment.notes ? `${assignment.notes} | ${notes}` : notes) : assignment.notes
        }
      });

      // 3. Mark Order as DELIVERED and update paymentStatus if COD
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'DELIVERED',
          paymentStatus: isCod ? 'PAID' : order.paymentStatus
        }
      });

      // 4. Update proof recipient details if provided
      if (assignment.proofs.length > 0 && (recipientName || recipientPhone || customerOtp)) {
        const latestProof = assignment.proofs[assignment.proofs.length - 1];
        await tx.deliveryProof.update({
          where: { id: latestProof.id },
          data: {
            recipientName: recipientName ? String(recipientName).trim() : latestProof.recipientName,
            recipientPhone: recipientPhone ? String(recipientPhone).trim() : latestProof.recipientPhone,
            customerOtp: customerOtp ? String(customerOtp).trim() : latestProof.customerOtp
          }
        });
      }

      // 5. Create OrderStatusHistory record
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: 'DELIVERED',
          note: `Delivered by staff: ${req.user.name}. ${isCod ? `COD Collected: ₹${actualCollected}` : 'Prepaid order'}`
        }
      });

      // 6. Create DeliveryStatusLog
      await tx.deliveryStatusLog.create({
        data: {
          assignmentId: assignment.id,
          orderId: order.id,
          staffId: req.user.id,
          previousStatus: assignment.status,
          newStatus: 'DELIVERED',
          metadata: {
            deliveredAt: now,
            collectedAmount: actualCollected,
            recipientName,
            recipientPhone
          }
        }
      });

      return { updatedAssignment, codRecord };
    });

    logAudit(req, {
      module: 'DELIVERY',
      action: 'ORDER_DELIVERED',
      resourceId: result.updatedAssignment.id,
      resourceName: order.orderNumber,
      details: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        deliveryPerson: req.user.name,
        codCollected: actualCollected
      }
    });

    ok(res, result, `Order ${order.orderNumber} successfully marked as DELIVERED`);
  }),

  // 6. Report Failed Delivery Attempt
  reportFailure: asyncHandler(async (req, res) => {
    const { id } = req.params; // assignmentId
    const { reason, notes, evidenceUrl } = req.body;
    const deliveryPersonId = req.user.id;
    const isSuperOrAdmin = req.user.role === 'SUPER_ADMIN' || req.user.role === 'ADMIN';

    const validReasons = [
      'Customer unavailable',
      'Customer refused delivery',
      'Incorrect address',
      'Customer unreachable',
      'Delivery location inaccessible',
      'Other reason'
    ];

    if (!reason || !validReasons.includes(reason)) {
      throw new AppError(`A valid failure reason is required. Options: ${validReasons.join(', ')}`, 422);
    }

    const assignment = await prisma.deliveryAssignment.findFirst({
      where: {
        id,
        isCurrent: true,
        ...(isSuperOrAdmin ? {} : { deliveryPersonId })
      },
      include: { order: true }
    });

    if (!assignment) {
      throw new AppError('Assigned delivery not found or access denied', 404);
    }

    if (assignment.status === 'DELIVERED') {
      throw new AppError('Cannot mark an already delivered order as failed', 400);
    }

    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const a = await tx.deliveryAssignment.update({
        where: { id: assignment.id },
        data: {
          status: 'DELIVERY_FAILED',
          failedAt: now,
          failureReason: reason,
          failureNotes: notes ? String(notes).trim() : null,
          failureEvidence: evidenceUrl || null
        }
      });

      // Record status log
      await tx.deliveryStatusLog.create({
        data: {
          assignmentId: assignment.id,
          orderId: assignment.orderId,
          staffId: req.user.id,
          previousStatus: assignment.status,
          newStatus: 'DELIVERY_FAILED',
          metadata: { reason, notes }
        }
      });

      return a;
    });

    logAudit(req, {
      module: 'DELIVERY',
      action: 'DELIVERY_ATTEMPT_FAILED',
      resourceId: updated.id,
      resourceName: assignment.order?.orderNumber,
      details: {
        orderId: assignment.orderId,
        reason,
        notes
      }
    });

    ok(res, updated, `Delivery marked as failed: ${reason}. Admin has been notified for rescheduling.`);
  }),

  // 7. Duty Status & Availability Toggle
  updateDutyStatus: asyncHandler(async (req, res) => {
    const { dutyStatus, latitude, longitude } = req.body;

    const validStatuses = ['ON_DUTY', 'OFF_DUTY', 'ON_BREAK'];
    const newDutyStatus = String(dutyStatus || '').toUpperCase();

    if (!validStatuses.includes(newDutyStatus)) {
      throw new AppError(`Invalid duty status. Must be one of: ${validStatuses.join(', ')}`, 422);
    }

    const data = {
      dutyStatus: newDutyStatus
    };

    if (latitude !== undefined && longitude !== undefined) {
      data.currentLatitude = latitude;
      data.currentLongitude = longitude;
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        dutyStatus: true,
        currentLatitude: true,
        currentLongitude: true
      }
    });

    ok(res, updated, `Duty status changed to ${newDutyStatus}`);
  }),

  // 8. Delivery Staff's Own COD Collections & Handover Summary
  getMyCodSummary: asyncHandler(async (req, res) => {
    const deliveryPersonId = req.user.id;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [allPending, todayDelivered, recentSettlements] = await Promise.all([
      prisma.codCollection.findMany({
        where: {
          deliveryPersonId,
          settlementStatus: 'PENDING'
        },
        include: {
          order: { select: { id: true, orderNumber: true, grandTotal: true, createdAt: true } }
        },
        orderBy: [{ collectedAt: 'desc' }]
      }),
      prisma.codCollection.findMany({
        where: {
          deliveryPersonId,
          collectedAt: { gte: todayStart }
        }
      }),
      prisma.codSettlement.findMany({
        where: { deliveryPersonId },
        include: { settledBy: { select: { name: true } } },
        orderBy: [{ settledAt: 'desc' }],
        take: 10
      })
    ]);

    const pendingHandoverAmount = allPending.reduce((acc, c) => acc + Number(c.collectedAmount), 0);
    const todayCollectedAmount = todayDelivered.reduce((acc, c) => acc + Number(c.collectedAmount), 0);

    ok(res, {
      pendingHandoverAmount,
      pendingOrdersCount: allPending.length,
      todayCollectedAmount,
      todayDeliveredCount: todayDelivered.length,
      pendingCollections: allPending.map(c => ({
        id: c.id,
        orderId: c.orderId,
        orderNumber: c.order?.orderNumber,
        expectedAmount: Number(c.expectedAmount),
        collectedAmount: Number(c.collectedAmount),
        collectedAt: c.collectedAt
      })),
      recentSettlements: recentSettlements.map(s => ({
        id: s.id,
        settlementNumber: s.settlementNumber,
        totalOrders: s.totalOrders,
        totalSettledAmount: Number(s.totalSettledAmount),
        settledBy: s.settledBy?.name,
        settledAt: s.settledAt
      }))
    });
  }),

  // 9. Delivery Staff Profile
  getMyProfile: asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        mobile: true,
        role: true,
        staffRole: true,
        deliveryStaffId: true,
        dutyStatus: true,
        assignedVillageIds: true,
        vehicleType: true,
        vehicleNumber: true,
        isStaffActive: true,
        createdAt: true
      }
    });

    ok(res, user);
  })
};
