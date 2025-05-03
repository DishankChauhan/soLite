import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction, 
  SystemProgram, 
  sendAndConfirmTransaction, 
  LAMPORTS_PER_SOL,
  clusterApiUrl,
  TransactionInstruction
} from '@solana/web3.js';
import { 
  getAssociatedTokenAddress, 
  TOKEN_PROGRAM_ID, 
  createTransferInstruction,
  getAccount,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync
} from '@solana/spl-token';
import config from '../config';
import logger from '../utils/logger';
import CryptoJS from 'crypto-js';

// Create a connection to the Solana network
const connection = new Connection(config.solana.rpcUrl);

// Initialize relayer keypair from private key if available
let relayerKeypair: Keypair | null = null;

if (config.solana.relayerPrivateKey) {
  try {
    // The private key can be stored in different formats, adjust as needed
    if (config.solana.relayerPrivateKey.startsWith('[')) {
      // Handle array format
      const privateKeyArray = JSON.parse(config.solana.relayerPrivateKey);
      relayerKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
    } else {
      // Handle base58 encoded format
      // This would need bs58 library, which isn't imported yet
      logger.warn('Relayer private key in base58 format not supported yet');
    }
    logger.info(`Relayer initialized with public key: ${relayerKeypair?.publicKey.toString()}`);
  } catch (error) {
    logger.error(`Failed to initialize relayer keypair: ${error}`);
  }
}

// USDC Token setup
const usdcTokenPublicKey = config.solana.usdcTokenAddress 
  ? new PublicKey(config.solana.usdcTokenAddress)
  : null;

/**
 * Generate a new Solana keypair
 */
function generateKeypair(): Keypair {
  return Keypair.generate();
}

/**
 * Encrypt a private key
 * @param privateKey - The private key to encrypt
 */
function encryptPrivateKey(privateKey: Uint8Array): string {
  const privateKeyString = Buffer.from(privateKey).toString('hex');
  return CryptoJS.AES.encrypt(privateKeyString, config.security.encryptionKey).toString();
}

/**
 * Decrypt a private key
 * @param encryptedPrivateKey - The encrypted private key
 */
function decryptPrivateKey(encryptedPrivateKey: string): Uint8Array {
  const decrypted = CryptoJS.AES.decrypt(encryptedPrivateKey, config.security.encryptionKey).toString(CryptoJS.enc.Utf8);
  return Buffer.from(decrypted, 'hex');
}

/**
 * Get the SOL balance for a wallet
 * @param publicKey - The public key of the wallet
 */
async function getSolBalance(publicKey: string): Promise<number> {
  try {
    const pubKey = new PublicKey(publicKey);
    const balance = await connection.getBalance(pubKey);
    return balance / LAMPORTS_PER_SOL; // Convert lamports to SOL
  } catch (error) {
    logger.error(`Error getting SOL balance: ${error}`);
    throw error;
  }
}

/**
 * Get the USDC balance for a wallet
 * @param publicKey - The public key of the wallet
 */
async function getUsdcBalance(publicKey: string): Promise<number> {
  try {
    if (!usdcTokenPublicKey) {
      logger.warn('USDC token address not configured');
      return 0;
    }

    const pubKey = new PublicKey(publicKey);
    const tokenAddress = await getAssociatedTokenAddress(usdcTokenPublicKey, pubKey);
    
    try {
      const tokenAccount = await getAccount(connection, tokenAddress);
      // Token amounts in Solana are typically stored with 6 decimal places for USDC
      return Number(tokenAccount.amount) / 1_000_000;
    } catch (error) {
      // Account doesn't exist yet, which means it has 0 balance
      return 0;
    }
  } catch (error) {
    logger.error(`Error getting USDC balance: ${error}`);
    return 0;
  }
}

/**
 * Send SOL from one wallet to another
 * @param senderPrivateKey - The sender's private key
 * @param recipientPublicKey - The recipient's public key
 * @param amount - The amount of SOL to send
 */
