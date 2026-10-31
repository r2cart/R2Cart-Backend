import {prisma} from '../config/prisma.js';
import {orderDto} from '../utils/order.js';

const labels={NEW:'New',CONFIRMED:'Confirmed',PACKING:'Packing',OUT_FOR_DELIVERY:'Out for Delivery',DELIVERED:'Delivered',CANCELLED:'Cancelled'};
const colors={NEW:'#f59e0b',CONFIRMED:'#3b82f6',PACKING:'#8b5cf6',OUT_FOR_DELIVERY:'#06b6d4',DELIVERED:'#168447',CANCELLED:'#ef4444'};

// Reporting days use the store's India timezone, independent of server timezone.
export function reportingDates(now=new Date()){
  const offset=330*60000,local=new Date(now.getTime()+offset);
  const today=new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate())-offset);
  return {today,tomorrow:new Date(today.getTime()+86400000),week:new Date(today.getTime()-6*86400000),month:new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),1)-offset)};
}

export function salesSeries(rows,start){
  return Array.from({length:7},(_,index)=>{
    const date=new Date(start.getTime()+index*86400000),end=new Date(date.getTime()+86400000);
    return {d:date.toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short'}),v:rows.filter(row=>new Date(row.createdAt)>=date&&new Date(row.createdAt)<end).reduce((sum,row)=>sum+Number(row.grandTotal||row.v||0),0)};
  });
}

/**
 * getDashboard - category-scope aware.
 * @param {Date}   now               - reference "now" for date ranges
 * @param {string[]|null} allowedCategoryIds - null = global (Super Admin / general Admin)
 *                                             string[] = scoped (Category Admin)
 */
export async function getDashboard(now=new Date(), allowedCategoryIds=null){
  const {today,tomorrow,week,month}=reportingDates(now);
  const todayRange={gte:today,lt:tomorrow};
  const isScoped = Array.isArray(allowedCategoryIds) && allowedCategoryIds.length > 0;

  // Base where-clause fragments
  const prodWhere = isScoped
    ? {deletedAt:null, categoryId:{in:allowedCategoryIds}}
    : {deletedAt:null};

  const lowWhere = isScoped
    ? {deletedAt:null, categoryId:{in:allowedCategoryIds}, stock:{gt:0,lte:prisma.product.fields.lowStockThreshold}}
    : {deletedAt:null, stock:{gt:0,lte:prisma.product.fields.lowStockThreshold}};

  // Orders that contain at least one item from the allowed categories
  const orderScopeWhere = isScoped
    ? {items:{some:{product:{categoryId:{in:allowedCategoryIds}}}}}
    : {};

  // OrderItem filter for product performance / revenue aggregation
  const orderItemScopeWhere = isScoped
    ? {product:{categoryId:{in:allowedCategoryIds}}}
    : {};

  // ── Revenue helpers for scoped mode (sum item.price * item.quantity)
  const scopedRevenue = async (orderWhere) => {
    const items = await prisma.orderItem.findMany({
      where: {...orderItemScopeWhere, order: orderWhere},
      select: {price:true, quantity:true}
    }).catch(() => []);
    return items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
  };

  // ── Weekly sales series rows (scoped: item-level rows, global: order-level rows)
  const weeklySalesRows = isScoped
    ? await prisma.orderItem.findMany({
        where: {...orderItemScopeWhere, order:{status:'DELIVERED', createdAt:{gte:week,lt:tomorrow}}},
        select: {price:true, quantity:true, order:{select:{createdAt:true}}}
      }).then(items => items.map(item => ({createdAt: item.order.createdAt, grandTotal: Number(item.price)*item.quantity}))).catch(() => [])
    : await prisma.order.findMany({where:{status:'DELIVERED',createdAt:{gte:week,lt:tomorrow}},select:{createdAt:true,grandTotal:true}});

  // ── Run all parallel queries
  const [
    todayOrders, pending, totalOrders, totalCustomers, totalProducts,
    lowStock, outOfStock,
    statusCounts, topGroups, lowStockProducts,
    deliveredOrders, failedDeliveries, unassignedOrders,
    totalDeliveryStaff, availableDeliveryStaff,
    codCollected, codPending, verificationQueueCount, storeSetting,
    recentOrders, recentCustomers
  ] = await Promise.all([
    // Order counts
    prisma.order.count({where:{...orderScopeWhere, createdAt:todayRange}}),
    prisma.order.count({where:{...orderScopeWhere, status:{in:['NEW','CONFIRMED','PACKING','OUT_FOR_DELIVERY']}}}),
    prisma.order.count({where:orderScopeWhere}),

    // Customers - scoped: count distinct order owners; global: total customer accounts
    isScoped
      ? prisma.order.groupBy({by:['userId'],where:orderScopeWhere}).then(r=>r.length).catch(()=>0)
      : prisma.user.count({where:{role:'CUSTOMER'}}),

    // Product counts
    prisma.product.count({where:prodWhere}),
    prisma.product.count({where:lowWhere}),
    prisma.product.count({where:{...prodWhere, stock:0}}),

    // Order status pie
    prisma.order.groupBy({by:['status'],where:{...orderScopeWhere, createdAt:{gte:month,lt:tomorrow}},_count:{_all:true}}),

    // Top products by units sold
    prisma.orderItem.groupBy({
      by:['productId','name','unit','price'],
      where:{...orderItemScopeWhere, order:{status:'DELIVERED',createdAt:{gte:month,lt:tomorrow}}},
      _sum:{quantity:true}
    }),

    // Low/out-of-stock products
    prisma.product.findMany({
      where:{...prodWhere, OR:[{stock:0},lowWhere]},
      take:6, orderBy:{stock:'asc'},
      select:{id:true,name:true,unit:true,stock:true,lowStockThreshold:true,images:{take:1,orderBy:{position:'asc'},select:{url:true}}}
    }),

    // Delivery stats (not relevant when scoped - set to 0)
    prisma.order.count({where:{...orderScopeWhere, status:'DELIVERED'}}).catch(()=>0),
    isScoped ? Promise.resolve(0) : (prisma.deliveryAssignment?.count
      ? prisma.deliveryAssignment.count({where:{status:'DELIVERY_FAILED'}}).catch(()=>0) : 0),
    isScoped ? Promise.resolve(0) : (prisma.deliveryAssignment?.count
      ? prisma.order.count({where:{status:{in:['NEW','CONFIRMED','PACKING']},deliveryAssignments:{none:{isCurrent:true,status:{in:['ASSIGNED','ACCEPTED','PICKED_UP','OUT_FOR_DELIVERY','DELIVERY_PROOF_PENDING']}}}}}).catch(()=>0) : 0),
    isScoped ? Promise.resolve(0) : prisma.user.count({where:{OR:[{role:'DELIVERY_PERSON'},{staffRole:'DELIVERY_PERSON'}]}}).catch(()=>0),
    isScoped ? Promise.resolve(0) : prisma.user.count({where:{OR:[{role:'DELIVERY_PERSON'},{staffRole:'DELIVERY_PERSON'}],dutyStatus:'ON_DUTY',isStaffActive:true}}).catch(()=>0),

    // COD (global only)
    isScoped ? Promise.resolve({_sum:{collectedAmount:0}}) : (prisma.codCollection?.aggregate
      ? prisma.codCollection.aggregate({_sum:{collectedAmount:true}}).catch(()=>({_sum:{collectedAmount:0}})) : {_sum:{collectedAmount:0}}),
    isScoped ? Promise.resolve({_sum:{collectedAmount:0}}) : (prisma.codCollection?.aggregate
      ? prisma.codCollection.aggregate({_sum:{collectedAmount:true},where:{settlementStatus:'PENDING'}}).catch(()=>({_sum:{collectedAmount:0}})) : {_sum:{collectedAmount:0}}),

    // Proof queue (global only)
    isScoped ? Promise.resolve(0) : (prisma.deliveryProof?.count
      ? prisma.deliveryProof.count({where:{verificationStatus:'PENDING'}}).catch(()=>0) : 0),

    // Store settings (global only)
    isScoped ? Promise.resolve(null) : (prisma.storeSetting?.findFirst
      ? prisma.storeSetting.findFirst({select:{isOrderPaused:true,orderPauseMessage:true,emergencySettings:true}}).catch(()=>null) : null),

    // Recent orders
    prisma.order.findMany({
      where: orderScopeWhere,
      take:8, orderBy:{createdAt:'desc'},
      include:{
        items: isScoped ? {include:{product:{select:{id:true,categoryId:true}}}} : true,
        user:{select:{name:true,mobile:true}}
      }
    }),

    // Recent customers (global only)
    isScoped ? Promise.resolve([]) : prisma.user.findMany({
      where:{role:'CUSTOMER'}, take:6, orderBy:{createdAt:'desc'},
      select:{id:true,name:true,email:true,createdAt:true,_count:{select:{orders:true}}}
    })
  ]);

  // ── Revenue aggregations (run after scope-check)
  const [todayRevenue, totalRevenue] = await Promise.all([
    isScoped ? scopedRevenue({status:'DELIVERED', createdAt:todayRange}) : prisma.order.aggregate({_sum:{grandTotal:true},where:{status:'DELIVERED',createdAt:todayRange}}).then(r=>Number(r?._sum?.grandTotal||0)),
    isScoped ? scopedRevenue({status:'DELIVERED'}) : prisma.order.aggregate({_sum:{grandTotal:true},where:{status:'DELIVERED'}}).then(r=>Number(r?._sum?.grandTotal||0))
  ]);

  // ── Top products enriched with images
  const totals=new Map();
  for(const row of topGroups){
    const units=row._sum.quantity||0,current=totals.get(row.productId)||{id:row.productId,name:row.name,unit:row.unit,unitsSold:0,revenue:0};
    current.unitsSold+=units;current.revenue+=Number(row.price)*units;totals.set(row.productId,current);
  }
  const topProducts=[...totals.values()].sort((a,b)=>b.unitsSold-a.unitsSold).slice(0,5);
  const images=topProducts.length
    ? await prisma.product.findMany({where:{id:{in:topProducts.map(row=>row.id)}},select:{id:true,images:{take:1,orderBy:{position:'asc'},select:{url:true}}}})
    : [];

  // ── Filter recent order items to scoped categories
  const formattedRecentOrders = recentOrders.map(order => {
    if (isScoped && Array.isArray(order.items)) {
      return orderDto({
        ...order,
        items: order.items.filter(item => allowedCategoryIds.includes(item.product?.categoryId))
      });
    }
    return orderDto(order);
  });

  return {
    generatedAt:now.toISOString(), timezone:'Asia/Kolkata',
    stats:{
      todayOrders, pending, totalOrders, totalCustomers, totalProducts, lowStock, outOfStock,
      todayRevenue: typeof todayRevenue === 'number' ? todayRevenue : Number(todayRevenue?._sum?.grandTotal||0),
      totalRevenue: typeof totalRevenue === 'number' ? totalRevenue : Number(totalRevenue?._sum?.grandTotal||0),
      deliveredOrders: deliveredOrders||0,
      failedDeliveries: failedDeliveries||0,
      unassignedOrders: unassignedOrders||0,
      totalDeliveryStaff: totalDeliveryStaff||0,
      availableDeliveryStaff: availableDeliveryStaff||0,
      codCollected: Number(codCollected?._sum?.collectedAmount||0),
      codPendingSettlement: Number(codPending?._sum?.collectedAmount||0),
      verificationQueueCount: verificationQueueCount||0
    },
    storeStatus:{
      isOrderPaused: Boolean(storeSetting?.isOrderPaused),
      orderPauseMessage: storeSetting?.orderPauseMessage||null,
      emergencySettings: storeSetting?.emergencySettings||null
    },
    sales: salesSeries(weeklySalesRows, week),
    orderStatus: statusCounts.map(row=>({name:labels[row.status]||row.status,value:row._count._all,color:colors[row.status]||'#94a3b8'})),
    recentOrders: formattedRecentOrders,
    recentCustomers: recentCustomers.map(row=>({id:row.id,name:row.name,email:row.email,joinedAt:row.createdAt,orders:row._count.orders})),
    topProducts: topProducts.map(row=>({...row,image:images.find(image=>image.id===row.id)?.images[0]?.url||null})),
    lowStockProducts: lowStockProducts.map(({images,...row})=>({...row,image:images[0]?.url||null}))
  };
}
