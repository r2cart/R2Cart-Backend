import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { cache } from '../src/services/cache.service.js';

describe('BUG-18: User (Email) Enumeration Prevention (API / Auth)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    cache.flush();
  });

  describe('Password Reset (/api/v1/auth/forgot-password)', () => {
    it('returns generic 200 for UNKNOWN email instead of 404 (prevents email enumeration)', async () => {
      const unknownEmail = `unknown-${Date.now()}@testnonexistent.com`;

      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: unknownEmail });

      // Must be 200, never 404 "This email is not registered"
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('A 6-digit reset code has been sent to your email.');
      expect(res.body.data).toHaveProperty('expiresInSeconds');

      // Verify no reset OTP record was inserted for the nonexistent email
      const record = await prisma.otpVerification.findFirst({
        where: { identifier: unknownEmail, purpose: 'password_reset' }
      });
      expect(record).toBeNull();
    });

    it('returns identical 200 response for registered vs unregistered email', async () => {
      const registeredEmail = 'superadmin@r2cart.in';
      const unregisteredEmail = `unregistered-${Date.now()}@r2cart.in`;

      const [resRegistered, resUnregistered] = await Promise.all([
        request(app).post('/api/v1/auth/forgot-password').send({ email: registeredEmail }),
        request(app).post('/api/v1/auth/forgot-password').send({ email: unregisteredEmail })
      ]);

      // Both must return identical HTTP status, message, and shape
      expect(resRegistered.status).toBe(200);
      expect(resUnregistered.status).toBe(200);

      expect(resRegistered.body.success).toBe(true);
      expect(resUnregistered.body.success).toBe(true);

      expect(resRegistered.body.message).toBe(resUnregistered.body.message);
      expect(resRegistered.body.data.expiresInSeconds).toBe(resUnregistered.body.data.expiresInSeconds);
    });
  });

  describe('Signup OTP Request (/api/v1/auth/request-otp)', () => {
    it('returns generic 200 for ALREADY REGISTERED email instead of 409 (prevents email enumeration)', async () => {
      const existingEmail = 'superadmin@r2cart.in';

      const res = await request(app)
        .post('/api/v1/auth/request-otp')
        .send({
          name: 'Attacker Test',
          email: existingEmail,
          mobile: '9876543210',
          password: 'Password@123',
          mode: 'signup'
        });

      // Must be 200, never 409 "An account already exists with this email"
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('OTP sent to your email');
      expect(res.body.data).toHaveProperty('expiresInSeconds');

      // Verify no pending OTP record was created to hijack or overwrite the existing account
      const record = await prisma.otpVerification.findFirst({
        where: { identifier: existingEmail, purpose: 'signup' },
        orderBy: { createdAt: 'desc' }
      });
      // Existing user record must remain unchanged
      expect(record).toBeNull();
    });

    it('returns identical 200 response shape for existing vs new email on signup OTP request', async () => {
      const existingEmail = 'superadmin@r2cart.in';
      const newEmail = `brand-new-${Date.now()}@r2cart.in`;

      const resExisting = await request(app)
        .post('/api/v1/auth/request-otp')
        .send({
          name: 'Probe Name',
          email: existingEmail,
          mobile: '9876543210',
          password: 'Password@123',
          mode: 'signup'
        });

      const resNew = await request(app)
        .post('/api/v1/auth/request-otp')
        .send({
          name: 'Real User',
          email: newEmail,
          mobile: `9${String(Date.now()).slice(-9)}`,
          password: 'Password@123',
          mode: 'signup'
        });

      expect(resExisting.status).toBe(200);
      expect(resNew.status).toBe(200);

      expect(resExisting.body.success).toBe(true);
      expect(resNew.body.success).toBe(true);

      expect(resExisting.body.message).toBe(resNew.body.message);
      expect(resExisting.body.data.expiresInSeconds).toBe(resNew.body.data.expiresInSeconds);
    });
  });
});
