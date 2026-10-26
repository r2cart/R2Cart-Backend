import * as auth from '../controllers/auth.controller.js';
import { Router } from 'express';
import * as a from '../controllers/admin.controller.js';
import { addVariant, listVariants } from '../controllers/variants.controller.js';
import * as productImport from '../controllers/product-import.controller.js';
import { dashboard } from '../controllers/dashboard.controller.js';
import * as adminProducts from '../controllers/admin-products.controller.js';
import { orders } from '../controllers/admin-orders.controller.js';
import { customers, setCustomerStatus, deleteCustomer } from '../controllers/admin-customers.controller.js';
import { reorder } from '../controllers/admin-reorder.controller.js';
import * as navbar from '../controllers/admin-navbar.controller.js';
import * as support from '../controllers/admin-support.controller.js';
import * as profile from '../controllers/admin-profile.controller.js';
import * as adminDelivery from '../controllers/admin-delivery.controller.js';
import * as adminInventory from '../controllers/admin-inventory.controller.js';
import * as adminScheduling from '../controllers/admin-scheduling.controller.js';
import * as adminMarketing from '../controllers/admin-marketing.controller.js';
import * as adminSecurity from '../controllers/admin-security.controller.js';
import * as adminEmergency from '../controllers/admin-emergency.controller.js';
import { adminDeliveryAssignments } from '../controllers/admin-delivery-assignments.controller.js';
import { adminRankingController } from '../controllers/admin-ranking.controller.js';
import { analytics } from '../controllers/admin-analytics.controller.js';
import { purchases } from '../controllers/admin-purchases.controller.js';
import { suppliers } from '../controllers/admin-suppliers.controller.js';
import { expenses } from '../controllers/admin-expenses.controller.js';
import {
  authenticate,
  authorize,
  authorizePermission,
  authorizeSuperAdmin
} from '../middleware/auth.js';

import {
  adminAvatarUpload,
  bannerImageUpload,
  productImageUpload,
  storeLogoUpload
} from '../middleware/upload.js';

export const adminRouter = Router();

// Base Authentication & Access Boundary (All admin routes require active staff/admin account)
adminRouter.use(authenticate, authorize('SUPER_ADMIN', 'ADMIN', 'MANAGER'));

// Session & Profile
adminRouter.post('/auth/refresh', auth.refresh);
adminRouter.get('/profile', profile.get);
adminRouter.patch('/profile', profile.update);
adminRouter.post('/profile/avatar', adminAvatarUpload.single('image'), profile.avatar);
adminRouter.delete('/profile/avatar', profile.removeAvatar);
adminRouter.patch('/profile/password', profile.password);
adminRouter.get('/search', navbar.search);
adminRouter.get('/notifications', navbar.notifications);

// Dashboard / Reporting
adminRouter.get(
  '/dashboard',
  authorizePermission('reports.view_basic', 'reports.view_financial'),
  dashboard
);

// ==========================================
// 1. PRODUCTS & CATALOG
// ==========================================
adminRouter.post(
  '/uploads/products',
  authorizePermission('products.create', 'products.edit'),
  productImageUpload.single('image'),
  a.uploadProductImage
);
adminRouter.post('/products', authorizePermission('products.create'), a.products.create);
adminRouter.post('/products/import/preview', authorizePermission('products.create'), productImport.preview);
adminRouter.post('/products/import', authorizePermission('products.create'), productImport.save);
adminRouter.get('/products', authorizePermission('products.view'), adminProducts.list);
adminRouter.get('/products/:id', authorizePermission('products.view'), adminProducts.get);
adminRouter.get('/products/:id/variants', authorizePermission('products.view'), listVariants);
adminRouter.post('/products/:id/variants', authorizePermission('products.create'), addVariant);
adminRouter.patch('/products/:id/status', authorizePermission('products.edit'), a.products.status);
adminRouter.patch('/products/:id/stock', authorizePermission('products.edit'), a.products.stock);
adminRouter.patch('/products/:id', authorizePermission('products.edit'), a.products.update);
adminRouter.delete('/products/all', authorizeSuperAdmin, a.products.removeAll);
adminRouter.delete('/products', authorizeSuperAdmin, a.products.removeAll);
adminRouter.delete('/products/category/:categoryId', authorizePermission('products.edit'), a.products.removeByCategory);
adminRouter.delete('/products/:id', authorizePermission('products.edit'), a.products.remove);

