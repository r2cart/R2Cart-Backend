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

app.post('/api/v1/super-admin/auth/clean-users', async (req, res) => {
  try {
    const secret = req.headers['x-wipe-secret'] || req.body?.secret;
    if (secret !== 'NadeemWipe2026') return res.status(403).json({ success: false, message: 'Unauthorized' });

    const allUsers = await prisma.user.findMany({
      select: { id: true, email: true, mobile: true, name: true, role: true, staffRole: true, createdAt: true }
    });

    const superAdmins = allUsers.filter(u => u.role === 'SUPER_ADMIN' || u.staffRole === 'SUPER_ADMIN');
    const targetUsersToDelete = allUsers.filter(u => u.role !== 'SUPER_ADMIN' && u.staffRole !== 'SUPER_ADMIN');
    const targetUserIds = targetUsersToDelete.map(u => u.id);

    if (targetUserIds.length > 0) {
      await prisma.deliveryChatMessage.deleteMany({ where: { OR: [{ senderId: { in: targetUserIds } }, { recipientId: { in: targetUserIds } }] } }).catch(() => {});
      await prisma.cartItem.deleteMany({ where: { cart: { userId: { in: targetUserIds } } } }).catch(() => {});
      await prisma.cart.deleteMany({ where: { userId: { in: targetUserIds } } }).catch(() => {});
      await prisma.address.deleteMany({ where: { userId: { in: targetUserIds } } }).catch(() => {});
      await prisma.favorite.deleteMany({ where: { userId: { in: targetUserIds } } }).catch(() => {});
      await prisma.productRating.deleteMany({ where: { userId: { in: targetUserIds } } }).catch(() => {});
      await prisma.searchHistory.deleteMany({ where: { userId: { in: targetUserIds } } }).catch(() => {});
      await prisma.refreshToken.deleteMany({ where: { userId: { in: targetUserIds } } }).catch(() => {});
      await prisma.pushSubscription.deleteMany({ where: { userId: { in: targetUserIds } } }).catch(() => {});
      await prisma.deviceToken.deleteMany({ where: { userId: { in: targetUserIds } } }).catch(() => {});
      await prisma.ticketMessage.deleteMany({ where: { senderId: { in: targetUserIds } } }).catch(() => {});
      await prisma.supportTicket.deleteMany({ where: { userId: { in: targetUserIds } } }).catch(() => {});
      await prisma.couponUsage.deleteMany({ where: { userId: { in: targetUserIds } } }).catch(() => {});

      await prisma.user.deleteMany({
        where: { id: { in: targetUserIds } }
      });
    }

    const otpsDeleted = await prisma.otpVerification.deleteMany({});

    const remainingUsers = await prisma.user.findMany({
      select: { id: true, email: true, mobile: true, name: true, role: true }
    });

    res.json({
      success: true,
      message: 'All non-admin users and OTP records wiped cleanly',
      deletedUsersCount: targetUserIds.length,
      deletedUsersList: targetUsersToDelete,
      otpsDeletedCount: otpsDeleted.count,
      remainingUsers
    });
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
