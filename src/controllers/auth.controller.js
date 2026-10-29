import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import {prisma} from '../config/prisma.js';
import {env} from '../config/env.js';
import {AppError,asyncHandler,ok} from '../utils/response.js';
import {accessToken,hashToken,refreshExpiry,refreshToken,verifyRefresh} from '../utils/tokens.js';
import {sendOtpEmail} from '../services/mail.service.js';
import {logAudit} from '../services/audit.service.js';
import {cache} from '../services/cache.service.js';
const publicUser=u=>({
  id:u.id,
  name:u.name,
  email:u.email,
  mobile:u.mobile,
  role:u.role,
  status:u.status,
  deliveryStaffId:u.deliveryStaffId||null,
  staffRole:u.staffRole||(u.role==='SUPER_ADMIN'?'SUPER_ADMIN':u.role==='ADMIN'?'ADMIN':u.role==='DELIVERY_PERSON'?'DELIVERY_PERSON':u.role==='MANAGER'?'MANAGER':'CUSTOMER'),
  permissions:u.permissions||{},
  isStaffActive:u.isStaffActive!==false,
  dutyStatus:u.dutyStatus||'OFF_DUTY',
  assignedVillageIds:u.assignedVillageIds||[],
  vehicleType:u.vehicleType||null,
  vehicleNumber:u.vehicleNumber||null,
  lastLoginAt:u.lastLoginAt
});
async function issue(res,user,{cookieName,cookiePath='/'}={}){
 const access=accessToken(user),refresh=refreshToken(user);
 await prisma.refreshToken.create({data:{userId:user.id,tokenHash:hashToken(refresh),expiresAt:refreshExpiry()}});
 const isProd=env.nodeEnv==='production';
 const targetCookie = cookieName || (
   user.role === 'CUSTOMER' ? 'r2cart_refresh' :
   user.role === 'DELIVERY_PERSON' ? 'r2cart_delivery_refresh' :
   'r2cart_admin_refresh'
 );
 res.cookie(targetCookie,refresh,{
  httpOnly:true,
  secure:isProd||env.cookieSecure,
  sameSite:isProd?'none':'lax',
  maxAge:90*86400000,
  path:cookiePath
 });
 return {
  accessToken:access,
  refreshToken:refresh,
  user:publicUser(user)
 };
}

export const customerLogin=asyncHandler(async(req,res)=>{
  const rawIdentifier = String(req.body.identifier || req.body.email || req.body.mobile || req.body.deliveryStaffId || '').trim();
  const password = String(req.body.password || '');
  if (!rawIdentifier || !password) {
    throw new AppError('Identifier and password are required', 400);
  }

  const normalizedEmail = rawIdentifier.toLowerCase();
  const normalizedStaffId = rawIdentifier.toUpperCase();
  const digitsOnly = rawIdentifier.replace(/\D/g, '');

  const orConditions = [
    { email: normalizedEmail },
    { deliveryStaffId: normalizedStaffId }
  ];
  if (digitsOnly.length >= 7) {
    orConditions.push({ mobile: digitsOnly });
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: orConditions
    }
  });

  if (!user || !user.passwordHash || !await bcrypt.compare(password, user.passwordHash)) {
    throw new AppError('Invalid email, mobile or password', 401);
  }

  // Customer Login is strictly for Customers and Delivery Personnel
  const isStoreOrSuperAdmin = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(user.role) || ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(user.staffRole);
  if (isStoreOrSuperAdmin) {
    logAudit(req, {
      module: 'AUTH',
      action: 'LOGIN_FAILED',
      resourceName: rawIdentifier,
      details: { attempted: rawIdentifier, reason: 'Staff attempted login through customer portal' }
    });
    throw new AppError('Invalid credentials or unauthorized access.', 401);
  }

  if (user.role === 'DELIVERY_PERSON') {
    if (user.isStaffActive === false || user.status !== 'ACTIVE') {
      throw new AppError('Your delivery account is currently deactivated. Please contact administrator.', 403);
    }
  } else {
    if (user.status !== 'ACTIVE') {
      throw new AppError('Your account is currently unavailable', 403);
    }
  }

  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
      lastLoginIp: String(ip || '').slice(0, 45)
    }
  }).catch(() => {});

  logAudit(req, {
    module: 'AUTH',
    action: 'LOGIN_SUCCESS',
    resourceId: user.id,
    resourceName: user.name,
    details: { identifier: rawIdentifier, role: user.staffRole || user.role }
  });

  ok(res, await issue(res, user), 'Login successful');
});

