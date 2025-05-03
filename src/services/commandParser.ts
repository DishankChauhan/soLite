import logger from '../utils/logger';
import walletService from './walletService';
import smsService from './smsService';
import transactionService from './transactionService';
import { PublicKey } from '@solana/web3.js';

// Define command types
export enum CommandType {
  CREATE = 'CREATE',
  BALANCE = 'BALANCE',
  SEND = 'SEND',
  HISTORY = 'HISTORY',
  UNKNOWN = 'UNKNOWN',
}

// Parse the SMS command
export function parseCommand(message: string): { 
  command: CommandType; 
  amount?: number; 
  tokenType?: string; 
  recipientAddress?: string;
} {
  // Normalize the message
  const normalizedMessage = message.trim().toUpperCase();

  // Check for CREATE command
  if (normalizedMessage === CommandType.CREATE) {
    return { command: CommandType.CREATE };
  }

  // Check for BALANCE command
  if (normalizedMessage === CommandType.BALANCE) {
    return { command: CommandType.BALANCE };
  }

  // Check for HISTORY command
  if (normalizedMessage === CommandType.HISTORY) {
    return { command: CommandType.HISTORY };
  }

  // Check for SEND command: SEND <amount> <token_type> TO <address>
  if (normalizedMessage.startsWith(`${CommandType.SEND} `)) {
    const sendPattern = /^SEND\s+(\d+(?:\.\d+)?)\s+(SOL|USDC)\s+TO\s+([a-zA-Z0-9]{32,44})$/i;
    const match = normalizedMessage.match(sendPattern);
    
    if (match) {
      return { 
        command: CommandType.SEND, 
        amount: parseFloat(match[1]), 
        tokenType: match[2].toUpperCase(), 
        recipientAddress: match[3]
      };
    }
  }

  // If no command matches, return UNKNOWN
  return { command: CommandType.UNKNOWN };
}

// Process the command
export async function processCommand(phoneNumber: string, message: string): Promise<string> {
  try {
    // Log inbound message
    await smsService.logSmsMessage(phoneNumber, message, 'INBOUND');
    
    // Parse the command
    const parsedCommand = parseCommand(message);
    
    // Process based on command type
    switch (parsedCommand.command) {
      case CommandType.CREATE:
        return await handleCreateCommand(phoneNumber);
      
      case CommandType.BALANCE:
        return await handleBalanceCommand(phoneNumber);
      
      case CommandType.SEND:
        return await handleSendCommand(
          phoneNumber, 
          parsedCommand.amount || 0, 
          parsedCommand.tokenType || '', 
          parsedCommand.recipientAddress || ''
        );
      
      case CommandType.HISTORY:
        return await handleHistoryCommand(phoneNumber);
      
      case CommandType.UNKNOWN:
      default:
        return getHelpMessage();
    }
  } catch (error) {
    logger.error(`Error processing command: ${error}`);
    return 'An error occurred while processing your request. Please try again later.';
  }
}

// Handle CREATE command
async function handleCreateCommand(phoneNumber: string): Promise<string> {
  try {
    const wallet = await walletService.createWallet(phoneNumber);
    return `Wallet created.\nAddress: ${wallet.publicKey.substring(0, 5)}...${wallet.publicKey.substring(wallet.publicKey.length - 3)}`;
  } catch (error) {
    logger.error(`Error handling CREATE command: ${error}`);
    return 'Failed to create wallet. Please try again later.';
  }
}

// Handle BALANCE command
async function handleBalanceCommand(phoneNumber: string): Promise<string> {
  try {
    // Get wallet by phone number
    const wallet = await walletService.getWalletByPhoneNumber(phoneNumber);
    if (!wallet) {
      return 'No wallet found. Send CREATE to create a new wallet.';
    }

    // Get wallet balances
    const balances = await walletService.getWalletBalances(wallet.publicKey);
    
    return `Balance:\nSOL: ${balances.sol.toFixed(3)}\nUSDC: ${balances.usdc.toFixed(2)}`;
  } catch (error) {
    logger.error(`Error handling BALANCE command: ${error}`);
    return 'Failed to get balance. Please try again later.';
  }
}

// Handle SEND command
async function handleSendCommand(
  phoneNumber: string, 
  amount: number, 
  tokenType: string, 
  recipientAddress: string
): Promise<string> {
  try {
    // Validate inputs
    if (amount <= 0) {
      return 'Invalid amount. Amount must be greater than 0.';
    }
    
    if (tokenType !== 'SOL' && tokenType !== 'USDC') {
      return 'Invalid token type. Supported types: SOL, USDC.';
    }
    
    try {
      new PublicKey(recipientAddress);
    } catch {
      return 'Invalid recipient address.';
    }
    
    // Process the transaction
    const result = await transactionService.sendTokens(
      phoneNumber, 
      amount, 
      tokenType as 'SOL' | 'USDC', 
      recipientAddress
    );
    
    if (result.success) {
      return result.message;
    } else {
      return result.message;
    }
  } catch (error) {
    logger.error(`Error handling SEND command: ${error}`);
    return 'Failed to send tokens. Please try again later.';
  }
}

// Handle HISTORY command
async function handleHistoryCommand(phoneNumber: string): Promise<string> {
  try {
    // Get transaction history
    const transactions = await transactionService.getTransactionHistory(phoneNumber);
    
    if (transactions.length === 0) {
      return 'No transaction history found.';
    }
    
    // Format the transactions
    const formattedTransactions = transactions.slice(0, 3).map(tx => {
      const date = new Date(tx.created_at).toLocaleDateString();
      const time = new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      return `${date} ${time}: ${tx.transaction_type} ${tx.amount} ${tx.token_type} ${tx.recipient_address ? 'TO ' + tx.recipient_address.substring(0, 5) + '...' : ''}`;
    }).join('\n');
    
    return `Last Transactions:\n${formattedTransactions}\n\nTotal: ${transactions.length} transactions`;
  } catch (error) {
    logger.error(`Error handling HISTORY command: ${error}`);
    return 'Failed to get transaction history. Please try again later.';
  }
}

// Help message
function getHelpMessage(): string {
  return 'SolaText Commands:\n- CREATE: Create a new wallet\n- BALANCE: Check your balance\n- SEND <amount> <SOL|USDC> TO <address>: Send tokens\n- HISTORY: View transaction history';
}

export default {
  parseCommand,
  processCommand,
}; 