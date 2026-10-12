// Read-only smoke check against the configured MySQL database.
// Run manually: node tests/admin-api.integration-check.js
import 'dotenv/config';
import {prisma} from '../src/config/prisma.js';
import * as admin from '../src/controllers/admin.controller.js';
import {orders} from '../src/controllers/admin-orders.controller.js';
import {customers} from '../src/controllers/admin-customers.controller.js';
import * as navbar from '../src/controllers/admin-navbar.controller.js';
import * as support from '../src/controllers/admin-support.controller.js';
const checks={categories:admin.categories.list,orders:orders.list,customers,inventory:admin.inventory,coupons:admin.coupons.list,banners:admin.banners.list,delivery:admin.delivery.list,support:support.list,settings:admin.settings.get,search:navbar.search,notifications:navbar.notifications};
try{
 for(const [name,handler] of Object.entries(checks)){
  let result;await handler({query:{q:name==='search'?'Milk':undefined},params:{},user:{id:'smoke-check'}},{json:value=>{result=value}},error=>{throw error});
  const data=result.data;console.log(`${name}: OK (${Array.isArray(data)?data.length:data.pagination?.total??0} records)`);
 }
}catch(error){console.error(`Check failed: ${error.message}`);process.exitCode=1}finally{await prisma.$disconnect()}