export const generateSecureOtp = () => crypto.randomInt(100000, 1000000).toString();

const OTP_RESEND_COOLDOWN_SECONDS = env.otpCooldownSeconds || 60;

export async function assertOtpCooldown(email) {
  if (!email) return;
  const cacheKey = `otp:cooldown:${email}`;
  const lastRequestedAt = cache.get(cacheKey);
  if (lastRequestedAt) {
    const elapsed = Math.floor((Date.now() - Number(lastRequestedAt)) / 1000);
    const remaining = Math.max(1, OTP_RESEND_COOLDOWN_SECONDS - elapsed);
    throw new AppError(`Please wait ${remaining} seconds before requesting another code.`, 429);
  }

  const cutoff = new Date(Date.now() - OTP_RESEND_COOLDOWN_SECONDS * 1000);
  const recentDbOtp = await prisma.otpVerification.findFirst({
    where: {
      identifier: email,
      createdAt: { gt: cutoff }
    },
    orderBy: { createdAt: 'desc' }
  });

  if (recentDbOtp) {
    const elapsed = Math.floor((Date.now() - new Date(recentDbOtp.createdAt).getTime()) / 1000);
    const remaining = Math.max(1, OTP_RESEND_COOLDOWN_SECONDS - elapsed);
    cache.set(cacheKey, new Date(recentDbOtp.createdAt).getTime(), remaining);
    throw new AppError(`Please wait ${remaining} seconds before requesting another code.`, 429);
  }
}

export function recordOtpSent(email) {
  if (!email) return;
  cache.set(`otp:cooldown:${email}`, Date.now(), OTP_RESEND_COOLDOWN_SECONDS);
}

