import * as auth from '../controllers/auth.controller.js';
import {Router} from 'express';
import * as a from '../controllers/admin.controller.js';
import {addVariant,listVariants} from '../controllers/variants.controller.js';
import * as productImport from '../controllers/product-import.controller.js';
import {dashboard} from '../controllers/dashboard.controller.js';
import * as adminProducts from '../controllers/admin-products.controller.js';
import {orders} from '../controllers/admin-orders.controller.js';
import {customers,setCustomerStatus} from '../controllers/admin-customers.controller.js';
import {reorder} from '../controllers/admin-reorder.controller.js';
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
import {authenticate,authorize,authorizeModule} from '../middleware/auth.js';

import {adminAvatarUpload,bannerImageUpload,productImageUpload,storeLogoUpload} from '../middleware/upload.js';

export const adminRouter = Router();

// Base Authentication & Profile
adminRouter.use(authenticate, authorize('SUPER_ADMIN', 'ADMIN', 'MANAGER'));
adminRouter.post('/auth/refresh', auth.refresh);
adminRouter.get('/profile', profile.get);
adminRouter.patch('/profile', profile.update);
adminRouter.post('/profile/avatar', adminAvatarUpload.single('image'), profile.avatar);
adminRouter.delete('/profile/avatar', profile.removeAvatar);
adminRouter.patch('/profile/password', profile.password);
adminRouter.get('/search', navbar.search);
adminRouter.get('/notifications', navbar.notifications);
adminRouter.post('/uploads/products', productImageUpload.single('image'), a.uploadProductImage);
adminRouter.post('/uploads/banners', bannerImageUpload.single('image'), a.uploadBannerImage);
adminRouter.post('/uploads/settings/logo', storeLogoUpload.single('image'), a.uploadStoreLogo);
adminRouter.get('/dashboard', dashboard);

// Products & Catalog
adminRouter.post('/products', authorizeModule('products'), a.products.create);
adminRouter.post('/products/import/preview', authorizeModule('products'), productImport.preview);
adminRouter.post('/products/import', authorizeModule('products'), productImport.save);
adminRouter.get('/products', authorizeModule('products'), adminProducts.list);
adminRouter.get('/products/:id', authorizeModule('products'), adminProducts.get);
adminRouter.get('/products/:id/variants', authorizeModule('products'), listVariants);
adminRouter.post('/products/:id/variants', authorizeModule('products'), addVariant);
adminRouter.patch('/products/:id/status', authorizeModule('products'), a.products.status);
adminRouter.patch('/products/:id', authorizeModule('products'), a.products.update);
adminRouter.delete('/products/all', authorizeModule('products'), a.products.removeAll);
adminRouter.delete('/products', authorizeModule('products'), a.products.removeAll);
adminRouter.delete('/products/:id', authorizeModule('products'), a.products.remove);

// Categories & Banners
adminRouter.get('/categories', a.categories.list);
adminRouter.post('/categories/reorder', reorder('category'));
adminRouter.post('/banners/reorder', reorder('banner'));
adminRouter.post('/categories', a.categories.create);
adminRouter.patch('/categories/:id', a.categories.update);
adminRouter.delete('/categories/:id', a.categories.remove);

// Orders & Packing Management
adminRouter.get('/orders', authorizeModule('orders'), orders.list);
adminRouter.get('/orders/:id', authorizeModule('orders'), orders.get);
adminRouter.patch('/orders/:id/status', authorizeModule('orders'), orders.status);
adminRouter.patch('/orders/:id/items/:itemId', authorizeModule('orders'), orders.modifyItem);

// Customers
adminRouter.get('/customers', authorizeModule('customers'), customers);
adminRouter.patch('/customers/:id/status', authorizeModule('customers'), setCustomerStatus);

// ==========================================
// 1. VILLAGE-WISE DELIVERY MANAGEMENT
// ==========================================
adminRouter.get('/delivery/villages/preview', authorizeModule('delivery'), adminDelivery.villages.preview);
adminRouter.get('/delivery/villages', authorizeModule('delivery'), adminDelivery.villages.list);
adminRouter.post('/delivery/villages', authorizeModule('delivery'), adminDelivery.villages.create);
adminRouter.get('/delivery/villages/:id', authorizeModule('delivery'), adminDelivery.villages.get);
adminRouter.patch('/delivery/villages/:id', authorizeModule('delivery'), adminDelivery.villages.update);
adminRouter.patch('/delivery/villages/:id/status', authorizeModule('delivery'), adminDelivery.villages.status);
adminRouter.patch('/delivery/villages/:id/pause', authorizeModule('delivery'), adminDelivery.villages.pause);
adminRouter.delete('/delivery/villages/:id', authorizeModule('delivery'), adminDelivery.villages.remove);

