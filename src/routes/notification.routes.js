import { Router } from 'express';
import { optionalAuthenticate } from '../middleware/auth.js';
import {
  getVapidPublicKey,
  subscribe,
  unsubscribe,
  sendTestPush,
  registerFcmToken,
  unregisterFcmToken,
} from '../controllers/notification.controller.js';

export const notificationRouter = Router();

notificationRouter.get('/vapid-public-key', getVapidPublicKey);
notificationRouter.post('/subscribe', optionalAuthenticate, subscribe);
notificationRouter.post('/unsubscribe', unsubscribe);
notificationRouter.post('/test', optionalAuthenticate, sendTestPush);

// FCM device token registration
notificationRouter.post('/fcm/token', optionalAuthenticate, registerFcmToken);
notificationRouter.delete('/fcm/token', unregisterFcmToken);
