import { Router } from 'express';
import { optionalAuthenticate } from '../middleware/auth.js';
import {
  getVapidPublicKey,
  subscribe,
  unsubscribe,
  sendTestPush,
} from '../controllers/notification.controller.js';

export const notificationRouter = Router();

notificationRouter.get('/vapid-public-key', getVapidPublicKey);
notificationRouter.post('/subscribe', optionalAuthenticate, subscribe);
notificationRouter.post('/unsubscribe', unsubscribe);
notificationRouter.post('/test', optionalAuthenticate, sendTestPush);