async function sendSol(
  senderPrivateKey: Uint8Array,
  recipientPublicKey: string,
  amount: number
): Promise<string> {
  try {
    const senderKeypair = Keypair.fromSecretKey(senderPrivateKey);
    const recipientPubKey = new PublicKey(recipientPublicKey);
    const lamports = Math.floor(amount * LAMPORTS_PER_SOL);

    // Check if sender has enough balance
    const senderBalance = await connection.getBalance(senderKeypair.publicKey);
    const minimumBalance = lamports + 5000; // Add some for transaction fee
    
    if (senderBalance < minimumBalance) {
      throw new Error(`Insufficient balance. Required: ${minimumBalance / LAMPORTS_PER_SOL} SOL, Available: ${senderBalance / LAMPORTS_PER_SOL} SOL`);
    }

    // Create and sign transaction
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: senderKeypair.publicKey,
        toPubkey: recipientPubKey,
        lamports,
      })
    );

    // Sign and send the transaction
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [senderKeypair]
    );

    logger.info(`SOL transfer complete. Signature: ${signature}`);
    return signature;
  } catch (error) {
    logger.error(`Error sending SOL: ${error}`);
    throw error;
  }
}

/**
 * Send USDC from one wallet to another, with fee paid by the relayer
 * @param senderPrivateKey - The sender's private key
 * @param recipientPublicKey - The recipient's public key
 * @param amount - The amount of USDC to send
 */
async function sendUsdc(
  senderPrivateKey: Uint8Array,
  recipientPublicKey: string,
  amount: number
): Promise<string> {
  try {
    if (!usdcTokenPublicKey) {
      throw new Error('USDC token address not configured');
    }

    if (!relayerKeypair) {
      throw new Error('Relayer not configured');
    }

    const senderKeypair = Keypair.fromSecretKey(senderPrivateKey);
    const recipientPubKey = new PublicKey(recipientPublicKey);
    
    // Token amounts in Solana are typically stored with 6 decimal places for USDC
    const tokenAmount = Math.floor(amount * 1_000_000);
    
    // Get the associated token accounts for sender and recipient
    const senderTokenAddress = getAssociatedTokenAddressSync(
      usdcTokenPublicKey,
      senderKeypair.publicKey
    );
    
    const recipientTokenAddress = getAssociatedTokenAddressSync(
      usdcTokenPublicKey,
      recipientPubKey
    );
    
    // Check if sender has enough tokens
    try {
      const senderAccount = await getAccount(connection, senderTokenAddress);
      if (Number(senderAccount.amount) < tokenAmount) {
        throw new Error(`Insufficient USDC balance. Required: ${tokenAmount / 1_000_000}, Available: ${Number(senderAccount.amount) / 1_000_000}`);
      }
    } catch (error) {
      throw new Error('Sender does not have a USDC account or insufficient balance');
    }
    
    // Create transaction
    const transaction = new Transaction();
    
    // Check if recipient token account exists, if not create it
    try {
      await getAccount(connection, recipientTokenAddress);
    } catch (error) {
      // Recipient token account doesn't exist, create it
      transaction.add(
        createAssociatedTokenAccountInstruction(
          relayerKeypair.publicKey, // payer
          recipientTokenAddress, // associated token account
          recipientPubKey, // owner
          usdcTokenPublicKey // token mint
        )
      );
    }
    
    // Add token transfer instruction
    transaction.add(
      createTransferInstruction(
        senderTokenAddress, // source
        recipientTokenAddress, // destination
        senderKeypair.publicKey, // owner
        tokenAmount // amount
      )
    );
    
    // Use the relayer to pay for transaction fees
    transaction.feePayer = relayerKeypair.publicKey;
    
    // Sign and send transaction
    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    transaction.sign(senderKeypair, relayerKeypair);
    
    const signature = await connection.sendRawTransaction(transaction.serialize());
    await connection.confirmTransaction(signature);
    
    logger.info(`USDC transfer complete. Signature: ${signature}`);
    return signature;
  } catch (error) {
    logger.error(`Error sending USDC: ${error}`);
    throw error;
  }
}

// Export all functions
export default {
  generateKeypair,
  encryptPrivateKey,
  decryptPrivateKey,
  getSolBalance,
  getUsdcBalance,
  sendSol,
  sendUsdc,
  connection,
  relayerKeypair,
  usdcTokenPublicKey,
}; 