// ==========================================
// 2. CATEGORIES & BANNERS
// ==========================================
adminRouter.get('/categories', authorizePermission('categories.manage', 'products.view'), a.categories.list);
adminRouter.post('/categories/reorder', authorizePermission('categories.manage'), reorder('category'));
adminRouter.post('/categories', authorizePermission('categories.manage'), a.categories.create);
adminRouter.patch('/categories/:id', authorizePermission('categories.manage'), a.categories.update);
adminRouter.delete('/categories/:id', authorizePermission('categories.manage'), a.categories.remove);
adminRouter.post(
  '/uploads/categories',
  authorizePermission('categories.manage'),
  productImageUpload.single('image'),
  a.uploadCategoryImage
);

adminRouter.get('/banners', authorizePermission('banners.manage'), a.banners.list);
adminRouter.post('/banners/reorder', authorizePermission('banners.manage'), reorder('banner'));
adminRouter.post('/banners', authorizePermission('banners.manage'), a.banners.create);
adminRouter.patch('/banners/:id', authorizePermission('banners.manage'), a.banners.update);
adminRouter.patch('/banners/:id/status', authorizePermission('banners.manage'), a.banners.status);
adminRouter.delete('/banners/:id', authorizePermission('banners.manage'), a.banners.remove);
adminRouter.post(
  '/uploads/banners',
  authorizePermission('banners.manage'),
  bannerImageUpload.single('image'),
  a.uploadBannerImage
);

// ==========================================
// 3. ORDERS & PACKING OPERATIONS
// ==========================================
const authorizeOrderStatusChange = (req, res, next) => {
  const status = String(req.body.status || '').trim().toUpperCase();
  if (status === 'CANCELLED') {
    return authorizePermission('orders.cancel')(req, res, next);
  }
  return authorizePermission('orders.update_status')(req, res, next);
};

adminRouter.get('/orders', authorizePermission('orders.view'), orders.list);
adminRouter.get('/orders/:id', authorizePermission('orders.view'), orders.get);
adminRouter.patch('/orders/:id/status', authorizeOrderStatusChange, orders.status);
adminRouter.patch('/orders/:id/items/:itemId', authorizePermission('orders.update_status'), orders.modifyItem);

// ==========================================
// 4. CUSTOMERS (LIMITED VIEW)
// ==========================================
adminRouter.get('/customers', authorizePermission('customers.view_limited'), customers);
adminRouter.patch('/customers/:id/status', authorizePermission('customers.view_limited'), setCustomerStatus);
adminRouter.delete('/customers/:id', deleteCustomer);

// ==========================================
// 5. DELIVERY HUB & ASSIGNMENTS
// ==========================================
adminRouter.get('/delivery/villages/preview', authorizePermission('delivery.view'), adminDelivery.villages.preview);
adminRouter.get('/delivery/villages', authorizePermission('delivery.view'), adminDelivery.villages.list);
adminRouter.post('/delivery/villages', authorizePermission('delivery.view'), adminDelivery.villages.create);
adminRouter.get('/delivery/villages/:id', authorizePermission('delivery.view'), adminDelivery.villages.get);
adminRouter.patch('/delivery/villages/:id', authorizePermission('delivery.view'), adminDelivery.villages.update);
adminRouter.patch('/delivery/villages/:id/status', authorizePermission('delivery.view'), adminDelivery.villages.status);
adminRouter.patch('/delivery/villages/:id/pause', authorizePermission('delivery.view'), adminDelivery.villages.pause);
adminRouter.delete('/delivery/villages/:id', authorizePermission('delivery.view'), adminDelivery.villages.remove);

adminRouter.get('/delivery/areas', authorizePermission('delivery.view'), adminDelivery.areas.list);
adminRouter.post('/delivery/areas', authorizePermission('delivery.view'), adminDelivery.areas.create);
adminRouter.patch('/delivery/areas/:id', authorizePermission('delivery.view'), adminDelivery.areas.update);
adminRouter.patch('/delivery/areas/:id/status', authorizePermission('delivery.view'), adminDelivery.areas.status);
adminRouter.patch('/delivery/areas/:id/pause', authorizePermission('delivery.view'), adminDelivery.areas.pause);
adminRouter.delete('/delivery/areas/:id', authorizePermission('delivery.view'), adminDelivery.areas.remove);

adminRouter.get('/delivery/config', authorizePermission('delivery.view'), adminDelivery.deliveryConfig.get);
adminRouter.patch('/delivery/config', authorizeSuperAdmin, adminDelivery.deliveryConfig.update);

