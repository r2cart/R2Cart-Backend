import {Router} from 'express';
import * as c from '../controllers/catalog.controller.js';
import * as m from '../controllers/admin-marketing.controller.js';
import {homepageRankingController} from '../controllers/homepage-ranking.controller.js';
import {runOneTimeProductionCleanup} from '../services/live-cleanup.service.js';

import {optionalAuthenticate} from '../middleware/auth.js';

export const catalogRouter = Router();

// One-time secure trigger for real live database cleanup
catalogRouter.all('/system/live-clean-start', async (req, res) => {
  const key = req.query.secret || req.body?.secret;
  if (key !== 'r2cart_prod_cleanup_launch_789') {
    return res.status(403).json({ error: 'Access denied: invalid secret key' });
  }
  try {
    const result = await runOneTimeProductionCleanup();
    return res.json({ success: true, message: 'Real live database cleaned successfully', result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Public Homepage Ranking Endpoints
catalogRouter.get('/homepage/best-sellers', homepageRankingController.getBestSellers);
catalogRouter.get('/homepage/top-picks', homepageRankingController.getTopPicks);

catalogRouter.get('/categories', c.categories);
catalogRouter.get('/products', optionalAuthenticate, c.products);
catalogRouter.get('/products/:id', c.product);
catalogRouter.post('/products/:id/enquire', optionalAuthenticate, c.submitProductEnquiry);
catalogRouter.get('/search', optionalAuthenticate, c.searchProducts);
catalogRouter.get('/search/suggestions', optionalAuthenticate, c.suggestions);
catalogRouter.get('/banners', c.banners);
catalogRouter.get('/delivery', c.delivery);
catalogRouter.get('/delivery-slots', c.deliverySlots);
catalogRouter.get('/settings', c.settings);
catalogRouter.post('/contact', c.contactInquiry);
catalogRouter.get('/marketing/active', m.marketing.publicActive);
catalogRouter.post('/marketing/:id/track', m.marketing.track);
