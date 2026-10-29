import { Router } from 'express';
import { optionalAuthenticate, authenticate } from '../middleware/auth.js';
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
notificationRouter.post('/subscribe', authenticate, subscribe);
notificationRouter.post('/unsubscribe', unsubscribe);
notificationRouter.post('/test', authenticate, sendTestPush);

// FCM device token registration
notificationRouter.post('/fcm/token', authenticate, registerFcmToken);
notificationRouter.delete('/fcm/token', unregisterFcmToken);
