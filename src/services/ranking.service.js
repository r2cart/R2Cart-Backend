import { prisma } from '../config/prisma.js';
import { DEFAULT_BEST_SELLERS_CONFIG, DEFAULT_TOP_PICKS_CONFIG } from '../config/ranking-defaults.js';

class RankingService {
  constructor() {
    this.cache = new Map();
    this.CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  }

  // Invalidate in-memory cache
  invalidateCache() {
    this.cache.clear();
    console.log('[RankingService] In-memory ranking cache cleared.');
  }

  // Get active or draft configuration
  async getConfig(type = 'active') {
    const configId = type === 'draft' ? 'draft' : 'active';
    const row = await prisma.homepageRankingConfig.findUnique({
      where: { id: configId }
    });

    if (!row) {
      return {
        id: configId,
        bestSellers: { ...DEFAULT_BEST_SELLERS_CONFIG },
        topPicks: { ...DEFAULT_TOP_PICKS_CONFIG },
        version: 1,
        publishedAt: configId === 'active' ? new Date() : null,
        publishedBy: configId === 'active' ? 'system' : null
      };
    }

    return {
      id: row.id,
      bestSellers: typeof row.bestSellers === 'string' ? JSON.parse(row.bestSellers) : row.bestSellers,
      topPicks: typeof row.topPicks === 'string' ? JSON.parse(row.topPicks) : row.topPicks,
      version: row.version,
      publishedAt: row.publishedAt,
      publishedBy: row.publishedBy,
      updatedAt: row.updatedAt
    };
  }

  // Helper to calculate date cutoff in Asia/Kolkata
  getPeriodCutoff(periodDays = 30) {
    const now = new Date();
    // Offset for Asia/Kolkata (+05:30)
    const kolkataTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
    const cutoff = new Date(kolkataTime.getTime() - (periodDays * 24 * 60 * 60 * 1000));
    return cutoff;
  }

  // Query eligible sales from database
  async getEligibleSalesData(periodDays = 30) {
    const cutoffDate = this.getPeriodCutoff(periodDays);
    const midPeriodDate = new Date(Date.now() - ((periodDays / 2) * 24 * 60 * 60 * 1000));

    // An order is eligible ONLY if status is DELIVERED and paymentStatus is not REFUNDED or FAILED
    const eligibleOrders = await prisma.order.findMany({
      where: {
        status: 'DELIVERED',
        paymentStatus: { notIn: ['REFUNDED', 'FAILED'] },
        createdAt: { gte: cutoffDate }
      },
      select: {
        id: true,
        createdAt: true,
        items: {
          select: {
            productId: true,
            quantity: true,
            price: true
          }
        }
      }
    });

    // Aggregate metrics per product
    const productStats = new Map();

    for (const order of eligibleOrders) {
      const orderDate = new Date(order.createdAt);
      const isRecentHalf = orderDate >= midPeriodDate;

      for (const item of order.items) {
        if (!item.productId) continue;
        const pid = item.productId;
        const qty = Number(item.quantity) || 1;
        const itemPrice = Number(item.price) || 0;
        const revenue = qty * itemPrice;

        if (!productStats.has(pid)) {
          productStats.set(pid, {
            productId: pid,
            unitsSold: 0,
            orderIds: new Set(),
            revenue: 0,
            recentHalfUnits: 0,
            olderHalfUnits: 0
          });
        }

        const stat = productStats.get(pid);
        stat.unitsSold += qty;
        stat.orderIds.add(order.id);
        stat.revenue += revenue;

        if (isRecentHalf) {
          stat.recentHalfUnits += qty;
        } else {
          stat.olderHalfUnits += qty;
        }
      }
    }

    const weeks = Math.max(1, periodDays / 7);
    const result = new Map();

    for (const [pid, stat] of productStats.entries()) {
      const orderCount = stat.orderIds.size;
      const velocity = stat.unitsSold / weeks;
      
      // Trend: compare recent half vs older half
      let trend = 0;
      if (stat.olderHalfUnits > 0) {
        trend = (stat.recentHalfUnits - stat.olderHalfUnits) / stat.olderHalfUnits;
      } else if (stat.recentHalfUnits > 0) {
        trend = 1.0;
      }

      result.set(pid, {
        productId: pid,
        unitsSold: stat.unitsSold,
        orderCount,
        revenue: stat.revenue,
        velocity,
        trend
      });
    }

    return result;
  }