export const requestOtp = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const name = String(req.body.name || '').trim();
  const mobile = String(req.body.mobile || '').trim();
  const password = req.body.password;

  if (!email) {
    throw new AppError('Email is required', 400);
  }

  // BUG-19: Enforce per-email cooldown to prevent email bombing
  await assertOtpCooldown(email);

  const emailUser = await prisma.user.findUnique({ where: { email } });

  // BUG-18 Fix: Prevent user enumeration on signup OTP request.
  // If an account already exists with this email, return generic 200 response identical to success.
  if (emailUser?.passwordHash) {
    recordOtpSent(email);
    await bcrypt.hash(email, 10);
    return ok(res, { expiresInSeconds: env.otpMinutes * 60 }, 'OTP sent to your email');
  }

  const previous = !password
    ? await prisma.otpVerification.findFirst({
        where: { identifier: email, purpose: 'signup', consumedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' }
      })
    : null;

  if (!password && !previous) {
    throw new AppError('Signup session expired. Please enter your details again.', 400);
  }

  const mobileUser = password ? await prisma.user.findUnique({ where: { mobile } }) : null;
  if (mobileUser && mobileUser.id !== emailUser?.id) {
    // Also protect mobile enumeration with generic 200 response
    recordOtpSent(email);
    await bcrypt.hash(mobile, 10);
    return ok(res, { expiresInSeconds: env.otpMinutes * 60 }, 'OTP sent to your email');
  }

  const otp = generateSecureOtp();
  const row = await prisma.otpVerification.create({
    data: {
      identifier: email,
      purpose: 'signup',
      codeHash: await bcrypt.hash(otp, 10),
      pendingName: name || previous.pendingName,
      pendingMobile: mobile || previous.pendingMobile,
      pendingPasswordHash: password ? await bcrypt.hash(password, 12) : previous.pendingPasswordHash,
      expiresAt: new Date(Date.now() + env.otpMinutes * 60000)
    }
  });

  try {
    await sendOtpEmail(email, otp);
  } catch (error) {
    await prisma.otpVerification.delete({ where: { id: row.id } });
    throw error;
  }

  recordOtpSent(email);
  ok(res, { expiresInSeconds: env.otpMinutes * 60 }, 'OTP sent to your email');
});
export const verifyOtp=asyncHandler(async(req,res)=>{const email=String(req.body.email||'').trim().toLowerCase();const row=await prisma.otpVerification.findFirst({where:{identifier:email,purpose:'signup',consumedAt:null},orderBy:{createdAt:'desc'}});if(!row||row.expiresAt<new Date()||row.attempts>=5)throw new AppError('Invalid or expired OTP',401);if(!await bcrypt.compare(req.body.otp,row.codeHash)){await prisma.otpVerification.update({where:{id:row.id},data:{attempts:{increment:1}}});throw new AppError('Invalid or expired OTP',401)}const existing=await prisma.user.findUnique({where:{email}});if(existing?.passwordHash)throw new AppError('An account already exists with this email. Please sign in.',409);const user=await prisma.$transaction(async tx=>{await tx.otpVerification.update({where:{id:row.id},data:{consumedAt:new Date()}});return existing?tx.user.update({where:{id:existing.id},data:{name:row.pendingName,mobile:row.pendingMobile,passwordHash:row.pendingPasswordHash}}):tx.user.create({data:{email,name:row.pendingName,mobile:row.pendingMobile,passwordHash:row.pendingPasswordHash}})});ok(res,await issue(res,user),'Account created successfully')});
export const requestPasswordReset = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!email) {
    throw new AppError('Email is required', 400);
  }

  // BUG-19: Enforce per-email cooldown to prevent email bombing
  await assertOtpCooldown(email);

  const user = await prisma.user.findUnique({ where: { email } });

  // BUG-18 Fix: Prevent user enumeration on password reset.
  // If the email is not registered, inactive, or not a customer, return the exact same generic response
  // as a successful reset request (200 OK with identical payload and message).
  if (!user || !user.passwordHash || user.role !== 'CUSTOMER' || user.status !== 'ACTIVE') {
    recordOtpSent(email);
    await bcrypt.hash(email, 10);
    return ok(res, { expiresInSeconds: env.otpMinutes * 60 }, 'A 6-digit reset code has been sent to your email.');
  }

  const otp = generateSecureOtp();
  const row = await prisma.otpVerification.create({
    data: {
      identifier: email,
      purpose: 'password_reset',
      codeHash: await bcrypt.hash(otp, 10),
      expiresAt: new Date(Date.now() + env.otpMinutes * 60000)
    }
  });

  try {
    await sendOtpEmail(email, otp, 'password_reset');
  } catch (error) {
    await prisma.otpVerification.delete({ where: { id: row.id } });
    throw error;
  }

  recordOtpSent(email);
  ok(res, { expiresInSeconds: env.otpMinutes * 60 }, 'A 6-digit reset code has been sent to your email.');
});
export const resetPassword=asyncHandler(async(req,res)=>{const {email,otp,password}=req.body;const row=await prisma.otpVerification.findFirst({where:{identifier:email,purpose:'password_reset',consumedAt:null},orderBy:{createdAt:'desc'}});const user=await prisma.user.findUnique({where:{email}});if(!row||!user||user.role!=='CUSTOMER'||row.expiresAt<new Date()||row.attempts>=5)throw new AppError('Invalid or expired reset code',401);if(!await bcrypt.compare(otp,row.codeHash)){await prisma.otpVerification.update({where:{id:row.id},data:{attempts:{increment:1}}});throw new AppError('Invalid or expired reset code',401)}const passwordHash=await bcrypt.hash(password,12);await prisma.$transaction(async tx=>{await tx.otpVerification.update({where:{id:row.id},data:{consumedAt:new Date()}});await tx.user.update({where:{id:user.id},data:{passwordHash}});await tx.refreshToken.updateMany({where:{userId:user.id,revokedAt:null},data:{revokedAt:new Date()}})});res.clearCookie('r2cart_refresh',{path:'/api/v1/auth'});ok(res,null,'Password reset successfully')});
export const adminLogin=asyncHandler(async(req,res)=>{
  const rawIdentifier=String(req.body.identifier||req.body.email||req.body.mobile||req.body.deliveryStaffId||'').trim();
  const password=String(req.body.password||'');
  const ip=req.ip||req.headers['x-forwarded-for']||req.socket.remoteAddress;

  if(!rawIdentifier||!password){
    throw new AppError('Identifier and password are required',400);
  }

  const normalizedEmail=rawIdentifier.toLowerCase();
  const normalizedStaffId=rawIdentifier.toUpperCase();
  const digitsOnly=rawIdentifier.replace(/\D/g,'');

  const orConditions=[
    {email:normalizedEmail},
    {deliveryStaffId:normalizedStaffId}
  ];
  if(digitsOnly.length>=7){
    orConditions.push({mobile:digitsOnly});
  }

  const user=await prisma.user.findFirst({
    where:{
      OR:orConditions
    }
  });

  if(!user||!user.passwordHash||!await bcrypt.compare(password,user.passwordHash)){
    logAudit(req,{
      module:'AUTH',
      action:'LOGIN_FAILED',
      resourceName:rawIdentifier,
      details:{attemptedEmail:rawIdentifier,reason:'Invalid credentials'}
    });
    throw new AppError('Invalid credentials or unauthorized access.',401);
  }

  // Super Admin must strictly use the dedicated Super Admin portal
  const isSuper = user.role === 'SUPER_ADMIN' || user.staffRole === 'SUPER_ADMIN';
  if (isSuper) {
    logAudit(req,{
      module:'AUTH',
      action:'LOGIN_FAILED',
      resourceName:rawIdentifier,
      details:{attemptedEmail:rawIdentifier,reason:'Super Admin attempted login on store admin portal'}
    });
    throw new AppError('Invalid credentials or unauthorized access.', 401);
  }

  const isAdminOrManager = ['ADMIN', 'MANAGER'].includes(user.role) || ['ADMIN', 'MANAGER'].includes(user.staffRole);
  if (!isAdminOrManager) {
    logAudit(req,{
      module:'AUTH',
      action:'LOGIN_FAILED',
      resourceName:rawIdentifier,
      details:{attemptedEmail:rawIdentifier,reason:'Unauthorized access attempt to store admin portal'}
    });
    throw new AppError('Invalid credentials or unauthorized access.',401);
  }

  if(user.isStaffActive===false||user.status!=='ACTIVE'){
    logAudit(req,{
      module:'AUTH',
      action:'LOGIN_FAILED',
      resourceId:user.id,
      resourceName:user.name,
      details:{reason:'Staff account is deactivated'}
    });
    throw new AppError('Your staff account is currently deactivated. Please contact Super Admin.',403);
  }

  // Update last login
  await prisma.user.update({
    where:{id:user.id},
    data:{
      lastLoginAt:new Date(),
      lastLoginIp:String(ip||'').slice(0,45)
    }
  });

  logAudit(req,{
    module:'AUTH',
    action:'LOGIN_SUCCESS',
    resourceId:user.id,
    resourceName:user.name,
    details:{email:user.email,role:user.staffRole||user.role}
  });

  const cookieName='r2cart_admin_refresh';
  ok(res,await issue(res,user,{cookieName,cookiePath:'/'}),'Login successful');
});

