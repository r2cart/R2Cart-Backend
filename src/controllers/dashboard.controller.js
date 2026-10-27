import { asyncHandler, ok } from '../utils/response.js';
import { getDashboard } from '../services/dashboard.service.js';
import { hasPermission } from '../config/permissions.js';
import { cache } from '../services/cache.service.js';

export const dashboard = asyncHandler(async (req, res) => {
  const cachedData = await cache.getOrSet('admin:dashboard', () => getDashboard(), 15);
  const user = req.user;
  const isSuper = user?.role === 'SUPER_ADMIN' || user?.staffRole === 'SUPER_ADMIN';
  const canViewFinancial = isSuper || hasPermission(user, 'reports.view_financial');

  let data = cachedData;
  if (!canViewFinancial) {
    // Redact sensitive business revenue figures for restricted staff accounts without mutating cache
    data = JSON.parse(JSON.stringify(cachedData));
    if (data.stats) {
      data.stats.todayRevenue = null;
      data.stats.totalRevenue = null;
      data.stats.codCollected = null;
      data.stats.codPending = null;
    }
    data.weeklySales = [];
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

  ok(res, data, 'Dashboard fetched');
});

