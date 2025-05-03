import express from 'express';
import * as adminController from '../controllers/adminController';
import * as transactionController from '../controllers/transactionController';

const router = express.Router();

// Dashboard summary endpoint
router.get('/dashboard', adminController.getDashboardSummary);

// User management endpoints
router.get('/users', adminController.getUsers);

// Wallet management endpoints
router.get('/wallets', adminController.getWallets);

// Transaction management endpoints
router.get('/transactions', transactionController.getTransactions);
router.get('/transactions/:id', transactionController.getTransactionById);
router.get('/wallets/:walletId/transactions', transactionController.getTransactionsByWallet);

// Message logs endpoint
router.get('/logs', adminController.getMessageLogs);

export default router; 