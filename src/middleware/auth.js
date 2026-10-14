import {prisma} from '../config/prisma.js';
import {AppError,asyncHandler} from '../utils/response.js';
import {verifyAccess} from '../utils/tokens.js';
export const authenticate=asyncHandler(async(req,res,next)=>{const token=req.headers.authorization?.replace(/^Bearer\s+/i,'');if(!token)throw new AppError('Authentication required',401);let payload;try{payload=verifyAccess(token)}catch{throw new AppError('Invalid or expired access token',401)}const userId=payload?.sub||payload?.id;if(!userId)throw new AppError('Invalid or expired access token',401);const user=await prisma.user.findUnique({where:{id:userId}});if(!user||user.status!=='ACTIVE')throw new AppError('Account unavailable',401);req.user=user;next()});
export const authorize=(...roles)=>(req,res,next)=>roles.includes(req.user?.role)?next():next(new AppError('You are not allowed to perform this action',403));

const ROLE_PERMISSIONS={
  SUPER_ADMIN:['all'],
  ADMIN:['all'],
  INVENTORY_MANAGER:['inventory','products'],
  ORDER_MANAGER:['orders','scheduling','customers'],
  DELIVERY_MANAGER:['delivery','orders'],
  MARKETING_MANAGER:['marketing','coupons','banners'],
  SUPPORT_STAFF:['support','orders']
};

export const authorizeModule=(moduleName)=>(req,res,next)=>{
  const user=req.user;
  if(!user)return next(new AppError('Authentication required',401));
  if(user.role!=='ADMIN'&&user.role!=='SUPER_ADMIN'&&user.role!=='MANAGER')return next(new AppError('Admin access required',403));
  if(user.isStaffActive===false)return next(new AppError('Your staff account has been deactivated. Please contact Super Admin.',403));

  const staffRole=user.staffRole||(user.role==='SUPER_ADMIN'?'SUPER_ADMIN':(user.role==='ADMIN'?'SUPER_ADMIN':'ADMIN'));
  if(staffRole==='SUPER_ADMIN'||staffRole==='ADMIN')return next();

  // Check custom granular permissions json if present
  if(user.permissions&&typeof user.permissions==='object'){
    if(user.permissions[moduleName]===true||user.permissions.all===true)return next();
  }

  // Check default role permissions
  const allowed=ROLE_PERMISSIONS[staffRole]||[];
  if(allowed.includes('all')||allowed.includes(moduleName))return next();

  return next(new AppError(`Access denied: You do not have permission for the ${moduleName} module.`,403));
};

export const authorizeDeliveryPerson=(req,res,next)=>{
  const user=req.user;
  if(!user)return next(new AppError('Authentication required',401));
  if(user.isStaffActive===false)return next(new AppError('Your staff account has been deactivated. Please contact Super Admin.',403));
  if(user.role==='DELIVERY_PERSON'||user.staffRole==='DELIVERY_PERSON'||user.role==='SUPER_ADMIN'||user.role==='ADMIN'||user.staffRole==='SUPER_ADMIN'){
    return next();
  }
  return next(new AppError('Delivery staff access required',403));
};

export const authorizeSuperAdmin=(req,res,next)=>{
  const user=req.user;
  if(!user)return next(new AppError('Authentication required',401));
  const isSuper=user.role==='SUPER_ADMIN'||user.staffRole==='SUPER_ADMIN';
  if(!isSuper)return next(new AppError('Only Super Admin can perform this action',403));
  return next();
};

export const optionalAuthenticate=asyncHandler(async(req,res,next)=>{const token=req.headers.authorization?.replace(/^Bearer\s+/i,'');if(!token)return next();try{const payload=verifyAccess(token);const userId=payload?.sub||payload?.id;if(userId){const user=await prisma.user.findUnique({where:{id:userId}});if(user&&user.status==='ACTIVE')req.user=user}}catch{}next()});
