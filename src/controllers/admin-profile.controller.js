import bcrypt from 'bcryptjs';
import {prisma} from '../config/prisma.js';
import {AppError,asyncHandler,ok} from '../utils/response.js';
export const profileSelect={id:true,name:true,email:true,mobile:true,role:true,avatarUrl:true,createdAt:true,updatedAt:true};
export const get=asyncHandler(async(req,res)=>ok(res,await prisma.user.findUnique({where:{id:req.user.id},select:profileSelect})));
export const update=asyncHandler(async(req,res)=>{
 const name=String(req.body.name||'').trim(),email=String(req.body.email||'').trim().toLowerCase(),mobile=String(req.body.mobile||'').trim()||null;
 if(name.length<2||name.length>100)throw new AppError('Name must be 2–100 characters',422);
 if(email.length>191||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new AppError('Enter a valid email',422);
 if(mobile&&!/^[6-9]\d{9}$/.test(mobile))throw new AppError('Enter a valid 10-digit mobile number',422);
 if(email!==req.user.email.toLowerCase()&&(!req.user.passwordHash||!await bcrypt.compare(String(req.body.currentPassword||''),req.user.passwordHash)))throw new AppError('Confirm your current password to change your login email',401);
 const existing=await prisma.user.findFirst({where:{id:{not:req.user.id},OR:[{email},...(mobile?[{mobile}]:[])]},select:{id:true}});if(existing)throw new AppError('Email or mobile already belongs to another account',409);
 ok(res,await prisma.user.update({where:{id:req.user.id},data:{name,email,mobile},select:profileSelect}),'Profile saved');
});
export const avatar=asyncHandler(async(req,res)=>{if(!req.file)throw new AppError('Choose a profile photo',422);const avatarUrl=`/uploads/admins/${req.file.filename}`;ok(res,await prisma.user.update({where:{id:req.user.id},data:{avatarUrl},select:profileSelect}),'Profile photo saved')});
export const removeAvatar=asyncHandler(async(req,res)=>ok(res,await prisma.user.update({where:{id:req.user.id},data:{avatarUrl:null},select:profileSelect}),'Profile photo removed'));
export const password=asyncHandler(async(req,res)=>{
 const current=String(req.body.currentPassword||''),next=String(req.body.password||'');
 if(next.length<8||next.length>72||!/[A-Za-z]/.test(next)||!/[0-9]/.test(next))throw new AppError('Use 8–72 characters with a letter and a number',422);
 if(!req.user.passwordHash||!await bcrypt.compare(current,req.user.passwordHash))throw new AppError('Current password is incorrect',401);
 if(current===next)throw new AppError('Choose a different new password',422);
 const passwordHash=await bcrypt.hash(next,12);
 await prisma.$transaction(async tx=>{await tx.user.update({where:{id:req.user.id},data:{passwordHash}});await tx.refreshToken.updateMany({where:{userId:req.user.id,revokedAt:null},data:{revokedAt:new Date()}})});
 ok(res,null,'Password changed. Existing refresh sessions have been revoked.');
});
