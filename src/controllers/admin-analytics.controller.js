import { prisma } from '../config/prisma.js';
import { AppError, asyncHandler, ok } from '../utils/response.js';
import {
  getReportingPeriodBounds,
  calculatePeriodFinancials,
  buildSalesTrendSeries,
  getProductPerformanceReport,
  getInventoryValuationReport,
  getCashFlowReport,
  getSupplierPayablesSummary,
  getSmartBusinessInsights,
  getSalesProfitDashboard
} from '../services/analytics.service.js';
import {
  recordOpeningStockCost,
  consumeWastageFifoBatches
} from '../services/fifo.service.js';
import { logAudit } from '../services/audit.service.js';
import { resolveUserCategoryScope, verifyProductCategoryAccess } from '../utils/category-scope.js';

export const analytics = {
  /**
   * Main Business Analytics Overview with PoP comparisons.
   */
  overview: asyncHandler(async (req, res) => {
    const { preset = 'thisMonth', startDate: qStart, endDate: qEnd } = req.query;
    const scope = await resolveUserCategoryScope(req.user);
    const allowedCategoryIds = scope.isScoped ? scope.categoryIds : null;

    const bounds = getReportingPeriodBounds(preset, qStart, qEnd);
    const [currentFinancials, previousFinancials, inventoryVal, cashFlow, insights] = await Promise.all([
      calculatePeriodFinancials(bounds.startDate, bounds.endDate, allowedCategoryIds),
      calculatePeriodFinancials(bounds.prevStartDate, bounds.prevEndDate, allowedCategoryIds),
      getInventoryValuationReport(allowedCategoryIds),
      getCashFlowReport(bounds.startDate, bounds.endDate),
      getSmartBusinessInsights(bounds.startDate, bounds.endDate)
    ]);

    // Calculate percentage changes safely
    const calcDelta = (cur, prev) => {
      const c = Number(cur || 0);
      const p = Number(prev || 0);
      if (p === 0) return c === 0 ? 0 : 100;
      return Number((((c - p) / Math.abs(p)) * 100).toFixed(1));
    };

    const deltas = {
      grossSales: calcDelta(currentFinancials.grossProductSales, previousFinancials.grossProductSales),
      netSales: calcDelta(currentFinancials.netProductSales, previousFinancials.netProductSales),
      orders: calcDelta(currentFinancials.completedOrderCount, previousFinancials.completedOrderCount),
      cogs: calcDelta(currentFinancials.verifiedCogs, previousFinancials.verifiedCogs),
      grossProfit: calcDelta(currentFinancials.grossProfit, previousFinancials.grossProfit),
      netOperatingProfit: calcDelta(currentFinancials.netOperatingProfit, previousFinancials.netOperatingProfit),
      expenses: calcDelta(currentFinancials.totalOperatingExpenses, previousFinancials.totalOperatingExpenses)
    };

    ok(res, {
      period: {
        preset: bounds.preset,
        label: bounds.label,
        startDate: bounds.startDate.toISOString(),
        endDate: bounds.endDate.toISOString(),
        startFormatted: bounds.startFormatted,
        endFormatted: bounds.endFormatted,
        timezone: 'Asia/Kolkata'
      },
      current: currentFinancials,
      previous: previousFinancials,
      deltas,
      inventoryValuation: {
        totalValuation: inventoryVal.totalValuation,
        totalSellableUnits: inventoryVal.totalSellableUnits,
        totalUncostedUnits: inventoryVal.totalUncostedUnits,
        reconciliationCoveragePercent: inventoryVal.reconciliationCoveragePercent
      },
      cashFlow: {
        totalInflows: cashFlow.totalInflows,
        totalOutflows: cashFlow.totalOutflows,
        netCashFlow: cashFlow.netCashFlow,
        codCashCollected: cashFlow.codCashCollected,
        codCashSettled: cashFlow.codCashSettled,
        supplierPayments: cashFlow.supplierPayments,
        operatingExpensesPaid: cashFlow.operatingExpensesPaid
      },
      insights
    }, 'Business analytics overview fetched');
  }),

  /**
   * Direct Retail Sales & Profit Report (Today, Yesterday, 7 Days, 30 Days, Custom)
   */
  salesProfit: asyncHandler(async (req, res) => {
    const { preset = 'today', startDate: qStart, endDate: qEnd, date: qDate } = req.query;
    const start = qDate || qStart;
    const end = qDate || qEnd || start;
    const scope = await resolveUserCategoryScope(req.user);
    const allowedCategoryIds = scope.isScoped ? scope.categoryIds : null;
    const report = await getSalesProfitDashboard(preset, start, end, allowedCategoryIds);
    ok(res, report, 'Sales & profit report fetched');
  }),

  /**
   * Day-wise / Month-wise Sales & Profit Trends.
   */
  salesTrend: asyncHandler(async (req, res) => {
    const { preset = 'thisMonth', startDate: qStart, endDate: qEnd } = req.query;
    const scope = await resolveUserCategoryScope(req.user);
    const allowedCategoryIds = scope.isScoped ? scope.categoryIds : null;
    const bounds = getReportingPeriodBounds(preset, qStart, qEnd);
    const series = await buildSalesTrendSeries(bounds.startDate, bounds.endDate, allowedCategoryIds);

    ok(res, {
      period: bounds,
      series
    }, 'Sales trend fetched');
  }),

  /**
   * Product-level sales, FIFO COGS, and margin breakdown.
   */
  productPerformance: asyncHandler(async (req, res) => {
    const { preset = 'thisMonth', startDate: qStart, endDate: qEnd } = req.query;
    const scope = await resolveUserCategoryScope(req.user);
    const allowedCategoryIds = scope.isScoped ? scope.categoryIds : null;
    const bounds = getReportingPeriodBounds(preset, qStart, qEnd);
    const products = await getProductPerformanceReport(bounds.startDate, bounds.endDate, allowedCategoryIds);

    ok(res, {
      period: bounds,
      products
    }, 'Product performance fetched');
  }),

  /**
   * Batch-wise FIFO inventory valuation and reconciliation status.
   */
  inventoryValuation: asyncHandler(async (req, res) => {
    const scope = await resolveUserCategoryScope(req.user);
    const allowedCategoryIds = scope.isScoped ? scope.categoryIds : null;
    const valuation = await getInventoryValuationReport(allowedCategoryIds);
    ok(res, valuation, 'Inventory valuation fetched');
  }),

  /**
   * Reconciles opening cost for legacy products with unknown purchase cost.
   * Super Admin only.
   */
  reconcileOpeningStock: asyncHandler(async (req, res) => {
    const { productId, quantity, unitCost, notes } = req.body;
    if (!productId || !quantity || !unitCost) {
      throw new AppError('Product ID, quantity, and unit cost are required', 422);
    }

    const batch = await prisma.$transaction(async tx => {
      return recordOpeningStockCost(tx, {
        productId,
        quantity: Number(quantity),
        unitCost: Number(unitCost),
        notes: notes || null,
        adminUser: req.user
      });
    });

    logAudit(req, {
      module: 'FINANCIAL',
      action: 'RECONCILE_OPENING_COST',
      resourceId: batch.id,
      resourceName: batch.batchNumber,
      details: {
        productId,
        quantity: Number(quantity),
        unitCost: Number(unitCost),
        notes
      }
    });

    ok(res, batch, 'Opening inventory cost batch created successfully');
  }),

  /**
   * Records damaged or expired stock loss and writes off FIFO batch cost.
   */
  recordWastage: asyncHandler(async (req, res) => {
    const { productId, quantity, reason, notes } = req.body;
    if (!productId || !quantity) {
      throw new AppError('Product ID and quantity are required', 422);
    }

    const scope = await resolveUserCategoryScope(req.user);
    await verifyProductCategoryAccess(productId, scope);

    const result = await prisma.$transaction(async tx => {
      return consumeWastageFifoBatches(tx, {
        productId,
        quantity: Number(quantity),
        reason: reason || 'DAMAGED',
        notes: notes || null,
        adminUser: req.user
      });
    });

    logAudit(req, {
      module: 'INVENTORY',
      action: 'STOCK_WASTAGE_WRITEOFF',
      resourceId: productId,
      resourceName: `${result.quantityRemoved} units written off`,
      details: {
        productId,
        quantity: result.quantityRemoved,
        costLoss: result.totalCostLoss,
        reason
      }
    });

    ok(res, result, 'Stock wastage written off successfully');
  }),

  /**
   * Cash Flow Statement and Receivables/Payables summary.
   */
  cashFlow: asyncHandler(async (req, res) => {
    const { preset = 'thisMonth', startDate: qStart, endDate: qEnd } = req.query;
    const bounds = getReportingPeriodBounds(preset, qStart, qEnd);
    const [cashFlow, supplierPayables] = await Promise.all([
      getCashFlowReport(bounds.startDate, bounds.endDate),
      getSupplierPayablesSummary()
    ]);

    ok(res, {
      period: bounds,
      cashFlow,
      supplierPayables
    }, 'Cash flow report fetched');
  }),

  /**
   * Smart Business Insights (Explainable, advisory metrics).
   */
  insights: asyncHandler(async (req, res) => {
    const { preset = 'thisMonth', startDate: qStart, endDate: qEnd } = req.query;
    const bounds = getReportingPeriodBounds(preset, qStart, qEnd);
    const insights = await getSmartBusinessInsights(bounds.startDate, bounds.endDate);

    ok(res, {
      period: bounds,
      insights
    }, 'Smart insights fetched');
  }),

  /**
   * Exports full filtered report data as CSV.
   */
  exportCsv: asyncHandler(async (req, res) => {
    const { reportType } = req.params;
    const { preset = 'thisMonth', startDate: qStart, endDate: qEnd } = req.query;
    const scope = await resolveUserCategoryScope(req.user);
    const allowedCategoryIds = scope.isScoped ? scope.categoryIds : null;
    const bounds = getReportingPeriodBounds(preset, qStart, qEnd);

    if (scope.isScoped && reportType === 'suppliers') {
      throw new AppError('Access denied: Supplier exports are restricted to store managers and super admins', 403);
    }

    let csvContent = '';
    const safeCsvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

    if (reportType === 'sales') {
      const series = await buildSalesTrendSeries(bounds.startDate, bounds.endDate, allowedCategoryIds);
      const headers = ['Date', 'Gross Sales (INR)', 'Net Sales (INR)', 'FIFO COGS (INR)', 'Gross Profit (INR)', 'Orders Count'];
      const rows = series.map(s => [s.date, s.grossSales, s.netSales, s.cogs, s.grossProfit, s.ordersCount]);
      csvContent = [headers.join(','), ...rows.map(r => r.map(safeCsvCell).join(','))].join('\n');
    } else if (reportType === 'products') {
      const products = await getProductPerformanceReport(bounds.startDate, bounds.endDate, allowedCategoryIds);
      const headers = ['Product', 'SKU', 'Category', 'Units Sold', 'Gross Sales (INR)', 'FIFO COGS (INR)', 'Gross Profit (INR)', 'Margin %', 'Stock Remaining', 'Cost Verified'];
      const rows = products.map(p => [p.name, p.sku, p.category, p.unitsSold, p.grossSales, p.cogs, p.grossProfit, `${p.marginPercent}%`, p.currentStock, p.isCostComplete ? 'YES' : 'INCOMPLETE']);
      csvContent = [headers.join(','), ...rows.map(r => r.map(safeCsvCell).join(','))].join('\n');
    } else if (reportType === 'inventory') {
      const valuation = await getInventoryValuationReport(allowedCategoryIds);
      const headers = ['Product', 'SKU', 'Category', 'Current Stock', 'Tracked Batch Units', 'Uncosted Legacy Units', 'FIFO Valuation (INR)', 'Status'];
      const rows = valuation.products.map(p => [p.name, p.sku, p.category, p.stock, p.batchUnits, p.uncostedUnits, p.valuation, p.isFullyReconciled ? 'RECONCILED' : 'NEEDS_COST']);
      csvContent = [headers.join(','), ...rows.map(r => r.map(safeCsvCell).join(','))].join('\n');
    } else if (reportType === 'suppliers') {
      const payables = await getSupplierPayablesSummary();
      const headers = ['Supplier Code', 'Supplier Name', 'Contact Person', 'Phone', 'Total Purchases (INR)', 'Payments Made (INR)', 'Outstanding Balance (INR)', 'Status'];
      const rows = payables.suppliers.map(s => [s.code, s.name, s.contactPerson || '—', s.phone || '—', s.totalPurchases, s.totalPayments, s.outstandingBalance, s.status]);
      csvContent = [headers.join(','), ...rows.map(r => r.map(safeCsvCell).join(','))].join('\n');
    } else if (reportType === 'pl') {
      const fin = await calculatePeriodFinancials(bounds.startDate, bounds.endDate, allowedCategoryIds);
      const lines = [
        ['Metric', 'Amount (INR)'],
        ['Gross Product Sales', fin.grossProductSales],
        ['Discounts & Reductions', fin.totalDiscounts],
        ['Net Product Sales', fin.netProductSales],
        ['Cost of Goods Sold (FIFO)', fin.verifiedCogs],
        ['Gross Profit', fin.grossProfit],
        ['Gross Margin %', `${fin.grossMarginPercentage}%`],
        ['Operating Expenses', fin.totalOperatingExpenses],
        ['Net Operating Profit', fin.netOperatingProfit],
        ['Net Operating Margin %', `${fin.netOperatingMarginPercentage}%`],
        ['Cost Coverage %', `${fin.costCoveragePercentage}%`]
      ];
      csvContent = lines.map(r => r.map(safeCsvCell).join(',')).join('\n');
    } else {
      throw new AppError('Invalid report type for export', 400);
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="r2cart_${reportType}_${bounds.preset}_${Date.now()}.csv"`);
    res.status(200).send(csvContent);
  })
};
