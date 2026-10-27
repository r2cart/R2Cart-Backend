import { rankingService } from '../services/ranking.service.js';
import { asyncHandler, ok } from '../utils/response.js';
import { cache } from '../services/cache.service.js';

export const homepageRankingController = {
  getBestSellers: asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
    const result = await cache.getOrSet('catalog:bestsellers', () => rankingService.getPublicBestSellers(), 300);
    return ok(res, result, 'Best sellers fetched');
  }),

  getTopPicks: asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
    const result = await cache.getOrSet('catalog:toppicks', () => rankingService.getPublicTopPicks(), 300);
    return ok(res, result, 'Top picks fetched');
  })
};
