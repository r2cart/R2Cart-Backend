import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';

describe('BUG-05: Secrets and Credentials Configuration Security', () => {
  it('does not contain hardcoded VAPID keys or default admin passwords in source files', () => {
    const envSourcePath = path.resolve(__dirname, '../src/config/env.js');
    const schemaGuardPath = path.resolve(__dirname, '../src/services/schema-guard.service.js');
    const seedPath = path.resolve(__dirname, '../prisma/seed.js');

    const envContent = fs.readFileSync(envSourcePath, 'utf8');
    const schemaGuardContent = fs.readFileSync(schemaGuardPath, 'utf8');
    const seedContent = fs.readFileSync(seedPath, 'utf8');

    // Forbidden hardcoded values
    const hardcodedVapidPub = 'BO1w2k-LiDaBdRpubuoqxvNfencYPWQoYptfAutAN5U1oXACbCkaro3jtrOzE0yEy2XghewIIJMTTyD3joO8Q_Y';
    const hardcodedVapidPriv = 'yOuYWg8zQrDtqdx5FU0KS-I3Wi7tmIk0o_1k2VcH0IY';
    const hardcodedSuperPassword = 'Super@123';
    const hardcodedAdminPassword = 'Admin@123';

    expect(envContent).not.toContain(hardcodedVapidPub);
    expect(envContent).not.toContain(hardcodedVapidPriv);
    expect(envContent).not.toContain(hardcodedSuperPassword);

    expect(schemaGuardContent).not.toContain(hardcodedSuperPassword);
    expect(schemaGuardContent).not.toContain(hardcodedAdminPassword);

    expect(seedContent).not.toContain(hardcodedSuperPassword);
    expect(seedContent).not.toContain(hardcodedAdminPassword);
  });

  describe('ensureSuperAdminAccount behavior without hardcoded credentials', () => {
    it('refuses to bootstrap a Super Admin if no SUPER_ADMIN_PASSWORD is set in environment', async () => {
      // Mock prisma
      const mockPrisma = {
        user: {
          findFirst: vi.fn().mockResolvedValue(null),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          upsert: vi.fn()
        }
      };

      vi.resetModules();
      vi.doMock('../src/config/prisma.js', () => ({ prisma: mockPrisma }));
      vi.doMock('../src/config/env.js', () => ({
        env: {
          superAdminEmail: 'super@gmail.com',
          superAdminPassword: ''
        }
      }));

      const origEnvSuperPass = process.env.SUPER_ADMIN_PASSWORD;
      const origEnvInitPass = process.env.INITIAL_SUPER_ADMIN_PASSWORD;
      delete process.env.SUPER_ADMIN_PASSWORD;
      delete process.env.INITIAL_SUPER_ADMIN_PASSWORD;

      try {
        const { ensureSuperAdminAccount } = await import('../src/services/schema-guard.service.js');
        const result = await ensureSuperAdminAccount();

        expect(result).toBeNull();
        expect(mockPrisma.user.upsert).not.toHaveBeenCalled();
      } finally {
        if (origEnvSuperPass) process.env.SUPER_ADMIN_PASSWORD = origEnvSuperPass;
        if (origEnvInitPass) process.env.INITIAL_SUPER_ADMIN_PASSWORD = origEnvInitPass;
        vi.resetModules();
      }
    });

    it('bootstraps Super Admin with the password provided via environment variable', async () => {
      const createdUser = {
        id: 'super-admin-id',
        email: 'admin-env@r2cart.in',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE'
      };

      const mockPrisma = {
        user: {
          findFirst: vi.fn().mockResolvedValue(null),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          upsert: vi.fn().mockResolvedValue(createdUser)
        }
      };

      vi.resetModules();
      vi.doMock('../src/config/prisma.js', () => ({ prisma: mockPrisma }));
      vi.doMock('../src/config/env.js', () => ({
        env: {
          superAdminEmail: 'admin-env@r2cart.in',
          superAdminPassword: 'MySecureEnvPassword!456'
        }
      }));

      try {
        const { ensureSuperAdminAccount } = await import('../src/services/schema-guard.service.js');
        const result = await ensureSuperAdminAccount();

        expect(result).toEqual(createdUser);
        expect(mockPrisma.user.upsert).toHaveBeenCalledTimes(1);

        const upsertArgs = mockPrisma.user.upsert.mock.calls[0][0];
        expect(upsertArgs.where.email).toBe('admin-env@r2cart.in');
        expect(upsertArgs.create.email).toBe('admin-env@r2cart.in');

        // Check passwordHash matches the environment password
        const passwordMatches = await bcrypt.compare('MySecureEnvPassword!456', upsertArgs.create.passwordHash);
        expect(passwordMatches).toBe(true);
      } finally {
        vi.resetModules();
      }
    });
  });
});

