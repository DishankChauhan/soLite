import db from '../utils/db';
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import logger from '../utils/logger';
import solanaService from './solanaService';
import tokenService from './tokenService';

/**
 * Create a new Solana wallet for a user
 * @param phoneNumber - The user's phone number
 */
async function createWallet(phoneNumber: string): Promise<{ publicKey: string }> {
  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');
    
    // Check if user exists
    let userResult = await client.query(
      'SELECT id FROM users WHERE phone_number = $1',
      [phoneNumber]
    );
    
    let userId;
    
    // If user doesn't exist, create one
    if (userResult.rows.length === 0) {
      const newUserResult = await client.query(
        'INSERT INTO users (phone_number) VALUES ($1) RETURNING id',
        [phoneNumber]
      );
      userId = newUserResult.rows[0].id;
    } else {
      userId = userResult.rows[0].id;
    }
    
    // Create a new keypair
    const keypair = solanaService.generateKeypair();
    const publicKey = keypair.publicKey.toString();
    const privateKey = keypair.secretKey;
    
    // Encrypt the private key
    const encryptedPrivateKey = solanaService.encryptPrivateKey(privateKey);
    
    // Store the wallet
    await client.query(
      'INSERT INTO wallets (user_id, public_key, encrypted_private_key) VALUES ($1, $2, $3)',
      [userId, publicKey, encryptedPrivateKey]
    );
    
    await client.query('COMMIT');
    
    logger.info(`Wallet created for ${phoneNumber} with address ${publicKey}`);
    return { publicKey };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(`Error creating wallet: ${error}`);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get a wallet by phone number
 * @param phoneNumber - The user's phone number
 */
async function getWalletByPhoneNumber(phoneNumber: string): Promise<{ publicKey: string } | null> {
  try {
    const result = await db.query(
      `SELECT w.public_key 
       FROM wallets w
       JOIN users u ON w.user_id = u.id
       WHERE u.phone_number = $1
       AND w.is_active = true
       ORDER BY w.created_at DESC
       LIMIT 1`,
      [phoneNumber]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return { publicKey: result.rows[0].public_key };
  } catch (error) {
    logger.error(`Error getting wallet by phone number: ${error}`);
    return null;
  }
}

/**
 * Get wallet balances
 * @param publicKey - The wallet's public key
 */
async function getWalletBalances(publicKey: string): Promise<{ 
  sol: number; 
  usdc: number;
  tokens: Array<{ symbol: string; balance: number }>;
}> {
  try {
    // Get SOL balance
    const solBalance = await solanaService.getSolBalance(publicKey);
    
    // Get USDC balance
    const usdcBalance = await solanaService.getUsdcBalance(publicKey);
    
    // Get all token balances
    const tokenBalances = await tokenService.getAllTokenBalances(publicKey);
    
    // Filter out SOL and USDC from token list (since we're showing them separately)
    const otherTokens = tokenBalances.filter(t => t.symbol !== 'SOL' && t.symbol !== 'USDC');
    
    return {
      sol: solBalance,
      usdc: usdcBalance,
      tokens: otherTokens
    };
  } catch (error) {
    logger.error(`Error getting wallet balances: ${error}`);
    return { sol: 0, usdc: 0, tokens: [] };
  }
}

/**
 * Format the balance response message
 * @param balances - The wallet balances
 */
function formatBalanceMessage(balances: { 
  sol: number; 
  usdc: number;
  tokens: Array<{ symbol: string; balance: number }>;
}): string {
  let message = 'Your balances:';
  
  // Add SOL balance
  message += `\n${balances.sol.toFixed(6)} SOL`;
  
  // Add USDC balance
  message += `\n${balances.usdc.toFixed(6)} USDC`;
  
  // Add other token balances
  if (balances.tokens.length > 0) {
    for (const token of balances.tokens) {
      if (token.balance > 0) {
        message += `\n${token.balance.toFixed(6)} ${token.symbol}`;
      }
    }
  }
  
  return message;
}

export default {
  createWallet,
  getWalletByPhoneNumber,
  getWalletBalances,
  formatBalanceMessage
}; 