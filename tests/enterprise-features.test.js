import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  order: {
    findUnique: vi.fn(),
    update: vi.fn(),
    findFirst: vi.fn()
  },
  orderItem: {
    delete: vi.fn(),
    update: vi.fn()
  },
  payment: {
    update: vi.fn()
  },
  orderStatusHistory: {
    create: vi.fn()
  },
  storeSetting: {
    findUnique: vi.fn(),
    update: vi.fn()
  },
  address: {
    findFirst: vi.fn()
  },
  $transaction: vi.fn()
}));

vi.mock('../src/config/prisma.js', () => ({ prisma: db }));

import { orders } from '../src/controllers/admin-orders.controller.js';
import { settings } from '../src/controllers/admin.controller.js';
import { checkout } from '../src/controllers/customer.controller.js';

const response = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('Enterprise Production Features', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    db.$transaction.mockImplementation(fn => fn(db));
  });

  describe('Feature 1 & 2: Order Item Modification (Out of Stock & Quantity Reduction)', () => {
    it('marks an item out of stock, recalculates total and payment, and creates history log', async () => {
      const mockOrder = {
        id: 'o-101',
        orderNumber: 'ORD-101',
        status: 'CONFIRMED',
        itemTotal: 400,
        productDiscount: 50,
        grandTotal: 370,
        deliveryFee: 20,
        items: [
          { id: 'item-1', name: 'Fresh Milk', unit: '500ml', quantity: 2, price: 30, mrp: 35 },
          { id: 'item-2', name: 'Fortune Oil', unit: '1L', quantity: 1, price: 150, mrp: 180 }
        ],
        payment: { id: 'pay-1', amount: 370 }
      };

      db.order.findUnique
        .mockResolvedValueOnce(mockOrder) // first lookup
        .mockResolvedValueOnce({ ...mockOrder, grandTotal: 220, items: [mockOrder.items[0]] }); // return row

      const req = {
        params: { id: 'o-101', itemId: 'item-2' },
        body: { action: 'OUT_OF_STOCK', reason: 'Packaging damaged during picking' }
      };
      const res = response();
      const next = vi.fn();

      await orders.modifyItem(req, res, next);

      expect(next).not.toHaveBeenCalled();
      // Item should be deleted
      expect(db.orderItem.delete).toHaveBeenCalledWith({ where: { id: 'item-2' } });
      // Order grandTotal and itemTotal should be reduced by 150
      expect(db.order.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'o-101' },
        data: expect.objectContaining({
          itemTotal: 250,
          grandTotal: 220
        })
      }));
      // Payment amount should be adjusted to 220
      expect(db.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-1' },
        data: { amount: 220 }
      });
      // History record created
      expect(db.orderStatusHistory.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'o-101',
          note: expect.stringContaining('marked out of stock')
        })
      }));
    });

    it('partially reduces item quantity when store has limited units remaining', async () => {
      const mockOrder = {
        id: 'o-102',
        orderNumber: 'ORD-102',
        status: 'PACKING',
        itemTotal: 300,
        productDiscount: 30,
        grandTotal: 270,
        items: [
          { id: 'item-1', name: 'Apple', unit: '1kg', quantity: 3, price: 100, mrp: 110 }
        ],
        payment: { id: 'pay-2', amount: 270 }
      };

      db.order.findUnique
        .mockResolvedValueOnce(mockOrder)
        .mockResolvedValueOnce({ ...mockOrder, grandTotal: 70 });

      const req = {
        params: { id: 'o-102', itemId: 'item-1' },
        body: { action: 'REDUCE_QUANTITY', quantity: 1, reason: 'Only 1 unit in stock' }
      };
      const res = response();
      const next = vi.fn();

      await orders.modifyItem(req, res, next);

      expect(next).not.toHaveBeenCalled();
      // Quantity updated to 1 (diff is 2, deducted price 200)
      expect(db.orderItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { quantity: 1 }
      });
      // Grand total reduced by 200 (270 - 200 = 70)
      expect(db.order.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'o-102' },
        data: expect.objectContaining({
          grandTotal: 70
        })
      }));
    });

    it('rejects modification if order is already delivered or cancelled', async () => {
      db.order.findUnique.mockResolvedValue({
        id: 'o-103',
        status: 'DELIVERED',
        items: [{ id: 'item-1' }]
      });

      const req = {
        params: { id: 'o-103', itemId: 'item-1' },
        body: { action: 'OUT_OF_STOCK' }
      };
      const res = response();
      const next = vi.fn();

      await orders.modifyItem(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0].status).toBe(409);
    });
  });

  describe('Feature 3: Emergency Store Pause Switch & Holiday Management', () => {
    it('persists emergency pause state, custom message, and holiday dates in store policies', async () => {
      db.storeSetting.findUnique.mockResolvedValue({
        id: 1,
        policies: { legalName: 'R2Cart Pvt Ltd' }
      });
      db.storeSetting.update.mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data }));

      const req = {
        body: {
          isPaused: true,
          reason: 'Severe Waterlogging in Hathua',
          message: 'Heavy rain in progress. Orders paused for 1 hour.',
          resumesAt: '2026-10-14T16:00:00.000Z',
          holidayDates: ['2026-10-20', '2026-11-01']
        }
      };
      const res = response();
      const next = vi.fn();

      await settings.emergencyPause(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(db.storeSetting.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          policies: expect.objectContaining({
            emergencyPause: expect.objectContaining({
              isPaused: true,
              reason: 'Severe Waterlogging in Hathua',
              message: 'Heavy rain in progress. Orders paused for 1 hour.',
              holidayDates: ['2026-10-20', '2026-11-01']
            })
          })
        }
      });
    });

    it('blocks customer checkout with HTTP 423 when store orders are paused', async () => {
      db.storeSetting.findUnique.mockResolvedValue({
        id: 1,
        policies: {
          emergencyPause: {
            isPaused: true,
            reason: 'High Order Volume',
            message: 'Dark store order capacity full. Deliveries paused.'
          }
        }
      });

      const req = {
        user: { id: 'cust-1' },
        body: { addressId: 'addr-1', deliveryType: 'INSTANT' }
      };
      const res = response();
      const next = vi.fn();

      await checkout(req, res, next);

      expect(next).toHaveBeenCalled();
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(423);
      expect(err.message).toContain('Dark store order capacity full');
    });
  });
});
