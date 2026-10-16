import {Router} from 'express';
import * as c from '../controllers/catalog.controller.js';
import * as m from '../controllers/admin-marketing.controller.js';
import {homepageRankingController} from '../controllers/homepage-ranking.controller.js';

export const catalogRouter = Router();

// Public Homepage Ranking Endpoints
catalogRouter.get('/homepage/best-sellers', homepageRankingController.getBestSellers);
catalogRouter.get('/homepage/top-picks', homepageRankingController.getTopPicks);

catalogRouter.get('/categories', c.categories);
catalogRouter.get('/products', c.products);
catalogRouter.get('/products/:id', c.product);
catalogRouter.get('/search', c.suggestions);
catalogRouter.get('/banners', c.banners);
catalogRouter.get('/delivery', c.delivery);
catalogRouter.get('/delivery-slots', c.deliverySlots);
catalogRouter.get('/settings', c.settings);
catalogRouter.post('/contact', c.contactInquiry);
catalogRouter.get('/marketing/active', m.marketing.publicActive);
catalogRouter.post('/marketing/:id/track', m.marketing.track);
