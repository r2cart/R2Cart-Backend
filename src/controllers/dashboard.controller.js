import { asyncHandler, ok } from '../utils/response.js';
import { getDashboard } from '../services/dashboard.service.js';
import { hasPermission } from '../config/permissions.js';

export const dashboard = asyncHandler(async (req, res) => {
  const data = await getDashboard();
  const user = req.user;
  const isSuper = user?.role === 'SUPER_ADMIN' || user?.staffRole === 'SUPER_ADMIN';
  const canViewFinancial = isSuper || hasPermission(user, 'reports.view_financial');

  if (!canViewFinancial) {
    // Redact sensitive business revenue figures for restricted staff accounts
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
    data.hasFinancialAccess = true;
  }

  ok(res, data, 'Dashboard fetched');
});
