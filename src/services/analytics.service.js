import { prisma } from '../config/prisma.js';

/**
 * R2Cart Business Analytics & Profit Management Service
 * 
 * Implements strict accounting principles, FIFO Cost of Goods Sold (COGS),
 * date range calculations in Asia/Kolkata timezone, Gross & Net Operating Profit,
 * Inventory Valuation, Cash Flow reconciliation, and Smart Business Insights.
 */

// Timezone offset for Asia/Kolkata is +05:30 (330 minutes)
const KOLKATA_OFFSET_MS = 330 * 60 * 1000;

/**
 * Returns UTC Date objects for start and end boundaries in Asia/Kolkata timezone,
 * alongside equivalent previous comparison period boundaries.
 */
export function getReportingPeriodBounds(preset = 'thisMonth', customStart, customEnd, now = new Date()) {
  const localNow = new Date(now.getTime() + KOLKATA_OFFSET_MS);
  const year = localNow.getUTCFullYear();
  const month = localNow.getUTCMonth(); // 0-indexed
  const date = localNow.getUTCDate();

  let startLocal, endLocal;
  let prevStartLocal, prevEndLocal;
  let label = preset;

  const startOfDay = (y, m, d) => new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
  const endOfDay = (y, m, d) => new Date(Date.UTC(y, m, d, 23, 59, 59, 999));

  switch (preset) {
    case 'today': {
      startLocal = startOfDay(year, month, date);
      endLocal = endOfDay(year, month, date);
      // Previous period: yesterday
      prevStartLocal = startOfDay(year, month, date - 1);
      prevEndLocal = endOfDay(year, month, date - 1);
      label = 'Today';
      break;
    }
    case 'yesterday': {
      startLocal = startOfDay(year, month, date - 1);
      endLocal = endOfDay(year, month, date - 1);
      prevStartLocal = startOfDay(year, month, date - 2);
      prevEndLocal = endOfDay(year, month, date - 2);
      label = 'Yesterday';
      break;
    }
    case 'last7days': {
      startLocal = startOfDay(year, month, date - 6);
      endLocal = endOfDay(year, month, date);
      prevStartLocal = startOfDay(year, month, date - 13);
      prevEndLocal = endOfDay(year, month, date - 7);
      label = 'Last 7 Days';
      break;
    }
    case 'last30days': {
      startLocal = startOfDay(year, month, date - 29);
      endLocal = endOfDay(year, month, date);
      prevStartLocal = startOfDay(year, month, date - 59);
      prevEndLocal = endOfDay(year, month, date - 30);
      label = 'Last 30 Days';
      break;
    }
    case 'lastMonth': {
      // Previous calendar month
      const prevMonthYear = month === 0 ? year - 1 : year;
      const prevMonth = month === 0 ? 11 : month - 1;
      const daysInPrevMonth = new Date(Date.UTC(prevMonthYear, prevMonth + 1, 0)).getUTCDate();

      startLocal = startOfDay(prevMonthYear, prevMonth, 1);
      endLocal = endOfDay(prevMonthYear, prevMonth, daysInPrevMonth);

      // Equivalent prior month
      const priorMonthYear = prevMonth === 0 ? prevMonthYear - 1 : prevMonthYear;
      const priorMonth = prevMonth === 0 ? 11 : prevMonth - 1;
      const daysInPriorMonth = new Date(Date.UTC(priorMonthYear, priorMonth + 1, 0)).getUTCDate();
      prevStartLocal = startOfDay(priorMonthYear, priorMonth, 1);
      prevEndLocal = endOfDay(priorMonthYear, priorMonth, daysInPriorMonth);
      label = 'Previous Month';
      break;
    }
    case 'thisYear': {
      startLocal = startOfDay(year, 0, 1);
      endLocal = endOfDay(year, month, date);
      prevStartLocal = startOfDay(year - 1, 0, 1);
      prevEndLocal = endOfDay(year - 1, month, date);
      label = 'Current Year';
      break;
    }
    case 'custom': {
      if (customStart && customEnd) {
        const [sy, sm, sd] = customStart.split('-').map(Number);
        const [ey, em, ed] = customEnd.split('-').map(Number);
        startLocal = startOfDay(sy, sm - 1, sd);
        endLocal = endOfDay(ey, em - 1, ed);

        const durationMs = endLocal.getTime() - startLocal.getTime();
        prevEndLocal = new Date(startLocal.getTime() - 1);
        prevStartLocal = new Date(prevEndLocal.getTime() - durationMs);
        label = `${customStart} to ${customEnd}`;
      } else {
        startLocal = startOfDay(year, month, 1);
        endLocal = endOfDay(year, month, date);
        prevStartLocal = startOfDay(year, month - 1, 1);
        prevEndLocal = endOfDay(year, month - 1, date);
        label = 'Current Month';
      }
      break;
    }
    case 'thisMonth':
    default: {
      startLocal = startOfDay(year, month, 1);
      endLocal = endOfDay(year, month, date);
      // Previous month up to same relative day
      const prevMonthYear = month === 0 ? year - 1 : year;
      const prevMonth = month === 0 ? 11 : month - 1;
      const daysInPrevMonth = new Date(Date.UTC(prevMonthYear, prevMonth + 1, 0)).getUTCDate();
      const clampedDate = Math.min(date, daysInPrevMonth);

      prevStartLocal = startOfDay(prevMonthYear, prevMonth, 1);
      prevEndLocal = endOfDay(prevMonthYear, prevMonth, clampedDate);
      label = 'Current Month';
      break;
    }
  }

  // Convert local UTC representations to absolute UTC boundaries by subtracting offset
  const startDate = new Date(startLocal.getTime() - KOLKATA_OFFSET_MS);
  const endDate = new Date(endLocal.getTime() - KOLKATA_OFFSET_MS);
  const prevStartDate = new Date(prevStartLocal.getTime() - KOLKATA_OFFSET_MS);
  const prevEndDate = new Date(prevEndLocal.getTime() - KOLKATA_OFFSET_MS);

  return {
    preset,
    label,
    startDate,
    endDate,
    prevStartDate,
    prevEndDate,
    startFormatted: startDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }),
    endFormatted: endDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' })
  };
}

