/**
 * R2Cart Role-Based Access Control (RBAC) System Permissions
 * 
 * Defines all granular system permissions, logical groupings, and evaluation rules.
 * Super Admin possesses full authorized control over all actions.
 * Admins are restricted staff accounts following the principle of least privilege.
 */

export const SYSTEM_PERMISSIONS = {
  // Products Management
  'products.view': {
    key: 'products.view',
    label: 'View Products',
    group: 'Products',
    description: 'Browse product catalog, view variants, and read product details'
  },
  'products.create': {
    key: 'products.create',
    label: 'Create Products',
    group: 'Products',
    description: 'Add new products, bulk import spreadsheets, and create pack size variants'
  },
  'products.edit': {
    key: 'products.edit',
    label: 'Edit Products',
    group: 'Products',
    description: 'Modify product descriptions, prices, categories, images, and active status'
  },
  'products.update_stock': {
    key: 'products.update_stock',
    label: 'Update Stock Levels',
    group: 'Products',
    description: 'Quick stock adjustments and low-stock alert thresholds'
  },

  // Inventory Management
  'inventory.view': {
    key: 'inventory.view',
    label: 'View Inventory',
    group: 'Inventory',
    description: 'Inspect stock overview, expiry dates, batch numbers, and audit history logs'
  },
  'inventory.manage': {
    key: 'inventory.manage',
    label: 'Manage Inventory',
    group: 'Inventory',
    description: 'Perform stock adjustments, update product expiry, and toggle auto-hide'
  },

  // Orders Operations
  'orders.view': {
    key: 'orders.view',
    label: 'View Orders',
    group: 'Orders',
    description: 'View customer orders, item details, customer notes, and payment records'
  },
  'orders.update_status': {
    key: 'orders.update_status',
    label: 'Update Order Status',
    group: 'Orders',
    description: 'Advance orders through Confirmed, Packing, and Out for Delivery'
  },
  'orders.cancel': {
    key: 'orders.cancel',
    label: 'Cancel Orders',
    group: 'Orders',
    description: 'Cancel customer orders and automatically restore inventory stock'
  },

  // Customers
  'customers.view_limited': {
    key: 'customers.view_limited',
    label: 'View Customers (Limited)',
    group: 'Customers',
    description: 'View customer profiles, total orders, and order history without full credentials'
  },

  // Delivery Hub
  'delivery.view': {
    key: 'delivery.view',
    label: 'View Delivery Hub',
    group: 'Delivery',
    description: 'View delivery zones, serviceable villages, and active order assignments'
  },
  'delivery.assign': {
    key: 'delivery.assign',
    label: 'Assign & Verify Deliveries',
    group: 'Delivery',
    description: 'Assign orders to delivery riders, verify proof of delivery, and settle COD collections'
  },

  // Reports & Financials
  'reports.view_basic': {
    key: 'reports.view_basic',
    label: 'View Basic Reports',
    group: 'Reports',
    description: 'View operational statistics (order volume, low stock, delivery status summary)'
  },
  'reports.view_financial': {
    key: 'reports.view_financial',
    label: 'View Financial & Revenue',
    group: 'Reports',
    description: 'View sensitive revenue figures, daily earnings, sales trends, and financial reports'
  },

  // Catalog & Content
  'categories.manage': {
    key: 'categories.manage',
    label: 'Manage Categories',
    group: 'Catalog & Content',
    description: 'Create, edit, reorder, and remove product categories'
  },
  'banners.manage': {
    key: 'banners.manage',
    label: 'Manage Banners',
    group: 'Catalog & Content',
    description: 'Create, edit, upload, and position homepage promotional banners'
  },

  // Marketing & Operations
  'coupons.manage': {
    key: 'coupons.manage',
    label: 'Manage Coupons & Promos',
    group: 'Marketing',
    description: 'Create discount coupons, marketing campaigns, and track promotional performance'
  },
  'scheduling.manage': {
    key: 'scheduling.manage',
    label: 'Store Hours & Scheduling',
    group: 'Operations',
    description: 'Manage delivery slots, weekly store hours, seasonal schedules, and holidays'
  },
  'support.manage': {
    key: 'support.manage',
    label: 'Customer Support',
    group: 'Support',
    description: 'View customer inquiries and respond to support tickets'
  },

  // Business Analytics & Profit Management
  'analytics.view': {
    key: 'analytics.view',
    label: 'View Business Analytics',
    group: 'Analytics & Profit',
    description: 'Access business analytics dashboard, sales summaries, and product performance'
  },
  'analytics.cost_view': {
    key: 'analytics.cost_view',
    label: 'View COGS & Profit Margins',
    group: 'Analytics & Profit',
    description: 'View sensitive FIFO cost of goods sold, gross margins, and net operating profit'
  },
  'purchases.view': {
    key: 'purchases.view',
    label: 'View Purchases',
    group: 'Purchases & Suppliers',
    description: 'Browse purchase history, supplier bills, and line items'
  },
  'purchases.manage': {
    key: 'purchases.manage',
    label: 'Manage Purchases',
    group: 'Purchases & Suppliers',
    description: 'Create purchase drafts, allocate landed freight, and finalize inventory receipts'
  },
  'suppliers.view': {
    key: 'suppliers.view',
    label: 'View Suppliers',
    group: 'Purchases & Suppliers',
    description: 'View supplier profiles, purchase history, and outstanding payables'
  },
  'suppliers.manage': {
    key: 'suppliers.manage',
    label: 'Manage Suppliers',
    group: 'Purchases & Suppliers',
    description: 'Create and edit supplier profiles, and record supplier payments'
  },
  'expenses.view': {
    key: 'expenses.view',
    label: 'View Expenses',
    group: 'Expenses',
    description: 'Inspect business operating expenses and category breakdowns'
  },
  'expenses.manage': {
    key: 'expenses.manage',
    label: 'Manage Expenses',
    group: 'Expenses',
    description: 'Record operating expenses, attach references, and update payment status'
  },
  'reports.export': {
    key: 'reports.export',
    label: 'Export Financial Reports',
    group: 'Reports',
    description: 'Download CSV spreadsheets for Sales, P&L, Inventory Valuation, and Purchases'
  }
};

