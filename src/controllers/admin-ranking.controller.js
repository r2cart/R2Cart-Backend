import { prisma } from '../config/prisma.js';
import { rankingService } from '../services/ranking.service.js';
import { asyncHandler, ok, AppError } from '../utils/response.js';

function validateConfig(config) {
  if (!config) throw new AppError('Configuration is required', 400);

  const { bestSellers, topPicks } = config;
  if (!bestSellers || !topPicks) {
    throw new AppError('Both Best Sellers and Top Picks configurations are required', 400);
  }

  // Validate Best Sellers
  const validBsModes = ['UNITS_SOLD', 'ORDERS', 'REVENUE', 'WEIGHTED_SCORE', 'CATEGORY_RELATIVE'];
  if (bestSellers.mode && !validBsModes.includes(bestSellers.mode)) {
    throw new AppError(`Invalid Best Sellers mode: ${bestSellers.mode}`, 400);
  }

  const validPeriods = [7, 30, 60, 90];
  if (bestSellers.periodDays && !validPeriods.includes(Number(bestSellers.periodDays))) {
    throw new AppError(`Invalid sales period. Must be 7, 30, 60, or 90 days.`, 400);
  }

  const validFallbackBehaviors = ['HIDE', 'CURATED_FALLBACK', 'WAIT'];
  if (bestSellers.fallbackBehavior && !validFallbackBehaviors.includes(bestSellers.fallbackBehavior)) {
    throw new AppError(`Invalid fallback behavior: ${bestSellers.fallbackBehavior}`, 400);
  }

  // Validate weights
  if (bestSellers.weights && typeof bestSellers.weights === 'object') {
    for (const [k, v] of Object.entries(bestSellers.weights)) {
      if (typeof v !== 'number' || v < 0) {
        throw new AppError(`Best sellers weight ${k} must be a non-negative number`, 400);
      }
    }
  }

  // Validate Top Picks
  const validTpModes = ['CURATED', 'ALGORITHMIC', 'HYBRID'];
  if (topPicks.mode && !validTpModes.includes(topPicks.mode)) {
    throw new AppError(`Invalid Top Picks mode: ${topPicks.mode}`, 400);
  }

  if (topPicks.weights && typeof topPicks.weights === 'object') {
    for (const [k, v] of Object.entries(topPicks.weights)) {
      if (typeof v !== 'number' || v < 0) {
        throw new AppError(`Top picks weight ${k} must be a non-negative number`, 400);
      }
    }
  }
}

