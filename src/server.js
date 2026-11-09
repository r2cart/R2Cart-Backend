import {app} from './app.js';
import {env} from './config/env.js';
import {prisma, startDbHeartbeat} from './config/prisma.js';
import {ensureStoreSettingColumns, ensureCategoryAdminColumns, ensureProductDeliveryScopeColumns, ensureDeliveryStaffColumns, ensureHomepageRankingTables, ensureDeliveryChatTable, ensureDeliveryOperatingHoursColumns, ensureHandlingFeeColumns, autoSyncPrismaSchema, ensureSuperAdminAccount} from './services/schema-guard.service.js';

const server=app.listen(env.port,async()=>{
 console.log(`R2Cart API running at http://localhost:${env.port}/api/v1 (ENV: ${env.nodeEnv})`);
 
 // Start background MySQL keep-alive heartbeat to prevent cloud connection drops
 startDbHeartbeat();

 // Render 24/7 Keep-Alive self ping (prevents free tier sleep and eliminates 50s cold starts)
 const renderHost = process.env.RENDER_EXTERNAL_URL || (env.nodeEnv === 'production' ? 'https://r2cart-backend-joyh.onrender.com' : null);
 if (renderHost) {
   const healthUrl = `${renderHost.replace(/\/$/, '')}/api/v1/health`;
   console.log(`[KeepAlive] Render anti-sleep self-ping configured for: ${healthUrl}`);
   const pingJob = setInterval(async () => {
     try {
       const pingRes = await fetch(healthUrl, { headers: { 'User-Agent': 'R2Cart-KeepAlive/1.0' } });
       if (!pingRes.ok) console.warn(`[KeepAlive] Warning: health check returned ${pingRes.status}`);
     } catch (err) {
       console.warn('[KeepAlive] Self-ping notice:', err.message);
     }
   }, 10 * 60 * 1000); // 10 minutes (Render sleep timeout is 15 minutes)
   if (pingJob.unref) pingJob.unref();
 }

 try{
  // 1. Immediately ensure missing store_settings, category admin, delivery staff columns, ranking and delivery chat tables exist
  await ensureStoreSettingColumns();
  await ensureCategoryAdminColumns();
  await ensureProductDeliveryScopeColumns();
  await ensureDeliveryStaffColumns();
  await ensureHomepageRankingTables();
  await ensureDeliveryChatTable();
  await ensureDeliveryOperatingHoursColumns();
  await ensureHandlingFeeColumns();
 }catch(err){
  console.error('[Startup] Schema guard check notice:', err.message);
 }

 try{
  // 2. Ensure Super Admin account & remove old admin accounts as requested
  await ensureSuperAdminAccount();
 }catch(err){
  console.error('[Startup] Super Admin bootstrap notice:', err.message);
 }

 try{
  // 3. Sync all Prisma tables (DeliveryAssignment, DeliveryProof, EmergencyPause, MarketingCampaign, etc.)
  autoSyncPrismaSchema();
 }catch(err){
  console.error('[Startup] Auto sync notice:', err.message);
 }
});

server.on('error', err => {
  console.error('[Server] Fatal server error:', err.message);
  if (err.code === 'EADDRINUSE') {
    process.exit(1);
  }
});

const shutdown=async()=>{
 server.close();
 await prisma.$disconnect();
 process.exit(0);
};

process.on('SIGINT',shutdown);
process.on('SIGTERM',shutdown);
