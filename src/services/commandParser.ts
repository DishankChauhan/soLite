import logger from '../utils/logger';
import walletService from './walletService';
import smsService from './smsService';
import transactionService from './transactionService';
import contactService from './contactService';
import authService from './authService';
import { PublicKey } from '@solana/web3.js';

// Define command types
export enum CommandType {
  CREATE = 'CREATE',
  BALANCE = 'BALANCE',
  SEND = 'SEND',
  HISTORY = 'HISTORY',
  SETUP_PIN = 'SETUP PIN',
  VERIFY_PIN = 'VERIFY PIN',
  ADD_CONTACT = 'ADD CONTACT',
  LIST_CONTACTS = 'CONTACTS',
  UNKNOWN = 'UNKNOWN',
}

// Parse the SMS command
export function parseCommand(message: string): { 
  command: CommandType; 
  amount?: number; 
  tokenType?: string; 
  recipient?: string;
  pin?: string;
  contactAlias?: string;
  walletAddress?: string;
} {
  // Get the original message for preserving case
  const originalMessage = message.trim();
  
  // Normalize the command portion for comparison
  const normalizedMessage = originalMessage.toUpperCase();

  // Basic commands check
  if (normalizedMessage === CommandType.CREATE) {
    return { command: CommandType.CREATE };
  }

  if (normalizedMessage === CommandType.BALANCE) {
    return { command: CommandType.BALANCE };
  }

  if (normalizedMessage === CommandType.HISTORY) {
    return { command: CommandType.HISTORY };
  }

  if (normalizedMessage === CommandType.LIST_CONTACTS) {
    return { command: CommandType.LIST_CONTACTS };
  }

  if (normalizedMessage === CommandType.SETUP_PIN) {
    return { command: CommandType.SETUP_PIN };
  }

  // VERIFY PIN command: VERIFY PIN <pin>
  if (normalizedMessage.startsWith(`${CommandType.VERIFY_PIN} `)) {
    const pinParts = originalMessage.split(' ');
    if (pinParts.length === 3) {
      const pin = pinParts[2].trim();
      return { command: CommandType.VERIFY_PIN, pin };
    }
  }

  // ADD CONTACT command: ADD CONTACT <alias> <address>
  if (normalizedMessage.startsWith('ADD CONTACT ')) {
    const parts = originalMessage.split(' ');
    if (parts.length >= 4) {
      const contactAlias = parts[2].trim();
      const walletAddress = parts.slice(3).join(' ').trim();
      
      return { 
        command: CommandType.ADD_CONTACT, 
        contactAlias, 
        walletAddress 
      };
    }
  }

  // SEND command: SEND <amount> <token_type> TO <alias or address>
  if (normalizedMessage.startsWith(`${CommandType.SEND} `)) {
    logger.info(`Attempting to parse SEND command: "${normalizedMessage}"`);
    
    // Split by " TO " to preserve case in the recipient
    const toIndex = originalMessage.toLowerCase().indexOf(" to ");
    if (toIndex !== -1) {
      const firstPart = originalMessage.substring(0, toIndex).toUpperCase();
      const recipient = originalMessage.substring(toIndex + 4).trim();
      
      const firstPartTokens = firstPart.split(" ");
      if (firstPartTokens.length >= 3 && firstPartTokens[0] === "SEND") {
        const amount = parseFloat(firstPartTokens[1]);
        const tokenType = firstPartTokens[2];
        
        logger.info(`Parsed SEND command components:`);
        logger.info(`- Amount: ${amount}`);
        logger.info(`- Token Type: ${tokenType}`);
        logger.info(`- Recipient: ${recipient}`);
        
        if (!isNaN(amount) && (tokenType === "SOL" || tokenType === "USDC")) {
          return { 
            command: CommandType.SEND, 
            amount, 
            tokenType, 
            recipient 
          };
        }
      }
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
      
      case CommandType.BALANCE: {
        // Check if user has verified PIN before allowing balance check
        const pinCheck = await authService.requirePin(phoneNumber);
        if (!pinCheck.verified) {
          return pinCheck.message || 'Security verification required. Send SETUP PIN to secure your wallet.';
        }
        return await handleBalanceCommand(phoneNumber);
      }
      
      case CommandType.SEND: {
        // Check if user has verified PIN before allowing sends
        const pinCheck = await authService.requirePin(phoneNumber);
        if (!pinCheck.verified) {
          return pinCheck.message || 'Security verification required. Send SETUP PIN to secure your wallet.';
        }
        
        return await handleSendCommand(
          phoneNumber, 
          parsedCommand.amount || 0, 
          parsedCommand.tokenType || '', 
          parsedCommand.recipient || ''
        );
      }
      
      case CommandType.HISTORY: {
        // Check if user has verified PIN before showing history
        const pinCheck = await authService.requirePin(phoneNumber);
        if (!pinCheck.verified) {
          return pinCheck.message || 'Security verification required. Send SETUP PIN to secure your wallet.';
        }
        return await handleHistoryCommand(phoneNumber);
      }
      
      case CommandType.SETUP_PIN:
        return await handleSetupPinCommand(phoneNumber);
      
      case CommandType.VERIFY_PIN:
        return await handleVerifyPinCommand(phoneNumber, parsedCommand.pin || '');
      
      case CommandType.ADD_CONTACT:
        return await handleAddContactCommand(
          phoneNumber, 
          parsedCommand.contactAlias || '', 
          parsedCommand.walletAddress || ''
        );
      
      case CommandType.LIST_CONTACTS:
        return await handleListContactsCommand(phoneNumber);
      
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
    // Get existing wallet
    const wallet = await walletService.getWalletByPhoneNumber(phoneNumber);
    
    if (wallet) {
      return `You already have a wallet with address: ${wallet.publicKey}`;
    }
    
    // Create a new wallet
    const newWallet = await walletService.createWallet(phoneNumber);
    
    return `Wallet created successfully. Your address: ${newWallet.publicKey}\n\nFor security, please send SETUP PIN to set up a PIN code.`;
  } catch (error) {
    logger.error(`Error handling CREATE command: ${error}`);
    return 'Failed to create wallet. Please try again later.';
  }
}

// Handle BALANCE command
async function handleBalanceCommand(phoneNumber: string): Promise<string> {
  try {
    // Get wallet
    const wallet = await walletService.getWalletByPhoneNumber(phoneNumber);
    
    if (!wallet) {
      return 'No wallet found. Send CREATE to create a new wallet.';
    }
    
    // Get balances
    const balances = await walletService.getWalletBalances(wallet.publicKey);
    
    return `Your balances:\n${balances.sol} SOL\n${balances.usdc} USDC`;
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
  recipient: string
): Promise<string> {
  try {
    // Debug logging
    logger.info(`SEND Command - Debug Info:`);
    logger.info(`Amount: ${amount}`);
    logger.info(`Token Type: ${tokenType}`);
    logger.info(`Recipient: "${recipient}"`);
    
    // Validate inputs
    if (amount <= 0) {
      return 'Invalid amount. Amount must be greater than 0.';
    }
    
    if (tokenType !== 'SOL' && tokenType !== 'USDC') {
      return 'Invalid token type. Supported types: SOL, USDC.';
    }
    
    // First, try to resolve the recipient as a contact alias
    let recipientAddress = await contactService.resolveAlias(phoneNumber, recipient);
    
    // If not found as an alias, treat as a direct address
    if (!recipientAddress) {
      recipientAddress = recipient;
      
      // Validate address format
      let isValidAddress = false;
      try {
        new PublicKey(recipientAddress);
        isValidAddress = true;
      } catch (error) {
        // Not a valid address
        logger.warn(`Invalid Solana address format: ${error}`);
      }
  
      if (!isValidAddress) {
        return `Invalid recipient. "${recipient}" is not a recognized contact or valid Solana address.`;
      }
    }
    
    // Process the transaction
    const result = await transactionService.sendTokens(
      phoneNumber, 
      amount, 
      tokenType as 'SOL' | 'USDC', 
      recipientAddress
    );
    
    if (result.success) {
      // If the recipient was an alias, include that in the confirmation
      const aliasMsg = recipientAddress !== recipient ? ` (${recipient})` : '';
      return `${result.message}${aliasMsg}`;
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

// Handle SETUP PIN command
async function handleSetupPinCommand(phoneNumber: string): Promise<string> {
  try {
    const result = await authService.setupPin(phoneNumber);
    return result.message;
  } catch (error) {
    logger.error(`Error handling SETUP PIN command: ${error}`);
    return 'Failed to set up PIN. Please try again later.';
  }
}

// Handle VERIFY PIN command
async function handleVerifyPinCommand(phoneNumber: string, pin: string): Promise<string> {
  try {
    if (!pin) {
      return 'Please provide your PIN. Format: VERIFY PIN <your-pin>';
    }
    
    const result = await authService.verifyPin(phoneNumber, pin);
    return result.message;
  } catch (error) {
    logger.error(`Error handling VERIFY PIN command: ${error}`);
    return 'Failed to verify PIN. Please try again later.';
  }
}

// Handle ADD CONTACT command
async function handleAddContactCommand(
  phoneNumber: string, 
  alias: string, 
  address: string
): Promise<string> {
  try {
    if (!alias || !address) {
      return 'Please provide both an alias and address. Format: ADD CONTACT <alias> <address>';
    }
    
    const result = await contactService.addContact(phoneNumber, alias, address);
    return result.message;
  } catch (error) {
    logger.error(`Error handling ADD CONTACT command: ${error}`);
    return 'Failed to add contact. Please try again later.';
  }
}

// Handle LIST CONTACTS command
async function handleListContactsCommand(phoneNumber: string): Promise<string> {
  try {
    const contacts = await contactService.listContacts(phoneNumber);
    
    if (contacts.length === 0) {
      return 'No contacts found. Use ADD CONTACT <alias> <address> to add a contact.';
    }
    
    const contactList = contacts.map(contact => {
      // Make sure the wallet address exists before trying to truncate it
      if (contact.walletAddress) {
        // Truncate the address for better readability
        const shortAddress = `${contact.walletAddress.substring(0, 6)}...${contact.walletAddress.substring(contact.walletAddress.length - 4)}`;
        return `${contact.alias}: ${shortAddress}`;
      } else {
        return `${contact.alias}: (Invalid address)`;
      }
    }).join('\n');
    
    return `Your Contacts:\n${contactList}`;
  } catch (error) {
    logger.error(`Error handling LIST CONTACTS command: ${error}`);
    return 'Failed to list contacts. Please try again later.';
  }
}

// Help message
function getHelpMessage(): string {
  return 'SolaText Commands:\n' + 
         '- CREATE: Create a wallet\n' + 
         '- BALANCE: Check balance\n' + 
         '- SEND <amount> <SOL|USDC> TO <address/alias>: Send tokens\n' + 
         '- HISTORY: View transactions\n' + 
         '- SETUP PIN: Secure your wallet\n' + 
         '- VERIFY PIN <pin>: Verify your PIN\n' + 
         '- ADD CONTACT <alias> <address>: Add a contact\n' + 
         '- CONTACTS: List your contacts';
}

export default {
  parseCommand,
  processCommand,
}; 