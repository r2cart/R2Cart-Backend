import { rankingService } from '../services/ranking.service.js';
import { asyncHandler, ok } from '../utils/response.js';

export const homepageRankingController = {
  getBestSellers: asyncHandler(async (req, res) => {
    const result = await rankingService.getPublicBestSellers();
    return ok(res, result, 'Best sellers fetched');
  }),

  getTopPicks: asyncHandler(async (req, res) => {
    const result = await rankingService.getPublicTopPicks();
    return ok(res, result, 'Top picks fetched');
  })
};
