import { describe, it, expect, vi } from 'vitest';
import { addresses } from '../src/controllers/customer.controller.js';
import { errorHandler, sanitizeErrorMessage } from '../src/middleware/errors.js';
import { AppError } from '../src/utils/response.js';

describe('BUG-17: Cross-tenant Address Update/Delete Security & Error Mapping', () => {
  it('returns 404 when Customer B attempts to PATCH Customer A address (cross-tenant isolation)', async () => {
    const customerAAddressId = 'addr-customer-a-123';
    const customerBUserId = 'user-customer-b-456';

    const req = {
      params: { id: customerAAddressId },
      user: { id: customerBUserId },
      body: { name: 'Hacked Name', street: 'Hacked Street' }
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    let caughtError = null;
    const next = vi.fn(err => {
      caughtError = err;
    });

    await addresses.update(req, res, next);

    expect(caughtError).toBeInstanceOf(AppError);
    expect(caughtError.status).toBe(404);
    expect(caughtError.message).toBe('Address not found');

    // Pass through global errorHandler to verify client response
    const clientRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    errorHandler(caughtError, req, clientRes, () => {});

    expect(clientRes.status).toHaveBeenCalledWith(404);
    expect(clientRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Address not found'
      })
    );
  });

  it('returns 404 when Customer B attempts to DELETE Customer A address', async () => {
    const customerAAddressId = 'addr-customer-a-123';
    const customerBUserId = 'user-customer-b-456';

    const req = {
      params: { id: customerAAddressId },
      user: { id: customerBUserId }
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    let caughtError = null;
    const next = vi.fn(err => {
      caughtError = err;
    });

    await addresses.remove(req, res, next);

    expect(caughtError).toBeInstanceOf(AppError);
    expect(caughtError.status).toBe(404);
    expect(caughtError.message).toBe('Address not found');

    // Pass through global errorHandler
    const clientRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    errorHandler(caughtError, req, clientRes, () => {});

    expect(clientRes.status).toHaveBeenCalledWith(404);
    expect(clientRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Address not found'
      })
    );
  });

  it('ensures uncaught Prisma P2025 errors are mapped to 404 Not Found (never 500)', () => {
    // Simulates an uncaught PrismaClientKnownRequestError with P2025
    const prismaP2025Error = new Error('An operation failed because it depends on one or more records that were required but not found. Record to delete does not exist.');
    prismaP2025Error.code = 'P2025';
    prismaP2025Error.name = 'PrismaClientKnownRequestError';

    const req = {};
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    errorHandler(prismaP2025Error, req, res, next);

    // Must be 404, never 500
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'The requested record was not found.',
        errorCode: 'P2025'
      })
    );
  });

  it('ensures sanitizeErrorMessage produces clean non-internal message for P2025', () => {
    const p2025Err = {
      code: 'P2025',
      name: 'PrismaClientKnownRequestError',
      message: 'Record to delete does not exist'
    };
    const clean = sanitizeErrorMessage(p2025Err);
    expect(clean).toBe('The requested record was not found.');
    expect(clean).not.toContain('Record to delete does not exist');
  });
});

