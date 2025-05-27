import { Request, Response } from 'express';
import db from '../utils/db';
import logger from '../utils/logger';

/**
 * Get all users
 */
export async function getUsers(req: Request, res: Response): Promise<void> {
  try {
    const result = await db.query(
      `SELECT u.id, u.phone_number, u.created_at, 
              COUNT(w.id) AS wallet_count
       FROM users u
       LEFT JOIN wallets w ON u.id = w.user_id
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    );

    res.status(200).json({ users: result.rows });
  } catch (error) {
    logger.error(`Error getting users: ${error}`);
    res.status(500).json({ error: 'Error fetching users' });
  }
}

/**
 * Get all wallets
 */
export async function getWallets(req: Request, res: Response): Promise<void> {
  try {
    const result = await db.query(
      `SELECT w.id, w.public_key, w.created_at, w.is_active,
              u.phone_number
       FROM wallets w
       JOIN users u ON w.user_id = u.id
       ORDER BY w.created_at DESC`
    );

    res.status(200).json({ wallets: result.rows });
  } catch (error) {
    logger.error(`Error getting wallets: ${error}`);
    res.status(500).json({ error: 'Error fetching wallets' });
  }
}

/**
 * Get all message logs
 */
export async function getMessageLogs(req: Request, res: Response): Promise<void> {
  try {
    const result = await db.query(
      `SELECT id, phone_number, message_content, direction, processed, error_message, created_at
       FROM message_logs
       ORDER BY created_at DESC
       LIMIT 100`
    );

    res.status(200).json({ logs: result.rows });
  } catch (error) {
    logger.error(`Error getting message logs: ${error}`);
    res.status(500).json({ error: 'Error fetching message logs' });
  }
}

/**
 * Get dashboard summary
 */
export async function getDashboardSummary(req: Request, res: Response): Promise<void> {
  try {
    // Get user count
    const userCountResult = await db.query('SELECT COUNT(*) AS count FROM users');
    const userCount = parseInt(userCountResult.rows[0].count, 10);

    // Get wallet count
    const walletCountResult = await db.query('SELECT COUNT(*) AS count FROM wallets');
    const walletCount = parseInt(walletCountResult.rows[0].count, 10);

    // Get message count
    const messageCountResult = await db.query('SELECT COUNT(*) AS count FROM message_logs');
    const messageCount = parseInt(messageCountResult.rows[0].count, 10);

    // Get transaction count
    const transactionCountResult = await db.query('SELECT COUNT(*) AS count FROM transactions');
    const transactionCount = parseInt(transactionCountResult.rows[0].count, 10);

    // Get inbound message count
    const inboundCountResult = await db.query("SELECT COUNT(*) AS count FROM message_logs WHERE direction = 'INBOUND'");
    const inboundCount = parseInt(inboundCountResult.rows[0].count, 10);

    // Get outbound message count
    const outboundCountResult = await db.query("SELECT COUNT(*) AS count FROM message_logs WHERE direction = 'OUTBOUND'");
    const outboundCount = parseInt(outboundCountResult.rows[0].count, 10);

    res.status(200).json({
      userCount,
      walletCount,
      messageCount,
      transactionCount,
      inboundCount,
      outboundCount,
    });
  } catch (error) {
    logger.error(`Error getting dashboard summary: ${error}`);
    res.status(500).json({ error: 'Error fetching dashboard summary' });
  }
} 