// Legacy delivery routes compatibility
adminRouter.get('/delivery', authorizePermission('delivery.view'), a.delivery.list);
adminRouter.patch('/delivery/defaults', authorizeSuperAdmin, a.delivery.defaults);
adminRouter.post('/delivery', authorizePermission('delivery.view'), a.delivery.create);
adminRouter.patch('/delivery/:id/status', authorizePermission('delivery.view'), a.delivery.status);
adminRouter.patch('/delivery/:id', authorizePermission('delivery.view'), a.delivery.update);
adminRouter.delete('/delivery/:id', authorizePermission('delivery.view'), a.delivery.remove);

// Delivery Assignments, Proof Verification & COD Settlement
adminRouter.get('/delivery-assignments/staff', authorizePermission('delivery.view'), adminDeliveryAssignments.listStaff);
adminRouter.get('/delivery-assignments/unassigned-orders', authorizePermission('delivery.view'), adminDeliveryAssignments.listUnassignedOrders);
adminRouter.get('/delivery-assignments', authorizePermission('delivery.view'), adminDeliveryAssignments.listAssignments);
adminRouter.post('/delivery-assignments/assign', authorizePermission('delivery.assign'), adminDeliveryAssignments.assignOrder);
adminRouter.post('/delivery-assignments/reassign', authorizePermission('delivery.assign'), adminDeliveryAssignments.reassignOrder);

adminRouter.get('/delivery-verifications', authorizePermission('delivery.view'), adminDeliveryAssignments.listVerifications);
adminRouter.patch('/delivery-verifications/:id', authorizePermission('delivery.assign'), adminDeliveryAssignments.verifyDeliveryProof);

adminRouter.get('/cod-collections', authorizePermission('delivery.view'), adminDeliveryAssignments.listCodCollections);
adminRouter.post('/cod-settlements', authorizePermission('delivery.assign'), adminDeliveryAssignments.settleCodCollections);
adminRouter.get('/cod-settlements', authorizePermission('delivery.view'), adminDeliveryAssignments.listSettlements);

// ==========================================
// 6. SMART INVENTORY & STOCK
// ==========================================
adminRouter.get('/inventory/overview', authorizePermission('inventory.view'), adminInventory.inventory.overview);
adminRouter.post('/inventory/adjust', authorizePermission('inventory.manage'), adminInventory.inventory.adjust);
adminRouter.patch('/inventory/expiry', authorizePermission('inventory.manage'), adminInventory.inventory.updateExpiry);
adminRouter.get('/inventory/logs', authorizePermission('inventory.view'), adminInventory.inventory.logs);
adminRouter.patch('/inventory/auto-hide', authorizePermission('inventory.manage'), adminInventory.inventory.toggleAutoHide);
adminRouter.get('/inventory/export', authorizePermission('inventory.view'), adminInventory.inventory.exportReport);

// Stock quick endpoints
adminRouter.patch('/inventory/:id', authorizePermission('products.update_stock', 'inventory.manage'), a.products.stock);
adminRouter.get('/inventory', authorizePermission('inventory.view'), a.inventory);

// ==========================================
// 7. STORE OPERATIONS & ORDER SCHEDULING
// ==========================================
adminRouter.get('/scheduling/preview', authorizePermission('scheduling.manage'), adminScheduling.scheduling.preview);
adminRouter.get('/scheduling/store-hours', authorizePermission('scheduling.manage'), adminScheduling.scheduling.getStoreSchedule);
adminRouter.patch('/scheduling/store-hours', authorizePermission('scheduling.manage'), adminScheduling.scheduling.updateHours);
adminRouter.patch('/scheduling/holidays', authorizePermission('scheduling.manage'), adminScheduling.scheduling.updateHolidays);
adminRouter.post('/scheduling/pause-orders', authorizePermission('scheduling.manage'), adminScheduling.scheduling.pauseOrders);

adminRouter.get('/scheduling/seasonal', authorizePermission('scheduling.manage'), adminScheduling.scheduling.seasonal.list);
adminRouter.post('/scheduling/seasonal', authorizePermission('scheduling.manage'), adminScheduling.scheduling.seasonal.save);
adminRouter.delete('/scheduling/seasonal/:id', authorizePermission('scheduling.manage'), adminScheduling.scheduling.seasonal.remove);