export const PERMISSION_GROUPS = [
  { name: 'Products', keys: ['products.view', 'products.create', 'products.edit', 'products.update_stock'] },
  { name: 'Inventory', keys: ['inventory.view', 'inventory.manage'] },
  { name: 'Orders', keys: ['orders.view', 'orders.update_status', 'orders.cancel'] },
  { name: 'Analytics & Profit', keys: ['analytics.view', 'analytics.cost_view'] },
  { name: 'Purchases & Suppliers', keys: ['purchases.view', 'purchases.manage', 'suppliers.view', 'suppliers.manage'] },
  { name: 'Expenses', keys: ['expenses.view', 'expenses.manage'] },
  { name: 'Customers', keys: ['customers.view_limited'] },
  { name: 'Delivery', keys: ['delivery.view', 'delivery.assign'] },
  { name: 'Reports', keys: ['reports.view_basic', 'reports.view_financial', 'reports.export'] },
  { name: 'Catalog & Content', keys: ['categories.manage', 'banners.manage'] },
  { name: 'Marketing & Operations', keys: ['coupons.manage', 'scheduling.manage', 'support.manage'] }
];

/**
 * Checks whether a given user possesses a specific permission.
 * 
 * Rules:
 * 1. SUPER_ADMIN possesses all permissions.
 * 2. Deactivated accounts (isStaffActive = false or status != ACTIVE) possess 0 permissions.
 * 3. Admins/Managers only possess permissions explicitly granted in their permissions object.
 * 4. Implied/Hierarchical permissions are automatically recognized (e.g. edit implies view).
 */
export function hasPermission(user, requiredPermission) {
  if (!user) return false;
  
  // Super Admin has full authorized control
  const isSuper = user.role === 'SUPER_ADMIN' || user.staffRole === 'SUPER_ADMIN';
  if (isSuper) return true;

  // Account must be active
  if (user.status !== 'ACTIVE' || user.isStaffActive === false) {
    return false;
  }

  // Only Admin, Category Admin, or Manager can hold staff permissions
  if (user.role !== 'ADMIN' && user.role !== 'MANAGER' && user.staffRole !== 'CATEGORY_ADMIN') {
    return false;
  }

  const perms = user.permissions;
  if (!perms || typeof perms !== 'object') {
    return false;
  }

  // Wildcard / Full admin grant
  if (perms.all === true || perms['*'] === true) {
    return true;
  }

  // Direct grant
  if (perms[requiredPermission] === true) {
    return true;
  }

  // Hierarchical and module-level backward compatibility
  switch (requiredPermission) {
    case 'products.view':
      return Boolean(
        perms['products.create'] ||
        perms['products.edit'] ||
        perms['products.update_stock'] ||
        perms.products
      );

    case 'products.create':
    case 'products.edit':
      return Boolean(perms.products);

    case 'products.update_stock':
      return Boolean(perms['inventory.manage'] || perms.products || perms.inventory);

    case 'inventory.view':
      return Boolean(perms['inventory.manage'] || perms.inventory);

    case 'inventory.manage':
      return Boolean(perms.inventory);

    case 'orders.view':
      return Boolean(
        perms['orders.update_status'] ||
        perms['orders.cancel'] ||
        perms.orders
      );

    case 'orders.update_status':
    case 'orders.cancel':
      return Boolean(perms.orders);

    case 'customers.view_limited':
      return Boolean(perms.customers);

    case 'delivery.view':
      return Boolean(perms['delivery.assign'] || perms.delivery);

    case 'delivery.assign':
      return Boolean(perms.delivery);

    case 'reports.view_basic':
      return Boolean(perms['reports.view_financial'] || perms.reports);

    case 'reports.view_financial':
      return Boolean(perms.reports);

    case 'categories.manage':
      return Boolean(perms.categories || perms.products);

    case 'banners.manage':
      return Boolean(perms.banners || perms.marketing);

    case 'coupons.manage':
      return Boolean(perms.coupons || perms.marketing);

    case 'scheduling.manage':
      return Boolean(perms.scheduling);

    case 'support.manage':
      return Boolean(perms.support);

    default:
      return false;
  }
}
