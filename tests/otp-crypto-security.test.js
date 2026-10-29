import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { generateSecureOtp } from '../src/controllers/auth.controller.js';

describe('BUG-11: Cryptographically Secure OTP Generation', () => {
  it('does not use Math.random in auth.controller.js for OTP generation', () => {
    const authControllerPath = path.resolve(__dirname, '../src/controllers/auth.controller.js');
    const sourceCode = fs.readFileSync(authControllerPath, 'utf8');

    expect(sourceCode).not.toContain('Math.random()');
    expect(sourceCode).toContain('crypto.randomInt');
  });

  it('ensures no Math.random exists in any backend src controllers or services', () => {
    const srcDir = path.resolve(__dirname, '../src');
    
    function scanDir(dir) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          scanDir(fullPath);
        } else if (file.endsWith('.js')) {
          const content = fs.readFileSync(fullPath, 'utf8');
          expect(content, `Math.random() found in ${file}`).not.toContain('Math.random()');
        }
      }
    }

    scanDir(srcDir);
  });

  it('generateSecureOtp produces valid 6-digit numeric strings within [100000, 999999]', () => {
    for (let i = 0; i < 1000; i++) {
      const otp = generateSecureOtp();
      
      expect(typeof otp).toBe('string');
      expect(otp).toHaveLength(6);
      expect(/^\d{6}$/.test(otp)).toBe(true);

      const num = parseInt(otp, 10);
      expect(num).toBeGreaterThanOrEqual(100000);
      expect(num).toBeLessThanOrEqual(999999);
    }
  });

  it('uses crypto.randomInt with range [100000, 1000000)', () => {
    const randomIntSpy = vi.spyOn(crypto, 'randomInt');
    
    const otp = generateSecureOtp();
    expect(randomIntSpy).toHaveBeenCalledWith(100000, 1000000);
    expect(otp).toMatch(/^\d{6}$/);

    randomIntSpy.mockRestore();
  });
});

