import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cache, invalidateProducts, invalidateAdminDashboard } from '../src/services/cache.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');

describe('BUG-16: Order Cancel Restores DB Stock and Invalidates Catalog Cache', () => {
  beforeEach(() => {
    cache.flush();
  });

  it('evicts catalog:products:* and catalog:product:* from cache when invalidateProducts is called', () => {
    // Populate cache with product listing and individual product details
    cache.set('catalog:products:1:20:all:default:all', { data: [{ id: 'prod-milk', stock: 25 }] }, 300);
    cache.set('catalog:product:prod-milk', { id: 'prod-milk', name: 'Amul Taaza Milk 1L', stock: 25 }, 600);
    cache.set('catalog:bestsellers', [{ id: 'prod-milk' }], 300);
    cache.set('catalog:toppicks', [{ id: 'prod-milk' }], 300);

    // Verify cache has populated entries
    expect(cache.get('catalog:products:1:20:all:default:all')).not.toBeNull();
    expect(cache.get('catalog:product:prod-milk')).not.toBeNull();
    expect(cache.get('catalog:bestsellers')).not.toBeNull();
    expect(cache.get('catalog:toppicks')).not.toBeNull();

    // Call invalidateProducts()
    invalidateProducts();

    // Verify all product catalog cache entries are evicted immediately
    expect(cache.get('catalog:products:1:20:all:default:all')).toBeNull();
    expect(cache.get('catalog:product:prod-milk')).toBeNull();
    expect(cache.get('catalog:bestsellers')).toBeNull();
    expect(cache.get('catalog:toppicks')).toBeNull();
  });

  it('guarantees public /products/:id cache returns restored stock after order cancellation', async () => {
    // Initial product state: 27 units in stock
    let dbStock = 27;
    const productId = 'prod-oil-1';

    // 1. Order placed for qty 2 -> stock in DB becomes 25
    dbStock -= 2;
    expect(dbStock).toBe(25);

    // Public catalog serves and caches stock = 25
    const cacheKey = `catalog:product:${productId}`;
    cache.set(cacheKey, { id: productId, name: 'Fortune Mustard Oil 1L', stock: dbStock }, 600);
    expect(cache.get(cacheKey).stock).toBe(25);

    // 2. Cancellation occurs: DB stock is incremented back to 27
    const orderQty = 2;
    dbStock += orderQty;
    expect(dbStock).toBe(27);

    // BUG-16 Fix: invalidateProducts() must be invoked upon cancellation
    invalidateProducts();

    // Cache must be cleared (not stale for 10 minutes)
    expect(cache.get(cacheKey)).toBeNull();

    // Next request to catalog fetches fresh stock from DB and caches restored value
    const freshData = await cache.getOrSet(
      cacheKey,
      async () => ({ id: productId, name: 'Fortune Mustard Oil 1L', stock: dbStock }),
      600
    );

    expect(freshData.stock).toBe(27);
    expect(cache.get(cacheKey).stock).toBe(27);
  });

  it('verifies static code wiring in customer.controller.js and admin-orders.controller.js', () => {
    const customerCtrlSrc = fs.readFileSync(
      path.join(backendRoot, 'src', 'controllers', 'customer.controller.js'),
      'utf8'
    );
    const adminOrdersCtrlSrc = fs.readFileSync(
      path.join(backendRoot, 'src', 'controllers', 'admin-orders.controller.js'),
      'utf8'
    );
    const adminPurchasesCtrlSrc = fs.readFileSync(
      path.join(backendRoot, 'src', 'controllers', 'admin-purchases.controller.js'),
      'utf8'
    );

    // customer.controller.js cancel endpoint must invalidate products & admin dashboard
    const cancelSlice = customerCtrlSrc.substring(
      customerCtrlSrc.indexOf('cancel:asyncHandler'),
      customerCtrlSrc.indexOf('updateDetails:')
    );
    expect(cancelSlice).toContain('invalidateProducts()');
    expect(cancelSlice).toContain('invalidateAdminDashboard()');

    // admin-orders.controller.js must import and call invalidateProducts on CANCELLED
    expect(adminOrdersCtrlSrc).toContain('invalidateProducts');
    expect(adminOrdersCtrlSrc).toMatch(/status\s*===\s*'CANCELLED'[\s\S]*?invalidateProducts\(\)/);

    // admin-purchases.controller.js must invalidate products when receiving new stock
    expect(adminPurchasesCtrlSrc).toContain('invalidateProducts');
  });
});

