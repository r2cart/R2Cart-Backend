import {app} from './app.js';
import {env} from './config/env.js';
import {prisma} from './config/prisma.js';
import {seedIfEmpty} from '../prisma/seed.js';

const server=app.listen(env.port,async()=>{
 console.log(`R2Cart API running at http://localhost:${env.port}/api/v1 (ENV: ${env.nodeEnv})`);
 try{
  await seedIfEmpty();
 }catch(err){
  console.error('[Startup] Safe bootstrap check failed:', err.message);
 }
});

const shutdown=async()=>{
 server.close();
 await prisma.$disconnect();
 process.exit(0);
};

process.on('SIGINT',shutdown);
process.on('SIGTERM',shutdown);