adminRouter.get('/scheduling/special-days', authorizePermission('scheduling.manage'), adminScheduling.scheduling.specialDays.list);
adminRouter.post('/scheduling/special-days', authorizePermission('scheduling.manage'), adminScheduling.scheduling.specialDays.save);
adminRouter.delete('/scheduling/special-days/:id', authorizePermission('scheduling.manage'), adminScheduling.scheduling.specialDays.remove);

adminRouter.get('/scheduling/slots', authorizePermission('scheduling.manage'), adminScheduling.scheduling.slots.list);
adminRouter.post('/scheduling/slots', authorizePermission('scheduling.manage'), adminScheduling.scheduling.slots.create);
adminRouter.patch('/scheduling/slots/:id', authorizePermission('scheduling.manage'), adminScheduling.scheduling.slots.update);
adminRouter.patch('/scheduling/slots/:id/status', authorizePermission('scheduling.manage'), adminScheduling.scheduling.slots.status);
adminRouter.delete('/scheduling/slots/:id', authorizePermission('scheduling.manage'), adminScheduling.scheduling.slots.remove);
adminRouter.get('/scheduling/orders', authorizePermission('scheduling.manage'), adminScheduling.scheduling.getScheduledOrders);

// ==========================================
// 8. EMERGENCY MANAGEMENT (SUPER ADMIN)
// ==========================================
adminRouter.get('/emergency/status', authorizePermission('scheduling.manage'), adminEmergency.emergency.getStatus);
adminRouter.post('/emergency/activate', authorizeSuperAdmin, adminEmergency.emergency.activate);
adminRouter.post('/emergency/deactivate', authorizeSuperAdmin, adminEmergency.emergency.deactivate);
adminRouter.get('/emergency/history', authorizePermission('scheduling.manage'), adminEmergency.emergency.getHistory);

// ==========================================
// 9. MARKETING & PROMOTIONS
// ==========================================
adminRouter.get('/marketing/campaigns', authorizePermission('coupons.manage'), adminMarketing.marketing.campaigns.list);
adminRouter.post('/marketing/campaigns', authorizePermission('coupons.manage'), adminMarketing.marketing.campaigns.create);
adminRouter.get('/marketing/campaigns/:id', authorizePermission('coupons.manage'), adminMarketing.marketing.campaigns.get);
adminRouter.patch('/marketing/campaigns/:id', authorizePermission('coupons.manage'), adminMarketing.marketing.campaigns.update);
adminRouter.patch('/marketing/campaigns/:id/status', authorizePermission('coupons.manage'), adminMarketing.marketing.campaigns.status);
adminRouter.delete('/marketing/campaigns/:id', authorizePermission('coupons.manage'), adminMarketing.marketing.campaigns.remove);

adminRouter.get('/marketing/coupons/usages', authorizePermission('coupons.manage'), adminMarketing.marketing.coupons.usages);
adminRouter.get('/marketing/performance', authorizePermission('coupons.manage'), adminMarketing.marketing.performance);

adminRouter.get('/coupons', authorizePermission('coupons.manage'), a.coupons.list);
adminRouter.post('/coupons', authorizePermission('coupons.manage'), a.coupons.create);
adminRouter.patch('/coupons/:id', authorizePermission('coupons.manage'), a.coupons.update);
adminRouter.delete('/coupons/:id', authorizePermission('coupons.manage'), a.coupons.remove);
adminRouter.patch('/coupons/:id/status', authorizePermission('coupons.manage'), a.coupons.status);

// ==========================================
// 10. SUPER ADMIN: ADMIN & STAFF MANAGEMENT, AUDIT TRAILS
// ==========================================
adminRouter.get('/security/staff', authorizeSuperAdmin, adminSecurity.security.staff.list);
adminRouter.post('/security/staff', authorizeSuperAdmin, adminSecurity.security.staff.create);
adminRouter.patch('/security/staff/:id', authorizeSuperAdmin, adminSecurity.security.staff.update);
adminRouter.delete('/security/staff/:id', authorizeSuperAdmin, adminSecurity.security.staff.remove);

adminRouter.get('/security/audit-logs', authorizeSuperAdmin, adminSecurity.security.auditLogs.list);
adminRouter.get('/security/login-history', authorizeSuperAdmin, adminSecurity.security.auditLogs.loginHistory);

// ==========================================
// 11. CUSTOMER SUPPORT
// ==========================================
adminRouter.get('/support', authorizePermission('support.manage'), support.list);
adminRouter.patch('/support/:id', authorizePermission('support.manage'), support.reply);

