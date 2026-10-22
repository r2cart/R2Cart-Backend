import { prisma } from '../config/prisma.js';
import { productDto } from '../utils/order.js';

/**
 * Calculates Levenshtein distance between two strings
 */
function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// Common unit synonyms and canonical keys in grocery search
const UNIT_SYNONYMS = {
  '1l': ['1 l', '1l', '1 litre', '1 liter', '1000ml', '1000 ml', '1ltr', '1 ltr'],
  '500ml': ['500 ml', '500ml', '0.5l', '0.5 l', 'half litre', 'half liter', '500 gm'],
  '200ml': ['200 ml', '200ml'],
  '250ml': ['250 ml', '250ml'],
  '1kg': ['1 kg', '1kg', '1000g', '1000 g', '1 kilo', '1 k.g.'],
  '500g': ['500 g', '500g', '0.5kg', 'half kg'],
  '250g': ['250 g', '250g'],
  '100g': ['100 g', '100g'],
  '12pcs': ['12 pcs', '12pcs', '12 pieces', '1 dozen', 'dozen'],
  '6pcs': ['6 pcs', '6pcs', '6 pieces', 'half dozen']
};

// Common grocery spelling typo map
const COMMON_TYPOS = {
  almon: 'Almond',
  almondd: 'Almond',
  paner: 'Paneer',
  panner: 'Paneer',
  choclate: 'Chocolate',
  choclat: 'Chocolate',
  biskit: 'Biscuits',
  biscut: 'Biscuits',
  biscit: 'Biscuits',
  tamato: 'Tomato',
  patato: 'Potato',
  onionn: 'Onion',
  atta: 'Atta',
  ghe: 'Ghee',
  ghee: 'Ghee',
  mlik: 'Milk',
  mik: 'Milk',
  milkk: 'Milk',
  bannana: 'Banana',
  banna: 'Banana',
  chese: 'Cheese',
  buter: 'Butter'
};