export const adminRankingController = {
  // Get active and draft configs
  getConfig: asyncHandler(async (req, res) => {
    const active = await rankingService.getConfig('active');
    const draft = await rankingService.getConfig('draft');
    const historyCount = await prisma.homepageRankingHistory.count();

    return ok(res, {
      active,
      draft,
      historyCount
    }, 'Homepage ranking configurations retrieved');
  }),

  // Save draft configuration
  updateDraft: asyncHandler(async (req, res) => {
    const { bestSellers, topPicks } = req.body;
    validateConfig({ bestSellers, topPicks });

    const currentDraft = await rankingService.getConfig('draft');
    const updatedDraft = await prisma.homepageRankingConfig.upsert({
      where: { id: 'draft' },
      create: {
        id: 'draft',
        bestSellers,
        topPicks,
        version: currentDraft.version || 1
      },
      update: {
        bestSellers,
        topPicks
      }
    });

    return ok(res, updatedDraft, 'Draft configuration saved successfully');
  }),

  // Preview ranking (draft or active)
  preview: asyncHandler(async (req, res) => {
    const target = req.query.target === 'draft' ? 'draft' : 'active';
    const config = await rankingService.getConfig(target);

    const [bestSellersPreview, topPicksPreview] = await Promise.all([
      rankingService.calculateBestSellers(config.bestSellers, { preview: true }),
      rankingService.calculateTopPicks(config.topPicks, { preview: true })
    ]);

    return ok(res, {
      target,
      version: config.version,
      bestSellers: bestSellersPreview,
      topPicks: topPicksPreview
    }, `Preview generated for ${target} configuration`);
  }),

  // Publish draft configuration
  publish: asyncHandler(async (req, res) => {
    const draft = await rankingService.getConfig('draft');
    validateConfig(draft);

    const active = await rankingService.getConfig('active');
    const newVersion = (active.version || 1) + 1;
    const adminEmail = req.user?.email || 'admin@r2cart.com';
    const note = req.body.note || `Published version ${newVersion} by ${adminEmail}`;

    // Transactionally update active and save history
    const result = await prisma.$transaction(async (tx) => {
      // 1. Save history of current publish
      const historyEntry = await tx.homepageRankingHistory.create({
        data: {
          version: newVersion,
          bestSellers: draft.bestSellers,
          topPicks: draft.topPicks,
          publishedBy: adminEmail,
          note
        }
      });

      // 2. Update active configuration
      const publishedActive = await tx.homepageRankingConfig.upsert({
        where: { id: 'active' },
        create: {
          id: 'active',
          bestSellers: draft.bestSellers,
          topPicks: draft.topPicks,
          version: newVersion,
          publishedAt: new Date(),
          publishedBy: adminEmail
        },
        update: {
          bestSellers: draft.bestSellers,
          topPicks: draft.topPicks,
          version: newVersion,
          publishedAt: new Date(),
          publishedBy: adminEmail
        }
      });

      // 3. Keep draft in sync with newly published version
      await tx.homepageRankingConfig.update({
        where: { id: 'draft' },
        data: {
          version: newVersion
        }
      });

      return { publishedActive, historyEntry };
    });

    // Invalidate caches
    rankingService.invalidateCache();

    return ok(res, {
      version: newVersion,
      publishedAt: result.publishedActive.publishedAt,
      publishedBy: adminEmail
    }, `Version ${newVersion} published successfully to live store`);
  }),

  // Get publication history
  getHistory: asyncHandler(async (req, res) => {
    const history = await prisma.homepageRankingHistory.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    return ok(res, history, 'Publication history retrieved');
  }),

  // Rollback to previous version
  rollback: asyncHandler(async (req, res) => {
    const { historyId, version } = req.body;
    let targetEntry = null;

    if (historyId) {
      targetEntry = await prisma.homepageRankingHistory.findUnique({
        where: { id: historyId }
      });
    } else if (version) {
      targetEntry = await prisma.homepageRankingHistory.findFirst({
        where: { version: Number(version) },
        orderBy: { createdAt: 'desc' }
      });
    }

    if (!targetEntry) {
      throw new AppError('Specified historical version not found for rollback', 404);
    }

    const active = await rankingService.getConfig('active');
    const newVersion = (active.version || 1) + 1;
    const adminEmail = req.user?.email || 'admin@r2cart.com';
    const note = `Rolled back to version ${targetEntry.version} by ${adminEmail}`;

    await prisma.$transaction(async (tx) => {
      // 1. Record rollback in history
      await tx.homepageRankingHistory.create({
        data: {
          version: newVersion,
          bestSellers: targetEntry.bestSellers,
          topPicks: targetEntry.topPicks,
          publishedBy: adminEmail,
          note
        }
      });

      // 2. Overwrite active with historical config
      await tx.homepageRankingConfig.update({
        where: { id: 'active' },
        data: {
          bestSellers: targetEntry.bestSellers,
          topPicks: targetEntry.topPicks,
          version: newVersion,
          publishedAt: new Date(),
          publishedBy: adminEmail
        }
      });

      // 3. Also update draft to match rollback
      await tx.homepageRankingConfig.update({
        where: { id: 'draft' },
        data: {
          bestSellers: targetEntry.bestSellers,
          topPicks: targetEntry.topPicks,
          version: newVersion
        }
      });
    });

    rankingService.invalidateCache();

    return ok(res, {
      restoredFromVersion: targetEntry.version,
      newVersion,
      rolledBackBy: adminEmail
    }, `Successfully rolled back to configuration version ${targetEntry.version}`);
  }),

  // Manual cache refresh
  refreshCache: asyncHandler(async (req, res) => {
    rankingService.invalidateCache();
    await Promise.all([
      rankingService.getPublicBestSellers(),
      rankingService.getPublicTopPicks()
    ]);
    return ok(res, null, 'Ranking cache refreshed successfully');
  })
};
