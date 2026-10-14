import {prisma} from '../config/prisma.js';
import {AppError,asyncHandler,created,ok} from '../utils/response.js';
import {productDto} from '../utils/order.js';
import {logAudit} from '../services/audit.service.js';

export const inventory = {
  overview: asyncHandler(async (req, res) => {
    const { status, search, category, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

    const now = new Date();
    const fourteenDaysLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    // Build base where
    const where = { deletedAt: null };
    if (search) {
      where.OR = [
        { name: { contains: String(search).trim() } },
        { sku: { contains: String(search).trim() } }
      ];
    }
    if (category) {
      where.category = { slug: category };
    }

    // Status filter conditions
    if (status === 'OUT_OF_STOCK') {
      where.stock = 0;
    } else if (status === 'LOW_STOCK') {
      where.stock = { gt: 0 };
      // low stock condition will also be refined or handled in memory/query
    } else if (status === 'EXPIRED') {
      where.hasExpiry = true;
      where.expiryDate = { lte: now };
    } else if (status === 'APPROACHING_EXPIRY') {
      where.hasExpiry = true;
      where.expiryDate = { gt: now, lte: fourteenDaysLater };
    }

    const [allProducts, setting] = await Promise.all([
      prisma.product.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          stock: true,
          lowStockThreshold: true,
          hasExpiry: true,
          expiryDate: true
        }
      }),
      prisma.storeSetting.findUnique({
        where: { id: 1 },
        select: { autoHideOutOfStock: true }
      })
    ]);

    let totalInStock = 0;
    let totalLowStock = 0;
    let totalOutOfStock = 0;
    let totalExpired = 0;
    let totalApproachingExpiry = 0;

    for (const p of allProducts) {
      if (p.stock === 0) totalOutOfStock++;
      else if (p.stock <= p.lowStockThreshold) totalLowStock++;
      else totalInStock++;

      if (p.hasExpiry && p.expiryDate) {
        const exp = new Date(p.expiryDate);
        if (exp <= now) totalExpired++;
        else if (exp <= fourteenDaysLater) totalApproachingExpiry++;
      }
    }

    // Fetch paginated rows
    const [rows, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, slug: true } },
          images: { take: 1, orderBy: { position: 'asc' } }
        },
        orderBy: [{ stock: 'asc' }, { updatedAt: 'desc' }],
        skip: (pageNum - 1) * limitNum,
        take: limitNum
      }),
      prisma.product.count({ where })
    ]);

    const enriched = rows.map(p => {
      let stockStatus = 'IN_STOCK';
      if (p.stock === 0) stockStatus = 'OUT_OF_STOCK';
      else if (p.stock <= p.lowStockThreshold) stockStatus = 'LOW_STOCK';

      let expiryStatus = 'NOT_APPLICABLE';
      if (p.hasExpiry && p.expiryDate) {
        const exp = new Date(p.expiryDate);
        if (exp <= now) expiryStatus = 'EXPIRED';
        else if (exp <= fourteenDaysLater) expiryStatus = 'EXPIRING_SOON';
        else expiryStatus = 'FRESH';
      }

      return {
        ...productDto(p),
        stock: p.stock,
        lowStockThreshold: p.lowStockThreshold,
        stockStatus,
        hasExpiry: p.hasExpiry,
        expiryDate: p.expiryDate ? p.expiryDate.toISOString().slice(0, 10) : null,
        batchNumber: p.batchNumber,
        expiryStatus
      };
    });

    ok(res, {
      items: enriched,
      stats: {
        totalProducts: allProducts.length,
        inStock: totalInStock,
        lowStock: totalLowStock,
        outOfStock: totalOutOfStock,
        expired: totalExpired,
        approachingExpiry: totalApproachingExpiry,
        autoHideOutOfStock: Boolean(setting?.autoHideOutOfStock)
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.max(1, Math.ceil(total / limitNum))
      }
    });
  }),

  adjust: asyncHandler(async (req, res) => {
    const { productId, newStock, quantityDiff, reason } = req.body;
    if (!productId) throw new AppError('Product ID is required', 422);

    const trimmedReason = String(reason || '').trim();
    if (!trimmedReason || trimmedReason.length < 3) {
      throw new AppError('A clear adjustment reason is mandatory (minimum 3 characters)', 422);
    }

    const result = await prisma.$transaction(async tx => {
      const product = await tx.product.findUnique({
        where: { id: productId },
        include: { category: true }
      });
      if (!product || product.deletedAt) throw new AppError('Product not found', 404);

      let targetStock = product.stock;
      let diff = 0;

      if (newStock !== undefined && newStock !== '') {
        const parsed = Number(newStock);
        if (!Number.isInteger(parsed) || parsed < 0 || parsed > 2147483647) {
          throw new AppError('Stock must be a non-negative whole number', 422);
        }
        targetStock = parsed;
        diff = targetStock - product.stock;
      } else if (quantityDiff !== undefined && quantityDiff !== '') {
        const parsedDiff = Number(quantityDiff);
        if (!Number.isInteger(parsedDiff)) {
          throw new AppError('Adjustment quantity must be an integer', 422);
        }
        diff = parsedDiff;
        targetStock = Math.max(0, product.stock + diff);
      } else {
        throw new AppError('Either newStock or quantityDiff must be provided', 422);
      }

      // Update product stock
      const updated = await tx.product.update({
        where: { id: productId },
        data: { stock: targetStock }
      });

      // Create permanent inventory log
      const log = await tx.inventoryLog.create({
        data: {
          productId: product.id,
          type: diff >= 0 ? 'MANUAL_RESTOCK' : 'MANUAL_DEDUCTION',
          previousStock: product.stock,
          newStock: targetStock,
          quantityDiff: diff,
          reason: trimmedReason,
          adminId: req.user.id,
          adminName: req.user.name
        }
      });

      return { product: updated, log };
    });

    logAudit(req, {
      module: 'INVENTORY',
      action: 'STOCK_ADJUSTMENT',
      resourceId: result.product.id,
      resourceName: result.product.name,
      details: {
        previousStock: result.log.previousStock,
        newStock: result.log.newStock,
        diff: result.log.quantityDiff,
        reason: trimmedReason
      }
    });

    ok(res, {
      product: productDto(result.product),
      log: result.log
    }, 'Stock adjusted successfully');
  }),

  updateExpiry: asyncHandler(async (req, res) => {
    const { productId, hasExpiry, expiryDate, batchNumber } = req.body;
    if (!productId) throw new AppError('Product ID is required', 422);

    const current = await prisma.product.findUnique({ where: { id: productId } });
    if (!current || current.deletedAt) throw new AppError('Product not found', 404);

    let parsedExpiry = null;
    const isExpiryTracked = Boolean(hasExpiry);
    if (isExpiryTracked) {
      if (!expiryDate) throw new AppError('Expiry date is required when expiry tracking is enabled', 422);
      parsedExpiry = new Date(expiryDate);
      if (isNaN(parsedExpiry.getTime())) throw new AppError('Enter a valid expiry date', 422);
    }

    const updated = await prisma.product.update({
      where: { id: productId },
      data: {
        hasExpiry: isExpiryTracked,
        expiryDate: isExpiryTracked ? parsedExpiry : null,
        batchNumber: isExpiryTracked && batchNumber ? String(batchNumber).trim() : null
      }
    });

    logAudit(req, {
      module: 'INVENTORY',
      action: 'EXPIRY_CONFIG_UPDATE',
      resourceId: updated.id,
      resourceName: updated.name,
      details: {
        hasExpiry: isExpiryTracked,
        expiryDate: parsedExpiry ? parsedExpiry.toISOString() : null,
        batchNumber: batchNumber || null
      }
    });

    ok(res, productDto(updated), 'Product expiry configuration updated');
  }),

  logs: asyncHandler(async (req, res) => {
    const { productId, type, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

    const where = {};
    if (productId) where.productId = productId;
    if (type) where.type = type;

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
    }

    const [rows, total] = await Promise.all([
      prisma.inventoryLog.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, sku: true, unit: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum
      }),
      prisma.inventoryLog.count({ where })
    ]);

    ok(res, {
      logs: rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.max(1, Math.ceil(total / limitNum))
      }
    });
  }),

  toggleAutoHide: asyncHandler(async (req, res) => {
    const autoHideOutOfStock = Boolean(req.body.autoHideOutOfStock);
    const updated = await prisma.storeSetting.update({
      where: { id: 1 },
      data: { autoHideOutOfStock }
    });

    logAudit(req, {
      module: 'INVENTORY',
      action: 'AUTO_HIDE_OOS_TOGGLE',
      resourceId: '1',
      resourceName: 'Store Settings',
      details: { autoHideOutOfStock }
    });

    ok(res, { autoHideOutOfStock: updated.autoHideOutOfStock }, autoHideOutOfStock ? 'Automatic hiding of out-of-stock items enabled' : 'Automatic hiding of out-of-stock items disabled');
  }),

  exportReport: asyncHandler(async (req, res) => {
    const products = await prisma.product.findMany({
      where: { deletedAt: null },
      include: { category: { select: { name: true } } },
      orderBy: [{ categoryId: 'asc' }, { name: 'asc' }]
    });

    const now = new Date();
    const rows = [
      ['SKU', 'Product Name', 'Category', 'Unit', 'MRP (INR)', 'Selling Price (INR)', 'Stock Qty', 'Low Stock Alert Threshold', 'Stock Status', 'Track Expiry', 'Expiry Date', 'Batch Number', 'Last Updated']
    ];

    for (const p of products) {
      let stockStatus = 'IN_STOCK';
      if (p.stock === 0) stockStatus = 'OUT_OF_STOCK';
      else if (p.stock <= p.lowStockThreshold) stockStatus = 'LOW_STOCK';

      const expDate = p.hasExpiry && p.expiryDate ? p.expiryDate.toISOString().slice(0, 10) : 'N/A';
      const batch = p.batchNumber || 'N/A';

      rows.push([
        `"${p.sku}"`,
        `"${p.name.replace(/"/g, '""')}"`,
        `"${(p.category?.name || 'General').replace(/"/g, '""')}"`,
        `"${p.unit}"`,
        Number(p.mrp).toFixed(2),
        Number(p.price).toFixed(2),
        p.stock,
        p.lowStockThreshold,
        stockStatus,
        p.hasExpiry ? 'YES' : 'NO',
        expDate,
        `"${batch.replace(/"/g, '""')}"`,
        p.updatedAt.toISOString().slice(0, 19).replace('T', ' ')
      ]);
    }

    const csvContent = rows.map(r => r.join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="r2cart-inventory-report-${now.toISOString().slice(0, 10)}.csv"`);
    res.status(200).send(csvContent);
  })
};