export async function smartSearchProducts({
  q = '',
  category = null,
  available = false,
  sort = 'popular',
  page = 1,
  limit = 20,
  userId = null
}) {
  const rawQuery = String(q || '').trim();
  const normalizedQuery = rawQuery.toLowerCase().replace(/\s+/g, ' ');

  // Record search history if user is authenticated and query is non-empty
  if (userId && rawQuery.length >= 2) {
    prisma.searchHistory.create({
      data: { userId, query: rawQuery }
    }).catch(() => {});
  }

  // Fetch store setting for autoHideOutOfStock
  const setting = await prisma.storeSetting?.findUnique?.({
    where: { id: 1 },
    select: { autoHideOutOfStock: true }
  }).catch(() => null);
  const hideOos = Boolean(setting?.autoHideOutOfStock);

  const include = { category: true, ratings: true, images: { orderBy: { position: 'asc' } } };

  // If query is empty, return regular products catalogue
  if (!normalizedQuery) {
    const where = {
      deletedAt: null,
      status: 'ACTIVE',
      ...(category && category !== 'all' && { category: { slug: category } }),
      ...((available || hideOos) && { stock: { gt: 0 } })
    };
    const orderBy = sort === 'low' ? { price: 'asc' } : sort === 'high' ? { price: 'desc' } : sort === 'discount' ? { featured: 'desc' } : { bestSeller: 'desc' };

    const [rows, total] = await Promise.all([
      prisma.product.findMany({ where, include, orderBy, skip: (page - 1) * limit, take: limit }),
      prisma.product.count({ where })
    ]);

    const groups = [...new Set(rows.map(r => r.variantGroupId).filter(Boolean))];
    const packs = groups.length ? await prisma.product.findMany({ where: { deletedAt: null, status: 'ACTIVE', variantGroupId: { in: groups } }, include, orderBy: { price: 'asc' } }) : [];

    return {
      query: '',
      scenario: 'EMPTY_QUERY',
      exactProduct: null,
      results: rows.map(r => ({
        ...productDto(r),
        variants: r.variantGroupId ? packs.filter(p => p.variantGroupId === r.variantGroupId).map(productDto) : []
      })),
      similarProducts: [],
      suggestions: [],
      total,
      inStockCount: rows.filter(r => r.stock > 0).length,
      hasAvailable: rows.some(r => r.stock > 0),
      page,
      limit,
      pages: Math.ceil(total / limit)
    };
  }

  // Tokenize query
  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);

  // Detect unit qualifier in query
  let queryUnitKey = null;
  for (const [key, syns] of Object.entries(UNIT_SYNONYMS)) {
    if (syns.some(s => normalizedQuery.includes(s))) {
      queryUnitKey = key;
      break;
    }
  }

  // Fetch all active products matching category filter (if provided)
  const candidateWhere = {
    deletedAt: null,
    status: 'ACTIVE',
    ...(category && category !== 'all' && { category: { slug: category } }),
    ...(hideOos && { stock: { gt: 0 } })
  };

  const allActiveCandidates = await prisma.product.findMany({
    where: candidateWhere,
    include
  });

  // Calculate vocabulary from active products for spelling suggestions
  const vocabulary = new Map();
  for (const p of allActiveCandidates) {
    const words = `${p.name} ${p.category?.name || ''}`.toLowerCase().split(/[^a-z0-9]+/i).filter(w => w.length >= 3);
    for (const w of words) {
      vocabulary.set(w, (vocabulary.get(w) || 0) + 1);
    }
  }

  // Score each candidate product
  const scored = [];
  for (const product of allActiveCandidates) {
    const nameLower = product.name.toLowerCase();
    const unitLower = product.unit.toLowerCase();
    const catNameLower = (product.category?.name || '').toLowerCase();
    const descLower = (product.description || '').toLowerCase();

    let score = 0;
    let matchedTokenCount = 0;

    // 1. Exact Name match (Highest priority)
    if (nameLower === normalizedQuery) {
      score += 2000;
    } else if (nameLower.startsWith(normalizedQuery)) {
      score += 1200;
    } else if (nameLower.includes(normalizedQuery)) {
      score += 800;
    }

    // 2. Token-by-token matching
    const nameWords = nameLower.split(/[^a-z0-9]+/i).filter(Boolean);
    for (const token of queryTokens) {
      let tokenMatched = false;
      // Exact word in product name
      if (nameWords.includes(token)) {
        score += 220;
        tokenMatched = true;
      } else if (nameWords.some(w => w.startsWith(token))) {
        score += 150;
        tokenMatched = true;
      } else if (nameLower.includes(token)) {
        score += 90;
        tokenMatched = true;
      } else if (unitLower.includes(token)) {
        score += 110;
        tokenMatched = true;
      } else if (catNameLower.includes(token)) {
        score += 70;
        tokenMatched = true;
      } else if (descLower.includes(token)) {
        score += 25;
      }

      if (tokenMatched) {
        matchedTokenCount++;
      }
    }

    // Bonus for all tokens matched in product name
    if (matchedTokenCount === queryTokens.length && queryTokens.length > 0) {
      score += 450;
    } else if (queryTokens.length > 1) {
      const ratio = matchedTokenCount / queryTokens.length;
      score += Math.round(ratio * 200);
      if (ratio < 0.35 && queryTokens.length >= 3) {
        score -= 250;
      }
    }

    // Unit qualifier matching bonus / penalty
    if (queryUnitKey) {
      const syns = UNIT_SYNONYMS[queryUnitKey] || [];
      const matchesUnit = syns.some(s => unitLower.includes(s.replace(/\s+/g, '')) || unitLower === s);
      if (matchesUnit) {
        score += 350; // Requested size gets strong boost
      } else {
        score -= 60; // Different size gets slight demotion
      }
    }

    // In-stock preference when relevance is comparable
    if (product.stock > 0 && score > 0) {
      score += 60;
    }

    // Popularity / Best seller subtle tie breaker
    if (product.bestSeller && score > 0) score += 15;
    if (product.featured && score > 0) score += 10;

    if (score > 60) {
      scored.push({
        product,
        score,
        matchedTokenCount
      });
    }
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Generate spelling suggestions
  const suggestions = [];
  for (const token of queryTokens) {
    if (COMMON_TYPOS[token] && !suggestions.includes(COMMON_TYPOS[token])) {
      suggestions.push(COMMON_TYPOS[token]);
    } else if (token.length >= 4 && !vocabulary.has(token)) {
      let closestWord = null;
      let minDistance = 3; // allow up to 2 edits
      for (const [vocabWord] of vocabulary.entries()) {
        if (Math.abs(vocabWord.length - token.length) <= 2) {
          const dist = levenshteinDistance(token, vocabWord);
          if (dist < minDistance) {
            minDistance = dist;
            closestWord = vocabWord;
          }
        }
      }
      if (closestWord) {
        const cap = closestWord.charAt(0).toUpperCase() + closestWord.slice(1);
        if (!suggestions.includes(cap)) suggestions.push(cap);
      }
    }
  }

  // Attach variants to products
  const groupsToFetch = [...new Set(allActiveCandidates.map(s => s.variantGroupId).filter(Boolean))];
  const packRows = groupsToFetch.length
    ? await prisma.product.findMany({
        where: { deletedAt: null, status: 'ACTIVE', variantGroupId: { in: groupsToFetch } },
        include,
        orderBy: { price: 'asc' }
      })
    : [];

  const packMap = new Map();
  for (const p of packRows) {
    if (!packMap.has(p.variantGroupId)) packMap.set(p.variantGroupId, []);
    packMap.get(p.variantGroupId).push(productDto(p));
  }

  const formatWithVariants = (p) => ({
    ...productDto(p),
    variants: p.variantGroupId && packMap.has(p.variantGroupId) ? packMap.get(p.variantGroupId) : []
  });

  // Filter for genuine direct matches based on query specificity:
  const genuineMatches = scored.filter(s => {
    if (queryTokens.length <= 1) return s.score >= 120;
    if (queryTokens.length === 2) return s.matchedTokenCount >= 1 && s.score >= 240;
    // 3 or more words: must match at least 50% of the query tokens or whole query string
    return (s.matchedTokenCount / queryTokens.length >= 0.5 && s.score >= 280) || s.product.name.toLowerCase().includes(normalizedQuery);
  });

  // Determine Scenario:
  let scenario = 'PARTIAL_MATCHES';
  let exactProduct = null;
  let similarProducts = [];
  let matchingProducts = genuineMatches.map(s => s.product);

  // Case 2: Product Not Found
  if (matchingProducts.length === 0) {
    scenario = 'NOT_FOUND';

    // Find similar/related products if suitable alternatives can be inferred
    const fallbackCategoryIds = new Set();
    for (const token of queryTokens) {
      for (const p of allActiveCandidates) {
        if (p.category?.name?.toLowerCase().includes(token) || p.category?.slug?.includes(token)) {
          fallbackCategoryIds.add(p.categoryId);
        }
      }
    }

    // Also infer category from any suggestions
    for (const sug of suggestions) {
      const sugLower = sug.toLowerCase();
      for (const p of allActiveCandidates) {
        if (p.name.toLowerCase().includes(sugLower) || p.category?.name?.toLowerCase().includes(sugLower)) {
          fallbackCategoryIds.add(p.categoryId);
        }
      }
    }

    if (fallbackCategoryIds.size > 0) {
      const relatedCandidates = allActiveCandidates.filter(p => fallbackCategoryIds.has(p.categoryId) && p.stock > 0);
      similarProducts = relatedCandidates.slice(0, 8).map(formatWithVariants);
    }
  } else {
    const topScored = genuineMatches[0];
    const topProduct = topScored.product;
    const isSpecificQuery = queryTokens.length >= 2 || topScored.score >= 600;

    // Check Case 3: Exact Product Not Available, but Related Products Exist
    // Top product matches the query strongly, BUT it is out of stock (stock === 0)
    const allTopMatchesOos = genuineMatches.slice(0, 3).every(s => s.product.stock <= 0);

    if (topProduct.stock <= 0 && (allTopMatchesOos || (isSpecificQuery && queryUnitKey))) {
      scenario = 'EXACT_UNAVAILABLE';
      exactProduct = formatWithVariants(topProduct);

      // Prioritize Similar Products per user instructions:
      // 1. Same product in another available size or variant (variantGroupId)
      const variantAlternatives = topProduct.variantGroupId
        ? allActiveCandidates.filter(p => p.variantGroupId === topProduct.variantGroupId && p.id !== topProduct.id && p.stock > 0)
        : [];

      // 2. Same product category
      const categoryAlternatives = allActiveCandidates.filter(
        p => p.categoryId === topProduct.categoryId && p.id !== topProduct.id && p.stock > 0 && !variantAlternatives.some(v => v.id === p.id)
      );

      // 3. Products with similar names or relevant attributes
      const nameAlternatives = allActiveCandidates.filter(p => {
        if (p.id === topProduct.id || p.stock <= 0) return false;
        const pWords = p.name.toLowerCase().split(/\s+/);
        return queryTokens.some(t => pWords.includes(t)) && !variantAlternatives.some(v => v.id === p.id) && !categoryAlternatives.some(c => c.id === p.id);
      });

      const combinedSimilar = [
        ...variantAlternatives,
        ...categoryAlternatives,
        ...nameAlternatives
      ].slice(0, 10);

      similarProducts = combinedSimilar.map(formatWithVariants);

      if (available) {
        matchingProducts = matchingProducts.filter(p => p.stock > 0);
      }
    } else if (topScored.score >= 500 && topProduct.stock > 0 && isSpecificQuery) {
      // Case 1: Exact Product Available
      scenario = 'EXACT_AVAILABLE';
      if (available) {
        matchingProducts = matchingProducts.filter(p => p.stock > 0);
      }
    } else {
      // Case 4: Partial Search Matches
      scenario = 'PARTIAL_MATCHES';
      if (available) {
        matchingProducts = matchingProducts.filter(p => p.stock > 0);
      }
    }
  }

  // Apply explicit user sort override if requested
  if (sort === 'low') {
    matchingProducts.sort((a, b) => Number(a.price) - Number(b.price));
  } else if (sort === 'high') {
    matchingProducts.sort((a, b) => Number(b.price) - Number(a.price));
  } else if (sort === 'discount') {
    matchingProducts.sort((a, b) => (Number(b.mrp) - Number(b.price)) - (Number(a.mrp) - Number(a.price)));
  }

  const total = matchingProducts.length;
  const paginated = matchingProducts.slice((page - 1) * limit, page * limit).map(formatWithVariants);

  // For Case 1 & 4: Populate related products from category if not already populated
  if (scenario !== 'NOT_FOUND' && scenario !== 'EXACT_UNAVAILABLE' && paginated.length > 0 && similarProducts.length === 0) {
    const primaryCategory = paginated[0].category;
    const resultIds = new Set(matchingProducts.map(p => p.id));
    const catAlternatives = allActiveCandidates.filter(p => (p.category?.slug === primaryCategory || p.categoryId === paginated[0].categoryId) && !resultIds.has(p.id) && p.stock > 0).slice(0, 6);
    if (catAlternatives.length) {
      similarProducts = catAlternatives.map(formatWithVariants);
    }
  }

  return {
    query: rawQuery,
    scenario,
    exactProduct,
    results: paginated,
    similarProducts,
    suggestions: suggestions.slice(0, 4),
    total,
    inStockCount: matchingProducts.filter(p => p.stock > 0).length,
    hasAvailable: matchingProducts.some(p => p.stock > 0),
    page,
    limit,
    pages: Math.ceil(total / limit)
  };
}