adminRouter.get('/delivery/areas', authorizeModule('delivery'), adminDelivery.areas.list);
adminRouter.post('/delivery/areas', authorizeModule('delivery'), adminDelivery.areas.create);
adminRouter.patch('/delivery/areas/:id', authorizeModule('delivery'), adminDelivery.areas.update);
adminRouter.patch('/delivery/areas/:id/status', authorizeModule('delivery'), adminDelivery.areas.status);
adminRouter.patch('/delivery/areas/:id/pause', authorizeModule('delivery'), adminDelivery.areas.pause);
adminRouter.delete('/delivery/areas/:id', authorizeModule('delivery'), adminDelivery.areas.remove);

adminRouter.get('/delivery/config', authorizeModule('delivery'), adminDelivery.deliveryConfig.get);
adminRouter.patch('/delivery/config', authorizeModule('delivery'), adminDelivery.deliveryConfig.update);

// Legacy delivery routes compatibility
adminRouter.get('/delivery', a.delivery.list);
adminRouter.patch('/delivery/defaults', a.delivery.defaults);
adminRouter.post('/delivery', a.delivery.create);
adminRouter.patch('/delivery/:id/status', a.delivery.status);
adminRouter.patch('/delivery/:id', a.delivery.update);
adminRouter.delete('/delivery/:id', a.delivery.remove);

// ==========================================
// DELIVERY ASSIGNMENTS, POD VERIFICATION & COD SETTLEMENT
// ==========================================
adminRouter.get('/delivery-assignments/staff', authorizeModule('delivery'), adminDeliveryAssignments.listStaff);
adminRouter.get('/delivery-assignments/unassigned-orders', authorizeModule('delivery'), adminDeliveryAssignments.listUnassignedOrders);
adminRouter.get('/delivery-assignments', authorizeModule('delivery'), adminDeliveryAssignments.listAssignments);
adminRouter.post('/delivery-assignments/assign', authorizeModule('delivery'), adminDeliveryAssignments.assignOrder);
adminRouter.post('/delivery-assignments/reassign', authorizeModule('delivery'), adminDeliveryAssignments.reassignOrder);

adminRouter.get('/delivery-verifications', authorizeModule('delivery'), adminDeliveryAssignments.listVerifications);
adminRouter.patch('/delivery-verifications/:id', authorizeModule('delivery'), adminDeliveryAssignments.verifyDeliveryProof);

adminRouter.get('/cod-collections', authorizeModule('delivery'), adminDeliveryAssignments.listCodCollections);
adminRouter.post('/cod-settlements', authorizeModule('delivery'), adminDeliveryAssignments.settleCodCollections);
adminRouter.get('/cod-settlements', authorizeModule('delivery'), adminDeliveryAssignments.listSettlements);

// ==========================================
// 2. SMART INVENTORY MANAGEMENT
// ==========================================
adminRouter.get('/inventory/overview', authorizeModule('inventory'), adminInventory.inventory.overview);
adminRouter.post('/inventory/adjust', authorizeModule('inventory'), adminInventory.inventory.adjust);
adminRouter.patch('/inventory/expiry', authorizeModule('inventory'), adminInventory.inventory.updateExpiry);
adminRouter.get('/inventory/logs', authorizeModule('inventory'), adminInventory.inventory.logs);
adminRouter.patch('/inventory/auto-hide', authorizeModule('inventory'), adminInventory.inventory.toggleAutoHide);
adminRouter.get('/inventory/export', authorizeModule('inventory'), adminInventory.inventory.exportReport);

// Legacy stock endpoints compatibility
adminRouter.patch('/inventory/:id', a.products.stock);
adminRouter.get('/inventory', a.inventory);

// ==========================================
// 3. STORE OPERATIONS & ORDER SCHEDULING
// ==========================================
adminRouter.get('/scheduling/preview', authorizeModule('scheduling'), adminScheduling.scheduling.preview);
adminRouter.get('/scheduling/store-hours', authorizeModule('scheduling'), adminScheduling.scheduling.getStoreSchedule);
adminRouter.patch('/scheduling/store-hours', authorizeModule('scheduling'), adminScheduling.scheduling.updateHours);
adminRouter.patch('/scheduling/holidays', authorizeModule('scheduling'), adminScheduling.scheduling.updateHolidays);
adminRouter.post('/scheduling/pause-orders', authorizeModule('scheduling'), adminScheduling.scheduling.pauseOrders);