/**
 * Calculates percentage change safely handling zero denominator.
 */
function safePercentageChange(current, previous) {
  const c = Number(current || 0);
  const p = Number(previous || 0);
  if (p === 0) {
    if (c === 0) return 0;
    return 100.0;
  }
  return Number((((c - p) / Math.abs(p)) * 100).toFixed(1));
}

/**
 * Computes core business analytics and P&L metrics for a given date range.
 */
export async function calculatePeriodFinancials(startDate, endDate) {
  // 1. Fetch eligible DELIVERED orders within the period
  const deliveredOrders = await prisma.order.findMany({
    where: {
      status: 'DELIVERED',
      createdAt: { gte: startDate, lte: endDate }
    },
    include: {
      items: true,
      coupon: true,
      fifoAllocations: {
        where: { status: 'COMMITTED' }
      }
    }
  });

  let completedOrderCount = deliveredOrders.length;
  let grossProductSales = 0;
  let productDiscounts = 0;
  let couponDiscounts = 0;
  let deliveryFeesCollected = 0;
  let grandTotalSales = 0;
  let totalUnitsSold = 0;

  // Track FIFO COGS
  let verifiedCogs = 0;
  let uncostedUnitsCount = 0;
  let totalAllocatedUnits = 0;

  for (const order of deliveredOrders) {
    productDiscounts += Number(order.productDiscount || 0);
    couponDiscounts += Number(order.couponDiscount || 0);
    deliveryFeesCollected += Number(order.deliveryFee || 0);
    grandTotalSales += Number(order.grandTotal || 0);

    for (const item of order.items) {
      const lineItemSales = Number(item.price) * item.quantity;
      grossProductSales += lineItemSales;
      totalUnitsSold += item.quantity;
    }

    // Tally FIFO allocations for this delivered order
    for (const alloc of order.fifoAllocations) {
      totalAllocatedUnits += alloc.quantity;
      if (alloc.isCostKnown && alloc.unitCost > 0) {
        verifiedCogs += Number(alloc.totalCost);
      } else {
        uncostedUnitsCount += alloc.quantity;
      }
    }
  }

  grossProductSales = Number(grossProductSales.toFixed(2));
  const totalDiscounts = Number((productDiscounts + couponDiscounts).toFixed(2));
  const netProductSales = Math.max(0, Number((grossProductSales - totalDiscounts).toFixed(2)));
  verifiedCogs = Number(verifiedCogs.toFixed(2));

  // Gross profit & Gross margin
  const grossProfit = Number((netProductSales - verifiedCogs).toFixed(2));
  const grossMarginPercentage = netProductSales > 0 ? Number(((grossProfit / netProductSales) * 100).toFixed(1)) : 0;
  const costCoveragePercentage = totalUnitsSold > 0 ? Number((((totalUnitsSold - uncostedUnitsCount) / totalUnitsSold) * 100).toFixed(1)) : 100;
  const averageOrderValue = completedOrderCount > 0 ? Number((grandTotalSales / completedOrderCount).toFixed(2)) : 0;

  // 2. Fetch Operating Expenses in the period
  const expenses = await prisma.expense.findMany({
    where: {
      expenseDate: { gte: startDate, lte: endDate }
    }
  });

  const totalOperatingExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const netOperatingProfit = Number((grossProfit - totalOperatingExpenses).toFixed(2));
  const netOperatingMarginPercentage = netProductSales > 0 ? Number(((netOperatingProfit / netProductSales) * 100).toFixed(1)) : 0;

  return {
    completedOrderCount,
    totalUnitsSold,
    averageOrderValue,
    grossProductSales,
    totalDiscounts,
    productDiscounts: Number(productDiscounts.toFixed(2)),
    couponDiscounts: Number(couponDiscounts.toFixed(2)),
    deliveryFeesCollected: Number(deliveryFeesCollected.toFixed(2)),
    grandTotalSales: Number(grandTotalSales.toFixed(2)),
    netProductSales,
    verifiedCogs,
    grossProfit,
    grossMarginPercentage,
    totalOperatingExpenses: Number(totalOperatingExpenses.toFixed(2)),
    netOperatingProfit,
    netOperatingMarginPercentage,
    costCoveragePercentage,
    uncostedUnitsCount,
    isCostIncomplete: uncostedUnitsCount > 0
  };
}