  // Format product for frontend/API response
  formatProduct(p, extra = {}) {
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      unit: p.unit,
      price: Number(p.price),
      mrp: Number(p.mrp),
      stock: p.stock,
      lowStockThreshold: p.lowStockThreshold || 5,
      status: p.status,
      category: p.category?.slug || p.categoryId,
      categoryId: p.categoryId,
      categoryName: p.category?.name || '',
      image: p.images?.[0]?.url || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=80',
      images: p.images?.map(img => img.url) || [],
      bestSeller: Boolean(p.bestSeller),
      featured: Boolean(p.featured),
      ...extra
    };
  }

  // Authoritative Best Sellers calculation
  async calculateBestSellers(configOverride = null, { preview = false } = {}) {
    const config = configOverride || (await this.getConfig('active')).bestSellers;

    if (!config.enabled) {
      return {
        visible: false,
        reason: 'section_disabled',
        type: 'disabled',
        title: config.title || 'Best Sellers',
        subtitle: config.subtitle || '',
        products: []
      };
    }

    const periodDays = [7, 30, 60, 90].includes(Number(config.periodDays)) ? Number(config.periodDays) : 30;
    const minUnits = Math.max(1, Number(config.minUnits) || 1);
    const minOrders = Math.max(1, Number(config.minOrders) || 1);
    const minQualifyingProducts = Math.max(1, Number(config.minQualifyingProducts) || 3);
    const targetCount = Math.max(1, Number(config.count) || 10);
    const stockPolicy = config.stockPolicy || 'IN_STOCK_ONLY';
    const excludedIds = new Set(config.excludedProductIds || []);
    const pinnedIds = config.pinnedProductIds || [];
    const categoryFilterIds = config.categoryFilterIds || [];

    // 1. Fetch eligible sales
    const salesMap = await this.getEligibleSalesData(periodDays);

    // 2. Query products that have sales data + pinned products
    const productIdsWithSales = Array.from(salesMap.keys());
    const candidateProductIds = [...new Set([...productIdsWithSales, ...pinnedIds, ...(config.fallbackProductIds || [])])];

    const whereClause = {
      status: 'ACTIVE',
      deletedAt: null
    };

    if (candidateProductIds.length > 0) {
      whereClause.id = { in: candidateProductIds };
    }

    const candidateProducts = await prisma.product.findMany({
      where: whereClause,
      include: {
        category: { select: { id: true, name: true, slug: true } },
        images: { orderBy: { position: 'asc' }, take: 1 }
      }
    });

    const candidateMap = new Map(candidateProducts.map(p => [p.id, p]));

    // 3. Filter candidates who meet sales criteria
    const qualifyingCandidates = [];
    const previewAudit = [];

    // Calculate category averages for CATEGORY_RELATIVE mode
    const categoryTotals = new Map();
    for (const [pid, s] of salesMap.entries()) {
      const prod = candidateMap.get(pid);
      if (prod) {
        const catId = prod.categoryId;
        if (!categoryTotals.has(catId)) categoryTotals.set(catId, { totalUnits: 0, count: 0 });
        const c = categoryTotals.get(catId);
        c.totalUnits += s.unitsSold;
        c.count += 1;
      }
    }

    // Determine min/max for normalization across candidate products with sales
    let maxUnits = 1, minUnitsVal = 0;
    let maxOrders = 1, minOrdersVal = 0;
    let maxRevenue = 1, minRevenueVal = 0;
    let maxVelocity = 1, minVelocityVal = 0;

    for (const s of salesMap.values()) {
      if (s.unitsSold > maxUnits) maxUnits = s.unitsSold;
      if (s.orderCount > maxOrders) maxOrders = s.orderCount;
      if (s.revenue > maxRevenue) maxRevenue = s.revenue;
      if (s.velocity > maxVelocity) maxVelocity = s.velocity;
    }

    const weights = config.weights || DEFAULT_BEST_SELLERS_CONFIG.weights;
    const wUnits = Number(weights.unitsSold) || 0;
    const wOrders = Number(weights.orderCount) || 0;
    const wRevenue = Number(weights.revenue) || 0;
    const wVelocity = Number(weights.velocity) || 0;
    const wTrend = Number(weights.trend) || 0;
    const wCatRel = Number(weights.categoryRelative) || 0;
    const totalWeights = wUnits + wOrders + wRevenue + wVelocity + wTrend + wCatRel;
    const normFactor = totalWeights > 0 ? (1 / totalWeights) : 1;

    for (const [pid, s] of salesMap.entries()) {
      const prod = candidateMap.get(pid);
      if (!prod) continue;

      const isExcluded = excludedIds.has(pid);
      const isPinned = pinnedIds.includes(pid);
      const passesCategory = categoryFilterIds.length === 0 || categoryFilterIds.includes(prod.categoryId);
      const passesStock = stockPolicy === 'ALLOW_OUT_OF_STOCK' || prod.stock > 0;
      const meetsThresholds = s.unitsSold >= minUnits && s.orderCount >= minOrders;

      // Normalizations
      const normU = maxUnits > minUnitsVal ? (s.unitsSold - minUnitsVal) / (maxUnits - minUnitsVal) : 1;
      const normO = maxOrders > minOrdersVal ? (s.orderCount - minOrdersVal) / (maxOrders - minOrdersVal) : 1;
      const normR = maxRevenue > minRevenueVal ? (s.revenue - minRevenueVal) / (maxRevenue - minRevenueVal) : 1;
      const normV = maxVelocity > minVelocityVal ? (s.velocity - minVelocityVal) / (maxVelocity - minVelocityVal) : 1;
      const normT = Math.max(0, Math.min(1, (s.trend + 1) / 2)); // map -1..1 to 0..1

      const catStat = categoryTotals.get(prod.categoryId);
      const avgCatUnits = catStat && catStat.count > 0 ? catStat.totalUnits / catStat.count : 1;
      const normCatRel = Math.min(2, s.unitsSold / (avgCatUnits || 1)) / 2;

      let score = 0;
      if (config.mode === 'UNITS_SOLD') {
        score = s.unitsSold;
      } else if (config.mode === 'ORDERS') {
        score = s.orderCount;
      } else if (config.mode === 'REVENUE') {
        score = s.revenue;
      } else if (config.mode === 'CATEGORY_RELATIVE') {
        score = normCatRel;
      } else {
        // WEIGHTED_SCORE
        score = (normU * wUnits + normO * wOrders + normR * wRevenue + normV * wVelocity + normT * wTrend + normCatRel * wCatRel) * normFactor;
      }

      const itemAudit = {
        product: prod,
        sales: s,
        score: Number(score.toFixed(4)),
        signals: {
          unitsSold: s.unitsSold,
          orderCount: s.orderCount,
          revenue: s.revenue,
          velocity: Number(s.velocity.toFixed(2)),
          trend: Number(s.trend.toFixed(2))
        },
        meetsThresholds,
        passesStock,
        passesCategory,
        isExcluded,
        isPinned,
        eligible: meetsThresholds && passesStock && passesCategory && !isExcluded
      };

      if (preview) {
        previewAudit.push(itemAudit);
      }

      if (itemAudit.eligible) {
        qualifyingCandidates.push(itemAudit);
      }
    }

    // 4. Insufficient Sales Data Check
    if (qualifyingCandidates.length < minQualifyingProducts) {
      if (config.fallbackBehavior === 'HIDE') {
        return {
          visible: false,
          reason: 'insufficient_sales_data',
          type: 'hidden',
          title: config.title || 'Best Sellers',
          subtitle: config.subtitle || '',
          products: [],
          insufficientData: true,
          previewAudit: preview ? previewAudit : undefined
        };
      }

      if (config.fallbackBehavior === 'WAIT') {
        return {
          visible: false,
          reason: 'insufficient_sales_data',
          type: 'waiting',
          title: config.title || 'Best Sellers',
          subtitle: config.subtitle || '',
          products: [],
          insufficientData: true,
          previewAudit: preview ? previewAudit : undefined
        };
      }

      // Option B: CURATED_FALLBACK
      const fallbackIds = config.fallbackProductIds || [];
      const fallbackProducts = [];

      for (const fId of fallbackIds) {
        if (excludedIds.has(fId)) continue;
        const prod = candidateMap.get(fId) || await prisma.product.findUnique({
          where: { id: fId, status: 'ACTIVE', deletedAt: null },
          include: { category: true, images: { take: 1 } }
        });

        if (prod && (stockPolicy === 'ALLOW_OUT_OF_STOCK' || prod.stock > 0)) {
          fallbackProducts.push(this.formatProduct(prod, {
            rankingType: 'FALLBACK',
            label: 'Selected for You',
            ...(preview ? { reason: 'Curated fallback pick (insufficient sales data threshold)' } : {})
          }));
        }
      }

      return {
        visible: fallbackProducts.length > 0,
        type: 'curated_fallback',
        title: config.fallbackTitle || 'Popular Picks',
        subtitle: config.fallbackSubtitle || 'Handpicked daily essentials for your household',
        products: fallbackProducts.slice(0, targetCount),
        insufficientData: true,
        reason: fallbackProducts.length > 0 ? 'curated_fallback_active' : 'no_eligible_fallback_products',
        previewAudit: preview ? previewAudit : undefined
      };
    }

    // 5. Sort qualified candidates deterministically
    qualifyingCandidates.sort((a, b) => {
      // Deterministic tie-breaker
      if (b.score !== a.score) return b.score - a.score;
      if (b.sales.unitsSold !== a.sales.unitsSold) return b.sales.unitsSold - a.sales.unitsSold;
      if (b.sales.revenue !== a.sales.revenue) return b.sales.revenue - a.sales.revenue;
      return a.product.id.localeCompare(b.product.id);
    });

    // 6. Assemble final ranked product list
    const finalProducts = [];
    const includedIds = new Set();

    // A. Add eligible pinned products first in configured order
    for (const pinId of pinnedIds) {
      if (excludedIds.has(pinId)) continue;
      const prod = candidateMap.get(pinId);
      if (prod && prod.status === 'ACTIVE' && (stockPolicy === 'ALLOW_OUT_OF_STOCK' || prod.stock > 0)) {
        includedIds.add(pinId);
        const s = salesMap.get(pinId) || { unitsSold: 0, orderCount: 0, revenue: 0 };
        finalProducts.push(this.formatProduct(prod, {
          rank: finalProducts.length + 1,
          rankingType: 'PINNED',
          ...(preview ? {
            score: 999,
            unitsSold: s.unitsSold,
            distinctOrders: s.orderCount,
            reason: 'Manually pinned by Super Admin'
          } : {})
        }));
      }
    }

    // B. Add algorithmically ranked candidates
    for (const item of qualifyingCandidates) {
      if (finalProducts.length >= targetCount) break;
      if (includedIds.has(item.product.id)) continue;

      includedIds.add(item.product.id);
      finalProducts.push(this.formatProduct(item.product, {
        rank: finalProducts.length + 1,
        rankingType: 'ALGORITHMIC',
        ...(preview ? {
          score: item.score,
          unitsSold: item.sales.unitsSold,
          distinctOrders: item.sales.orderCount,
          signals: item.signals,
          reason: `Ranked by ${config.mode}`
        } : {})
      }));
    }

    return {
      visible: finalProducts.length > 0,
      type: 'best_sellers',
      title: config.title || 'Best Sellers',
      subtitle: config.subtitle || 'Most popular grocery items bought by our customers',
      products: finalProducts,
      previewAudit: preview ? previewAudit : undefined
    };
  }

  // Authoritative Top Picks calculation
  async calculateTopPicks(configOverride = null, { preview = false } = {}) {
    const config = configOverride || (await this.getConfig('active')).topPicks;

    if (!config.enabled) {
      return {
        visible: false,
        reason: 'section_disabled',
        type: 'disabled',
        title: config.title || 'Top Picks',
        subtitle: config.subtitle || '',
        products: []
      };
    }

    const targetCount = Math.max(1, Number(config.count) || 10);
    const mode = ['CURATED', 'ALGORITHMIC', 'HYBRID'].includes(config.mode) ? config.mode : 'HYBRID';
    const stockPolicy = config.stockPolicy || 'IN_STOCK_ONLY';
    const excludedIds = new Set(config.excludedProductIds || []);
    const pinnedIds = config.pinnedProductIds || [];
    const curatedIds = config.curatedProductIds || [];
    const categoryFilterIds = config.categoryFilterIds || [];
    const labels = config.labels || {};

    // Mode A: CURATED
    if (mode === 'CURATED') {
      const products = [];
      for (const id of curatedIds) {
        if (excludedIds.has(id)) continue;
        const prod = await prisma.product.findUnique({
          where: { id, status: 'ACTIVE', deletedAt: null },
          include: { category: true, images: { take: 1 } }
        });

        if (prod && (stockPolicy === 'ALLOW_OUT_OF_STOCK' || prod.stock > 0)) {
          if (categoryFilterIds.length === 0 || categoryFilterIds.includes(prod.categoryId)) {
            products.push(this.formatProduct(prod, {
              rank: products.length + 1,
              rankingType: 'CURATED',
              topPickLabel: labels[id] || 'Staff Pick',
              ...(preview ? { reason: 'Handpicked by Super Admin' } : {})
            }));
          }
        }
      }

      return {
        visible: products.length > 0,
        type: 'top_picks',
        mode: 'CURATED',
        title: config.title || 'Top Picks',
        subtitle: config.subtitle || 'Handpicked daily essentials for you',
        products: products.slice(0, targetCount)
      };
    }

    // Algorithmic / Hybrid Scoring
    const salesMap = await this.getEligibleSalesData(60); // 60 days sales context
    const allActive = await prisma.product.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        ...(stockPolicy === 'IN_STOCK_ONLY' ? { stock: { gt: 0 } } : {})
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        images: { orderBy: { position: 'asc' }, take: 1 }
      }
    });

    const weights = config.weights || DEFAULT_TOP_PICKS_CONFIG.weights;
    const wSales = Number(weights.salesPerformance) || 0.25;
    const wValue = Number(weights.valueScore) || 0.20;
    const wAvail = Number(weights.availabilityScore) || 0.20;
    const wFresh = Number(weights.freshnessScore) || 0.15;
    const wTrend = Number(weights.trendScore) || 0.10;
    const wDiv = Number(weights.diversityScore) || 0.10;
    const totalW = wSales + wValue + wAvail + wFresh + wTrend + wDiv;
    const normFactor = totalW > 0 ? (1 / totalW) : 1;

    let maxUnits = 1;
    for (const s of salesMap.values()) {
      if (s.unitsSold > maxUnits) maxUnits = s.unitsSold;
    }

    const scoredProducts = [];
    const nowMs = Date.now();

    for (const prod of allActive) {
      if (excludedIds.has(prod.id)) continue;
      if (categoryFilterIds.length > 0 && !categoryFilterIds.includes(prod.categoryId)) continue;

      const s = salesMap.get(prod.id) || { unitsSold: 0, orderCount: 0, velocity: 0, trend: 0 };
      const normSales = s.unitsSold / maxUnits;
      
      const price = Number(prod.price) || 0;
      const mrp = Number(prod.mrp) || price;
      const valueScore = mrp > price ? (mrp - price) / mrp : 0;
      const availabilityScore = Math.min(1, prod.stock / 25);
      
      const ageDays = Math.max(1, (nowMs - new Date(prod.createdAt).getTime()) / (24 * 60 * 60 * 1000));
      const freshnessScore = Math.max(0, 1 - (ageDays / 180));
      const trendScore = Math.max(0, Math.min(1, (s.trend + 1) / 2));
      const diversityScore = 0.5; // neutral baseline

      const totalScore = (
        normSales * wSales +
        valueScore * wValue +
        availabilityScore * wAvail +
        freshnessScore * wFresh +
        trendScore * wTrend +
        diversityScore * wDiv
      ) * normFactor;

      scoredProducts.push({
        product: prod,
        score: Number(totalScore.toFixed(4)),
        sales: s,
        signals: {
          salesPerformance: Number(normSales.toFixed(2)),
          valueScore: Number(valueScore.toFixed(2)),
          availabilityScore: Number(availabilityScore.toFixed(2)),
          freshnessScore: Number(freshnessScore.toFixed(2)),
          trendScore: Number(trendScore.toFixed(2))
        }
      });
    }

    scoredProducts.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.product.id.localeCompare(b.product.id);
    });

    const finalProducts = [];
    const includedIds = new Set();
    const categoryCount = new Map();

    // In HYBRID mode: add pins first
    if (mode === 'HYBRID') {
      const activeMap = new Map(allActive.map(p => [p.id, p]));
      for (const pinId of pinnedIds) {
        if (excludedIds.has(pinId)) continue;
        const prod = activeMap.get(pinId);
        if (prod) {
          includedIds.add(pinId);
          const catId = prod.categoryId;
          categoryCount.set(catId, (categoryCount.get(catId) || 0) + 1);
          finalProducts.push(this.formatProduct(prod, {
            rank: finalProducts.length + 1,
            rankingType: 'PINNED',
            topPickLabel: labels[pinId] || 'Editor Pick',
            ...(preview ? { score: 999, reason: 'Manually pinned Top Pick' } : {})
          }));
        }
      }
    }

    // Category diversity limit: max 3 per category if diversityEnabled
    const maxPerCategory = config.diversityEnabled !== false ? 3 : 999;

    for (const item of scoredProducts) {
      if (finalProducts.length >= targetCount) break;
      if (includedIds.has(item.product.id)) continue;

      const catId = item.product.categoryId;
      const currentCatCount = categoryCount.get(catId) || 0;
      if (currentCatCount >= maxPerCategory && scoredProducts.length > targetCount) {
        continue; // skip to maintain category diversity
      }

      includedIds.add(item.product.id);
      categoryCount.set(catId, currentCatCount + 1);

      finalProducts.push(this.formatProduct(item.product, {
        rank: finalProducts.length + 1,
        rankingType: 'ALGORITHMIC',
        topPickLabel: labels[item.product.id] || (item.score > 0.4 ? 'Great Value' : 'Daily Essentials'),
        ...(preview ? {
          score: item.score,
          signals: item.signals,
          reason: 'Algorithmic multi-signal score'
        } : {})
      }));
    }

    // If diversity left empty slots, backfill from remaining scored products
    if (finalProducts.length < targetCount) {
      for (const item of scoredProducts) {
        if (finalProducts.length >= targetCount) break;
        if (includedIds.has(item.product.id)) continue;
        includedIds.add(item.product.id);
        finalProducts.push(this.formatProduct(item.product, {
          rank: finalProducts.length + 1,
          rankingType: 'ALGORITHMIC',
          topPickLabel: labels[item.product.id] || 'Daily Essentials',
          ...(preview ? { score: item.score, reason: 'Backfill item' } : {})
        }));
      }
    }

    return {
      visible: finalProducts.length > 0,
      type: 'top_picks',
      mode,
      title: config.title || 'Top Picks',
      subtitle: config.subtitle || 'Daily essentials, seasonal favorites, and great value',
      products: finalProducts
    };
  }

  // Public cached Best Sellers
  async getPublicBestSellers() {
    const activeConfig = await this.getConfig('active');
    const cacheKey = `best_sellers_v${activeConfig.version}`;

    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
        return cached.data;
      }
    }

    const calculated = await this.calculateBestSellers(activeConfig.bestSellers, { preview: false });
    this.cache.set(cacheKey, { timestamp: Date.now(), data: calculated });
    return calculated;
  }

  // Public cached Top Picks
  async getPublicTopPicks() {
    const activeConfig = await this.getConfig('active');
    const cacheKey = `top_picks_v${activeConfig.version}`;

    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
        return cached.data;
      }
    }

    const calculated = await this.calculateTopPicks(activeConfig.topPicks, { preview: false });
    this.cache.set(cacheKey, { timestamp: Date.now(), data: calculated });
    return calculated;
  }
}

export const rankingService = new RankingService();
