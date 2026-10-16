import { prisma } from '../config/prisma.js';
import { AppError, asyncHandler } from '../utils/response.js';
import { verifyAccess } from '../utils/tokens.js';
import { hasPermission } from '../config/permissions.js';

export const authenticate = asyncHandler(async (req, res, next) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) throw new AppError('Authentication required', 401);

  let payload;
  try {
    payload = verifyAccess(token);
  } catch {
    throw new AppError('Invalid or expired access token', 401);
  }

  const userId = payload?.sub || payload?.id;
  if (!userId) throw new AppError('Invalid or expired access token', 401);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== 'ACTIVE') {
    throw new AppError('Account unavailable', 401);
  }

  // Immediately block deactivated staff/admin accounts from using protected endpoints
  if (user.role !== 'CUSTOMER' && user.isStaffActive === false) {
    throw new AppError('Your staff account has been deactivated. Please contact Super Admin.', 403);
  }

  req.user = user;
  next();
});

export const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return next(new AppError('Authentication required', 401));
  return roles.includes(req.user?.role)
    ? next()
    : next(new AppError('You are not allowed to perform this action', 403));
};

export const authorizeSuperAdmin = (req, res, next) => {
  const user = req.user;
  if (!user) return next(new AppError('Authentication required', 401));
  if (user.status !== 'ACTIVE' || user.isStaffActive === false) {
    return next(new AppError('Your account has been deactivated. Please contact Super Admin.', 403));
  }

  const isSuper = user.role === 'SUPER_ADMIN' || user.staffRole === 'SUPER_ADMIN';
  if (!isSuper) {
    return next(new AppError('Only Super Admin can perform this action', 403));
  }
  return next();
};

export const authorizePermission = (permission, ...alternatives) => (req, res, next) => {
  const user = req.user;
  if (!user) return next(new AppError('Authentication required', 401));
  if (user.status !== 'ACTIVE') return next(new AppError('Account is unavailable', 401));
  if (user.role !== 'CUSTOMER' && user.isStaffActive === false) {
    return next(new AppError('Your staff account has been deactivated. Please contact Super Admin.', 403));
  }

  // Super Admin has full authorized control
  if (user.role === 'SUPER_ADMIN' || user.staffRole === 'SUPER_ADMIN') {
    return next();
  }

  // Check required permission and any allowed alternatives
  const allReqs = [permission, ...alternatives];
  const passed = allReqs.some(p => hasPermission(user, p));

  if (passed) return next();

  return next(new AppError(`Access denied: Missing required permission (${permission})`, 403));
};

export const authorizeModule = (moduleName) => (req, res, next) => {
  const user = req.user;
  if (!user) return next(new AppError('Authentication required', 401));
  if (user.status !== 'ACTIVE') return next(new AppError('Account is unavailable', 401));
  if (user.role !== 'CUSTOMER' && user.isStaffActive === false) {
    return next(new AppError('Your staff account has been deactivated. Please contact Super Admin.', 403));
  }

  // Security and staff management is exclusively for Super Admin
  if (moduleName === 'security') {
    return authorizeSuperAdmin(req, res, next);
  }

  // Super Admin has full authorized control
  if (user.role === 'SUPER_ADMIN' || user.staffRole === 'SUPER_ADMIN') {
    return next();
  }

  // Map coarse module names to granular RBAC permissions
  const modulePermissionMap = {
    products: 'products.view',
    orders: 'orders.view',
    inventory: 'inventory.view',
    customers: 'customers.view_limited',
    delivery: 'delivery.view',
    scheduling: 'scheduling.manage',
    marketing: 'coupons.manage',
    reports: 'reports.view_basic'
  };

  const requiredPerm = modulePermissionMap[moduleName] || moduleName;
  if (hasPermission(user, requiredPerm)) {
    return next();
  }

  return next(new AppError(`Access denied: You do not have permission for the ${moduleName} module.`, 403));
};

export const authorizeDeliveryPerson = (req, res, next) => {
  const user = req.user;
  if (!user) return next(new AppError('Authentication required', 401));
  if (user.isStaffActive === false) {
    return next(new AppError('Your staff account has been deactivated. Please contact Super Admin.', 403));
  }
  if (
    user.role === 'DELIVERY_PERSON' ||
    user.staffRole === 'DELIVERY_PERSON' ||
    user.role === 'SUPER_ADMIN' ||
    user.staffRole === 'SUPER_ADMIN'
  ) {
    return next();
  }
  return next(new AppError('Delivery staff access required', 403));
};

export const optionalAuthenticate = asyncHandler(async (req, res, next) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return next();
  try {
    const payload = verifyAccess(token);
    const userId = payload?.sub || payload?.id;
    if (userId) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (user && user.status === 'ACTIVE') req.user = user;
    }
  } catch {}
  next();
});