/**
 * Builds day-wise and monthly trend series for charts.
 */
export async function buildSalesTrendSeries(startDate, endDate) {
  const deliveredOrders = await prisma.order.findMany({
    where: {
      status: 'DELIVERED',
      createdAt: { gte: startDate, lte: endDate }
    },
    include: {
      items: true,
      fifoAllocations: { where: { status: 'COMMITTED' } }
    },
    orderBy: { createdAt: 'asc' }
  });

  // Group by local calendar day (YYYY-MM-DD in Asia/Kolkata)
  const dayMap = new Map();

  for (const order of deliveredOrders) {
    const localDate = new Date(order.createdAt.getTime() + KOLKATA_OFFSET_MS);
    const dayKey = localDate.toISOString().slice(0, 10); // YYYY-MM-DD

    const current = dayMap.get(dayKey) || {
      date: dayKey,
      label: new Date(order.createdAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' }),
      grossSales: 0,
      netSales: 0,
      cogs: 0,
      grossProfit: 0,
      ordersCount: 0
    };

    let itemGross = 0;
    for (const itm of order.items) {
      itemGross += Number(itm.price) * itm.quantity;
    }
    const discount = Number(order.productDiscount || 0) + Number(order.couponDiscount || 0);
    const net = Math.max(0, itemGross - discount);

    let orderCogs = 0;
    for (const alloc of order.fifoAllocations) {
      if (alloc.isCostKnown) orderCogs += Number(alloc.totalCost);
    }

    current.grossSales += itemGross;
    current.netSales += net;
    current.cogs += orderCogs;
    current.grossProfit += (net - orderCogs);
    current.ordersCount += 1;

    dayMap.set(dayKey, current);
  }

  return [...dayMap.values()].map(d => ({
    ...d,
    grossSales: Number(d.grossSales.toFixed(2)),
    netSales: Number(d.netSales.toFixed(2)),
    cogs: Number(d.cogs.toFixed(2)),
    grossProfit: Number(d.grossProfit.toFixed(2))
  }));
}

/**
 * Calculates product performance table with units, revenue, FIFO COGS, and margin.
 */
export async function getProductPerformanceReport(startDate, endDate) {
  const deliveredOrders = await prisma.order.findMany({
    where: {
      status: 'DELIVERED',
      createdAt: { gte: startDate, lte: endDate }
    },
    include: {
      items: {
        include: {
          product: {
            include: {
              category: { select: { id: true, name: true, slug: true } },
              images: { take: 1, orderBy: { position: 'asc' } }
            }
          }
        }
      },
      fifoAllocations: { where: { status: 'COMMITTED' } }
    }
  });

  const productMap = new Map();

  for (const order of deliveredOrders) {
    // Map order fifo allocations by productId
    const orderAllocations = new Map();
    for (const alloc of order.fifoAllocations) {
      const cur = orderAllocations.get(alloc.productId) || { cogs: 0, uncosted: 0 };
      if (alloc.isCostKnown && alloc.unitCost > 0) {
        cur.cogs += Number(alloc.totalCost);
      } else {
        cur.uncosted += alloc.quantity;
      }
      orderAllocations.set(alloc.productId, cur);
    }

    for (const item of order.items) {
      const pid = item.productId;
      const current = productMap.get(pid) || {
        id: pid,
        name: item.name,
        sku: item.sku,
        unit: item.unit,
        category: item.product?.category?.name || 'General',
        image: item.product?.images?.[0]?.url || item.image || null,
        currentStock: item.product?.stock ?? 0,
        unitsSold: 0,
        ordersCount: 0,
        grossSales: 0,
        cogs: 0,
        uncostedUnits: 0
      };

      current.unitsSold += item.quantity;
      current.ordersCount += 1;
      current.grossSales += Number(item.price) * item.quantity;

      const alloc = orderAllocations.get(pid);
      if (alloc) {
        current.cogs += alloc.cogs;
        current.uncostedUnits += alloc.uncosted;
      }

      productMap.set(pid, current);
    }
  }

  return [...productMap.values()].map(p => {
    const grossSales = Number(p.grossSales.toFixed(2));
    const cogs = Number(p.cogs.toFixed(2));
    const grossProfit = Number((grossSales - cogs).toFixed(2));
    const marginPercent = grossSales > 0 ? Number(((grossProfit / grossSales) * 100).toFixed(1)) : 0;
    const isCostComplete = p.uncostedUnits === 0;

    return {
      ...p,
      grossSales,
      cogs,
      grossProfit,
      marginPercent,
      isCostComplete
    };
  }).sort((a, b) => b.grossSales - a.grossSales);
}

/**
 * Calculates current and batch-wise FIFO inventory valuation.
 */
export async function getInventoryValuationReport() {
  const [products, activeBatches] = await Promise.all([
    prisma.product.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        sku: true,
        unit: true,
        stock: true,
        mrp: true,
        price: true,
        lowStockThreshold: true,
        category: { select: { id: true, name: true, slug: true } }
      },
      orderBy: { name: 'asc' }
    }),
    prisma.fifoCostBatch.findMany({
      where: { quantityRemaining: { gt: 0 } },
      include: {
        supplier: { select: { id: true, name: true, code: true } },
        purchase: { select: { id: true, purchaseNumber: true, invoiceNumber: true } }
      },
      orderBy: [{ receivedDate: 'asc' }, { createdAt: 'asc' }]
    })
  ]);

  // Group active batches by productId
  const batchMap = new Map();
  for (const b of activeBatches) {
    const list = batchMap.get(b.productId) || [];
    list.push({
      id: b.id,
      batchNumber: b.batchNumber,
      supplierName: b.supplier?.name || (b.isOpeningStock ? 'Opening Stock' : 'Direct Receipt'),
      purchaseNumber: b.purchase?.purchaseNumber || null,
      receivedDate: b.receivedDate,
      quantityReceived: b.quantityReceived,
      quantityRemaining: b.quantityRemaining,
      originalUnitCost: Number(b.originalUnitCost),
      effectiveUnitCost: Number(b.effectiveUnitCost),
      batchValuation: Number((Number(b.effectiveUnitCost) * b.quantityRemaining).toFixed(2)),
      isVerified: b.isVerified,
      isOpeningStock: b.isOpeningStock
    });
    batchMap.set(b.productId, list);
  }

  let totalValuation = 0;
  let totalSellableUnits = 0;
  let totalUncostedUnits = 0;

  const productValuations = products.map(p => {
    const batches = batchMap.get(p.id) || [];
    const batchUnits = batches.reduce((sum, b) => sum + b.quantityRemaining, 0);
    const productValuation = batches.reduce((sum, b) => sum + b.batchValuation, 0);

    // If product has more stock than tracked in FIFO batches, difference is uncosted legacy stock
    const uncostedUnits = Math.max(0, p.stock - batchUnits);

    totalValuation += productValuation;
    totalSellableUnits += p.stock;
    totalUncostedUnits += uncostedUnits;

    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      unit: p.unit,
      category: p.category?.name || 'General',
      stock: p.stock,
      lowStockThreshold: p.lowStockThreshold,
      batchesCount: batches.length,
      batchUnits,
      uncostedUnits,
      valuation: Number(productValuation.toFixed(2)),
      isFullyReconciled: uncostedUnits === 0,
      batches
    };
  });

  return {
    totalValuation: Number(totalValuation.toFixed(2)),
    totalSellableUnits,
    totalUncostedUnits,
    reconciliationCoveragePercent: totalSellableUnits > 0 ? Number((((totalSellableUnits - totalUncostedUnits) / totalSellableUnits) * 100).toFixed(1)) : 100,
    products: productValuations
  };
}

