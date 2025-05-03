import express from 'express';
import * as adminController from '../controllers/adminController';

const router = express.Router();

// Dashboard summary endpoint
router.get('/dashboard', adminController.getDashboardSummary);

// User management endpoints
router.get('/users', adminController.getUsers);

// Wallet management endpoints
router.get('/wallets', adminController.getWallets);

// Message logs endpoint
router.get('/logs', adminController.getMessageLogs);

export default router; 