import {prisma} from '../config/prisma.js';
import {AppError,asyncHandler} from '../utils/response.js';
import {verifyAccess} from '../utils/tokens.js';
export const authenticate=asyncHandler(async(req,res,next)=>{const token=req.headers.authorization?.replace(/^Bearer\s+/i,'');if(!token)throw new AppError('Authentication required',401);let payload;try{payload=verifyAccess(token)}catch{throw new AppError('Invalid or expired access token',401)}const user=await prisma.user.findUnique({where:{id:payload.sub}});if(!user||user.status!=='ACTIVE')throw new AppError('Account unavailable',401);req.user=user;next()});
export const authorize=(...roles)=>(req,res,next)=>roles.includes(req.user?.role)?next():next(new AppError('You are not allowed to perform this action',403));
export const optionalAuthenticate=asyncHandler(async(req,res,next)=>{const token=req.headers.authorization?.replace(/^Bearer\s+/i,'');if(!token)return next();try{const payload=verifyAccess(token);const user=await prisma.user.findUnique({where:{id:payload.sub}});if(user&&user.status==='ACTIVE')req.user=user}catch{}next()});
