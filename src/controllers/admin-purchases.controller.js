import { prisma } from '../config/prisma.js';
import { AppError, asyncHandler, created, ok } from '../utils/response.js';
import { finalizePurchaseReceipt } from '../services/fifo.service.js';
import { logAudit } from '../services/audit.service.js';
import { invalidateAdminDashboard, invalidateProducts } from '../services/cache.service.js';

export const purchases = {
  /**
   * List purchases with optional supplier, status, and date filters.
   */
  list: asyncHandler(async (req, res) => {
    const { supplierId, status, search, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

    const where = {};
    if (supplierId) where.supplierId = supplierId;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { purchaseNumber: { contains: String(search).trim() } },
        { invoiceNumber: { contains: String(search).trim() } },
        { supplier: { name: { contains: String(search).trim() } } }
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.purchase.findMany({
        where,
        include: {
          supplier: { select: { id: true, name: true, code: true } },
          items: true,
          _count: { select: { payments: true } }
        },
        orderBy: [{ purchaseDate: 'desc' }, { createdAt: 'desc' }],
        skip: (pageNum - 1) * limitNum,
        take: limitNum
      }),
      prisma.purchase.count({ where })
    ]);

    ok(res, {
      items: rows,
      total,
      page: pageNum,
      limit: limitNum
    }, 'Purchases fetched');
  }),

  /**
   * Get single purchase details with items, FIFO batches, and payments.
   */
  get: asyncHandler(async (req, res) => {
    const purchase = await prisma.purchase.findUnique({
      where: { id: req.params.id },
      include: {
        supplier: true,
        items: {
          include: {
            product: {
              select: { id: true, name: true, sku: true, stock: true, unit: true }
            }
          }
        },
        fifoBatches: true,
        payments: true
      }
    });

    if (!purchase) throw new AppError('Purchase order not found', 404);
    ok(res, purchase, 'Purchase details fetched');
  }),

  /**
   * Create a new purchase in DRAFT status.
   * Does NOT increase inventory until finalized.
   */
  create: asyncHandler(async (req, res) => {
    const {
      supplierId,
      invoiceNumber,
      purchaseDate,
      items,
      taxAmount = 0,
      freightLandedCost = 0,
      discountAmount = 0,
      notes
    } = req.body;

    if (!supplierId) throw new AppError('Supplier is required', 422);
    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError('Purchase must contain at least 1 item', 422);
    }

    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier || supplier.status !== 'ACTIVE') {
      throw new AppError('Valid active supplier is required', 422);
    }

    // Generate unique sequential purchase number
    const count = await prisma.purchase.count();
    const purchaseNumber = `PUR-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(count + 1).padStart(4, '0')}`;

    let subtotal = 0;
    const itemRecords = [];

    for (const itm of items) {
      const qty = parseInt(itm.quantity, 10);
      const unitCost = Number(itm.unitCost);
      if (!itm.productId || isNaN(qty) || qty <= 0 || isNaN(unitCost) || unitCost <= 0) {
        throw new AppError('Each item must have a valid product, quantity > 0, and cost > 0', 422);
      }

      const product = await prisma.product.findUnique({
        where: { id: itm.productId },
        select: { id: true, name: true, sku: true, unit: true }
      });
      if (!product) throw new AppError(`Product ${itm.productId} not found`, 404);

      const lineSubtotal = Number((qty * unitCost).toFixed(2));
      subtotal += lineSubtotal;

      itemRecords.push({
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        unit: product.unit,
        quantity: qty,
        unitCost,
        allocatedFreight: 0.00,
        effectiveUnitCost: unitCost,
        subtotal: lineSubtotal,
        batchNumber: itm.batchNumber ? String(itm.batchNumber).trim() : null,
        expiryDate: itm.expiryDate ? new Date(itm.expiryDate) : null
      });
    }

    subtotal = Number(subtotal.toFixed(2));
    const totalAmount = Number((subtotal + Number(taxAmount || 0) + Number(freightLandedCost || 0) - Number(discountAmount || 0)).toFixed(2));

    const newPurchase = await prisma.purchase.create({
      data: {
        purchaseNumber,
        supplierId,
        invoiceNumber: invoiceNumber ? String(invoiceNumber).trim() : null,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
        status: 'DRAFT',
        subtotal,
        taxAmount: Number(taxAmount || 0),
        freightLandedCost: Number(freightLandedCost || 0),
        discountAmount: Number(discountAmount || 0),
        totalAmount,
        paymentStatus: 'UNPAID',
        paidAmount: 0.00,
        notes: notes ? String(notes).trim() : null,
        items: {
          create: itemRecords
        }
      },
      include: {
        supplier: true,
        items: true
      }
    });

    logAudit(req, {
      module: 'PURCHASES',
      action: 'PURCHASE_DRAFT_CREATED',
      resourceId: newPurchase.id,
      resourceName: newPurchase.purchaseNumber,
      details: {
        supplier: supplier.name,
        totalAmount,
        itemCount: itemRecords.length
      }
    });

    created(res, newPurchase, 'Purchase draft created successfully');
  }),

  /**
   * Finalize purchase receipt: atomically creates FIFO batches and updates inventory stock.
   */
  finalize: asyncHandler(async (req, res) => {
    const { id } = req.params;

    const finalized = await prisma.$transaction(async tx => {
      return finalizePurchaseReceipt(tx, {
        purchaseId: id,
        adminUser: req.user
      });
    });

    logAudit(req, {
      module: 'PURCHASES',
      action: 'PURCHASE_FINALIZED_RECEIVED',
      resourceId: finalized.id,
      resourceName: finalized.purchaseNumber,
      details: {
        supplier: finalized.supplier?.name,
        batchesCreated: finalized.fifoBatches?.length || 0,
        totalAmount: finalized.totalAmount
      }
    });

    invalidateAdminDashboard();
    invalidateProducts();
    ok(res, finalized, 'Purchase receipt finalized and FIFO batches generated successfully');
  }),

  /**
   * Cancel draft purchase.
   */
  cancel: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const purchase = await prisma.purchase.findUnique({ where: { id } });
    if (!purchase) throw new AppError('Purchase order not found', 404);
    if (purchase.status === 'RECEIVED') {
      throw new AppError('Cannot cancel a finalized purchase. Inventory has already been received.', 409);
    }

    const cancelled = await prisma.purchase.update({
      where: { id },
      data: { status: 'CANCELLED' }
    });

    logAudit(req, {
      module: 'PURCHASES',
      action: 'PURCHASE_CANCELLED',
      resourceId: cancelled.id,
      resourceName: cancelled.purchaseNumber,
      details: { reason: req.body?.reason || 'Cancelled by admin' }
    });

    ok(res, cancelled, 'Purchase order cancelled');
  })
};
