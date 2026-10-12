import {asyncHandler,ok} from '../utils/response.js';
import {getDashboard} from '../services/dashboard.service.js';
export const dashboard=asyncHandler(async(req,res)=>ok(res,await getDashboard(),'Dashboard fetched'));
