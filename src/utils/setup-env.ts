import fs from 'fs';
import path from 'path';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

/**
 * This utility helps with setting up environment variables for SolaText
 * It handles:
 * 1. Reading the relayer keypair from a JSON file
 * 2. Formatting it for the .env file
 * 3. Setting up a devnet USDC token address
 */

// Devnet USDC token address (example)
const DEVNET_USDC_TOKEN_ADDRESS = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

// Path to your relayer keypair file
const KEYPAIR_PATH = path.join(process.cwd(), 'relayer-keypair.json');

// Function to read and format the keypair
function formatRelayerKeypair() {
  try {
    // Read keypair from file
    const keypairData = fs.readFileSync(KEYPAIR_PATH, 'utf8');
    const keypairArray = JSON.parse(keypairData);
    
    // Convert to Solana keypair
    const keypair = Keypair.fromSecretKey(new Uint8Array(keypairArray));
    
    // Get public key (for verification)
    const publicKey = keypair.publicKey.toString();
    
    // Format private key as array string for .env
    const privateKeyArray = JSON.stringify(Array.from(keypair.secretKey));
    
    // Format private key as base58 for .env (alternative)
    const privateKeyBase58 = bs58.encode(keypair.secretKey);
    
    console.log(`\n=== Relayer Wallet Information ===`);
    console.log(`Public Key: ${publicKey}`);
    console.log(`\nFor .env, use ONE of these formats:`);
    console.log(`\n1. Array format (preferred):`);
    console.log(`RELAYER_PRIVATE_KEY=${privateKeyArray}`);
    console.log(`\n2. Base58 format (alternative):`);
    console.log(`RELAYER_PRIVATE_KEY=${privateKeyBase58}`);
    
    return {
      publicKey,
      privateKeyArray,
      privateKeyBase58,
    };
  } catch (error) {
    console.error(`Error reading keypair file: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`Make sure ${KEYPAIR_PATH} exists.`);
    return null;
  }
}

// Function to set up USDC token address
function setupUsdcToken() {
  console.log(`\n=== USDC Token Information ===`);
  console.log(`Devnet USDC Token Address: ${DEVNET_USDC_TOKEN_ADDRESS}`);
  console.log(`\nFor .env, add:`);
  console.log(`USDC_TOKEN_ADDRESS=${DEVNET_USDC_TOKEN_ADDRESS}`);
  
  return DEVNET_USDC_TOKEN_ADDRESS;
}

// Main function
function setupEnvironment() {
  console.log(`Setting up environment for SolaText...`);
  
  // Format relayer keypair
  const keypairInfo = formatRelayerKeypair();
  
  // Set up USDC token address
  const usdcAddress = setupUsdcToken();
  
  console.log(`\n=== Next Steps ===`);
  console.log(`1. Copy the above values to your .env file`);
  console.log(`2. Restart your application`);
  console.log(`3. Run 'npm run test-phase2' to verify your setup`);
}

// Run the setup
setupEnvironment(); 