/**
 * Calculates Cash Flow statement based on recorded business transactions.
 */
export async function getCashFlowReport(startDate, endDate) {
  const [
    codCollectedAgg,
    codSettledAgg,
    supplierPaymentsAgg,
    expensePaymentsAgg,
    expensesByCategory
  ] = await Promise.all([
    prisma.codCollection.aggregate({
      _sum: { collectedAmount: true },
      where: { collectedAt: { gte: startDate, lte: endDate } }
    }),
    prisma.codSettlement.aggregate({
      _sum: { totalSettledAmount: true },
      where: { settledAt: { gte: startDate, lte: endDate } }
    }),
    prisma.supplierPayment.aggregate({
      _sum: { amount: true },
      where: { paymentDate: { gte: startDate, lte: endDate } }
    }),
    prisma.expense.aggregate({
      _sum: { amount: true },
      where: { expenseDate: { gte: startDate, lte: endDate }, status: 'PAID' }
    }),
    prisma.expense.groupBy({
      by: ['category'],
      _sum: { amount: true },
      where: { expenseDate: { gte: startDate, lte: endDate } }
    })
  ]);

  const codCashCollected = Number(codCollectedAgg._sum.collectedAmount || 0);
  const codCashSettled = Number(codSettledAgg._sum.totalSettledAmount || 0);
  const supplierPayments = Number(supplierPaymentsAgg._sum.amount || 0);
  const operatingExpensesPaid = Number(expensePaymentsAgg._sum.amount || 0);

  const totalInflows = codCashCollected;
  const totalOutflows = Number((supplierPayments + operatingExpensesPaid).toFixed(2));
  const netCashFlow = Number((totalInflows - totalOutflows).toFixed(2));

  return {
    codCashCollected,
    codCashSettled,
    supplierPayments,
    operatingExpensesPaid,
    totalInflows,
    totalOutflows,
    netCashFlow,
    expenseCategories: expensesByCategory.map(c => ({
      category: c.category,
      amount: Number(c._sum.amount || 0)
    }))
  };
}