export const superAdminLogin=asyncHandler(async(req,res)=>{
  const rawIdentifier=String(req.body.identifier||req.body.email||req.body.mobile||'').trim();
  const password=String(req.body.password||'');
  const ip=req.ip||req.headers['x-forwarded-for']||req.socket.remoteAddress;

  if(!rawIdentifier||!password){
    throw new AppError('Identifier and password are required',400);
  }

  const normalizedEmail=rawIdentifier.toLowerCase();
  const digitsOnly=rawIdentifier.replace(/\D/g,'');

  const orConditions=[{email:normalizedEmail}];
  if(digitsOnly.length>=7){
    orConditions.push({mobile:digitsOnly});
  }

  const user=await prisma.user.findFirst({
    where:{OR:orConditions}
  });

  if(!user||!user.passwordHash||!await bcrypt.compare(password,user.passwordHash)){
    logAudit(req,{
      module:'AUTH',
      action:'LOGIN_FAILED',
      resourceName:rawIdentifier,
      details:{attemptedEmail:rawIdentifier,portal:'SUPER_ADMIN',reason:'Invalid credentials'}
    });
    throw new AppError('Invalid credentials or unauthorized access.',401);
  }

  const isSuper = user.role === 'SUPER_ADMIN' || user.staffRole === 'SUPER_ADMIN';
  if(!isSuper){
    logAudit(req,{
      module:'AUTH',
      action:'LOGIN_FAILED',
      resourceName:rawIdentifier,
      details:{attemptedEmail:rawIdentifier,portal:'SUPER_ADMIN',reason:'Unauthorized access attempt to super admin portal'}
    });
    throw new AppError('Invalid credentials or unauthorized access.',401);
  }

  if(user.isStaffActive===false||user.status!=='ACTIVE'){
    throw new AppError('Your Super Admin account is currently deactivated.', 403);
  }

  await prisma.user.update({
    where:{id:user.id},
    data:{
      lastLoginAt:new Date(),
      lastLoginIp:String(ip||'').slice(0,45)
    }
  });

  logAudit(req,{
    module:'AUTH',
    action:'LOGIN_SUCCESS',
    resourceId:user.id,
    resourceName:user.name,
    details:{email:user.email,portal:'SUPER_ADMIN',role:'SUPER_ADMIN'}
  });

  ok(res,await issue(res,user,{cookieName:'r2cart_admin_refresh',cookiePath:'/'}),'Super Admin login successful');
});

