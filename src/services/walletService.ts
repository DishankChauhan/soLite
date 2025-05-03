import { PublicKey } from '@solana/web3.js';
import db from '../utils/db';
import logger from '../utils/logger';
import solanaService from './solanaService';

/**
 * Create a new wallet for a user
 * @param phoneNumber - The user's phone number
 */
async function createWallet(phoneNumber: string): Promise<{ publicKey: string }> {
  try {
    // First, check if the user exists
    const userResult = await db.query(
      'SELECT id FROM users WHERE phone_number = $1',
      [phoneNumber]
    );

    let userId;

    // If user doesn't exist, create one
    if (userResult.rows.length === 0) {
      const newUserResult = await db.query(
        'INSERT INTO users (phone_number) VALUES ($1) RETURNING id',
        [phoneNumber]
      );
      userId = newUserResult.rows[0].id;
    } else {
      userId = userResult.rows[0].id;
    }

    // Check if user already has a wallet
    const walletResult = await db.query(
      'SELECT public_key FROM wallets WHERE user_id = $1 AND is_active = true',
      [userId]
    );

    // If user already has a wallet, return it
    if (walletResult.rows.length > 0) {
      return { publicKey: walletResult.rows[0].public_key };
    }

    // Generate a new Solana keypair
    const keypair = solanaService.generateKeypair();
    const publicKey = keypair.publicKey.toString();
    const privateKey = keypair.secretKey;

    // Encrypt the private key
    const encryptedPrivateKey = solanaService.encryptPrivateKey(privateKey);

    // Save the wallet to the database
    await db.query(
      'INSERT INTO wallets (user_id, public_key, encrypted_private_key) VALUES ($1, $2, $3)',
      [userId, publicKey, encryptedPrivateKey]
    );

    logger.info(`Created new wallet for user with phone number ${phoneNumber}`);
    return { publicKey };
  } catch (error) {
    logger.error(`Error creating wallet: ${error}`);
    throw error;
  }
}

/**
 * Get a user's wallet details by phone number
 * @param phoneNumber - The user's phone number
 */
async function getWalletByPhoneNumber(phoneNumber: string): Promise<{ publicKey: string, userId: string } | null> {
  try {
    const result = await db.query(
      `SELECT w.public_key, w.user_id 
       FROM wallets w
       JOIN users u ON w.user_id = u.id
       WHERE u.phone_number = $1 AND w.is_active = true`,
      [phoneNumber]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return {
      publicKey: result.rows[0].public_key,
      userId: result.rows[0].user_id,
    };
  } catch (error) {
    logger.error(`Error getting wallet by phone number: ${error}`);
    throw error;
  }
}

/**
 * Get wallet balances
 * @param publicKey - The wallet's public key
 */
async function getWalletBalances(publicKey: string): Promise<{ sol: number, usdc: number }> {
  try {
    // Get SOL balance
    const solBalance = await solanaService.getSolBalance(publicKey);

    // Get USDC balance (placeholder for now)
    const usdcBalance = await solanaService.getUsdcBalance(publicKey);

    return {
      sol: solBalance,
      usdc: usdcBalance,
    };
  } catch (error) {
    logger.error(`Error getting wallet balances: ${error}`);
    throw error;
  }
}

export default {
  createWallet,
  getWalletByPhoneNumber,
  getWalletBalances,
}; 