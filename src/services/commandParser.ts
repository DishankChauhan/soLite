import logger from '../utils/logger';
import walletService from './walletService';
import smsService from './smsService';
import transactionService from './transactionService';
import contactService from './contactService';
import authService from './authService';
import notificationService from './notificationService';
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
  ENABLE_2FA = 'ENABLE 2FA',
  DISABLE_2FA = 'DISABLE 2FA',
  NOTIFICATIONS = 'NOTIFICATIONS',
  TOKENS = 'TOKENS',
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
  notificationSettings?: { transactions?: boolean; security?: boolean; marketing?: boolean; };
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

  if (normalizedMessage === CommandType.ENABLE_2FA) {
    return { command: CommandType.ENABLE_2FA };
  }

  if (normalizedMessage === CommandType.DISABLE_2FA) {
    return { command: CommandType.DISABLE_2FA };
  }

  if (normalizedMessage === CommandType.TOKENS) {
    return { command: CommandType.TOKENS };
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

  // NOTIFICATIONS command: NOTIFICATIONS ON/OFF <type>
  if (normalizedMessage.startsWith('NOTIFICATIONS ')) {
    const parts = originalMessage.split(' ');
    
    if (parts.length >= 3) {
      const action = parts[1].toUpperCase();
      const type = parts[2].toLowerCase();
      
      if (action === 'ON' || action === 'OFF') {
        const isEnabled = action === 'ON';
        const notificationSettings: {[key: string]: boolean} = {};
        
        if (type === 'all') {
          notificationSettings.transactions = isEnabled;
          notificationSettings.security = isEnabled;
          notificationSettings.marketing = isEnabled;
        } else if (['transactions', 'security', 'marketing'].includes(type)) {
          notificationSettings[type] = isEnabled;
        }
        
        if (Object.keys(notificationSettings).length > 0) {
          return {
            command: CommandType.NOTIFICATIONS,
            notificationSettings
          };
        }
      }
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
        
        if (!isNaN(amount)) {
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
      
      case CommandType.ENABLE_2FA:
        return await handleEnable2FACommand(phoneNumber);
      
      case CommandType.DISABLE_2FA:
        return await handleDisable2FACommand(phoneNumber);
      
      case CommandType.NOTIFICATIONS:
        return await handleNotificationsCommand(
          phoneNumber, 
          parsedCommand.notificationSettings || {}
        );
      
      case CommandType.TOKENS:
        return await handleTokensCommand();
      
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
    
    // Format the balance message
    return walletService.formatBalanceMessage(balances);
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
    
    let resolvedRecipient = recipient;
    
    // Check if recipient is an alias
    if (recipient.length < 32) {
      const resolvedAddress = await contactService.resolveAlias(phoneNumber, recipient);
      if (resolvedAddress) {
        logger.info(`Resolved alias ${recipient} to address ${resolvedAddress}`);
        resolvedRecipient = resolvedAddress;
      }
    }
    
    // Send the tokens
    const result = await transactionService.sendTokens(
      phoneNumber,
      amount,
      tokenType,
      resolvedRecipient
    );
    
    return result.message;
  } catch (error) {
    logger.error(`Error handling SEND command: ${error}`);
    return `Failed to send tokens: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// Handle HISTORY command
async function handleHistoryCommand(phoneNumber: string): Promise<string> {
  try {
    // Get transaction history
    const transactions = await transactionService.getTransactionHistory(phoneNumber);
    
    // Format and return the history
    return transactionService.formatTransactionHistory(transactions);
  } catch (error) {
    logger.error(`Error handling HISTORY command: ${error}`);
    return 'Failed to retrieve transaction history. Please try again later.';
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
    if (!pin || pin.length !== 6 || !/^\d+$/.test(pin)) {
      return 'Invalid PIN format. PIN must be a 6-digit number.';
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
    // Validate inputs
    if (!alias || alias.length === 0) {
      return 'Invalid alias. Please provide a name for this contact.';
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
      return 'You have no saved contacts. Use ADD CONTACT <alias> <address> to add one.';
    }
    
    let message = 'Your contacts:';
    for (const contact of contacts) {
      message += `\n${contact.alias}: ${contact.walletAddress.substring(0, 5)}...${contact.walletAddress.substring(contact.walletAddress.length - 3)}`;
    }
    
    return message;
  } catch (error) {
    logger.error(`Error handling LIST CONTACTS command: ${error}`);
    return 'Failed to list contacts. Please try again later.';
  }
}

// Handle ENABLE 2FA command
async function handleEnable2FACommand(phoneNumber: string): Promise<string> {
  try {
    // Check if user has verified PIN
    const pinCheck = await authService.requirePin(phoneNumber);
    if (!pinCheck.verified) {
      return pinCheck.message || 'You must verify your PIN before enabling 2FA. Send SETUP PIN to secure your wallet.';
    }
    
    const result = await authService.setup2FA(phoneNumber);
    return result.message;
  } catch (error) {
    logger.error(`Error handling ENABLE 2FA command: ${error}`);
    return 'Failed to enable two-factor authentication. Please try again later.';
  }
}

// Handle DISABLE 2FA command
async function handleDisable2FACommand(phoneNumber: string): Promise<string> {
  try {
    // Check if user has verified PIN
    const pinCheck = await authService.requirePin(phoneNumber);
    if (!pinCheck.verified) {
      return pinCheck.message || 'You must verify your PIN first. Send SETUP PIN to secure your wallet.';
    }
    
    const result = await authService.disable2FA(phoneNumber);
    return result.message;
  } catch (error) {
    logger.error(`Error handling DISABLE 2FA command: ${error}`);
    return 'Failed to disable two-factor authentication. Please try again later.';
  }
}

// Handle NOTIFICATIONS command
async function handleNotificationsCommand(
  phoneNumber: string,
  settings: { transactions?: boolean; security?: boolean; marketing?: boolean; }
): Promise<string> {
  try {
    // Update notification preferences
    const success = await notificationService.updateNotificationPreferences(
      phoneNumber,
      settings
    );
    
    if (!success) {
      return 'Failed to update notification preferences. Please try again.';
    }
    
    // Build a message about what was updated
    const updates: string[] = [];
    if (settings.transactions !== undefined) {
      updates.push(`Transaction alerts: ${settings.transactions ? 'ON' : 'OFF'}`);
    }
    if (settings.security !== undefined) {
      updates.push(`Security alerts: ${settings.security ? 'ON' : 'OFF'}`);
    }
    if (settings.marketing !== undefined) {
      updates.push(`Marketing messages: ${settings.marketing ? 'ON' : 'OFF'}`);
    }
    
    return `Notification preferences updated:\n${updates.join('\n')}`;
  } catch (error) {
    logger.error(`Error handling NOTIFICATIONS command: ${error}`);
    return 'Failed to update notification preferences. Please try again later.';
  }
}

// Handle TOKENS command
async function handleTokensCommand(): Promise<string> {
  try {
    return await transactionService.getSupportedTokensList();
  } catch (error) {
    logger.error(`Error handling TOKENS command: ${error}`);
    return 'Failed to retrieve supported tokens list. Please try again later.';
  }
}

// Get help message with command list
function getHelpMessage(): string {
  return `Available commands:

CREATE - Create a new wallet
BALANCE - Check your balances
SEND <amount> <token> TO <recipient> - Send tokens
HISTORY - View transaction history
SETUP PIN - Set up your security PIN
VERIFY PIN <pin> - Verify your PIN
ENABLE 2FA - Enable two-factor authentication
DISABLE 2FA - Disable two-factor authentication
ADD CONTACT <alias> <address> - Save an address
CONTACTS - List your saved contacts
NOTIFICATIONS ON/OFF <type> - Update notification settings
TOKENS - View supported tokens
`;
}

export default {
  parseCommand,
  processCommand,
}; 