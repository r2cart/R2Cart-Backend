import {describe,expect,it,vi} from 'vitest';
import {getAvailableCustomerSlots} from '../src/controllers/admin-scheduling.controller.js';
import {resolveDeliveryRules,calculateCart} from '../src/services/pricing.service.js';
import {prisma} from '../src/config/prisma.js';

describe('Advanced Admin Modules', () => {
  describe('1. Village-Wise Delivery Management', () => {
    it('throws when village is paused during delivery resolution', async () => {
      const mockTx = {
        storeSetting: {
          findUnique: vi.fn().mockResolvedValue({
            id: 1,
            minimumOrder: 100,
            deliveryFee: 30,
            freeDeliveryThreshold: 500,
            estimatedDelivery: '20 minutes',
            globalDeliveryRadius: 5.0
          })
        },
        deliveryVillage: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'v-1',
              name: 'Hathua Village East',
              status: 'ACTIVE',
              isPaused: true,
              deliveryFee: 40,
              minimumOrder: 150,
              freeDeliveryThreshold: 600,
              schedule: '08:00 - 20:00'
            }
          ])
        },
        deliveryArea: {
          findMany: vi.fn().mockResolvedValue([])
        }
      };

      await expect(resolveDeliveryRules(mockTx, 'Hathua Village East'))
        .rejects
        .toThrow(/temporarily paused/i);
    });

    it('applies village-specific delivery fee and threshold when active and unpaused', async () => {
      const mockTx = {
        storeSetting: {
          findUnique: vi.fn().mockResolvedValue({
            id: 1,
            minimumOrder: 100,
            deliveryFee: 30,
            freeDeliveryThreshold: 500,
            estimatedDelivery: '20 minutes',
            globalDeliveryRadius: 5.0
          })
        },
        deliveryVillage: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'v-2',
              name: 'Mirganj Rural',
              status: 'ACTIVE',
              isPaused: false,
              deliveryFee: 45,
              minimumOrder: 200,
              freeDeliveryThreshold: 700,
              schedule: '09:00 - 18:00'
            }
          ])
        },
        deliveryArea: {
          findMany: vi.fn().mockResolvedValue([])
        }
      };

      const rules = await resolveDeliveryRules(mockTx, 'Mirganj Rural');
      expect(rules.deliveryFee).toBe(45);
      expect(rules.minimumOrder).toBe(200);
      expect(rules.freeDeliveryThreshold).toBe(700);
      expect(rules.villageName).toBe('Mirganj Rural');
      expect(rules.matchType).toBe('VILLAGE');
    });

    it('rejects unserviceable areas outside global radius', async () => {
      const mockTx = {
        storeSetting: {
          findUnique: vi.fn().mockResolvedValue({
            id: 1,
            minimumOrder: 100,
            deliveryFee: 30,
            freeDeliveryThreshold: 500,
            estimatedDelivery: '20 minutes',
            globalDeliveryRadius: 5.0
          })
        },
        deliveryVillage: {
          findMany: vi.fn().mockResolvedValue([])
        },
        deliveryArea: {
          findMany: vi.fn().mockResolvedValue([])
        }
      };

      await expect(resolveDeliveryRules(mockTx, 'Unknown Faraway Village'))
        .rejects
        .toThrow(/unavailable in "Unknown Faraway Village"/i);
    });
  });

  describe('2. Smart Inventory Management', () => {
    it('prevents purchasing expired products during cart calculation', async () => {
      const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // yesterday
      const mockTx = {
        cart: {
          findUnique: vi.fn().mockResolvedValue({
            items: [
              {
                quantity: 2,
                product: {
                  id: 'p-milk',
                  name: 'Fresh Cow Milk 1L',
                  sku: 'R2C-MILK-1L',
                  status: 'ACTIVE',
                  stock: 10,
                  price: 60,
                  mrp: 65,
                  hasExpiry: true,
                  expiryDate: expiredDate,
                  images: []
                }
              }
            ]
          })
        },
        storeSetting: {
          findUnique: vi.fn().mockResolvedValue({
            minimumOrder: 50,
            deliveryFee: 20,
            freeDeliveryThreshold: 300,
            estimatedDelivery: '15 mins'
          })
        }
      };

      await expect(calculateCart(mockTx, 'user-1', null, { minimumOrder: 50, deliveryFee: 20, freeDeliveryThreshold: 300 }))
        .rejects
        .toThrow(/reached its expiration date/i);
    });
  });

  describe('3. Marketing & Coupons', () => {
    it('enforces first-order coupon restriction when customer already has orders', async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const mockTx = {
        cart: {
          findUnique: vi.fn().mockResolvedValue({
            items: [
              {
                quantity: 1,
                product: {
                  id: 'p-atta',
                  name: 'Chakki Fresh Atta 5kg',
                  sku: 'R2C-ATTA',
                  status: 'ACTIVE',
                  stock: 20,
                  price: 250,
                  mrp: 275,
                  images: []
                }
              }
            ]
          })
        },
        coupon: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'c-first',
            code: 'FIRST50',
            type: 'FIXED',
            discount: 50,
            minimumOrder: 200,
            startsAt: pastDate,
            expiresAt: futureDate,
            status: 'ACTIVE',
            isFirstOrderOnly: true,
            perUserLimit: 1,
            usageLimit: 1000,
            usageCount: 10
          })
        },
        order: {
          count: vi.fn().mockResolvedValue(1) // user already has 1 order
        },
        couponUsage: {
          count: vi.fn().mockResolvedValue(0)
        }
      };

      await expect(calculateCart(mockTx, 'user-existing', 'FIRST50', { minimumOrder: 100, deliveryFee: 0, freeDeliveryThreshold: 500 }))
        .rejects
        .toThrow(/valid only on your first order/i);
    });
  });
});
