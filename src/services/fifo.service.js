import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/response.js';

/**
 * R2Cart FIFO Inventory Costing Engine
 * 
 * Implements strict First-In, First-Out (FIFO) batch-wise purchase tracking,
 * cost allocation, reversals, and inventory valuation.
 */

/**
 * Consumes FIFO batches for an order within an active transaction.
 * If legacy stock has no batch, records allocation with isCostKnown = false.
 */
export async function consumeFifoBatches(tx, { orderId, orderNumber, items }) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const createdAllocations = [];

  for (const item of items) {
    let needed = Number(item.quantity);
    if (needed <= 0) continue;

    const sellingPrice = Number(item.price);

    // Fetch active FIFO batches for this product ordered oldest first
    const activeBatches = await tx.fifoCostBatch.findMany({
      where: {
        productId: item.productId,
        quantityRemaining: { gt: 0 }
      },
      orderBy: [
        { receivedDate: 'asc' },
        { createdAt: 'asc' }
      ]
    });

    for (const batch of activeBatches) {
      if (needed <= 0) break;

      const availableInBatch = Number(batch.quantityRemaining);
      const consumeQty = Math.min(availableInBatch, needed);
      const unitCost = Number(batch.effectiveUnitCost);
      const totalCost = Number((unitCost * consumeQty).toFixed(2));

      // Decrement batch remaining quantity
      await tx.fifoCostBatch.update({
        where: { id: batch.id },
        data: {
          quantityRemaining: { decrement: consumeQty }
        }
      });

      // Find corresponding order item
      const orderItem = await tx.orderItem.findFirst({
        where: { orderId, productId: item.productId }
      });

      if (orderItem) {
        const allocation = await tx.orderFifoAllocation.create({
          data: {
            orderId,
            orderItemId: orderItem.id,
            productId: item.productId,
            batchId: batch.id,
            quantity: consumeQty,
            unitCost,
            totalCost,
            sellingPrice,
            isCostKnown: Boolean(batch.isVerified),
            status: 'COMMITTED'
          }
        });
        createdAllocations.push(allocation);
      }

      needed -= consumeQty;
    }

    // If needed quantity still remains (legacy uncosted inventory)
    if (needed > 0) {
      const orderItem = await tx.orderItem.findFirst({
        where: { orderId, productId: item.productId }
      });

      if (orderItem) {
        const uncostedAllocation = await tx.orderFifoAllocation.create({
          data: {
            orderId,
            orderItemId: orderItem.id,
            productId: item.productId,
            batchId: null,
            quantity: needed,
            unitCost: 0.00,
            totalCost: 0.00,
            sellingPrice,
            isCostKnown: false, // Flagged for cost reconciliation; profit not fabricated
            status: 'COMMITTED'
          }
        });
        createdAllocations.push(uncostedAllocation);
      }
    }
  }

  return createdAllocations;
}

/**
 * Reverses FIFO batch allocations when an order is cancelled.
 */
export async function reverseFifoAllocations(tx, { orderId, reason = 'Order cancelled' }) {
  const allocations = await tx.orderFifoAllocation.findMany({
    where: {
      orderId,
      status: 'COMMITTED'
    }
  });

  if (allocations.length === 0) return [];

  const now = new Date();
  for (const alloc of allocations) {
    // If allocated from a known batch, restore the quantity to the batch
    if (alloc.batchId) {
      await tx.fifoCostBatch.update({
        where: { id: alloc.batchId },
        data: {
          quantityRemaining: { increment: alloc.quantity }
        }
      }).catch(() => {});
    }

    // Mark allocation as reversed
    await tx.orderFifoAllocation.update({
      where: { id: alloc.id },
      data: {
        status: 'REVERSED',
        reversedAt: now
      }
    });
  }

  return allocations;
}

/**
 * Finalizes a purchase order and creates traceable FIFO cost batches.
 * Increases product stock and allocates landed freight costs.
 */