/**
 * Calculates supplier balances and purchase summaries.
 */
export async function getSupplierPayablesSummary() {
  const suppliers = await prisma.supplier.findMany({
    include: {
      purchases: {
        where: { status: { in: ['RECEIVED', 'DRAFT'] } },
        select: { totalAmount: true, paidAmount: true, status: true }
      },
      payments: {
        select: { amount: true, paymentDate: true }
      }
    },
    orderBy: { name: 'asc' }
  });

  let totalPurchasesAll = 0;
  let totalPaymentsAll = 0;
  let totalOutstandingAll = 0;

  const rows = suppliers.map(s => {
    const totalPurchases = s.purchases.reduce((sum, p) => sum + Number(p.totalAmount), 0);
    const totalPayments = s.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const outstanding = Math.max(0, Number((totalPurchases - totalPayments).toFixed(2)));

    totalPurchasesAll += totalPurchases;
    totalPaymentsAll += totalPayments;
    totalOutstandingAll += outstanding;

    return {
      id: s.id,
      code: s.code,
      name: s.name,
      contactPerson: s.contactPerson,
      phone: s.phone,
      status: s.status,
      totalPurchases: Number(totalPurchases.toFixed(2)),
      totalPayments: Number(totalPayments.toFixed(2)),
      outstandingBalance: outstanding
    };
  });

  return {
    totalPurchasesAll: Number(totalPurchasesAll.toFixed(2)),
    totalPaymentsAll: Number(totalPaymentsAll.toFixed(2)),
    totalOutstandingAll: Number(totalOutstandingAll.toFixed(2)),
    suppliers: rows
  };
}

