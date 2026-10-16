export const DEFAULT_BEST_SELLERS_CONFIG = {
  enabled: true,
  title: 'Best Sellers',
  subtitle: 'Most popular grocery items bought by our customers',
  count: 10,
  mode: 'WEIGHTED_SCORE', // 'UNITS_SOLD' | 'ORDERS' | 'REVENUE' | 'WEIGHTED_SCORE' | 'CATEGORY_RELATIVE'
  periodDays: 30, // 7 | 30 | 60 | 90
  weights: {
    unitsSold: 0.35,
    orderCount: 0.25,
    revenue: 0.20,
    velocity: 0.10,
    trend: 0.10,
    conversion: 0.0,
    categoryRelative: 0.0
  },
  minUnits: 1,
  minOrders: 1,
  minQualifyingProducts: 3,
  stockPolicy: 'IN_STOCK_ONLY', // 'IN_STOCK_ONLY' | 'ALLOW_OUT_OF_STOCK'
  categoryFilterIds: [],
  pinnedProductIds: [],
  excludedProductIds: [],
  fallbackBehavior: 'CURATED_FALLBACK', // 'HIDE' | 'CURATED_FALLBACK' | 'WAIT'
  fallbackTitle: 'Popular Picks',
  fallbackSubtitle: 'Handpicked daily essentials for your household',
  fallbackProductIds: []
};

export const DEFAULT_TOP_PICKS_CONFIG = {
  enabled: true,
  title: 'Top Picks',
  subtitle: 'Daily essentials, seasonal favorites, and great value',
  count: 10,
  mode: 'HYBRID', // 'CURATED' | 'ALGORITHMIC' | 'HYBRID'
  weights: {
    salesPerformance: 0.25,
    valueScore: 0.20,
    availabilityScore: 0.20,
    freshnessScore: 0.15,
    trendScore: 0.10,
    diversityScore: 0.10
  },
  curatedProductIds: [],
  pinnedProductIds: [],
  excludedProductIds: [],
  categoryFilterIds: [],
  diversityEnabled: true,
  stockPolicy: 'IN_STOCK_ONLY',
  labels: {} // { [productId]: 'Daily Essentials' | 'Great Value' | 'Seasonal Favourites' | 'Staff Picks' }
};