export async function finalizePurchaseReceipt(tx, { purchaseId, adminUser }) {
  const purchase = await tx.purchase.findUnique({
    where: { id: purchaseId },
    include: {
      items: true,
      supplier: true
    }
  });

  if (!purchase) throw new AppError('Purchase record not found', 404);
  if (purchase.status === 'RECEIVED') throw new AppError('This purchase has already been finalized and received', 409);
  if (purchase.status === 'CANCELLED') throw new AppError('Cannot finalize a cancelled purchase', 409);
  if (!purchase.items || purchase.items.length === 0) throw new AppError('Purchase must contain at least 1 line item', 422);

  const totalItemSubtotal = purchase.items.reduce((acc, itm) => acc + Number(itm.subtotal), 0);
  const totalFreight = Number(purchase.freightLandedCost || 0);
  const now = new Date();

  // Create batch for each purchase line item
  for (let idx = 0; idx < purchase.items.length; idx++) {
    const item = purchase.items[idx];
    const qty = Number(item.quantity);
    if (qty <= 0) continue;

    // Allocate freight proportionally by value (or evenly if subtotal is 0)
    let allocatedItemFreight = 0;
    if (totalFreight > 0 && totalItemSubtotal > 0) {
      const share = Number(item.subtotal) / totalItemSubtotal;
      allocatedItemFreight = Number((totalFreight * share).toFixed(2));
    }
    const freightPerUnit = Number((allocatedItemFreight / qty).toFixed(2));
    const effectiveCost = Number((Number(item.unitCost) + freightPerUnit).toFixed(2));

    // Update purchase item with effective cost
    await tx.purchaseItem.update({
      where: { id: item.id },
      data: {
        allocatedFreight: allocatedItemFreight,
        effectiveUnitCost: effectiveCost
      }
    });

    // Create immutable FIFO batch
    const batchNumber = item.batchNumber || `BAT-${purchase.purchaseNumber}-${idx + 1}`;
    await tx.fifoCostBatch.create({
      data: {
        batchNumber,
        productId: item.productId,
        supplierId: purchase.supplierId,
        purchaseId: purchase.id,
        purchaseItemId: item.id,
        receivedDate: purchase.purchaseDate || now,
        quantityReceived: qty,
        quantityRemaining: qty,
        originalUnitCost: Number(item.unitCost),
        landedCostPerUnit: freightPerUnit,
        effectiveUnitCost: effectiveCost,
        isOpeningStock: false,
        isVerified: true,
        notes: `Received via Purchase #${purchase.purchaseNumber}`
      }
    });

    // Update product stock and log
    const product = await tx.product.findUnique({
      where: { id: item.productId },
      select: { id: true, stock: true, name: true }
    });

    if (product) {
      const newStock = product.stock + qty;
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: newStock }
      });

      if (tx.inventoryLog?.create) {
        await tx.inventoryLog.create({
          data: {
            productId: item.productId,
            type: 'PURCHASE_RECEIPT',
            previousStock: product.stock,
            newStock,
            quantityDiff: qty,
            reason: `Purchase finalized #${purchase.purchaseNumber} (${purchase.supplier.name})`,
            adminId: adminUser?.id || null,
            adminName: adminUser?.name || 'Admin'
          }
        });
      }
    }
  }

  // Update purchase status
  const updatedPurchase = await tx.purchase.update({
    where: { id: purchaseId },
    data: {
      status: 'RECEIVED',
      receivedAt: now,
      receivedById: adminUser?.id || null,
      receivedByName: adminUser?.name || 'Admin'
    },
    include: {
      items: true,
      supplier: true,
      fifoBatches: true
    }
  });

  return updatedPurchase;
}

/**
 * Records a verified opening stock cost for legacy inventory.
 */
export async function recordOpeningStockCost(tx, { productId, quantity, unitCost, notes, adminUser }) {
  const qty = Number(quantity);
  const cost = Number(unitCost);

  if (qty <= 0) throw new AppError('Opening quantity must be greater than 0', 422);
  if (cost <= 0) throw new AppError('Opening unit cost must be greater than 0', 422);

  const product = await tx.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, sku: true, stock: true }
  });

  if (!product) throw new AppError('Product not found', 404);

  const now = new Date();
  const batch = await tx.fifoCostBatch.create({
    data: {
      batchNumber: `OPEN-${product.sku}-${Date.now().toString(36).toUpperCase()}`,
      productId,
      supplierId: null,
      purchaseId: null,
      purchaseItemId: null,
      receivedDate: now,
      quantityReceived: qty,
      quantityRemaining: qty,
      originalUnitCost: cost,
      landedCostPerUnit: 0.00,
      effectiveUnitCost: cost,
      isOpeningStock: true,
      isVerified: true,
      notes: notes || `Super Admin verified opening cost reconciliation by ${adminUser?.name || 'Super Admin'}`
    }
  });

  return batch;
}