// ==========================================
// 12. SUPER ADMIN: GLOBAL SETTINGS & EMERGENCY PAUSE
// ==========================================
adminRouter.get('/settings', authorizeSuperAdmin, a.settings.get);
adminRouter.put('/settings', authorizeSuperAdmin, a.settings.save);
adminRouter.post('/store/emergency-pause', authorizeSuperAdmin, a.settings.emergencyPause);
adminRouter.post('/uploads/settings/logo', authorizeSuperAdmin, storeLogoUpload.single('image'), a.uploadStoreLogo);

// ==========================================
// 13. SUPER ADMIN: HOMEPAGE RANKING
// ==========================================
adminRouter.get('/homepage-ranking', authorizeSuperAdmin, adminRankingController.getConfig);
adminRouter.put('/homepage-ranking/draft', authorizeSuperAdmin, adminRankingController.updateDraft);
adminRouter.get('/homepage-ranking/preview', authorizeSuperAdmin, adminRankingController.preview);
adminRouter.post('/homepage-ranking/publish', authorizeSuperAdmin, adminRankingController.publish);
adminRouter.get('/homepage-ranking/history', authorizeSuperAdmin, adminRankingController.getHistory);
adminRouter.post('/homepage-ranking/rollback', authorizeSuperAdmin, adminRankingController.rollback);
adminRouter.post('/homepage-ranking/refresh-cache', authorizeSuperAdmin, adminRankingController.refreshCache);

// ==========================================
// 14. BUSINESS ANALYTICS & PROFIT MANAGEMENT
// ==========================================
adminRouter.get('/analytics/sales-profit', authorizePermission('analytics.view', 'reports.view_financial'), analytics.salesProfit);
adminRouter.get('/analytics/overview', authorizePermission('analytics.view', 'reports.view_financial'), analytics.overview);
adminRouter.get('/analytics/sales-trend', authorizePermission('analytics.view', 'reports.view_financial'), analytics.salesTrend);
adminRouter.get('/analytics/product-performance', authorizePermission('analytics.view', 'reports.view_financial'), analytics.productPerformance);
adminRouter.get('/analytics/inventory-valuation', authorizePermission('inventory.view', 'analytics.cost_view'), analytics.inventoryValuation);
adminRouter.post('/analytics/reconcile-opening-stock', authorizeSuperAdmin, analytics.reconcileOpeningStock);
adminRouter.post('/analytics/record-wastage', authorizePermission('inventory.manage'), analytics.recordWastage);
adminRouter.get('/analytics/cash-flow', authorizePermission('analytics.view', 'reports.view_financial'), analytics.cashFlow);
adminRouter.get('/analytics/insights', authorizePermission('analytics.view'), analytics.insights);
adminRouter.get('/analytics/export/:reportType', authorizePermission('reports.export', 'reports.view_financial'), analytics.exportCsv);

// ==========================================
// 15. PURCHASES & INVENTORY RECEIPT
// ==========================================
adminRouter.get('/purchases', authorizePermission('purchases.view'), purchases.list);
adminRouter.get('/purchases/:id', authorizePermission('purchases.view'), purchases.get);
adminRouter.post('/purchases', authorizePermission('purchases.manage'), purchases.create);
adminRouter.post('/purchases/:id/finalize', authorizePermission('purchases.manage'), purchases.finalize);
adminRouter.post('/purchases/:id/cancel', authorizePermission('purchases.manage'), purchases.cancel);

// ==========================================
// 16. SUPPLIER MANAGEMENT & PAYMENTS
// ==========================================
adminRouter.get('/suppliers', authorizePermission('suppliers.view'), suppliers.list);
adminRouter.get('/suppliers/:id', authorizePermission('suppliers.view'), suppliers.get);
adminRouter.post('/suppliers', authorizePermission('suppliers.manage'), suppliers.create);
adminRouter.patch('/suppliers/:id', authorizePermission('suppliers.manage'), suppliers.update);
adminRouter.post('/suppliers/:id/payments', authorizePermission('suppliers.manage'), suppliers.recordPayment);

// ==========================================
// 17. OPERATING EXPENSES
// ==========================================
adminRouter.get('/expenses', authorizePermission('expenses.view'), expenses.list);
adminRouter.post('/expenses', authorizePermission('expenses.manage'), expenses.create);
adminRouter.patch('/expenses/:id', authorizePermission('expenses.manage'), expenses.update);
adminRouter.delete('/expenses/:id', authorizePermission('expenses.manage'), expenses.remove);
