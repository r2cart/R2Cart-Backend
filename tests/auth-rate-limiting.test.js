import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('BUG-10: Rate Limiting on Privileged Login Routes (Brute-Force Protection)', () => {
  it('throttles POST /api/v1/admin/auth/login with 429 after 20 attempts', async () => {
    const statuses = [];

    // Send 25 consecutive login attempts with invalid credentials
    for (let i = 0; i < 25; i++) {
      const res = await request(app)
        .post('/api/v1/admin/auth/login')
        .set('X-Forwarded-For', '203.0.113.195') // Unique IP for this test
        .send({ identifier: 'admin@example.com', password: 'wrong-password-' + i });

      statuses.push(res.status);
    }

    // First 20 attempts receive 401 (Unauthorized)
    const unauthorizedCount = statuses.filter(s => s === 401).length;
    expect(unauthorizedCount).toBe(20);

    // Remaining attempts (21 to 25) receive 429 (Too Many Requests)
    const rateLimitedCount = statuses.filter(s => s === 429).length;
    expect(rateLimitedCount).toBe(5);

    // Verify 21st attempt is strictly 429
    expect(statuses[20]).toBe(429);
  });

  it('throttles POST /api/v1/delivery/auth/login with 429 after 20 attempts', async () => {
    const statuses = [];

    for (let i = 0; i < 25; i++) {
      const res = await request(app)
        .post('/api/v1/delivery/auth/login')
        .set('X-Forwarded-For', '203.0.113.196') // Unique IP for this test
        .send({ identifier: 'R2D-9999', password: 'wrong-password-' + i });

      statuses.push(res.status);
    }

    const unauthorizedCount = statuses.filter(s => s === 401).length;
    expect(unauthorizedCount).toBe(20);

    const rateLimitedCount = statuses.filter(s => s === 429).length;
    expect(rateLimitedCount).toBe(5);

    expect(statuses[20]).toBe(429);
  });

  it('throttles POST /api/v1/super-admin/auth/login with 429 after 20 attempts', async () => {
    const statuses = [];

    for (let i = 0; i < 25; i++) {
      const res = await request(app)
        .post('/api/v1/super-admin/auth/login')
        .set('X-Forwarded-For', '203.0.113.197') // Unique IP for this test
        .send({ identifier: 'super@example.com', password: 'wrong-password-' + i });

      statuses.push(res.status);
    }

    const unauthorizedCount = statuses.filter(s => s === 401).length;
    expect(unauthorizedCount).toBe(20);

    const rateLimitedCount = statuses.filter(s => s === 429).length;
    expect(rateLimitedCount).toBe(5);

    expect(statuses[20]).toBe(429);
  });
});