export const deliveryLogin=asyncHandler(async(req,res)=>{
  const rawIdentifier=String(req.body.identifier||req.body.email||req.body.mobile||req.body.deliveryStaffId||'').trim();
  const password=String(req.body.password||'');
  const ip=req.ip||req.headers['x-forwarded-for']||req.socket.remoteAddress;

  if(!rawIdentifier||!password){
    throw new AppError('Identifier and password are required',400);
  }

  const normalizedEmail=rawIdentifier.toLowerCase();
  const normalizedStaffId=rawIdentifier.toUpperCase();
  const digitsOnly=rawIdentifier.replace(/\D/g,'');

  const orConditions=[
    {deliveryStaffId:normalizedStaffId},
    {email:normalizedEmail}
  ];
  if(digitsOnly.length>=7){
    orConditions.push({mobile:digitsOnly});
  }

  const user=await prisma.user.findFirst({
    where:{
      OR:orConditions
    }
  });

  const isDeliveryStaff = user && (user.role === 'DELIVERY_PERSON' || user.staffRole === 'DELIVERY_PERSON');

  if(!user||!isDeliveryStaff||!user.passwordHash||!await bcrypt.compare(password,user.passwordHash)){
    logAudit(req,{
      module:'AUTH',
      action:'LOGIN_FAILED',
      resourceName:rawIdentifier,
      details:{attempted:rawIdentifier,reason:'Invalid delivery credentials'}
    });
    throw new AppError('Invalid Delivery Staff ID, email, or password',401);
  }

  if(user.isStaffActive===false||user.status!=='ACTIVE'){
    logAudit(req,{
      module:'AUTH',
      action:'LOGIN_FAILED',
      resourceId:user.id,
      resourceName:user.name,
      details:{reason:'Staff account is deactivated'}
    });
    throw new AppError('Your delivery account is deactivated. Please contact administrator.',403);
  }

  await prisma.user.update({
    where:{id:user.id},
    data:{
      lastLoginAt:new Date(),
      lastLoginIp:String(ip||'').slice(0,45)
    }
  });

  logAudit(req,{
    module:'AUTH',
    action:'LOGIN_SUCCESS',
    resourceId:user.id,
    resourceName:user.name,
    details:{email:user.email,role:user.staffRole||user.role}
  });

  ok(res,await issue(res,user,{cookieName:'r2cart_delivery_refresh',cookiePath:'/'}),'Delivery login successful');
});

export const refresh = asyncHandler(async (req, res) => {
  const raw =
    req.body?.refreshToken ||
    req.headers['x-refresh-token'] ||
    req.cookies?.r2cart_refresh ||
    req.cookies?.r2cart_admin_refresh ||
    req.cookies?.r2cart_delivery_refresh;
  if (!raw) throw new AppError('Refresh token required', 401);

  let payload;
  try {
    payload = verifyRefresh(raw);
  } catch {
    throw new AppError('Refresh token expired', 401);
  }

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: { user: true }
  });

  const now = new Date();
  const graceWindowMs = 60 * 1000; // 60 seconds grace window for concurrent reconnects
  const isWithinGrace = stored?.revokedAt && (now.getTime() - new Date(stored.revokedAt).getTime() < graceWindowMs);

  if (
    !stored ||
    (stored.revokedAt && !isWithinGrace) ||
    stored.expiresAt < now ||
    !['CUSTOMER', 'ADMIN', 'MANAGER', 'SUPER_ADMIN', 'DELIVERY_PERSON'].includes(stored.user.role)
  ) {
    throw new AppError('Refresh token invalid', 401);
  }

  if (!stored.revokedAt) {
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: now }
    }).catch(() => {});
  }

  const cookieName =
    stored.user.role === 'CUSTOMER'
      ? 'r2cart_refresh'
      : stored.user.role === 'DELIVERY_PERSON'
      ? 'r2cart_delivery_refresh'
      : 'r2cart_admin_refresh';

  ok(res, await issue(res, stored.user, { cookieName, cookiePath: '/' }), 'Session active');
});
export const logout=asyncHandler(async(req,res)=>{
 const raw=req.body?.refreshToken||req.headers['x-refresh-token']||req.cookies?.r2cart_refresh||req.cookies?.r2cart_admin_refresh||req.cookies?.r2cart_delivery_refresh;
 if(raw)await prisma.refreshToken.updateMany({where:{tokenHash:hashToken(raw)},data:{revokedAt:new Date()}});
 res.clearCookie('r2cart_refresh',{path:'/'});
 res.clearCookie('r2cart_admin_refresh',{path:'/'});
 res.clearCookie('r2cart_delivery_refresh',{path:'/'});
 ok(res,null,'Logged out');
});
export const me=asyncHandler(async(req,res)=>ok(res,publicUser(req.user)));
