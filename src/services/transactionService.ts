import { PublicKey } from '@solana/web3.js';
import db from '../utils/db';
import logger from '../utils/logger';
import solanaService from './solanaService';
import walletService from './walletService';

/**
 * Send tokens from a user's wallet to a recipient address
 * @param phoneNumber - The sender's phone number
 * @param amount - The amount to send
 * @param tokenType - The token type ('SOL' or 'USDC')
 * @param recipientAddress - The recipient's address
 */
async function sendTokens(
  phoneNumber: string,
  amount: number,
  tokenType: 'SOL' | 'USDC',
  recipientAddress: string
): Promise<{ success: boolean; message: string; signature?: string }> {
  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');
    
    // Validate amount
    if (amount <= 0) {
      return { success: false, message: 'Amount must be greater than 0' };
    }
    
    // Validate recipient address
    try {
      // Check if it's a valid Solana address
      new PublicKey(recipientAddress);
      
      // We've verified it's a valid Solana address, so we won't do additional length checks
      // as PublicKey validation should be sufficient
    } catch (error) {
      logger.error(`Invalid recipient address: ${error}`);
      return { success: false, message: 'Invalid recipient address' };
    }
    
    // Get sender's wallet
    const wallet = await walletService.getWalletByPhoneNumber(phoneNumber);
    if (!wallet) {
      return { success: false, message: 'No wallet found. Send CREATE to create a new wallet.' };
    }
    
    // Get wallet encrypted private key
    const walletResult = await client.query(
      'SELECT encrypted_private_key FROM wallets WHERE public_key = $1',
      [wallet.publicKey]
    );
    
    if (walletResult.rows.length === 0) {
      return { success: false, message: 'Wallet not found' };
    }
    
    const encryptedPrivateKey = walletResult.rows[0].encrypted_private_key;
    const privateKey = solanaService.decryptPrivateKey(encryptedPrivateKey);
    
    // Check balance
    let balance: number;
    if (tokenType === 'SOL') {
      balance = await solanaService.getSolBalance(wallet.publicKey);
      if (balance < amount) {
        return { 
          success: false, 
          message: `Insufficient SOL balance. Required: ${amount}, Available: ${balance.toFixed(6)}`
        };
      }
    } else if (tokenType === 'USDC') {
      balance = await solanaService.getUsdcBalance(wallet.publicKey);
      if (balance < amount) {
        return { 
          success: false, 
          message: `Insufficient USDC balance. Required: ${amount}, Available: ${balance.toFixed(6)}`
        };
      }
    } else {
      return { success: false, message: 'Invalid token type' };
    }
    
    // Send the tokens
    let signature: string;
    if (tokenType === 'SOL') {
      signature = await solanaService.sendSol(privateKey, recipientAddress, amount);
    } else { // tokenType === 'USDC'
      signature = await solanaService.sendUsdc(privateKey, recipientAddress, amount);
    }
    
    // Record the transaction in the database
    await client.query(
      `INSERT INTO transactions
       (wallet_id, transaction_type, token_type, amount, recipient_address, transaction_signature, status)
       VALUES (
         (SELECT id FROM wallets WHERE public_key = $1),
         'SEND',
         $2,
         $3,
         $4,
         $5,
         'COMPLETED'
       )`,
      [wallet.publicKey, tokenType, amount, recipientAddress, signature]
    );
    
    await client.query('COMMIT');
    
    return {
      success: true,
      message: `Sent ${amount} ${tokenType} to ${recipientAddress.substring(0, 5)}...${recipientAddress.substring(recipientAddress.length - 3)}. Tx: ${signature.substring(0, 8)}...`,
      signature
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(`Error sending tokens: ${error}`);
    return { success: false, message: `Transaction failed: ${error instanceof Error ? error.message : String(error)}` };
  } finally {
    client.release();
  }
}

/**
 * Get transaction history for a user
 * @param phoneNumber - The user's phone number
 */
async function getTransactionHistory(phoneNumber: string): Promise<any[]> {
  try {
    // Get wallet address from phone number
    const wallet = await walletService.getWalletByPhoneNumber(phoneNumber);
    if (!wallet) {
      return [];
    }
    
    // Get transactions
    const result = await db.query(
      `SELECT t.id, t.transaction_type, t.token_type, t.amount, 
              t.recipient_address, t.sender_address, t.transaction_signature, 
              t.status, t.created_at
       FROM transactions t
       JOIN wallets w ON t.wallet_id = w.id
       WHERE w.public_key = $1
       ORDER BY t.created_at DESC
       LIMIT 10`,
      [wallet.publicKey]
    );
    
    return result.rows;
  } catch (error) {
    logger.error(`Error getting transaction history: ${error}`);
    return [];
  }
}

export default {
  sendTokens,
  getTransactionHistory,
}; 