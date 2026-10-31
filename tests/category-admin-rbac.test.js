import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  user: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn()
  },
  category: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn()
  },
  product: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn()
  },
  storeSetting: {
    findUnique: vi.fn(),
    upsert: vi.fn()
  },
  order: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    updateMany: vi.fn()
  },
  refreshToken: {
    updateMany: vi.fn()
  },
  $transaction: vi.fn()
}));

vi.mock('../src/config/prisma.js', () => ({ prisma: db }));
vi.mock('../src/services/cache.service.js', () => ({
  invalidateProducts: vi.fn(),
  invalidateCategories: vi.fn(),
  invalidateBanners: vi.fn(),
  invalidateSettings: vi.fn(),
  invalidateAdminDashboard: vi.fn()
}));
vi.mock('../src/services/audit.service.js', () => ({
  logAudit: vi.fn()
}));
vi.mock('../src/services/image.service.js', () => ({
  uploadProductImage: vi.fn().mockResolvedValue({ url: 'https://img.test/pic.jpg' }),
  isCloudinaryConfigured: vi.fn().mockReturnValue(false),
  relocateProductImage: vi.fn().mockImplementation((url) => Promise.resolve(url)),
  optimizeCloudinaryUrl: vi.fn().mockImplementation((url) => url),
  productImagePublicId: vi.fn().mockImplementation((url) => 'pub-id'),
  deleteProduct: vi.fn(),
  deleteProductImage: vi.fn()
}));
vi.mock('../src/services/product-deletion.service.js', () => ({
  deleteProduct: vi.fn().mockResolvedValue(),
  deleteAllProducts: vi.fn().mockResolvedValue({ count: 5 }),
  deleteProductsByCategory: vi.fn().mockResolvedValue({ count: 2, categoryName: 'Resin Art' })
}));

import { resolveUserCategoryScope, verifyProductCategoryAccess, assertCategoryAccess } from '../src/utils/category-scope.js';
import { products, categories, uploadProductImage } from '../src/controllers/admin.controller.js';
import { list as listProducts, get as getProduct } from '../src/controllers/admin-products.controller.js';
import { addVariant } from '../src/controllers/variants.controller.js';
import { inventory } from '../src/controllers/admin-inventory.controller.js';
import { orders } from '../src/controllers/admin-orders.controller.js';
import { security } from '../src/controllers/admin-security.controller.js';
import { reorder } from '../src/controllers/admin-reorder.controller.js';
import { hasPermission } from '../src/config/permissions.js';

