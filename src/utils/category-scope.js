import { prisma } from '../config/prisma.js';
import { AppError } from './response.js';

/**
 * Resolves the category scope for an authenticated user.
 * 
 * Rules:
 * 1. Super Admin unrestricted access is strictly determined by role (SUPER_ADMIN),
 *    never by missing/null category assignments.
 * 2. If user is CATEGORY_ADMIN or has assignedCategoryIds configured:
 *    - Validates category IDs against database.
 *    - If assignedCategoryIds is empty or null, returns isScoped: true with categoryIds: []
 *      (Safe default: ZERO access rather than accidental unrestricted access).
 * 3. General Admin / staff without category scoping returns isScoped: false.
 */
export async function resolveUserCategoryScope(user, dbClient = prisma) {
  if (!user) {
    return { isScoped: false, categoryIds: null, assignedCategoryIds: [], categories: [] };
  }

  // Super Admin unrestricted access is strictly determined by role, never by missing/null category assignments
  const isSuper = user.role === 'SUPER_ADMIN' || user.staffRole === 'SUPER_ADMIN';
  if (isSuper) {
    return { isScoped: false, categoryIds: null, assignedCategoryIds: [], categories: [] };
  }

  // Account must be active
  if (user.status !== 'ACTIVE' || user.isStaffActive === false) {
    return { isScoped: true, categoryIds: [], assignedCategoryIds: [], categories: [] };
  }

  const isCategoryAdmin = user.staffRole === 'CATEGORY_ADMIN';
  const hasAssignedCategoryField = user.assignedCategoryIds !== undefined && user.assignedCategoryIds !== null;

  if (isCategoryAdmin || hasAssignedCategoryField) {
    const rawIds = Array.isArray(user.assignedCategoryIds) ? user.assignedCategoryIds : [];
    
    // A missing or empty category assignment must NEVER grant unrestricted access
    if (rawIds.length === 0) {
      return { isScoped: true, categoryIds: [], assignedCategoryIds: [], categories: [] };
    }

    // Verify assigned categories exist and are active in database
    const validCategories = await dbClient.category.findMany({
      where: { id: { in: rawIds } },
      select: { id: true, slug: true, name: true, status: true }
    });

    const validIds = validCategories.map(c => c.id);
    return {
      isScoped: true,
      categoryIds: validIds,
      assignedCategoryIds: rawIds,
      categories: validCategories
    };
  }

  // Non-scoped staff (e.g. legacy global staff)
  return { isScoped: false, categoryIds: null, assignedCategoryIds: [], categories: [] };
}

/**
 * Verifies that the existing product in database belongs to a category the user is permitted to manage.
 * Throws 404 if product not found, or 403 if user lacks access to that product's category.
 */
export async function verifyProductCategoryAccess(productId, user, dbClient = prisma) {
  if (!productId) throw new AppError('Product ID is required', 422);

  const product = await dbClient.product.findUnique({
    where: { id: String(productId) },
    select: { id: true, name: true, categoryId: true, deletedAt: true, category: { select: { id: true, name: true, slug: true } } }
  });

  if (!product || product.deletedAt) {
    throw new AppError('Product not found', 404);
  }

  const scope = await resolveUserCategoryScope(user, dbClient);
  if (scope.isScoped) {
    if (!scope.categoryIds.includes(product.categoryId)) {
      throw new AppError('Access denied: You are not authorized to manage products in this category', 403);
    }
  }

  return { product, scope };
}

/**
 * Asserts that a user has access to a specific category (by ID or Slug).
 * Throws 403 if user lacks access.
 */
export async function assertCategoryAccess(categoryIdOrSlug, user, dbClient = prisma) {
  const scope = await resolveUserCategoryScope(user, dbClient);
  if (!scope.isScoped) {
    return scope;
  }

  if (!categoryIdOrSlug) {
    throw new AppError('Category identifier is required', 422);
  }

  const targetCategory = await dbClient.category.findFirst({
    where: {
      OR: [
        { id: String(categoryIdOrSlug) },
        { slug: String(categoryIdOrSlug) }
      ]
    },
    select: { id: true, slug: true, name: true }
  });

  if (!targetCategory || !scope.categoryIds.includes(targetCategory.id)) {
    throw new AppError('Access denied: You are not authorized for this product category', 403);
  }

  return { ...scope, category: targetCategory };
}