adminRouter.get('/scheduling/seasonal', authorizeModule('scheduling'), adminScheduling.scheduling.seasonal.list);
adminRouter.post('/scheduling/seasonal', authorizeModule('scheduling'), adminScheduling.scheduling.seasonal.save);
adminRouter.delete('/scheduling/seasonal/:id', authorizeModule('scheduling'), adminScheduling.scheduling.seasonal.remove);

adminRouter.get('/scheduling/special-days', authorizeModule('scheduling'), adminScheduling.scheduling.specialDays.list);
adminRouter.post('/scheduling/special-days', authorizeModule('scheduling'), adminScheduling.scheduling.specialDays.save);
adminRouter.delete('/scheduling/special-days/:id', authorizeModule('scheduling'), adminScheduling.scheduling.specialDays.remove);

adminRouter.get('/scheduling/slots', authorizeModule('scheduling'), adminScheduling.scheduling.slots.list);
adminRouter.post('/scheduling/slots', authorizeModule('scheduling'), adminScheduling.scheduling.slots.create);
adminRouter.patch('/scheduling/slots/:id', authorizeModule('scheduling'), adminScheduling.scheduling.slots.update);
adminRouter.patch('/scheduling/slots/:id/status', authorizeModule('scheduling'), adminScheduling.scheduling.slots.status);
adminRouter.delete('/scheduling/slots/:id', authorizeModule('scheduling'), adminScheduling.scheduling.slots.remove);
adminRouter.get('/scheduling/orders', authorizeModule('scheduling'), adminScheduling.scheduling.getScheduledOrders);

// ==========================================
// EMERGENCY MANAGEMENT (DEDICATED MODULE)
// ==========================================
adminRouter.get('/emergency/status', authorizeModule('scheduling'), adminEmergency.emergency.getStatus);
adminRouter.post('/emergency/activate', authorizeModule('scheduling'), adminEmergency.emergency.activate);
adminRouter.post('/emergency/deactivate', authorizeModule('scheduling'), adminEmergency.emergency.deactivate);
adminRouter.get('/emergency/history', authorizeModule('scheduling'), adminEmergency.emergency.getHistory);


// ==========================================
// 4. MARKETING & PROMOTION MANAGEMENT
// ==========================================
adminRouter.get('/marketing/campaigns', authorizeModule('marketing'), adminMarketing.marketing.campaigns.list);
adminRouter.post('/marketing/campaigns', authorizeModule('marketing'), adminMarketing.marketing.campaigns.create);
adminRouter.get('/marketing/campaigns/:id', authorizeModule('marketing'), adminMarketing.marketing.campaigns.get);
adminRouter.patch('/marketing/campaigns/:id', authorizeModule('marketing'), adminMarketing.marketing.campaigns.update);
adminRouter.patch('/marketing/campaigns/:id/status', authorizeModule('marketing'), adminMarketing.marketing.campaigns.status);
adminRouter.delete('/marketing/campaigns/:id', authorizeModule('marketing'), adminMarketing.marketing.campaigns.remove);

adminRouter.get('/marketing/coupons/usages', authorizeModule('marketing'), adminMarketing.marketing.coupons.usages);
adminRouter.get('/marketing/performance', authorizeModule('marketing'), adminMarketing.marketing.performance);

// Coupons & Banners
for (const [path, handler] of [['coupons', a.coupons], ['banners', a.banners]]) {
  adminRouter.get(`/${path}`, handler.list);
  adminRouter.post(`/${path}`, handler.create);
  adminRouter.patch(`/${path}/:id`, handler.update);
  adminRouter.delete(`/${path}/:id`, handler.remove);
}
adminRouter.patch('/coupons/:id/status', a.coupons.status);
adminRouter.patch('/banners/:id/status', a.banners.status);

// ==========================================
// 5. ADMIN SECURITY & AUDIT TRAIL
// ==========================================
adminRouter.get('/security/staff', authorizeModule('security'), adminSecurity.security.staff.list);
adminRouter.post('/security/staff', authorizeModule('security'), adminSecurity.security.staff.create);
adminRouter.patch('/security/staff/:id', authorizeModule('security'), adminSecurity.security.staff.update);
adminRouter.delete('/security/staff/:id', authorizeModule('security'), adminSecurity.security.staff.remove);

adminRouter.get('/security/audit-logs', authorizeModule('security'), adminSecurity.security.auditLogs.list);
adminRouter.get('/security/login-history', authorizeModule('security'), adminSecurity.security.auditLogs.loginHistory);

// Support & General Settings
adminRouter.get('/support', support.list);
adminRouter.patch('/support/:id', support.reply);
adminRouter.get('/settings', a.settings.get);
adminRouter.put('/settings', a.settings.save);
adminRouter.post('/store/emergency-pause', a.settings.emergencyPause);