/**
 * Returns explainable Smart Business Insights based on real data.
 */
export async function getSmartBusinessInsights(startDate, endDate) {
  const [productReport, inventoryReport, expensesReport] = await Promise.all([
    getProductPerformanceReport(startDate, endDate),
    getInventoryValuationReport(),
    prisma.expense.groupBy({
      by: ['category'],
      _sum: { amount: true },
      where: { expenseDate: { gte: startDate, lte: endDate } }
    })
  ]);

  const topSellersByUnits = [...productReport].sort((a, b) => b.unitsSold - a.unitsSold).slice(0, 5);
  const highestProfitItems = [...productReport].sort((a, b) => b.grossProfit - a.grossProfit).slice(0, 5);
  const lowMarginItems = [...productReport].filter(p => p.unitsSold > 0 && p.marginPercent < 15 && p.isCostComplete).slice(0, 5);
  const uncostedItems = [...inventoryReport.products].filter(p => p.uncostedUnits > 0).slice(0, 5);

  const topExpenseCategories = expensesReport
    .map(e => ({ category: e.category, amount: Number(e._sum.amount || 0) }))
    .sort((a, b) => b.amount - a.amount);

  return {
    topSellersByUnits,
    highestProfitItems,
    lowMarginItems,
    uncostedItems,
    topExpenseCategories
  };
}
