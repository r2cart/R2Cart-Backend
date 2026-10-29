import express from 'express';import cors from 'cors';import helmet from 'helmet';import morgan from 'morgan';import cookieParser from 'cookie-parser';import compression from 'compression';import {rateLimit} from 'express-rate-limit';import {resolve} from 'node:path';import {env} from './config/env.js';import {authRouter,adminAuthRouter,superAdminAuthRouter,deliveryAuthRouter} from './routes/auth.routes.js';import {catalogRouter} from './routes/catalog.routes.js';import {customerRouter} from './routes/customer.routes.js';import {adminRouter} from './routes/admin.routes.js';import {deliveryRouter} from './routes/delivery.routes.js';import {notificationRouter} from './routes/notification.routes.js';import {errorHandler,notFound} from './middleware/errors.js';
const allowOrigin=(origin,done)=>{
  if(!origin||env.clientOrigins.includes(origin))return done(null,true);
  // Exact r2cart.in domain match only (www optional) — prevents evilr2cart.in style spoofing
  if(/^https:\/\/(www\.)?r2cart\.in$/.test(origin))return done(null,true);
  // Vercel deployments (r2-cart-web project only — production + preview URLs)
  if(/^https:\/\/r2-cart-web[a-z0-9-]*\.vercel\.app$/.test(origin))return done(null,true);
  // Onrender (backend health dashboard uses its own origin)
  if(/^https:\/\/[a-z0-9-]+\.onrender\.com$/.test(origin))return done(null,true);
  if(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))return done(null,true);
  return done(new Error('Origin is not allowed by CORS'));
};
import {prisma} from './config/prisma.js';
import {ensureSuperAdminAccount} from './services/schema-guard.service.js';

export const app = express();
app.set('trust proxy', 1);
app.use(compression({ level: 6, threshold: 1024 }));
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: allowOrigin, credentials: true }));
app.use('/uploads', express.static(resolve(env.uploadDir), { maxAge: env.nodeEnv === 'production' ? '7d' : 0, index: false }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(morgan(env.nodeEnv === 'test' ? 'tiny' : 'dev'));

export const createAuthLimiter = (customLimit = 20) => rateLimit({
  windowMs: 60 * 1000,
  limit: customLimit,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many authentication attempts. Please try again after 1 minute.' }
});

app.use('/api/v1/auth', createAuthLimiter(20), authRouter);
app.use('/api/v1/admin/auth', createAuthLimiter(20), adminAuthRouter);
app.use('/api/v1/super-admin/auth', createAuthLimiter(20), superAdminAuthRouter);
app.use('/api/v1/delivery/auth', createAuthLimiter(20), deliveryAuthRouter);

app.post('/api/v1/super-admin/auth/bootstrap', createAuthLimiter(5), async (req, res) => {
  try {
    // Self-sealing: only allow bootstrap if no super admin exists yet
    const existing = await prisma.user.findFirst({
      where: { OR: [{ role: 'SUPER_ADMIN' }, { staffRole: 'SUPER_ADMIN' }] },
      select: { id: true }
    });
    if (existing) return res.status(409).json({ success: false, message: 'Super admin already configured.' });
    await ensureSuperAdminAccount();
    res.json({ success: true, message: 'Super admin successfully configured.' });
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
      select: { id: true, role: true, status: true }
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
