import { asyncHandler, ok } from '../utils/response.js';
import { getDashboard } from '../services/dashboard.service.js';
import { hasPermission } from '../config/permissions.js';
import { cache } from '../services/cache.service.js';
import { resolveUserCategoryScope } from '../utils/category-scope.js';

export const dashboard = asyncHandler(async (req, res) => {
  const user = req.user;
  const isSuper = user?.role === 'SUPER_ADMIN' || user?.staffRole === 'SUPER_ADMIN';
  const canViewFinancial = isSuper || hasPermission(user, 'reports.view_financial');

  // Resolve category scope for this user
  const scope = await resolveUserCategoryScope(user);
  const allowedCategoryIds = scope.isScoped ? scope.categoryIds : null;

  // Use a distinct cache key per scope so Category Admin does not see or pollute global dashboard cache
  const cacheKey = scope.isScoped
    ? `admin:dashboard:cat:${[...scope.categoryIds].sort().join('_')}`
    : 'admin:dashboard';

  const cachedData = await cache.getOrSet(cacheKey, () => getDashboard(new Date(), allowedCategoryIds), 15);

  let data = cachedData;
  if (!canViewFinancial) {
    // Redact sensitive business revenue figures for restricted staff accounts without mutating cache
    data = JSON.parse(JSON.stringify(cachedData));
    if (data.stats) {
      data.stats.todayRevenue = null;
      data.stats.totalRevenue = null;
      data.stats.codCollected = null;
      data.stats.codPendingSettlement = null;
    }
    data.sales = [];
    if (Array.isArray(data.topProducts)) {
      data.topProducts = data.topProducts.map(prod => ({
        ...prod,
        revenue: null
      }));
    }
    data.hasFinancialAccess = false;
  } else {
    data = { ...cachedData, hasFinancialAccess: true };
  }

  // Surface assigned categories in dashboard metadata so the frontend can display workspace badge
  data.categoryScope = scope.isScoped
    ? { isScoped: true, categoryIds: scope.categoryIds }
    : { isScoped: false };

  ok(res, data, 'Dashboard fetched');
});
