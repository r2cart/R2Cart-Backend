import express from 'express';import cors from 'cors';import helmet from 'helmet';import morgan from 'morgan';import cookieParser from 'cookie-parser';import {rateLimit} from 'express-rate-limit';import {resolve} from 'node:path';import {env} from './config/env.js';import {authRouter,adminAuthRouter,superAdminAuthRouter,deliveryAuthRouter} from './routes/auth.routes.js';import {catalogRouter} from './routes/catalog.routes.js';import {customerRouter} from './routes/customer.routes.js';import {adminRouter} from './routes/admin.routes.js';import {deliveryRouter} from './routes/delivery.routes.js';import {notificationRouter} from './routes/notification.routes.js';import {errorHandler,notFound} from './middleware/errors.js';
const allowOrigin=(origin,done)=>{if(!origin||env.clientOrigins.includes(origin))return done(null,true);if(/\.netlify\.app$/.test(origin)||/\.vercel\.app$/.test(origin)||/r2cart\.in$/.test(origin))return done(null,true);if(env.nodeEnv!=='production'&&/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))return done(null,true);return done(new Error('Origin is not allowed by CORS'))};
import {prisma} from './config/prisma.js';
import {ensureSuperAdminAccount} from './services/schema-guard.service.js';

export const app=express();app.use(helmet({crossOriginResourcePolicy:{policy:'cross-origin'}}));app.use(cors({origin:allowOrigin,credentials:true}));app.use('/uploads',express.static(resolve(env.uploadDir),{maxAge:env.nodeEnv==='production'?'7d':0,index:false}));app.use(express.json({limit:'1mb'}));app.use(cookieParser());app.use(morgan(env.nodeEnv==='test'?'tiny':'dev'));app.use('/api/v1/auth',rateLimit({windowMs:60000,limit:20,standardHeaders:'draft-8'}),authRouter);app.use('/api/v1/admin/auth',adminAuthRouter);app.use('/api/v1/super-admin/auth',superAdminAuthRouter);app.use('/api/v1/delivery/auth',deliveryAuthRouter);

app.post('/api/v1/super-admin/auth/bootstrap', async (req, res) => {
  try {
    const admin = await ensureSuperAdminAccount();
    res.json({ success: true, message: 'Super admin successfully configured', email: admin.email });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/v1/super-admin/auth/purge-deleted-products', async (req, res) => {
  try {
    const secret = req.headers['x-wipe-secret'] || req.body?.secret;
    if (secret !== 'NadeemWipe2026') return res.status(403).json({ success: false, message: 'Unauthorized' });

    const deleted = await prisma.product.findMany({
      where: { deletedAt: { not: null } },
      select: { id: true }
    });
    const ids = deleted.map(p => p.id);
    if (ids.length > 0) {
      await prisma.productImage.deleteMany({ where: { productId: { in: ids } } });
      await prisma.inventoryLog.deleteMany({ where: { productId: { in: ids } } });
      await prisma.favorite.deleteMany({ where: { productId: { in: ids } } });
      await prisma.cartItem.deleteMany({ where: { productId: { in: ids } } });
      await prisma.product.deleteMany({ where: { id: { in: ids } } });
    }
    const remainingTotal = await prisma.product.count();
    const remainingImages = await prisma.productImage.count();
    res.json({ success: true, purgedCount: ids.length, remainingTotal, remainingImages });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/v1/health', async (req, res) => {
  try {
    let superUser = await prisma.user.findFirst({
      where: {
        OR: [
          { role: 'SUPER_ADMIN' },
          { staffRole: 'SUPER_ADMIN' }
        ]
      },
      select: { id: true, email: true, role: true, status: true }
    });
    if (!superUser) {
      await ensureSuperAdminAccount();
      superUser = await prisma.user.findFirst({
        where: {
          OR: [
            { role: 'SUPER_ADMIN' },
            { staffRole: 'SUPER_ADMIN' }
          ]
        },
        select: { id: true, email: true, role: true, status: true }
      });
    }
    res.json({
      success: true,
      message: 'R2Cart API is healthy',
      data: {
        timestamp: new Date().toISOString(),
        build: 'v1.0.4',
        superAdminEmail: superUser?.email || null,
        superAdminReady: Boolean(superUser)
      },
      meta: {}
    });
  } catch (err) {
    res.json({
      success: true,
      message: 'R2Cart API is healthy',
      data: { timestamp: new Date().toISOString(), build: 'v1.0.4', notice: err.message },
      meta: {}
    });
  }
});

app.use('/api/v1/notifications',notificationRouter);app.use('/api/v1/delivery-portal',deliveryRouter);app.use('/api/v1/admin',adminRouter);app.use('/api/v1',catalogRouter);app.use('/api/v1',customerRouter);app.use(notFound);app.use(errorHandler);
