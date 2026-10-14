import { Router } from 'express';
import { deliveryPortal } from '../controllers/delivery-portal.controller.js';
import { authenticate, authorizeDeliveryPerson } from '../middleware/auth.js';
import { deliveryProofUpload } from '../middleware/upload.js';

export const deliveryRouter = Router();

// Protect all delivery portal endpoints
deliveryRouter.use(authenticate, authorizeDeliveryPerson);

// 1. Orders Management
deliveryRouter.get('/my-orders', deliveryPortal.getMyOrders);
deliveryRouter.get('/orders/:id', deliveryPortal.getOrderDetails);
deliveryRouter.patch('/orders/:id/status', deliveryPortal.updateStatus);
deliveryRouter.post('/orders/:id/upload-proof', deliveryProofUpload.single('proofImage'), deliveryPortal.uploadProof);
deliveryRouter.post('/orders/:id/complete-delivery', deliveryPortal.completeDelivery);
deliveryRouter.post('/orders/:id/report-failure', deliveryPortal.reportFailure);

// 2. Profile & Duty Status
deliveryRouter.get('/profile', deliveryPortal.getMyProfile);
deliveryRouter.patch('/duty-status', deliveryPortal.updateDutyStatus);

// 3. COD Collections & Settlement Status
deliveryRouter.get('/cod-summary', deliveryPortal.getMyCodSummary);
