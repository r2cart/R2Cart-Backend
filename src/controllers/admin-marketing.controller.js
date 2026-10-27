import {prisma} from '../config/prisma.js';
import {AppError,asyncHandler,created,ok} from '../utils/response.js';
import {logAudit} from '../services/audit.service.js';
import {cache} from '../services/cache.service.js';

const campaignData = (body) => {
  const name = String(body.name || '').trim();
  if (!name) throw new AppError('Campaign name is required', 422);

  const title = String(body.title || name).trim();
  const type = String(body.type || 'FESTIVAL').trim().toUpperCase();
  if (!['FESTIVAL', 'POPUP', 'ANNOUNCEMENT_BAR', 'BANNER', 'DISCOUNT_DEAL'].includes(type)) {
    throw new AppError('Invalid campaign type', 422);
  }

  if (!body.startsAt || !body.expiresAt) {
    throw new AppError('Campaign start and end dates are required', 422);
  }

  const startsAt = new Date(body.startsAt);
  const expiresAt = new Date(body.expiresAt);
  if (isNaN(startsAt.getTime()) || isNaN(expiresAt.getTime())) {
    throw new AppError('Invalid campaign dates', 422);
  }
  if (expiresAt <= startsAt) {
    throw new AppError('Campaign expiry date must be after the start date', 422);
  }

  const status = String(body.status || 'ACTIVE').toUpperCase();
  if (!['ACTIVE', 'INACTIVE'].includes(status)) throw new AppError('Status must be ACTIVE or INACTIVE', 422);

  return {
    name,
    type,
    title,
    subtitle: body.subtitle ? String(body.subtitle).trim() : null,
    badge: body.badge ? String(body.badge).trim() : null,
    content: body.content ? String(body.content).trim() : null,
    imageUrl: body.imageUrl ? String(body.imageUrl).trim() : null,
    linkUrl: body.linkUrl ? String(body.linkUrl).trim() : null,
    bgColor: body.bgColor ? String(body.bgColor).trim() : '#10b981',
    textColor: body.textColor ? String(body.textColor).trim() : '#ffffff',
    startsAt,
    expiresAt,
    status,
    position: Number(body.position || 0),
    metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : null
  };
};