const mockResponse = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('Category-Based Admin RBAC and Authorization System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.$transaction.mockImplementation((fn) => fn(db));
  });

  describe('1. Category Scope Resolution (resolveUserCategoryScope)', () => {
    it('grants Super Admin unrestricted access (isScoped: false) regardless of category assignments', async () => {
      const superUser = {
        id: 'super-1',
        role: 'SUPER_ADMIN',
        staffRole: 'SUPER_ADMIN',
        status: 'ACTIVE',
        isStaffActive: true,
        assignedCategoryIds: null
      };

      const scope = await resolveUserCategoryScope(superUser, db);
      expect(scope.isScoped).toBe(false);
      expect(scope.categoryIds).toBeNull();
    });

    it('scopes Category Admin to assigned categories when valid', async () => {
      const categoryAdmin = {
        id: 'cat-admin-1',
        role: 'ADMIN',
        staffRole: 'CATEGORY_ADMIN',
        status: 'ACTIVE',
        isStaffActive: true,
        assignedCategoryIds: ['cat-resin-123']
      };

      db.category.findMany.mockResolvedValue([
        { id: 'cat-resin-123', slug: 'resin-art', name: 'Resin Art', status: 'ACTIVE' }
      ]);

      const scope = await resolveUserCategoryScope(categoryAdmin, db);
      expect(scope.isScoped).toBe(true);
      expect(scope.categoryIds).toEqual(['cat-resin-123']);
      expect(scope.categories[0].slug).toBe('resin-art');
    });

    it('ensures a missing or empty category assignment NEVER grants unrestricted access to Category Admin', async () => {
      const emptyCatAdmin = {
        id: 'cat-admin-empty',
        role: 'ADMIN',
        staffRole: 'CATEGORY_ADMIN',
        status: 'ACTIVE',
        isStaffActive: true,
        assignedCategoryIds: []
      };

      const scope = await resolveUserCategoryScope(emptyCatAdmin, db);
      expect(scope.isScoped).toBe(true);
      expect(scope.categoryIds).toEqual([]); // Zero access, never unrestricted
    });

    it('preserves unrestricted access for legacy general Admin without assignedCategoryIds', async () => {
      const legacyAdmin = {
        id: 'legacy-admin',
        role: 'ADMIN',
        staffRole: 'ADMIN',
        status: 'ACTIVE',
        isStaffActive: true,
        assignedCategoryIds: null
      };

      const scope = await resolveUserCategoryScope(legacyAdmin, db);
      expect(scope.isScoped).toBe(false);
    });

    it('blocks suspended or inactive staff from accessing categories', async () => {
      const suspendedStaff = {
        id: 'suspended-1',
        role: 'ADMIN',
        staffRole: 'CATEGORY_ADMIN',
        status: 'INACTIVE',
        isStaffActive: false,
        assignedCategoryIds: ['cat-resin-123']
      };

      const scope = await resolveUserCategoryScope(suspendedStaff, db);
      expect(scope.isScoped).toBe(true);
      expect(scope.categoryIds).toEqual([]);
    });
  });

  describe('2. Product Operations Authorization', () => {
    const resinAdmin = {
      id: 'cat-admin-resin',
      name: 'Resin Art Admin',
      role: 'ADMIN',
      staffRole: 'CATEGORY_ADMIN',
      status: 'ACTIVE',
      isStaffActive: true,
      permissions: { 'products.create': true, 'products.edit': true, 'products.view': true, 'inventory.manage': true },
      assignedCategoryIds: ['cat-resin-id']
    };

    beforeEach(() => {
      db.category.findMany.mockResolvedValue([
        { id: 'cat-resin-id', slug: 'resin-art', name: 'Resin Art', status: 'ACTIVE' }
      ]);
    });

    it('permits authorized category product creation', async () => {
      db.category.findUnique.mockResolvedValue({ id: 'cat-resin-id', slug: 'resin-art', name: 'Resin Art' });
      db.product.create.mockResolvedValue({
        id: 'prod-resin-1',
        name: 'Resin Ocean Clock',
        price: 1500,
        stock: 5,
        sku: 'R2C-CLK1',
        categoryId: 'cat-resin-id'
      });

      const req = {
        user: resinAdmin,
        body: {
          name: 'Resin Ocean Clock',
          description: 'Handmade resin art clock',
          unit: 'piece',
          mrp: 1800,
          price: 1500,
          stock: 5,
          category: 'resin-art',
          images: ['https://example.com/clock.jpg']
        }
      };
      const res = mockResponse();
      const next = vi.fn();

      await products.create(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('rejects cross-category product creation with 403 Forbidden', async () => {
      db.category.findUnique.mockResolvedValue({ id: 'cat-grocery-dairy', slug: 'dairy-bread-eggs', name: 'Dairy' });

      const req = {
        user: resinAdmin,
        body: {
          name: 'Amul Butter',
          description: 'Fresh butter 500g',
          unit: 'pack',
          mrp: 275,
          price: 260,
          stock: 50,
          category: 'dairy-bread-eggs',
          images: ['https://example.com/butter.jpg']
        }
      };
      const res = mockResponse();
      const next = vi.fn();

      await products.create(req, res, next);
      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error.status).toBe(403);
      expect(error.message).toContain('Access denied');
    });

    it('rejects cross-category product updates with 403 Forbidden after checking DB', async () => {
      // Product in DB belongs to grocery ('cat-grocery-dairy')
      db.product.findUnique.mockResolvedValue({
        id: 'prod-grocery-1',
        name: 'Dairy Milk',
        categoryId: 'cat-grocery-dairy',
        deletedAt: null
      });
      db.category.findUnique.mockResolvedValue({ id: 'cat-resin-id', slug: 'resin-art' });

      const req = {
        user: resinAdmin,
        params: { id: 'prod-grocery-1' },
        body: {
          name: 'Hacked Milk',
          description: 'Attempting cross-category tamper',
          unit: 'pack',
          category: 'resin-art'
        }
      };
      const res = mockResponse();
      const next = vi.fn();

      await products.update(req, res, next);
      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error.status).toBe(403);
      expect(error.message).toContain('Access denied');
    });

    it('rejects cross-category product deletion with 403 Forbidden', async () => {
      db.product.findUnique.mockResolvedValue({
        id: 'prod-grocery-1',
        name: 'Dairy Milk',
        categoryId: 'cat-grocery-dairy',
        deletedAt: null
      });

      const req = {
        user: resinAdmin,
        params: { id: 'prod-grocery-1' }
      };
      const res = mockResponse();
      const next = vi.fn();

      await products.remove(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0].status).toBe(403);
    });

    it('rejects adding variants to cross-category products with 403 Forbidden', async () => {
      db.product.findUnique.mockResolvedValue({
        id: 'prod-grocery-1',
        name: 'Rice Bag',
        categoryId: 'cat-grocery-atta',
        deletedAt: null
      });

      const req = {
        user: resinAdmin,
        params: { id: 'prod-grocery-1' },
        body: {
          unit: '10kg',
          price: 500,
          mrp: 600,
          stock: 10
        }
      };
      const res = mockResponse();
      const next = vi.fn();

      await addVariant(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0].status).toBe(403);
    });

    it('rejects cross-category stock adjustment with 403 Forbidden', async () => {
      db.product.findUnique.mockResolvedValue({
        id: 'prod-grocery-1',
        name: 'Dairy Milk',
        categoryId: 'cat-grocery-dairy',
        deletedAt: null
      });

      const req = {
        user: resinAdmin,
        body: {
          productId: 'prod-grocery-1',
          newStock: 25,
          reason: 'Physical count discrepancy'
        }
      };
      const res = mockResponse();
      const next = vi.fn();

      await inventory.adjust(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0].status).toBe(403);
    });
  });

  describe('3. Staff Management & Privilege Escalation Protection', () => {
    const superAdmin = {
      id: 'super-admin-root',
      role: 'SUPER_ADMIN',
      staffRole: 'SUPER_ADMIN',
      status: 'ACTIVE',
      isStaffActive: true
    };

    const resinAdmin = {
      id: 'cat-admin-resin',
      role: 'ADMIN',
      staffRole: 'CATEGORY_ADMIN',
      status: 'ACTIVE',
      isStaffActive: true,
      assignedCategoryIds: ['cat-resin-id']
    };

    it('requires at least one valid category when creating a Category Admin', async () => {
      const req = {
        user: superAdmin,
        body: {
          name: 'New Art Manager',
          email: 'artmgr@r2cart.com',
          password: 'Password123!',
          staffRole: 'CATEGORY_ADMIN',
          assignedCategoryIds: []
        }
      };
      const res = mockResponse();
      const next = vi.fn();

      await security.staff.create(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0].status).toBe(422);
      expect(next.mock.calls[0][0].message).toContain('At least one assigned category is required');
    });

    it('rejects non-existent category IDs when assigning categories', async () => {
      db.user.findUnique.mockResolvedValue(null);
      db.category.findMany.mockResolvedValue([]); // Category does not exist in DB

      const req = {
        user: superAdmin,
        body: {
          name: 'Invalid Cat Manager',
          email: 'invalid@r2cart.com',
          password: 'Password123!',
          staffRole: 'CATEGORY_ADMIN',
          assignedCategoryIds: ['cat-non-existent-999']
        }
      };
      const res = mockResponse();
      const next = vi.fn();

      await security.staff.create(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0].status).toBe(422);
      expect(next.mock.calls[0][0].message).toContain('assigned category IDs are invalid');
    });

    it('prevents Admin from modifying their own role, permissions, or category assignments', async () => {
      db.user.findUnique.mockResolvedValue(resinAdmin);

      const req = {
        user: resinAdmin, // Admin calling update on self
        params: { id: resinAdmin.id },
        body: {
          permissions: { all: true } // Attempting privilege escalation
        }
      };
      const res = mockResponse();
      const next = vi.fn();

      await security.staff.update(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0].status).toBe(403);
      expect(next.mock.calls[0][0].message).toContain('Admins cannot modify their own role, permissions, or category assignments');
    });

    it('prevents non-Super-Admin from creating new Category Admin accounts', async () => {
      const req = {
        user: resinAdmin,
        body: {
          name: 'Another Art Admin',
          email: 'art2@r2cart.com',
          password: 'Password123!',
          staffRole: 'CATEGORY_ADMIN',
          assignedCategoryIds: ['cat-resin-id']
        }
      };
      const res = mockResponse();
      const next = vi.fn();

      await security.staff.create(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0].status).toBe(403);
    });
  });

  describe('4. Mixed-Order Safety & Scoped Reporting', () => {
    const resinAdmin = {
      id: 'cat-admin-resin',
      role: 'ADMIN',
      staffRole: 'CATEGORY_ADMIN',
      status: 'ACTIVE',
      isStaffActive: true,
      permissions: { 'orders.view': true, 'orders.cancel': true, 'orders.update_status': true },
      assignedCategoryIds: ['cat-resin-id']
    };

    beforeEach(() => {
      db.category.findMany.mockResolvedValue([
        { id: 'cat-resin-id', slug: 'resin-art', name: 'Resin Art', status: 'ACTIVE' }
      ]);
    });

    it('prevents Category Admin from performing unrestricted order-level status changes on orders', async () => {
      const req = {
        user: resinAdmin,
        params: { id: 'order-mixed-1' },
        body: { status: 'Cancelled', reason: 'Customer requested' }
      };
      const res = mockResponse();
      const next = vi.fn();

      await orders.status(req, res, next);
      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error.status).toBe(403);
      expect(error.message).toContain('Category Admins cannot perform order-level status updates or cancellations');
    });

    it('scopes order listings so Category Admin only queries orders containing their category items', async () => {
      db.order.findMany.mockResolvedValue([]);
      db.order.count.mockResolvedValue(0);

      const req = {
        user: resinAdmin,
        query: { page: '1', limit: '20' }
      };
      const res = mockResponse();
      const next = vi.fn();

      await orders.list(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(db.order.findMany).toHaveBeenCalled();
      const queryWhere = db.order.findMany.mock.calls[0][0].where;
      expect(queryWhere.items).toEqual({
        some: { product: { categoryId: { in: ['cat-resin-id'] } } }
      });
    });

    it('prevents Category Admin from modifying order items (orders.modifyItem)', async () => {
      const req = {
        user: resinAdmin,
        params: { id: 'order-mixed-1', itemId: 'item-1' },
        body: { action: 'OUT_OF_STOCK' }
      };
      const res = mockResponse();
      const next = vi.fn();

      await orders.modifyItem(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0].status).toBe(403);
      expect(next.mock.calls[0][0].message).toContain('Category Admins cannot perform order item modifications');
    });
  });

  describe('5. Category Store Operations Boundaries', () => {
    const resinAdmin = {
      id: 'cat-admin-resin',
      role: 'ADMIN',
      staffRole: 'CATEGORY_ADMIN',
      status: 'ACTIVE',
      isStaffActive: true,
      permissions: { 'categories.manage': true },
      assignedCategoryIds: ['cat-resin-id']
    };

    beforeEach(() => {
      db.category.findMany.mockResolvedValue([
        { id: 'cat-resin-id', slug: 'resin-art', name: 'Resin Art', status: 'ACTIVE' }
      ]);
    });

    it('rejects Category Admin attempting to create new store categories with 403', async () => {
      const req = {
        user: resinAdmin,
        body: { name: 'New Unauthorized Category' }
      };
      const res = mockResponse();
      const next = vi.fn();

      await categories.create(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0].status).toBe(403);
      expect(next.mock.calls[0][0].message).toContain('Category Admins cannot create new categories');
    });

    it('rejects Category Admin attempting to delete store categories with 403', async () => {
      const req = {
        user: resinAdmin,
        params: { id: 'cat-resin-id' }
      };
      const res = mockResponse();
      const next = vi.fn();

      await categories.remove(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0].status).toBe(403);
      expect(next.mock.calls[0][0].message).toContain('Category Admins cannot delete categories');
    });

    it('rejects Category Admin attempting to reorder store categories with 403', async () => {
      const req = {
        user: resinAdmin,
        body: { ids: ['cat-resin-id', 'cat-other-id'] }
      };
      const res = mockResponse();
      const next = vi.fn();

      await reorder('category')(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0].status).toBe(403);
      expect(next.mock.calls[0][0].message).toContain('Category Admins cannot reorder store categories');
    });

    it('rejects Category Admin attempting to modify an unauthorized category with 403', async () => {
      const req = {
        user: resinAdmin,
        params: { id: 'cat-grocery-dairy' },
        body: { name: 'Dairy Tamper' }
      };
      const res = mockResponse();
      const next = vi.fn();

      await categories.update(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0].status).toBe(403);
      expect(next.mock.calls[0][0].message).toContain('Access denied');
    });

    it('rejects product image upload when category slug is outside assigned scope', async () => {
      db.category.findUnique.mockResolvedValue({ id: 'cat-grocery-dairy', slug: 'dairy-bread-eggs' });

      const req = {
        user: resinAdmin,
        file: { buffer: Buffer.from('fake-image-bytes') },
        body: { category: 'dairy-bread-eggs' }
      };
      const res = mockResponse();
      const next = vi.fn();

      await uploadProductImage(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0].status).toBe(403);
      expect(next.mock.calls[0][0].message).toContain('Access denied');
    });
  });

  describe('6. Granular Permissions & Existing Super Admin Preservation', () => {
    it('evaluates granular permissions correctly for CATEGORY_ADMIN', () => {
      const activeCatAdmin = {
        role: 'ADMIN',
        staffRole: 'CATEGORY_ADMIN',
        status: 'ACTIVE',
        isStaffActive: true,
        permissions: { 'products.view': true, 'products.create': true }
      };

      expect(hasPermission(activeCatAdmin, 'products.view')).toBe(true);
      expect(hasPermission(activeCatAdmin, 'products.create')).toBe(true);
      expect(hasPermission(activeCatAdmin, 'products.edit')).toBe(false); // Granular missing permission
    });

    it('Super Admin preserves all permissions regardless of permissions object', () => {
      const superAdmin = {
        role: 'SUPER_ADMIN',
        staffRole: 'SUPER_ADMIN',
        status: 'ACTIVE',
        isStaffActive: true,
        permissions: {}
      };

      expect(hasPermission(superAdmin, 'products.view')).toBe(true);
      expect(hasPermission(superAdmin, 'products.create')).toBe(true);
      expect(hasPermission(superAdmin, 'products.edit')).toBe(true);
      expect(hasPermission(superAdmin, 'orders.cancel')).toBe(true);
      expect(hasPermission(superAdmin, 'reports.view_financial')).toBe(true);
    });
  });
});
