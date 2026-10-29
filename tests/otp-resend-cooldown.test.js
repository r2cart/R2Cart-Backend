import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { cache } from '../src/services/cache.service.js';

describe('BUG-19: Per-Email OTP Resend Cooldown (API / Auth)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    cache.flush();
  });

  describe('POST /api/v1/auth/request-otp Cooldown', () => {
    it('allows initial signup OTP request, then throttles immediate subsequent request for the same email with 429', async () => {
      const email = `cooldown-signup-${Date.now()}@test.com`;
      const mobile = `9${String(Date.now()).slice(-9)}`;

      // First request: should succeed with 200 OK
      const res1 = await request(app)
        .post('/api/v1/auth/request-otp')
        .send({
          name: 'Cooldown Tester',
          email,
          mobile,
          password: 'Password@123',
          mode: 'signup'
        });

      expect(res1.status).toBe(200);
      expect(res1.body.success).toBe(true);
      expect(res1.body.message).toBe('OTP sent to your email');

      // Second immediate request for SAME email: must be throttled with 429
      const res2 = await request(app)
        .post('/api/v1/auth/request-otp')
        .send({
          name: 'Cooldown Tester',
          email,
          mobile,
          password: 'Password@123',
          mode: 'signup'
        });

      expect(res2.status).toBe(429);
      expect(res2.body.success).toBe(false);
      expect(res2.body.message).toMatch(/Please wait \d+ seconds before requesting another code\./);
    });

    it('allows requests for DIFFERENT emails concurrently without cross-blocking', async () => {
      const emailA = `email-a-${Date.now()}@test.com`;
      const emailB = `email-b-${Date.now()}@test.com`;
      const mobileA = `9${String(Date.now()).slice(-9)}`;
      const mobileB = `8${String(Date.now()).slice(-9)}`;

      const resA = await request(app)
        .post('/api/v1/auth/request-otp')
        .send({
          name: 'User A',
          email: emailA,
          mobile: mobileA,
          password: 'Password@123',
          mode: 'signup'
        });

      expect(resA.status).toBe(200);

      // Email B should NOT be blocked by Email A's cooldown
      const resB = await request(app)
        .post('/api/v1/auth/request-otp')
        .send({
          name: 'User B',
          email: emailB,
          mobile: mobileB,
          password: 'Password@123',
          mode: 'signup'
        });

      expect(resB.status).toBe(200);
    });
  });

  describe('POST /api/v1/auth/forgot-password Cooldown', () => {
    it('allows initial password reset request, then throttles immediate subsequent request for the same email with 429', async () => {
      const email = `cooldown-reset-${Date.now()}@test.com`;

      // First request: generic 200 (BUG-18 compliant)
      const res1 = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email });

      expect(res1.status).toBe(200);
      expect(res1.body.success).toBe(true);

      // Second immediate request: 429 Too Many Requests
      const res2 = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email });

      expect(res2.status).toBe(429);
      expect(res2.body.success).toBe(false);
      expect(res2.body.message).toMatch(/Please wait \d+ seconds before requesting another code\./);
    });
  });

  describe('Database Fallback Cooldown (Multi-instance / Cold Cache)', () => {
    it('enforces cooldown using DB otpVerification records even if memory cache is purged', async () => {
      const email = `db-cooldown-${Date.now()}@test.com`;

      // Insert a recent OTP verification record in DB (e.g. 10 seconds ago)
      await prisma.otpVerification.create({
        data: {
          identifier: email,
          purpose: 'signup',
          codeHash: 'dummyhash',
          expiresAt: new Date(Date.now() + 5 * 60000),
          createdAt: new Date(Date.now() - 10 * 1000) // 10s ago
        }
      });

      // Clear memory cache to simulate cold cache or separate app instance
      cache.flush();

      // Request OTP should still be caught by the DB timestamp and return 429
      const res = await request(app)
        .post('/api/v1/auth/request-otp')
        .send({
          name: 'Test DB Fallback',
          email,
          mobile: `9${String(Date.now()).slice(-9)}`,
          password: 'Password@123',
          mode: 'signup'
        });

      expect(res.status).toBe(429);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Please wait \d+ seconds before requesting another code\./);

      // Cleanup
      await prisma.otpVerification.deleteMany({
        where: { identifier: email }
      });
    });
  });
});