/**
 * Removes damaged or expired stock from sellable inventory, consumes from oldest batches,
 * and writes off the batch cost loss.
 */
export async function consumeWastageFifoBatches(tx, { productId, quantity, reason, notes, adminUser }) {
  const qtyToRemove = Number(quantity);
  if (qtyToRemove <= 0) throw new AppError('Wastage quantity must be greater than 0', 422);

  const product = await tx.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, stock: true }
  });

  if (!product) throw new AppError('Product not found', 404);
  if (product.stock < qtyToRemove) {
    throw new AppError(`Cannot remove ${qtyToRemove} units. Product only has ${product.stock} units in stock.`, 422);
  }

  // Consume from oldest batches first
  const activeBatches = await tx.fifoCostBatch.findMany({
    where: {
      productId,
      quantityRemaining: { gt: 0 }
    },
    orderBy: [
      { receivedDate: 'asc' },
      { createdAt: 'asc' }
    ]
  });

  let remainingToConsume = qtyToRemove;
  let totalCostLoss = 0;
  const wastageAllocations = [];

  for (const batch of activeBatches) {
    if (remainingToConsume <= 0) break;

    const available = Number(batch.quantityRemaining);
    const take = Math.min(available, remainingToConsume);
    const cost = Number(batch.effectiveUnitCost);
    const loss = Number((cost * take).toFixed(2));

    await tx.fifoCostBatch.update({
      where: { id: batch.id },
      data: { quantityRemaining: { decrement: take } }
    });

    const alloc = await tx.stockWastageBatchAllocation.create({
      data: {
        batchId: batch.id,
        productId,
        quantity: take,
        unitCost: cost,
        totalCostLoss: loss,
        reason: reason || 'SPOILED',
        notes: notes || null,
        recordedById: adminUser?.id || null,
        recordedByName: adminUser?.name || 'Admin'
      }
    });

    wastageAllocations.push(alloc);
    totalCostLoss += loss;
    remainingToConsume -= take;
  }

  // Deduct from product stock
  const newStock = Math.max(0, product.stock - qtyToRemove);
  await tx.product.update({
    where: { id: productId },
    data: { stock: newStock }
  });

  // Create permanent inventory log
  if (tx.inventoryLog?.create) {
    await tx.inventoryLog.create({
      data: {
        productId,
        type: 'STOCK_WASTAGE',
        previousStock: product.stock,
        newStock,
        quantityDiff: -qtyToRemove,
        reason: `Inventory wastage/expiry: ${reason} (${notes || 'Damaged goods write-off'})`,
        adminId: adminUser?.id || null,
        adminName: adminUser?.name || 'Admin'
      }
    });
  }

  // If cost loss occurred, record an Expense under WASTAGE_EXPIRY
  if (totalCostLoss > 0) {
    const expenseNum = `EXP-WASTE-${Date.now().toString(36).toUpperCase()}`;
    await tx.expense.create({
      data: {
        expenseNumber: expenseNum,
        expenseDate: new Date(),
        category: 'WASTAGE_EXPIRY',
        description: `Wastage write-off: ${qtyToRemove} units of ${product.name} (${reason})`,
        amount: Number(totalCostLoss.toFixed(2)),
        paymentMethod: 'OTHER',
        status: 'PAID',
        payee: 'Inventory Loss',
        notes: `Auto-recorded from inventory write-down for ${product.name}. Allocations: ${wastageAllocations.length} batches.`,
        createdById: adminUser?.id || null,
        createdByName: adminUser?.name || 'Admin'
      }
    });
  }

  return {
    productId,
    quantityRemoved: qtyToRemove,
    totalCostLoss: Number(totalCostLoss.toFixed(2)),
    allocations: wastageAllocations
  };
}
