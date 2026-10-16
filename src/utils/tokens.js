import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import {env} from '../config/env.js';
export const hashToken=value=>crypto.createHash('sha256').update(value).digest('hex');
export const accessToken=user=>jwt.sign({sub:user.id,role:user.role,email:user.email},env.accessSecret,{expiresIn:env.accessExpires});
export const refreshToken=user=>jwt.sign({sub:user.id,type:'refresh',jti:crypto.randomUUID()},env.refreshSecret,{expiresIn:env.refreshExpires});
export const verifyAccess=token=>jwt.verify(token,env.accessSecret);
export const verifyRefresh=token=>jwt.verify(token,env.refreshSecret);
export const refreshExpiry=()=>new Date(Date.now()+90*24*60*60*1000);
