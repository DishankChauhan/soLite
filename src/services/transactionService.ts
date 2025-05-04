import { PublicKey } from '@solana/web3.js';
import db from '../utils/db';
import logger from '../utils/logger';
import solanaService from './solanaService';
import walletService from './walletService';
import tokenService from './tokenService';
import notificationService from './notificationService';

/**
 * Send tokens from a user's wallet to a recipient address
 * @param phoneNumber - The sender's phone number
 * @param amount - The amount to send
 * @param tokenType - The token type ('SOL' or 'USDC' or SPL token symbol)
 * @param recipientAddress - The recipient's address
 */
async function sendTokens(
  phoneNumber: string,
  amount: number,
  tokenType: string,
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
      'SELECT w.id, w.encrypted_private_key, u.id as user_id FROM wallets w JOIN users u ON w.user_id = u.id WHERE w.public_key = $1',
      [wallet.publicKey]
    );
    
    if (walletResult.rows.length === 0) {
      return { success: false, message: 'Wallet not found' };
    }
    
    const walletId = walletResult.rows[0].id;
    const userId = walletResult.rows[0].user_id;
    const encryptedPrivateKey = walletResult.rows[0].encrypted_private_key;
    const privateKey = solanaService.decryptPrivateKey(encryptedPrivateKey);
    
    // Determine token type and handle appropriately
    let balance: number;
    let signature: string;
    
    // Normalize token type to uppercase
    const normalizedTokenType = tokenType.toUpperCase();
    let storedTokenType: string = normalizedTokenType;
    
    if (normalizedTokenType === 'SOL') {
      // Handle SOL transfers
      balance = await solanaService.getSolBalance(wallet.publicKey);
      if (balance < amount) {
        return { 
          success: false, 
          message: `Insufficient SOL balance. Required: ${amount}, Available: ${balance.toFixed(6)}`
        };
      }
      signature = await solanaService.sendSol(privateKey, recipientAddress, amount);
    } else {
      // Handle SPL token transfers
      let token;
      
      if (normalizedTokenType === 'USDC') {
        // Special case for USDC
        token = await tokenService.getTokenBySymbol('USDC');
        if (!token) {
          return { success: false, message: 'USDC token not configured in system' };
        }
      } else {
        // Look up the token in our supported tokens
        token = await tokenService.getTokenBySymbol(normalizedTokenType);
        if (!token) {
          return { success: false, message: `Unsupported token: ${normalizedTokenType}. Send TOKENS to see supported tokens.` };
        }
      }
      
      const mintAddress = token.mint_address;
      balance = await tokenService.getTokenBalance(wallet.publicKey, mintAddress);
      
      if (balance < amount) {
        return { 
          success: false, 
          message: `Insufficient ${normalizedTokenType} balance. Required: ${amount}, Available: ${balance.toFixed(6)}`
        };
      }
      
      // Send the SPL token
      signature = await solanaService.sendSplToken(
        privateKey, 
        recipientAddress, 
        amount,
        mintAddress,
        token.decimals
      );
      
      // Store the mint address as the token type in the database
      storedTokenType = mintAddress;
    }
    
    // Record the transaction in the database
    await client.query(
      `INSERT INTO transactions
       (wallet_id, transaction_type, token_type, amount, recipient_address, transaction_signature, status)
       VALUES ($1, 'SEND', $2, $3, $4, $5, 'COMPLETED')`,
      [walletId, storedTokenType, amount, recipientAddress, signature]
    );
    
    // Queue transaction notification
    await notificationService.queueTransactionNotification(
      userId,
      'SEND',
      amount,
      normalizedTokenType,
      recipientAddress
    );
    
    await client.query('COMMIT');
    
    return {
      success: true,
      message: `Sent ${amount} ${normalizedTokenType} to ${recipientAddress.substring(0, 5)}...${recipientAddress.substring(recipientAddress.length - 3)}. Tx: ${signature.substring(0, 8)}...`,
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

/**
 * Format transaction history as a readable message
 * @param transactions - The transaction objects from the database
 */
function formatTransactionHistory(transactions: any[]): string {
  if (transactions.length === 0) {
    return 'No transaction history found.';
  }
  
  let message = 'Recent transactions:';
  
  for (const tx of transactions) {
    const date = new Date(tx.created_at).toLocaleDateString();
    const time = new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const type = tx.transaction_type;
    const amount = tx.amount;
    let tokenSymbol = tx.token_type;
    
    // If token_type is a mint address, try to get the symbol
    if (tokenSymbol.length > 20) {
      // This is a mint address, we'd need to lookup the token
      // For simplicity, we'll use "unknown token" here
      tokenSymbol = "TOKEN";
    }
    
    // Format different transaction types appropriately
    let txDescription;
    if (type === 'SEND') {
      const recipient = tx.recipient_address.substring(0, 5) + '...' + tx.recipient_address.substring(tx.recipient_address.length - 3);
      txDescription = `SENT ${amount} ${tokenSymbol} TO ${recipient}`;
    } else if (type === 'RECEIVE') {
      const sender = tx.sender_address.substring(0, 5) + '...' + tx.sender_address.substring(tx.sender_address.length - 3);
      txDescription = `RECEIVED ${amount} ${tokenSymbol} FROM ${sender}`;
    } else {
      txDescription = `${type} ${amount} ${tokenSymbol}`;
    }
    
    message += `\n${date} ${time}: ${txDescription}`;
  }
  
  message += '\n\nSend BALANCE to check current balances.';
  return message;
}

/**
 * Get a list of supported tokens
 */
async function getSupportedTokensList(): Promise<string> {
  try {
    const tokens = await tokenService.getSupportedTokens();
    
    if (tokens.length === 0) {
      return 'No tokens are currently supported.';
    }
    
    let message = 'Supported tokens:';
    message += '\nSOL - Solana';
    
    for (const token of tokens) {
      if (token.symbol !== 'SOL') {
        message += `\n${token.symbol} - ${token.name}`;
      }
    }
    
    message += '\n\nUse: SEND <amount> <token> TO <address>';
    
    return message;
  } catch (error) {
    logger.error(`Error getting supported tokens list: ${error}`);
    return 'Error retrieving supported tokens.';
  }
}

/**
 * Record and notify about an incoming transaction
 * @param recipientAddress - The recipient's wallet address
 * @param senderAddress - The sender's wallet address
 * @param amount - The amount received
 * @param tokenType - The token type
 * @param transactionSignature - The transaction signature
 */
async function recordIncomingTransaction(
  recipientAddress: string,
  senderAddress: string,
  amount: number,
  tokenType: string,
  transactionSignature: string
): Promise<boolean> {
  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');
    
    // Find the wallet ID for the recipient
    const walletResult = await client.query(
      'SELECT w.id, w.user_id FROM wallets w WHERE w.public_key = $1',
      [recipientAddress]
    );
    
    if (walletResult.rows.length === 0) {
      // No matching wallet in our system, can't notify
      return false;
    }
    
    const walletId = walletResult.rows[0].id;
    const userId = walletResult.rows[0].user_id;
    
    // Record the transaction
    await client.query(
      `INSERT INTO transactions
       (wallet_id, transaction_type, token_type, amount, sender_address, transaction_signature, status)
       VALUES ($1, 'RECEIVE', $2, $3, $4, $5, 'COMPLETED')`,
      [walletId, tokenType, amount, senderAddress, transactionSignature]
    );
    
    // Queue notification for the recipient
    await notificationService.queueTransactionNotification(
      userId,
      'RECEIVE',
      amount,
      tokenType,
      senderAddress
    );
    
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(`Error recording incoming transaction: ${error}`);
    return false;
  } finally {
    client.release();
  }
}

/**
 * Check the Solana RPC connection
 * @returns True if connection is working, false otherwise
 */
async function checkSolanaConnection(): Promise<boolean> {
  try {
    // Try to get some basic Solana data to test connection
    const version = await solanaService.connection.getVersion();
    return true;
  } catch (error) {
    logger.error(`Solana connection check failed: ${error}`);
    return false;
  }
}

export default {
  sendTokens,
  getTransactionHistory,
  formatTransactionHistory,
  getSupportedTokensList,
  recordIncomingTransaction,
  checkSolanaConnection
}; 