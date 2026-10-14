import bcrypt from 'bcryptjs';
import {prisma} from '../config/prisma.js';
import {AppError,asyncHandler,created,ok} from '../utils/response.js';
import {logAudit} from '../services/audit.service.js';

export const VALID_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'DELIVERY_PERSON',
  'INVENTORY_MANAGER',
  'ORDER_MANAGER',
  'DELIVERY_MANAGER',
  'MARKETING_MANAGER',
  'SUPPORT_STAFF'
];

const sanitizeStaffUser = (user) => {
  const { passwordHash, ...rest } = user;
  return {
    ...rest,
    staffRole: rest.staffRole || (rest.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : rest.role === 'ADMIN' ? 'SUPER_ADMIN' : rest.role === 'DELIVERY_PERSON' ? 'DELIVERY_PERSON' : 'ADMIN'),
    permissions: rest.permissions || {},
    dutyStatus: rest.dutyStatus || 'OFF_DUTY',
    assignedVillageIds: rest.assignedVillageIds || [],
    vehicleType: rest.vehicleType || null,
    vehicleNumber: rest.vehicleNumber || null
  };
};

export const security = {
  staff: {
    list: asyncHandler(async (req, res) => {
      const rows = await prisma.user.findMany({
        where: {
          OR: [
            { role: { in: ['ADMIN', 'MANAGER', 'SUPER_ADMIN', 'DELIVERY_PERSON'] } },
            { staffRole: { not: null } }
          ]
        },
        orderBy: [{ createdAt: 'asc' }]
      });

      ok(res, rows.map(sanitizeStaffUser));
    }),

    create: asyncHandler(async (req, res) => {
      const name = String(req.body.name || '').trim();
      const email = String(req.body.email || '').trim().toLowerCase();
      const mobile = String(req.body.mobile || '').replace(/\D/g, '');
      const password = String(req.body.password || '').trim();
      const staffRole = String(req.body.staffRole || 'SUPPORT_STAFF').toUpperCase();

      if (name.length < 2) throw new AppError('Full name must be at least 2 characters', 422);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError('Valid email address is required', 422);
      if (mobile && !/^\d{10}$/.test(mobile)) throw new AppError('Mobile number must be exactly 10 digits', 422);
      if (!password || password.length < 6) throw new AppError('Password must be at least 6 characters long', 422);
      if (!VALID_ROLES.includes(staffRole)) throw new AppError('Invalid staff role selected', 422);

      // Only one Super Admin is allowed in the platform
      if (staffRole === 'SUPER_ADMIN') {
        throw new AppError('Only one Super Admin account is allowed in the platform.', 400);
      }

      const existingEmail = await prisma.user.findUnique({ where: { email } });
      if (existingEmail) throw new AppError('An account with this email already exists', 409);

      if (mobile) {
        const existingMobile = await prisma.user.findFirst({ where: { mobile } });
        if (existingMobile) throw new AppError('An account with this mobile number already exists', 409);
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const permissions = req.body.permissions && typeof req.body.permissions === 'object' ? req.body.permissions : {};
      const assignedVillageIds = Array.isArray(req.body.assignedVillageIds) ? req.body.assignedVillageIds : [];
      const vehicleType = req.body.vehicleType ? String(req.body.vehicleType).trim() : null;
      const vehicleNumber = req.body.vehicleNumber ? String(req.body.vehicleNumber).trim() : null;

      const userRole = staffRole === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : (staffRole === 'DELIVERY_PERSON' ? 'DELIVERY_PERSON' : (staffRole === 'ADMIN' ? 'ADMIN' : 'MANAGER'));

      const newStaff = await prisma.user.create({
        data: {
          name,
          email,
          mobile: mobile || null,
          passwordHash,
          role: userRole,
          staffRole,
          permissions,
          assignedVillageIds,
          vehicleType,
          vehicleNumber,
          dutyStatus: staffRole === 'DELIVERY_PERSON' ? 'OFF_DUTY' : 'ON_DUTY',
          isStaffActive: true,
          status: 'ACTIVE'
        }
      });

      logAudit(req, {
        module: 'SECURITY',
        action: 'STAFF_CREATE',
        resourceId: newStaff.id,
        resourceName: newStaff.name,
        details: {
          name: newStaff.name,
          email: newStaff.email,
          staffRole: newStaff.staffRole,
          permissions,
          assignedVillageIds,
          vehicleType
        }
      });

      created(res, sanitizeStaffUser(newStaff), 'Staff member account created');
    }),

    update: asyncHandler(async (req, res) => {
      const current = await prisma.user.findUnique({ where: { id: req.params.id } });
      if (!current) throw new AppError('Staff account not found', 404);

      const callerRole = req.user.staffRole || (req.user.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : (req.user.role === 'ADMIN' ? 'SUPER_ADMIN' : 'ADMIN'));
      const targetRole = current.staffRole || (current.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : (current.role === 'ADMIN' ? 'SUPER_ADMIN' : 'ADMIN'));

      // Super Admin protection
      if (targetRole === 'SUPER_ADMIN' && callerRole !== 'SUPER_ADMIN') {
        throw new AppError('Only Super Admins can modify Super Admin accounts', 403);
      }

      const data = {};
      if (req.body.name) {
        const name = String(req.body.name).trim();
        if (name.length < 2) throw new AppError('Name is too short', 422);
        data.name = name;
      }
      if (req.body.mobile !== undefined) {
        const mobile = String(req.body.mobile || '').replace(/\D/g, '');
        if (mobile && !/^\d{10}$/.test(mobile)) throw new AppError('Invalid mobile format', 422);
        data.mobile = mobile || null;
      }
      if (req.body.staffRole) {
        const staffRole = String(req.body.staffRole).toUpperCase();
        if (!VALID_ROLES.includes(staffRole)) throw new AppError('Invalid role', 422);
        if (staffRole === 'SUPER_ADMIN' && current.role !== 'SUPER_ADMIN') {
          throw new AppError('Only one Super Admin is allowed in the platform.', 400);
        }
        if (current.role === 'SUPER_ADMIN' && staffRole !== 'SUPER_ADMIN') {
          throw new AppError('The primary Super Admin account cannot be demoted.', 400);
        }
        data.staffRole = staffRole;
        data.role = staffRole === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : (staffRole === 'DELIVERY_PERSON' ? 'DELIVERY_PERSON' : (staffRole === 'ADMIN' ? 'ADMIN' : 'MANAGER'));
      }
      if (req.body.permissions && typeof req.body.permissions === 'object') {
        data.permissions = req.body.permissions;
      }
      if (req.body.assignedVillageIds !== undefined) {
        data.assignedVillageIds = Array.isArray(req.body.assignedVillageIds) ? req.body.assignedVillageIds : [];
      }
      if (req.body.vehicleType !== undefined) {
        data.vehicleType = req.body.vehicleType ? String(req.body.vehicleType).trim() : null;
      }
      if (req.body.vehicleNumber !== undefined) {
        data.vehicleNumber = req.body.vehicleNumber ? String(req.body.vehicleNumber).trim() : null;
      }
      if (req.body.dutyStatus !== undefined) {
        data.dutyStatus = String(req.body.dutyStatus).toUpperCase();
      }
      if (req.body.password) {
        const pass = String(req.body.password).trim();
        if (pass.length < 6) throw new AppError('Password must be at least 6 characters', 422);
        data.passwordHash = await bcrypt.hash(pass, 10);
      }
      if (req.body.isStaffActive !== undefined) {
        if (current.id === req.user.id && !req.body.isStaffActive) {
          throw new AppError('You cannot deactivate your own account', 400);
        }
        data.isStaffActive = Boolean(req.body.isStaffActive);
      }

      const updated = await prisma.user.update({
        where: { id: req.params.id },
        data
      });

      logAudit(req, {
        module: 'SECURITY',
        action: 'STAFF_UPDATE',
        resourceId: updated.id,
        resourceName: updated.name,
        details: {
          updatedFields: Object.keys(data).filter(k => k !== 'passwordHash'),
          staffRole: updated.staffRole
        }
      });

      ok(res, sanitizeStaffUser(updated), 'Staff account updated');
    }),

    remove: asyncHandler(async (req, res) => {
      const current = await prisma.user.findUnique({ where: { id: req.params.id } });
      if (!current) throw new AppError('Staff account not found', 404);

      if (current.id === req.user.id) {
        throw new AppError('You cannot delete your own account', 400);
      }

      const callerRole = req.user.staffRole || (req.user.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : (req.user.role === 'ADMIN' ? 'SUPER_ADMIN' : 'ADMIN'));
      const targetRole = current.staffRole || (current.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : (current.role === 'ADMIN' ? 'SUPER_ADMIN' : 'ADMIN'));

      if (targetRole === 'SUPER_ADMIN' && callerRole !== 'SUPER_ADMIN') {
        throw new AppError('Only Super Admins can delete Super Admin accounts', 403);
      }

      // Demote to customer and deactivate instead of hard deleting to preserve order and audit foreign keys
      await prisma.user.update({
        where: { id: req.params.id },
        data: {
          role: 'CUSTOMER',
          staffRole: null,
          permissions: null,
          isStaffActive: false
        }
      });

      logAudit(req, {
        module: 'SECURITY',
        action: 'STAFF_DELETE',
        resourceId: current.id,
        resourceName: current.name,
        details: { email: current.email, formerRole: targetRole }
      });

      ok(res, null, `Staff access for "${current.name}" removed successfully`);
    })
  },

  auditLogs: {
    list: asyncHandler(async (req, res) => {
      const { user, module: mod, action, dateFrom, dateTo, search, page = 1, limit = 50 } = req.query;
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

      const where = {};
      if (user) {
        where.OR = [
          { userName: { contains: String(user).trim() } },
          { userId: String(user).trim() }
        ];
      }
      if (mod) where.module = String(mod).toUpperCase();
      if (action) where.action = { contains: String(action).toUpperCase() };
      if (search) {
        where.OR = [
          { resourceName: { contains: String(search).trim() } },
          { userName: { contains: String(search).trim() } },
          { action: { contains: String(search).trim() } }
        ];
      }
      if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) where.createdAt.gte = new Date(dateFrom);
        if (dateTo) where.createdAt.lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
      }

      const [rows, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (pageNum - 1) * limitNum,
          take: limitNum
        }),
        prisma.auditLog.count({ where })
      ]);

      ok(res, {
        logs: rows,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.max(1, Math.ceil(total / limitNum))
        }
      });
    }),

    loginHistory: asyncHandler(async (req, res) => {
      const { page = 1, limit = 50 } = req.query;
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

      const where = {
        action: { in: ['LOGIN_SUCCESS', 'LOGIN_FAILED'] }
      };

      const [rows, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (pageNum - 1) * limitNum,
          take: limitNum
        }),
        prisma.auditLog.count({ where })
      ]);

      ok(res, {
        logins: rows,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.max(1, Math.ceil(total / limitNum))
        }
      });
    })
  }
};
