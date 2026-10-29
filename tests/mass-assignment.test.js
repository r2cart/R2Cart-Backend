import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addresses, orders } from '../src/controllers/customer.controller.js';
import { prisma } from '../src/config/prisma.js';
import { AppError } from '../src/utils/response.js';

describe('BUG-09: Mass Assignment Protection on Address and Order Updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('addresses.update mass assignment guard', () => {
    it('persists only whitelisted fields and discards malicious extra fields like userId and role', async () => {
      const mockReq = {
        user: { id: 'legit-user-123' },
        params: { id: 'addr-456' },
        body: {
          name: 'Priya Sharma',
          mobile: '9876543210',
          house: 'Flat 4B',
          // Malicious / Unwhitelisted fields
          userId: 'hacker-user-999',
          id: 'hacked-addr-id',
          role: 'SUPER_ADMIN',
          createdAt: '2020-01-01T00:00:00.000Z',
          extraSneakyField: 'injected_value'
        }
      };

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      };

      const mockExisting = {
        id: 'addr-456',
        userId: 'legit-user-123',
        name: 'Old Name',
        mobile: '9876543210',
        area: 'Hathua',
        city: 'Hathua',
        state: 'Bihar'
      };

      vi.spyOn(prisma.address, 'findFirst').mockResolvedValue(mockExisting);
      vi.spyOn(prisma.address, 'update').mockImplementation(async ({ where, data }) => ({
        id: where.id,
        ...mockExisting,
        ...data
      }));

      await addresses.update(mockReq, mockRes, () => {});

      expect(prisma.address.update).toHaveBeenCalledTimes(1);
      const updateArgs = prisma.address.update.mock.calls[0][0];

      // Verifies that only whitelisted fields are passed to Prisma
      expect(updateArgs.data).toHaveProperty('name', 'Priya Sharma');
      expect(updateArgs.data).toHaveProperty('mobile', '9876543210');
      expect(updateArgs.data).toHaveProperty('house', 'Flat 4B');

      // Crucial: malicious / unwhitelisted fields must NOT be passed to Prisma
      expect(updateArgs.data).not.toHaveProperty('userId');
      expect(updateArgs.data).not.toHaveProperty('id');
      expect(updateArgs.data).not.toHaveProperty('role');
      expect(updateArgs.data).not.toHaveProperty('createdAt');
      expect(updateArgs.data).not.toHaveProperty('extraSneakyField');
    });
  });

  describe('addresses.create mass assignment guard', () => {
    it('creates address with only whitelisted fields and preserves authenticated userId', async () => {
      const mockReq = {
        user: { id: 'legit-user-123' },
        body: {
          name: 'Rohan Verma',
          mobile: '9876543210',
          area: 'Hathua',
          house: 'House 12',
          userId: 'attacker-id-to-spoof',
          id: 'custom-id',
          adminBypass: true
        }
      };

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      };

      vi.spyOn(prisma.address, 'create').mockImplementation(async ({ data }) => ({
        id: 'new-id',
        ...data
      }));

      await addresses.create(mockReq, mockRes, () => {});

      expect(prisma.address.create).toHaveBeenCalledTimes(1);
      const createArgs = prisma.address.create.mock.calls[0][0];

      expect(createArgs.data.userId).toBe('legit-user-123');
      expect(createArgs.data).not.toHaveProperty('adminBypass');
      expect(createArgs.data.id).not.toBe('custom-id');
    });
  });

  describe('orders.updateDetails mass assignment guard', () => {
    it('persists only whitelisted address snapshot and order fields, preventing status or total manipulation', async () => {
      const mockReq = {
        user: { id: 'customer-100', name: 'Original Customer', mobile: '9988776655' },
        params: { id: 'ord-999' },
        body: {
          name: 'Recipient Updated',
          mobile: '9876543210',
          house: 'Plot 55',
          street: 'Main Road',
          area: 'Hathua',
          deliveryInstruction: 'Please ring bell',
          // Malicious fields attempting mass-assignment privilege escalation or price alteration
          status: 'DELIVERED',
          grandTotal: 0,
          userId: 'other-user',
          paymentStatus: 'PAID',
          arbitraryInjection: 'exploit'
        }
      };

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      };

      const mockCurrentOrder = {
        id: 'ord-999',
        orderNumber: 'R2C-9999',
        userId: 'customer-100',
        status: 'CONFIRMED',
        grandTotal: 500,
        deliveryType: 'INSTANT',
        addressSnapshot: {
          name: 'Original Recipient',
          mobile: '9988776655',
          house: 'Old House',
          area: 'Hathua',
          city: 'Hathua',
          state: 'Bihar'
        }
      };

      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue(mockCurrentOrder),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUnique: vi.fn().mockResolvedValue({
            ...mockCurrentOrder,
            addressSnapshot: {
              ...mockCurrentOrder.addressSnapshot,
              name: 'Recipient Updated',
              mobile: '9876543210',
              house: 'Plot 55'
            }
          })
        },
        orderStatusHistory: {
          create: vi.fn().mockResolvedValue({ id: 'hist-1' })
        },
        address: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 })
        }
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
        return callback(mockTx);
      });

      await orders.updateDetails(mockReq, mockRes, () => {});

      expect(mockTx.order.updateMany).toHaveBeenCalledTimes(1);
      const updateArgs = mockTx.order.updateMany.mock.calls[0][0];

      // Verifies that order fields like status, grandTotal, and userId were NOT updated
      expect(updateArgs.data).not.toHaveProperty('status');
      expect(updateArgs.data).not.toHaveProperty('grandTotal');
      expect(updateArgs.data).not.toHaveProperty('userId');
      expect(updateArgs.data).not.toHaveProperty('paymentStatus');
      expect(updateArgs.data).not.toHaveProperty('arbitraryInjection');

      // Verifies that only addressSnapshot and deliveryInstruction were updated
      expect(updateArgs.data).toHaveProperty('addressSnapshot');
      expect(updateArgs.data).toHaveProperty('deliveryInstruction', 'Please ring bell');

      // Verifies that addressSnapshot itself only contains whitelisted keys
      const snap = updateArgs.data.addressSnapshot;
      expect(snap.name).toBe('Recipient Updated');
      expect(snap.mobile).toBe('9876543210');
      expect(snap.house).toBe('Plot 55');
      expect(snap).not.toHaveProperty('arbitraryInjection');
      expect(snap).not.toHaveProperty('status');
      expect(snap).not.toHaveProperty('grandTotal');
    });
  });
});