export const marketing = {
  campaigns: {
    list: asyncHandler(async (req, res) => {
      const { type, status } = req.query;
      const where = {};
      if (type) where.type = String(type).toUpperCase();
      if (status) where.status = String(status).toUpperCase();

      const rows = await prisma.marketingCampaign.findMany({
        where,
        orderBy: [{ position: 'asc' }, { createdAt: 'desc' }]
      });
      ok(res, rows);
    }),

    get: asyncHandler(async (req, res) => {
      const row = await prisma.marketingCampaign.findUnique({ where: { id: req.params.id } });
      if (!row) throw new AppError('Campaign not found', 404);
      ok(res, row);
    }),

    create: asyncHandler(async (req, res) => {
      const data = campaignData(req.body);
      const campaign = await prisma.marketingCampaign.create({ data });

      logAudit(req, {
        module: 'MARKETING',
        action: 'CAMPAIGN_CREATE',
        resourceId: campaign.id,
        resourceName: campaign.name,
        details: { campaign }
      });

      created(res, campaign, 'Marketing campaign created');
      cache.del('catalog:marketing:active');
    }),

    update: asyncHandler(async (req, res) => {
      const current = await prisma.marketingCampaign.findUnique({ where: { id: req.params.id } });
      if (!current) throw new AppError('Campaign not found', 404);

      const data = campaignData(req.body);
      const updated = await prisma.marketingCampaign.update({
        where: { id: req.params.id },
        data
      });

      logAudit(req, {
        module: 'MARKETING',
        action: 'CAMPAIGN_UPDATE',
        resourceId: updated.id,
        resourceName: updated.name,
        details: { before: current, after: updated }
      });

      cache.del('catalog:marketing:active');
      ok(res, updated, 'Marketing campaign updated');
    }),

    status: asyncHandler(async (req, res) => {
      const status = String(req.body.status || '').toUpperCase();
      if (!['ACTIVE', 'INACTIVE'].includes(status)) throw new AppError('Status must be ACTIVE or INACTIVE', 422);

      const updated = await prisma.marketingCampaign.update({
        where: { id: req.params.id },
        data: { status }
      });

      logAudit(req, {
        module: 'MARKETING',
        action: status === 'ACTIVE' ? 'CAMPAIGN_ACTIVATE' : 'CAMPAIGN_DEACTIVATE',
        resourceId: updated.id,
        resourceName: updated.name,
        details: { status }
      });

      ok(res, updated, status === 'ACTIVE' ? 'Campaign activated' : 'Campaign paused');
    }),

    remove: asyncHandler(async (req, res) => {
      const current = await prisma.marketingCampaign.findUnique({ where: { id: req.params.id } });
      if (!current) throw new AppError('Campaign not found', 404);

      await prisma.marketingCampaign.delete({ where: { id: req.params.id } });

      logAudit(req, {
        module: 'MARKETING',
        action: 'CAMPAIGN_DELETE',
        resourceId: current.id,
        resourceName: current.name,
        details: { deletedCampaign: current }
      });

      ok(res, null, 'Campaign permanently deleted');
    })
  },

  coupons: {
    usages: asyncHandler(async (req, res) => {
      const { couponId, page = 1, limit = 50 } = req.query;
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

      const where = couponId ? { couponId } : {};

      const [rows, total] = await Promise.all([
        prisma.couponUsage.findMany({
          where,
          include: {
            user: { select: { id: true, name: true, email: true, mobile: true } },
            coupon: { select: { id: true, code: true, type: true, discount: true } },
            order: { select: { id: true, orderNumber: true, grandTotal: true, couponDiscount: true, createdAt: true } }
          },
          orderBy: { usedAt: 'desc' },
          skip: (pageNum - 1) * limitNum,
          take: limitNum
        }),
        prisma.couponUsage.count({ where })
      ]);

      ok(res, {
        usages: rows,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.max(1, Math.ceil(total / limitNum))
        }
      });
    })
  },

  performance: asyncHandler(async (req, res) => {
    const [campaigns, totalCoupons, usages, ordersWithCoupon] = await Promise.all([
      prisma.marketingCampaign.findMany({ orderBy: { createdAt: 'desc' } }),
      prisma.coupon.count(),
      prisma.couponUsage.findMany({
        include: {
          coupon: { select: { code: true } },
          order: { select: { couponDiscount: true, grandTotal: true } }
        }
      }),
      prisma.order.findMany({
        where: { couponId: { not: null }, status: { not: 'CANCELLED' } },
        select: { couponDiscount: true, grandTotal: true, couponId: true }
      })
    ]);

    const totalDiscountGiven = ordersWithCoupon.reduce((sum, o) => sum + Number(o.couponDiscount || 0), 0);
    const totalCouponSales = ordersWithCoupon.reduce((sum, o) => sum + Number(o.grandTotal || 0), 0);

    // Group usage by coupon
    const codeCounts = {};
    for (const u of usages) {
      const code = u.coupon?.code || 'UNKNOWN';
      codeCounts[code] = (codeCounts[code] || 0) + 1;
    }
    const topCoupons = Object.entries(codeCounts)
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    ok(res, {
      totalCampaigns: campaigns.length,
      activeCampaigns: campaigns.filter(c => c.status === 'ACTIVE').length,
      totalCoupons,
      totalRedemptions: usages.length,
      totalDiscountGiven,
      totalCouponSales,
      topCoupons,
      campaigns
    });
  }),

  // Public customer endpoint for active announcements & popups
  publicActive: asyncHandler(async (req, res) => {
    const data = await cache.getOrSet('catalog:marketing:active', async () => {
      const now = new Date();
      const active = await prisma.marketingCampaign.findMany({
        where: {
          status: 'ACTIVE',
          startsAt: { lte: now },
          expiresAt: { gte: now }
        },
        orderBy: [{ position: 'asc' }, { createdAt: 'desc' }]
      });

      const announcement = active.find(c => c.type === 'ANNOUNCEMENT_BAR') || null;
      const popup = active.find(c => c.type === 'POPUP') || null;
      const festivalOffers = active.filter(c => c.type === 'FESTIVAL' || c.type === 'DISCOUNT_DEAL');

      return {
        announcement,
        popup,
        festivalOffers
      };
    }, 180);

    ok(res, data);
  }),

  // Track impressions / clicks
  track: asyncHandler(async (req, res) => {
    const { action } = req.body; // 'view' or 'click'
    const id = req.params.id;

    if (action === 'click') {
      await prisma.marketingCampaign.update({
        where: { id },
        data: { clickCount: { increment: 1 } }
      }).catch(() => {});
    } else {
      await prisma.marketingCampaign.update({
        where: { id },
        data: { viewCount: { increment: 1 } }
      }).catch(() => {});
    }

    ok(res, { success: true });
  })
};
