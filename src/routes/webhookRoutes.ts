import * as express from 'express';
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { rateLimit } from 'express-rate-limit';
import transactionService from '../services/transactionService';
import tokenService from '../services/tokenService';
import logger from '../utils/logger';
import config from '../config';
import db from '../utils/db';

const router = express.Router();

// Rate limiter for webhook endpoints
const webhookRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // Limit each IP to 60 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for webhook: ${req.ip}`);
    res.status(429).json({
      error: 'Too many requests, please try again later',
    });
  },
});

// Apply rate limiting to all webhook routes
router.use(webhookRateLimiter);

/**
 * Verify the HMAC signature for webhook requests
 */
const verifyHmacSignature = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const signature = req.headers['x-webhook-signature'] as string;
    
    // If no signature provided, fall back to API key for backward compatibility
    if (!signature) {
      const { apiKey } = req.body;
      
      if (apiKey !== config.security.webhookApiKey) {
        logger.warn('Invalid API key used in webhook call', { ip: req.ip });
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      
      // Log that we're using deprecated auth method
      logger.warn('Using deprecated API key for webhook authentication', { ip: req.ip, path: req.path });
      
      return next();
    }
    
    // Calculate expected signature
    const payload = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', config.security.webhookSecret)
      .update(payload)
      .digest('hex');
    
    // Time-constant comparison to prevent timing attacks
    if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return next();
    }
    
    logger.warn('Invalid HMAC signature for webhook', { ip: req.ip, path: req.path });
    res.status(401).json({ error: 'Invalid signature' });
  } catch (error) {
    logger.error(`Error verifying webhook signature: ${error}`, { ip: req.ip, path: req.path });
    res.status(401).json({ error: 'Signature verification failed' });
  }
};

/**
 * Webhook for receiving transaction notifications
 * This can be called by an external service monitoring the blockchain
 */
const handleTransaction = (req: Request, res: Response): void => {
  (async () => {
    try {
      const {
        recipientAddress,
        senderAddress,
        amount,
        tokenType,
        signature
      } = req.body;
      
      // Log webhook request (but sanitize sensitive data)
      logger.info('Transaction webhook received', { 
        recipient: `${recipientAddress.substring(0, 4)}...`,
        sender: `${senderAddress.substring(0, 4)}...`, 
        tokenType,
        ip: req.ip
      });
      
      // Validate required fields
      if (!recipientAddress || !senderAddress || !amount || !tokenType || !signature) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }
      
      // Validate that we are not processing the same transaction again (idempotency)
      const existingTx = await db.query(
        'SELECT id FROM transactions WHERE transaction_signature = $1 LIMIT 1',
        [signature]
      );
      
      if (existingTx.rows.length > 0) {
        res.status(200).json({ status: 'success', message: 'Transaction already processed' });
        return;
      }
      
      // Record the transaction and notify the user
      const success = await transactionService.recordIncomingTransaction(
        recipientAddress,
        senderAddress,
        amount,
        tokenType,
        signature
      );
      
      if (success) {
        res.status(200).json({ status: 'success' });
      } else {
        res.status(404).json({ error: 'Recipient not found in system' });
      }
    } catch (error) {
      logger.error(`Error processing transaction webhook: ${error}`, { ip: req.ip });
      res.status(500).json({ error: 'Internal server error' });
    }
  })();
};

/**
 * Webhook for adding a new supported token
 */
const handleAddToken = (req: Request, res: Response): void => {
  (async () => {
    try {
      const {
        mintAddress,
        symbol,
        name,
        decimals,
        logoUrl
      } = req.body;
      
      // Log webhook request
      logger.info('Add token webhook received', { symbol, mintAddress, ip: req.ip });
      
      // Validate required fields
      if (!mintAddress || !symbol || !name || decimals === undefined) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }
      
      // Add the token
      const success = await tokenService.addSupportedToken(
        mintAddress,
        symbol,
        name,
        decimals,
        logoUrl
      );
      
      if (success) {
        res.status(200).json({ 
          status: 'success', 
          message: `Added ${symbol} token to supported tokens` 
        });
      } else {
        res.status(400).json({ error: 'Failed to add token' });
      }
    } catch (error) {
      logger.error(`Error processing add-token webhook: ${error}`, { ip: req.ip });
      res.status(500).json({ error: 'Internal server error' });
    }
  })();
};

/**
 * Health check endpoint for webhooks
 */
const handleHealthCheck = (req: Request, res: Response): void => {
  (async () => {
    try {
      // Check database connection
      const dbHealthy = await db.healthCheck();
      
      if (!dbHealthy) {
        res.status(500).json({ status: 'error', message: 'Database connection issue' });
        return;
      }
      
      // Check Solana connection
      const solanaConnected = await transactionService.checkSolanaConnection();
      
      if (!solanaConnected) {
        res.status(500).json({ status: 'error', message: 'Solana RPC connection issue' });
        return;
      }
      
      res.status(200).json({ status: 'ok' });
    } catch (error) {
      logger.error(`Error in webhook health check: ${error}`, { ip: req.ip });
      res.status(500).json({ status: 'error', message: 'Health check failed' });
    }
  })();
};

/**
 * Webhook for updating token prices
 */
const handleUpdatePrices = (req: Request, res: Response): void => {
  (async () => {
    try {
      const { forceUpdate } = req.body;
      
      // Update all token prices
      const updatedCount = await tokenService.updateAllTokenPrices();
      
      // If forcing update, also invalidate the cache
      if (forceUpdate === true) {
        tokenService.invalidateCache('prices');
      }
      
      res.status(200).json({ 
        status: 'success', 
        message: `Updated prices for ${updatedCount} tokens` 
      });
    } catch (error) {
      logger.error(`Error updating token prices: ${error}`, { ip: req.ip });
      res.status(500).json({ error: 'Internal server error' });
    }
  })();
};

// Register routes with HMAC verification
router.post('/transaction', verifyHmacSignature, handleTransaction);
router.post('/add-token', verifyHmacSignature, handleAddToken);
router.post('/update-prices', verifyHmacSignature, handleUpdatePrices);

// Health check doesn't need signature verification
router.get('/health', handleHealthCheck);

export default router; 