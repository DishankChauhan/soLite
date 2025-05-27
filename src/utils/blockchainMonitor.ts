import { Connection, PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';
import axios from 'axios';
import crypto from 'crypto';
import db from './db';
import logger from './logger';
import config from '../config';

// Time between checks (30 seconds)
const POLLING_INTERVAL = 30 * 1000;

class BlockchainMonitor {
  private connection: Connection;
  private isRunning: boolean = false;
  private lastSignature: string | null = null;

  constructor() {
    this.connection = new Connection(config.solana.rpcUrl);
  }

  /**
   * Start monitoring the blockchain for transactions
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Blockchain monitor is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting blockchain transaction monitor');

    try {
      // Get all wallet addresses we need to monitor
      const wallets = await this.getWalletsToMonitor();
      
      if (wallets.length === 0) {
        logger.warn('No wallets to monitor found in the database');
      } else {
        logger.info(`Monitoring ${wallets.length} wallets for transactions`);
      }

      // Start the monitoring loop
      this.monitorTransactions(wallets);
    } catch (error) {
      logger.error(`Error starting blockchain monitor: ${error}`);
      this.isRunning = false;
    }
  }

  /**
   * Stop the blockchain monitoring
   */
  public stop(): void {
    logger.info('Stopping blockchain transaction monitor');
    this.isRunning = false;
  }

  /**
   * Get all wallet addresses that we need to monitor
   */
  private async getWalletsToMonitor(): Promise<string[]> {
    try {
      const result = await db.query(
        `SELECT public_key FROM wallets WHERE is_active = true`
      );
      
      return result.rows.map(row => row.public_key);
    } catch (error) {
      logger.error(`Error fetching wallets to monitor: ${error}`);
      return [];
    }
  }

  /**
   * Monitor transactions for a set of wallet addresses
   */
  private async monitorTransactions(wallets: string[]): Promise<void> {
    if (!this.isRunning || wallets.length === 0) return;

    try {
      // For each wallet, check for new transactions
      for (const walletAddress of wallets) {
        await this.checkWalletTransactions(walletAddress);
      }

      // Schedule the next check
      setTimeout(() => {
        this.monitorTransactions(wallets);
      }, POLLING_INTERVAL);
    } catch (error) {
      logger.error(`Error in transaction monitoring loop: ${error}`);
      this.isRunning = false;
    }
  }

  /**
   * Check for new transactions for a specific wallet
   */
  private async checkWalletTransactions(walletAddress: string): Promise<void> {
    try {
      const publicKey = new PublicKey(walletAddress);
      
      // Get latest signatures for this wallet
      const signatures = await this.connection.getSignaturesForAddress(
        publicKey,
        { limit: 10 }
      );

      if (signatures.length === 0) return;

      // Process transactions in chronological order (oldest first)
      for (let i = signatures.length - 1; i >= 0; i--) {
        const signature = signatures[i].signature;
        
        // Skip if we've already processed this signature
        const exists = await this.hasProcessedTransaction(signature);
        if (exists) continue;

        // Get the transaction details
        const transaction = await this.connection.getParsedTransaction(signature);
        if (!transaction) continue;

        // Process the transaction data
        await this.processTransaction(transaction, walletAddress, signature);
      }
    } catch (error) {
      logger.error(`Error checking transactions for wallet ${walletAddress}: ${error}`);
    }
  }

  /**
   * Check if we've already processed a transaction
   */
  private async hasProcessedTransaction(signature: string): Promise<boolean> {
    try {
      const result = await db.query(
        `SELECT 1 FROM transactions WHERE transaction_signature = $1 LIMIT 1`,
        [signature]
      );
      
      return result.rows.length > 0;
    } catch (error) {
      logger.error(`Error checking if transaction was processed: ${error}`, { signature });
      return false;
    }
  }

  /**
   * Process a transaction and send a webhook notification
   */
  private async processTransaction(
    transaction: ParsedTransactionWithMeta,
    walletAddress: string,
    signature: string
  ): Promise<void> {
    try {
      // Extract relevant transaction data
      const { amount, sender, recipient, tokenType } = this.extractTransactionData(transaction, walletAddress);
      
      if (!amount || !sender || !recipient) {
        logger.debug(`Skipping transaction ${signature} - not a relevant SOL or token transfer`);
        return;
      }

      // Send webhook notification
      await this.sendTransactionWebhook({
        recipientAddress: recipient,
        senderAddress: sender,
        amount,
        tokenType: tokenType || 'SOL',
        signature
      });

    } catch (error) {
      logger.error(`Error processing transaction ${signature}: ${error}`);
    }
  }

  /**
   * Extract relevant data from a transaction
   */
  private extractTransactionData(
    transaction: ParsedTransactionWithMeta,
    walletAddress: string
  ): {
    amount: number | null;
    sender: string | null;
    recipient: string | null;
    tokenType: string | null;
  } {
    try {
      // Default response
      const result: {
        amount: number | null;
        sender: string | null;
        recipient: string | null;
        tokenType: string | null;
      } = {
        amount: null,
        sender: null,
        recipient: null,
        tokenType: null
      };

      if (!transaction.meta || transaction.meta.err) {
        return result; // Failed transaction or no metadata
      }

      // For native SOL transfers
      if (
        transaction.transaction.message.instructions &&
        transaction.transaction.message.instructions.length > 0
      ) {
        const instruction = transaction.transaction.message.instructions[0];
        
        if ('parsed' in instruction && instruction.parsed && instruction.parsed.type === 'transfer') {
          result.amount = instruction.parsed.info.lamports / 1e9; // Convert lamports to SOL
          result.sender = instruction.parsed.info.source;
          result.recipient = instruction.parsed.info.destination;
          result.tokenType = 'SOL';
          return result;
        }
      }

      // For SPL token transfers, check post token balances
      if (transaction.meta.postTokenBalances && transaction.meta.postTokenBalances.length > 0) {
        // Find the token balance for this wallet
        const tokenBalance = transaction.meta.postTokenBalances.find(
          balance => balance.owner === walletAddress
        );

        if (tokenBalance) {
          // Get token mint address and amount
          const mintAddress = tokenBalance.mint;
          
          // Determine if the wallet is sender or recipient
          const preBalances = transaction.meta.preTokenBalances || [];
          const preBalance = preBalances.find(
            balance => balance.owner === walletAddress && balance.mint === mintAddress
          );
          
          const postBalance = tokenBalance.uiTokenAmount.uiAmount || 0;
          const prevBalance = preBalance ? (preBalance.uiTokenAmount.uiAmount || 0) : 0;
          
          if (postBalance > prevBalance) {
            // This is a receipt
            result.amount = postBalance - prevBalance;
            result.recipient = walletAddress;
            
            // Try to find the sender
            const senderBalance = preBalances.find(
              balance => balance.owner !== walletAddress && balance.mint === mintAddress
            );
            
            result.sender = senderBalance?.owner || null;
          } else if (postBalance < prevBalance) {
            // This is a send
            result.amount = prevBalance - postBalance;
            result.sender = walletAddress;
            
            // Try to find the recipient
            const recipientBalance = transaction.meta.postTokenBalances.find(
              balance => balance.owner !== walletAddress && balance.mint === mintAddress
            );
            
            result.recipient = recipientBalance?.owner || null;
          }
          
          // Get token type based on mint address
          result.tokenType = mintAddress;
        }
      }
      
      return result;
    } catch (error) {
      logger.error(`Error extracting transaction data: ${error}`);
      return {
        amount: null,
        sender: null,
        recipient: null,
        tokenType: null
      };
    }
  }

  /**
   * Send transaction data to our webhook endpoint
   */
  private async sendTransactionWebhook(data: {
    recipientAddress: string;
    senderAddress: string;
    amount: number;
    tokenType: string;
    signature: string;
  }): Promise<void> {
    try {
      // Create HMAC signature for the webhook
      const payload = JSON.stringify(data);
      const hmacSignature = crypto
        .createHmac('sha256', config.security.webhookSecret)
        .update(payload)
        .digest('hex');

      // Post to our own webhook endpoint (or could be an external service)
      const webhookUrl = `http://localhost:${config.server.port}/webhook/transaction`;
      
      logger.info(`Sending transaction webhook for ${data.signature}`);
      
      await axios.post(webhookUrl, data, {
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-signature': hmacSignature
        }
      });
      
      logger.info(`Successfully sent transaction webhook for ${data.signature}`);
    } catch (error) {
      logger.error(`Error sending transaction webhook: ${error}`, { signature: data.signature });
    }
  }
}

// Create singleton instance
const blockchainMonitor = new BlockchainMonitor();

export default blockchainMonitor; 