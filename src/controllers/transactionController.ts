import { Request, Response } from 'express';
import db from '../utils/db';
import logger from '../utils/logger';

/**
 * Get all transactions
 */
export async function getTransactions(req: Request, res: Response): Promise<void> {
  try {
    const result = await db.query(
      `SELECT t.id, t.transaction_type, t.token_type, t.amount,
              t.recipient_address, t.sender_address, t.transaction_signature,
              t.status, t.created_at, w.public_key, u.phone_number
       FROM transactions t
       JOIN wallets w ON t.wallet_id = w.id
       JOIN users u ON w.user_id = u.id
       ORDER BY t.created_at DESC
       LIMIT 100`
    );

    res.status(200).json({ transactions: result.rows });
  } catch (error) {
    logger.error(`Error getting transactions: ${error}`);
    res.status(500).json({ error: 'Error fetching transactions' });
  }
}

/**
 * Get transaction by ID
 */
export async function getTransactionById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    
    const result = await db.query(
      `SELECT t.id, t.transaction_type, t.token_type, t.amount,
              t.recipient_address, t.sender_address, t.transaction_signature,
              t.status, t.created_at, w.public_key, u.phone_number
       FROM transactions t
       JOIN wallets w ON t.wallet_id = w.id
       JOIN users u ON w.user_id = u.id
       WHERE t.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Transaction not found' });
      return;
    }

    res.status(200).json({ transaction: result.rows[0] });
  } catch (error) {
    logger.error(`Error getting transaction by ID: ${error}`);
    res.status(500).json({ error: 'Error fetching transaction' });
  }
}

/**
 * Get transactions by wallet
 */
export async function getTransactionsByWallet(req: Request, res: Response): Promise<void> {
  try {
    const { walletId } = req.params;
    
    const result = await db.query(
      `SELECT t.id, t.transaction_type, t.token_type, t.amount,
              t.recipient_address, t.sender_address, t.transaction_signature,
              t.status, t.created_at
       FROM transactions t
       JOIN wallets w ON t.wallet_id = w.id
       WHERE w.public_key = $1 OR t.recipient_address = $1
       ORDER BY t.created_at DESC`,
      [walletId]
    );

    res.status(200).json({ transactions: result.rows });
  } catch (error) {
    logger.error(`Error getting transactions by wallet: ${error}`);
    res.status(500).json({ error: 'Error fetching transactions' });
  }
} 