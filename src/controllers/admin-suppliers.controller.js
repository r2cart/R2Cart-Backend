import { prisma } from '../config/prisma.js';
import { AppError, asyncHandler, created, ok } from '../utils/response.js';
import { logAudit } from '../services/audit.service.js';

export const suppliers = {
  /**
   * List suppliers with balances.
   */
  list: asyncHandler(async (req, res) => {
    const { search, status } = req.query;
    const where = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: String(search).trim() } },
        { code: { contains: String(search).trim() } },
        { phone: { contains: String(search).trim() } },
        { email: { contains: String(search).trim() } }
      ];
    }

    const rows = await prisma.supplier.findMany({
      where,
      include: {
        purchases: {
          where: { status: 'RECEIVED' },
          select: { totalAmount: true, paidAmount: true }
        },
        payments: {
          select: { amount: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    const enriched = rows.map(s => {
      const totalPurchases = s.purchases.reduce((sum, p) => sum + Number(p.totalAmount), 0);
      const totalPayments = s.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const balance = Math.max(0, Number((totalPurchases - totalPayments).toFixed(2)));

      return {
        id: s.id,
        code: s.code,
        name: s.name,
        contactPerson: s.contactPerson,
        phone: s.phone,
        email: s.email,
        address: s.address,
        notes: s.notes,
        status: s.status,
        totalPurchases: Number(totalPurchases.toFixed(2)),
        totalPayments: Number(totalPayments.toFixed(2)),
        outstandingBalance: balance,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt
      };
    });

    ok(res, enriched, 'Suppliers fetched');
  }),

  /**
   * Get single supplier with purchase history and payments.
   */
  get: asyncHandler(async (req, res) => {
    const supplier = await prisma.supplier.findUnique({
      where: { id: req.params.id },
      include: {
        purchases: {
          orderBy: { purchaseDate: 'desc' },
          take: 20
        },
        payments: {
          orderBy: { paymentDate: 'desc' },
          take: 20
        }
      }
    });

    if (!supplier) throw new AppError('Supplier not found', 404);

    const totalPurchases = supplier.purchases.reduce((sum, p) => sum + Number(p.totalAmount), 0);
    const totalPayments = supplier.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const outstandingBalance = Math.max(0, Number((totalPurchases - totalPayments).toFixed(2)));

    ok(res, {
      ...supplier,
      totalPurchases: Number(totalPurchases.toFixed(2)),
      totalPayments: Number(totalPayments.toFixed(2)),
      outstandingBalance
    }, 'Supplier details fetched');
  }),

  /**
   * Create a new supplier.
   */
  create: asyncHandler(async (req, res) => {
    const { name, contactPerson, phone, email, address, notes } = req.body;
    if (!name || String(name).trim().length < 2) {
      throw new AppError('Valid supplier name is required', 422);
    }

    const trimmedName = String(name).trim();

    // Generate unique code if not provided
    const count = await prisma.supplier.count();
    const code = req.body.code ? String(req.body.code).trim().toUpperCase() : `SUP-${String(count + 1).padStart(3, '0')}`;

    const existing = await prisma.supplier.findUnique({ where: { code } });
    if (existing) throw new AppError(`Supplier code "${code}" already exists`, 409);

    const newSupplier = await prisma.supplier.create({
      data: {
        code,
        name: trimmedName,
        contactPerson: contactPerson ? String(contactPerson).trim() : null,
        phone: phone ? String(phone).trim() : null,
        email: email ? String(email).trim().toLowerCase() : null,
        address: address ? String(address).trim() : null,
        notes: notes ? String(notes).trim() : null,
        status: 'ACTIVE'
      }
    });

    logAudit(req, {
      module: 'SUPPLIERS',
      action: 'SUPPLIER_CREATED',
      resourceId: newSupplier.id,
      resourceName: newSupplier.name,
      details: { code: newSupplier.code, phone: newSupplier.phone }
    });

    created(res, newSupplier, 'Supplier created successfully');
  }),

  /**
   * Update supplier details.
   */
  update: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, contactPerson, phone, email, address, notes, status } = req.body;

    const supplier = await prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new AppError('Supplier not found', 404);

    const updated = await prisma.supplier.update({
      where: { id },
      data: {
        ...(name ? { name: String(name).trim() } : {}),
        ...(contactPerson !== undefined ? { contactPerson: contactPerson ? String(contactPerson).trim() : null } : {}),
        ...(phone !== undefined ? { phone: phone ? String(phone).trim() : null } : {}),
        ...(email !== undefined ? { email: email ? String(email).trim().toLowerCase() : null } : {}),
        ...(address !== undefined ? { address: address ? String(address).trim() : null } : {}),
        ...(notes !== undefined ? { notes: notes ? String(notes).trim() : null } : {}),
        ...(status ? { status } : {})
      }
    });

    logAudit(req, {
      module: 'SUPPLIERS',
      action: 'SUPPLIER_UPDATED',
      resourceId: updated.id,
      resourceName: updated.name,
      details: { updatedFields: req.body }
    });

    ok(res, updated, 'Supplier updated successfully');
  }),

  /**
   * Record a payment to a supplier.
   */
  recordPayment: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { amount, paymentMethod = 'BANK_TRANSFER', reference, paymentDate, purchaseId, notes } = req.body;

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      throw new AppError('Payment amount must be greater than 0', 422);
    }

    const supplier = await prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new AppError('Supplier not found', 404);

    const paymentCount = await prisma.supplierPayment.count();
    const paymentNumber = `SPAY-${new Date().getFullYear()}-${String(paymentCount + 1).padStart(4, '0')}`;

    const payment = await prisma.$transaction(async tx => {
      const createdPayment = await tx.supplierPayment.create({
        data: {
          paymentNumber,
          supplierId: id,
          purchaseId: purchaseId || null,
          amount: numAmount,
          paymentMethod,
          reference: reference ? String(reference).trim() : null,
          paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
          notes: notes ? String(notes).trim() : null,
          createdById: req.user?.id || null,
          createdByName: req.user?.name || 'Admin'
        }
      });

      // If associated with a specific purchase, update purchase paid amount
      if (purchaseId) {
        const purchase = await tx.purchase.findUnique({ where: { id: purchaseId } });
        if (purchase) {
          const newPaid = Number((Number(purchase.paidAmount) + numAmount).toFixed(2));
          const totalAmt = Number(purchase.totalAmount);
          const paymentStatus = newPaid >= totalAmt ? 'PAID' : (newPaid > 0 ? 'PARTIAL' : 'UNPAID');

          await tx.purchase.update({
            where: { id: purchaseId },
            data: {
              paidAmount: newPaid,
              paymentStatus
            }
          });
        }
      }

      return createdPayment;
    });

    logAudit(req, {
      module: 'FINANCIAL',
      action: 'SUPPLIER_PAYMENT_RECORDED',
      resourceId: payment.id,
      resourceName: payment.paymentNumber,
      details: {
        supplier: supplier.name,
        amount: numAmount,
        paymentMethod,
        purchaseId
      }
    });

    created(res, payment, 'Supplier payment recorded successfully');
  })
};
