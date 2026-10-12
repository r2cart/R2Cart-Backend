import {app} from './app.js';import {env} from './config/env.js';import {prisma} from './config/prisma.js';
const server=app.listen(env.port,()=>console.log(`R2Cart API running at http://localhost:${env.port}/api/v1`));
const shutdown=async()=>{server.close();await prisma.$disconnect();process.exit(0)};process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
