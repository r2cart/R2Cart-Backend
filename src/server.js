import {app} from './app.js';
import {env} from './config/env.js';
import {prisma} from './config/prisma.js';
import {ensureStoreSettingColumns, ensureCategoryAdminColumns, ensureDeliveryStaffColumns, ensureHomepageRankingTables, ensureDeliveryChatTable, autoSyncPrismaSchema, ensureSuperAdminAccount} from './services/schema-guard.service.js';

const server=app.listen(env.port,async()=>{
 console.log(`R2Cart API running at http://localhost:${env.port}/api/v1 (ENV: ${env.nodeEnv})`);
 
 try{
  // 1. Immediately ensure missing store_settings, category admin, delivery staff columns, ranking and delivery chat tables exist
  await ensureStoreSettingColumns();
  await ensureCategoryAdminColumns();
  await ensureDeliveryStaffColumns();
  await ensureHomepageRankingTables();
  await ensureDeliveryChatTable();
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
