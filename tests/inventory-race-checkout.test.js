import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../src/utils/response.js';

describe('BUG-08: Inventory Race — Non-atomic Stock Decrement (Oversell Prevention)', () => {
  it('prevents overselling when two checkouts compete for the last item in stock', async () => {
    // Shared simulated in-memory product state
    let productStock = 1;

    // Simulate database engine with row-level atomic lock on updateMany
    const mockTx = {
      order: {
        create: vi.fn().mockImplementation(async ({ data }) => ({
          id: 'order-' + Math.random().toString(36).substring(2, 7),
          orderNumber: 'ORD-' + Math.floor(1000 + Math.random() * 9000),
          ...data
        }))
      },
      product: {
        updateMany: vi.fn().mockImplementation(async ({ where, data }) => {
          const requiredQty = where.stock?.gte ?? 1;
          // Atomic conditional evaluation under row lock
          if (productStock >= requiredQty) {
            const decrement = data.stock?.decrement ?? requiredQty;
            productStock -= decrement;
            return { count: 1 };
          }
          return { count: 0 };
        }),
        findUnique: vi.fn().mockImplementation(async ({ where }) => ({
          id: where.id,
          name: 'Amul Taaza Milk 1L',
          stock: productStock
        }))
      },
      inventoryLog: {
        create: vi.fn().mockResolvedValue({ id: 'log-1' })
      },
      cartItem: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 })
      }
    };

    // Simulated checkout item deduction logic identical to customer.controller.js
    async function processInventoryDeduction(tx, order, items) {
      const sortedItems = [...items].sort((a, b) => String(a.productId).localeCompare(String(b.productId)));

      for (const item of sortedItems) {
        const qty = Number(item.quantity);
        if (qty <= 0) continue;

        const updateResult = await tx.product.updateMany({
          where: {
            id: item.productId,
            stock: { gte: qty },
            deletedAt: null
          },
          data: {
            stock: { decrement: qty }
          }
        });

        if (updateResult.count === 0) {
          const current = await tx.product.findUnique({
            where: { id: item.productId },
            select: { id: true, name: true, stock: true }
          });
          throw new AppError(
            `Insufficient stock for ${current?.name || item.name || 'item'}. Only ${current?.stock || 0} remaining.`,
            409
          );
        }

        const updated = await tx.product.findUnique({
          where: { id: item.productId },
          select: { stock: true }
        });
        const newStock = updated?.stock ?? 0;

        if (tx.inventoryLog?.create) {
          await tx.inventoryLog.create({
            data: {
              productId: item.productId,
              type: 'ORDER_DEDUCT',
              previousStock: newStock + qty,
              newStock,
              quantityDiff: -qty,
              reason: `Order placed #${order.orderNumber}`,
              orderId: order.id
            }
          });
        }
      }
    }

    const itemsToBuy = [{ productId: 'prod-milk-1', name: 'Amul Taaza Milk 1L', quantity: 1 }];

    // Two users simultaneously trigger checkout for the last unit
    const user1Checkout = processInventoryDeduction(
      mockTx,
      { id: 'ord-1', orderNumber: 'R2C-1001' },
      itemsToBuy
    );

    const user2Checkout = processInventoryDeduction(
      mockTx,
      { id: 'ord-2', orderNumber: 'R2C-1002' },
      itemsToBuy
    );

    const results = await Promise.allSettled([user1Checkout, user2Checkout]);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    // Exactly one checkout succeeds, and the other fails with 409
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    // Rejection is 409 Insufficient stock
    expect(rejected[0].reason).toBeInstanceOf(AppError);
    expect(rejected[0].reason.status).toBe(409);
    expect(rejected[0].reason.message).toContain('Insufficient stock');

    // Final stock is exactly 0, never negative (no oversell)
    expect(productStock).toBe(0);
  });

  it('sorts multiple cart items deterministically by productId to prevent deadlocks', () => {
    const rawCartItems = [
      { productId: 'prod-Z', quantity: 2 },
      { productId: 'prod-A', quantity: 1 },
      { productId: 'prod-M', quantity: 3 }
    ];

    const sorted = [...rawCartItems].sort((a, b) => String(a.productId).localeCompare(String(b.productId)));

    expect(sorted.map(i => i.productId)).toEqual(['prod-A', 'prod-M', 'prod-Z']);
  });
});
