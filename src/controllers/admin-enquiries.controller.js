import { prisma } from '../config/prisma.js';
import { AppError, asyncHandler, ok } from '../utils/response.js';
import { resolveUserCategoryScope } from '../utils/category-scope.js';

export const enquiries = {
  list: asyncHandler(async (req, res) => {
    const scope = await resolveUserCategoryScope(req.user);
    const { status, search, page = 1, limit = 20 } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where = {};

    // Strict Category Scoping for Category Admins
    if (scope.isScoped) {
      where.product = {
        categoryId: { in: scope.categoryIds }
      };
    }

    if (status && ['PENDING', 'CONTACTED', 'RESOLVED', 'REJECTED'].includes(status.toUpperCase())) {
      where.status = status.toUpperCase();
    }

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q } },
        { phone: { contains: q } },
        { email: { contains: q } },
        { product: { name: { contains: q } } }
      ];
    }

    const [total, items] = await Promise.all([
      prisma.productEnquiry.count({ where }),
      prisma.productEnquiry.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              price: true,
              unit: true,
              deliveryScope: true,
              orderMode: true,
              category: {
                select: { id: true, name: true, slug: true }
              },
              images: {
                take: 1,
                orderBy: { position: 'asc' },
                select: { url: true }
              }
            }
          },
          user: {
            select: { id: true, name: true, email: true, mobile: true }
          }
        }
      })
    ]);

    res.json({
      success: true,
      data: items,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  }),

  updateStatus: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, adminNotes } = req.body;

    const existing = await prisma.productEnquiry.findUnique({
      where: { id },
      include: { product: true }
    });

    if (!existing) {
      throw new AppError('Enquiry not found', 404);
    }

    // RBAC Check for Category Admin
    const scope = await resolveUserCategoryScope(req.user);
    if (scope.isScoped && !scope.categoryIds.includes(existing.product.categoryId)) {
      throw new AppError('Access denied: You are not authorized to manage enquiries outside your assigned category', 403);
    }

    const data = {};
    if (status) {
      const upperStatus = status.trim().toUpperCase();
      if (!['PENDING', 'CONTACTED', 'RESOLVED', 'REJECTED'].includes(upperStatus)) {
        throw new AppError('Invalid status. Allowed: PENDING, CONTACTED, RESOLVED, REJECTED', 422);
      }
      data.status = upperStatus;
    }

    if (adminNotes !== undefined) {
      data.adminNotes = adminNotes ? String(adminNotes).trim() : null;
    }

    const updated = await prisma.productEnquiry.update({
      where: { id },
      data,
      include: {
        product: {
          select: { id: true, name: true, category: true, images: { take: 1 } }
        }
      }
    });

    res.json({
      success: true,
      message: 'Enquiry updated successfully',
      data: updated
    });
  }),

  delete: asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existing = await prisma.productEnquiry.findUnique({
      where: { id },
      include: { product: true }
    });

    if (!existing) {
      throw new AppError('Enquiry not found', 404);
    }

    const scope = await resolveUserCategoryScope(req.user);
    if (scope.isScoped && !scope.categoryIds.includes(existing.product.categoryId)) {
      throw new AppError('Access denied: You are not authorized to delete enquiries outside your assigned category', 403);
    }

    await prisma.productEnquiry.delete({ where: { id } });

    res.json({
      success: true,
      message: 'Enquiry deleted successfully'
    });
  })
};
