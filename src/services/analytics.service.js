import { prisma } from '../config/prisma.js';

/**
 * R2Cart Business Analytics & Profit Management Service
 * 
 * Implements strict accounting principles, FIFO Cost of Goods Sold (COGS),
 * date range calculations in Asia/Kolkata timezone, Gross & Net Operating Profit,
 * Inventory Valuation, Cash Flow reconciliation, and Smart Business Insights.
 */

// Helper functions for clean Asia/Kolkata calendar dates without offset distortion
export function getISTDateString(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d); // Returns 'YYYY-MM-DD'
}

export function shiftDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function formatISTDisplay(isoDateStr) {
  const d = new Date(`${isoDateStr}T12:00:00Z`);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

/**
 * Returns UTC Date objects for start and end boundaries in Asia/Kolkata timezone,
 * alongside equivalent previous comparison period boundaries.
 */
export function getReportingPeriodBounds(preset = 'thisMonth', customStart, customEnd, now = new Date()) {
  const todayStr = getISTDateString(now);

  let startStr = todayStr;
  let endStr = todayStr;
  let prevStartStr = shiftDays(todayStr, -1);
  let prevEndStr = shiftDays(todayStr, -1);
  let label = preset;

  switch (preset) {
    case 'today': {
      startStr = todayStr;
      endStr = todayStr;
      prevStartStr = shiftDays(todayStr, -1);
      prevEndStr = shiftDays(todayStr, -1);
      label = 'Today';
      break;
    }
    case 'yesterday': {
      startStr = shiftDays(todayStr, -1);
      endStr = shiftDays(todayStr, -1);
      prevStartStr = shiftDays(todayStr, -2);
      prevEndStr = shiftDays(todayStr, -2);
      label = 'Yesterday';
      break;
    }
    case 'singleDate':
    case 'date': {
      const target = customStart || todayStr;
      startStr = target;
      endStr = target;
      prevStartStr = shiftDays(target, -1);
      prevEndStr = shiftDays(target, -1);
      label = target === todayStr ? 'Today' : (target === shiftDays(todayStr, -1) ? 'Yesterday' : target);
      break;
    }
    case 'last7days': {
      startStr = shiftDays(todayStr, -6);
      endStr = todayStr;
      prevStartStr = shiftDays(todayStr, -13);
      prevEndStr = shiftDays(todayStr, -7);
      label = 'Last 7 Days';
      break;
    }
    case 'last30days': {
      startStr = shiftDays(todayStr, -29);
      endStr = todayStr;
      prevStartStr = shiftDays(todayStr, -59);
      prevEndStr = shiftDays(todayStr, -30);
      label = 'Last 30 Days';
      break;
    }
    case 'lastMonth': {
      const [curY, curM] = todayStr.split('-').map(Number);
      const prevM = curM === 1 ? 12 : curM - 1;
      const prevY = curM === 1 ? curY - 1 : curY;
      const daysInPrev = new Date(Date.UTC(prevY, prevM, 0)).getUTCDate();
      const pMStr = String(prevM).padStart(2, '0');
      startStr = `${prevY}-${pMStr}-01`;
      endStr = `${prevY}-${pMStr}-${String(daysInPrev).padStart(2, '0')}`;

      const priorM = prevM === 1 ? 12 : prevM - 1;
      const priorY = prevM === 1 ? prevY - 1 : prevY;
      const daysInPrior = new Date(Date.UTC(priorY, priorM, 0)).getUTCDate();
      const prMStr = String(priorM).padStart(2, '0');
      prevStartStr = `${priorY}-${prMStr}-01`;
      prevEndStr = `${priorY}-${prMStr}-${String(daysInPrior).padStart(2, '0')}`;
      label = 'Previous Month';
      break;
    }
    case 'thisYear': {
      const [curY] = todayStr.split('-').map(Number);
      startStr = `${curY}-01-01`;
      endStr = todayStr;
      prevStartStr = `${curY - 1}-01-01`;
      prevEndStr = shiftDays(`${curY - 1}-01-01`, 364);
      label = 'Current Year';
      break;
    }
    case 'custom': {
      if (customStart && customEnd) {
        startStr = customStart;
        endStr = customEnd;
        const [sy, sm, sd] = customStart.split('-').map(Number);
        const [ey, em, ed] = customEnd.split('-').map(Number);
        const diffDays = Math.max(1, Math.round((new Date(Date.UTC(ey, em - 1, ed)) - new Date(Date.UTC(sy, sm - 1, sd))) / 86400000)) + 1;
        prevEndStr = shiftDays(customStart, -1);
        prevStartStr = shiftDays(prevEndStr, -(diffDays - 1));
        label = `${customStart} to ${customEnd}`;
      } else {
        startStr = `${todayStr.slice(0, 7)}-01`;
        endStr = todayStr;
        prevStartStr = shiftDays(startStr, -30);
        prevEndStr = shiftDays(startStr, -1);
        label = 'Current Month';
      }
      break;
    }
    case 'thisMonth':
    default: {
      startStr = `${todayStr.slice(0, 7)}-01`;
      endStr = todayStr;
      prevStartStr = shiftDays(startStr, -30);
      prevEndStr = shiftDays(startStr, -1);
      label = 'Current Month';
      break;
    }
  }

  const startDate = new Date(`${startStr}T00:00:00.000Z`);
  const endDate = new Date(`${endStr}T23:59:59.999Z`);
  const prevStartDate = new Date(`${prevStartStr}T00:00:00.000Z`);
  const prevEndDate = new Date(`${prevEndStr}T23:59:59.999Z`);

  return {
    preset,
    label,
    startDateStr: startStr,
    endDateStr: endStr,
    startDate,
    endDate,
    prevStartDate,
    prevEndDate,
    startFormatted: formatISTDisplay(startStr),
    endFormatted: formatISTDisplay(endStr)
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
    const dayKey = order.createdAt.toISOString().slice(0, 10); // YYYY-MM-DD
    const dayLabel = new Date(`${dayKey}T12:00:00Z`).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short'
    });

    const current = dayMap.get(dayKey) || {
      date: dayKey,
      label: dayLabel,
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

/**
 * Direct Retail Sales & Profit Report
 * Calculates delivered sales, purchase costs, net profit, margin %,
 * day-by-day sales trend, and product-wise profit breakdown.
 */
export async function getSalesProfitDashboard(preset = 'today', customStart, customEnd) {
  const bounds = getReportingPeriodBounds(preset, customStart, customEnd);
  
  const deliveredOrders = await prisma.order.findMany({
    where: {
      status: 'DELIVERED',
      createdAt: { gte: bounds.startDate, lte: bounds.endDate }
    },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              costPrice: true,
              mrp: true,
              price: true,
              unit: true,
              stock: true,
              images: { take: 1, orderBy: { position: 'asc' } },
              category: { select: { id: true, name: true, slug: true } }
            }
          }
        }
      }
    },
    orderBy: { createdAt: 'asc' }
  });

  let totalOrders = deliveredOrders.length;
  let totalUnits = 0;
  let totalSales = 0;
  let totalCost = 0;

  const dayMap = new Map();
  const productMap = new Map();

  for (const order of deliveredOrders) {
    const dayKey = order.createdAt.toISOString().slice(0, 10);
    const dayLabel = new Date(`${dayKey}T12:00:00Z`).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short'
    });

    if (!dayMap.has(dayKey)) {
      dayMap.set(dayKey, {
        date: dayKey,
        displayDate: dayLabel,
        orders: 0,
        sales: 0,
        cost: 0,
        profit: 0
      });
    }
    const dayStat = dayMap.get(dayKey);
    dayStat.orders += 1;

    for (const item of order.items) {
      const qty = item.quantity || 0;
      const sellingPrice = Number(item.price || 0);
      const itemCost = Number(item.costPrice || 0);
      const fallbackCost = Number(item.product?.costPrice || 0);
      const costPrice = itemCost > 0 ? itemCost : fallbackCost;

      const lineSales = sellingPrice * qty;
      const lineCost = costPrice * qty;
      const lineProfit = lineSales - lineCost;

      totalUnits += qty;
      totalSales += lineSales;
      totalCost += lineCost;

      dayStat.sales += lineSales;
      dayStat.cost += lineCost;
      dayStat.profit += lineProfit;

      const pKey = item.productId || item.sku || item.name;
      if (!productMap.has(pKey)) {
        productMap.set(pKey, {
          id: item.productId,
          sku: item.sku || '',
          name: item.name,
          unit: item.unit || '',
          category: item.product?.category?.name || 'General',
          currentStock: item.product?.stock ?? 0,
          image: item.image || item.product?.images?.[0]?.url || null,
          sellingPrice,
          costPrice,
          mrp: Number(item.mrp || 0),
          unitsSold: 0,
          totalSales: 0,
          totalCost: 0,
          totalProfit: 0
        });
      }
      const prodStat = productMap.get(pKey);
      prodStat.unitsSold += qty;
      prodStat.totalSales += lineSales;
      prodStat.totalCost += lineCost;
      prodStat.totalProfit += lineProfit;
      if (prodStat.costPrice === 0 && costPrice > 0) prodStat.costPrice = costPrice;
      if (prodStat.sellingPrice === 0 && sellingPrice > 0) prodStat.sellingPrice = sellingPrice;
    }
  }

  totalSales = Number(totalSales.toFixed(2));
  totalCost = Number(totalCost.toFixed(2));
  const netProfit = Number((totalSales - totalCost).toFixed(2));
  const marginPercent = totalSales > 0 ? Number(((netProfit / totalSales) * 100).toFixed(1)) : 0;

  const dailySeries = [...dayMap.values()].map(d => ({
    ...d,
    sales: Number(d.sales.toFixed(2)),
    cost: Number(d.cost.toFixed(2)),
    profit: Number(d.profit.toFixed(2))
  }));

  const products = [...productMap.values()].map(p => {
    const profit = Number(p.totalProfit.toFixed(2));
    const sales = Number(p.totalSales.toFixed(2));
    const cost = Number(p.totalCost.toFixed(2));
    const margin = sales > 0 ? Number(((profit / sales) * 100).toFixed(1)) : 0;
    const perPieceProfit = Number((p.sellingPrice - p.costPrice).toFixed(2));
    return {
      ...p,
      sellingPrice: Number(p.sellingPrice.toFixed(2)),
      costPrice: Number(p.costPrice.toFixed(2)),
      perPieceProfit,
      totalSales: sales,
      totalCost: cost,
      totalProfit: profit,
      marginPercent: margin
    };
  }).sort((a, b) => b.totalProfit - a.totalProfit);

  return {
    period: bounds,
    summary: {
      totalOrders,
      totalUnits,
      totalSales,
      totalCost,
      netProfit,
      marginPercent
    },
    dailySeries,
    products
  };
}

