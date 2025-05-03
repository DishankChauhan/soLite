import solanaService from './services/solanaService';
import walletService from './services/walletService';
import transactionService from './services/transactionService';
import commandParser from './services/commandParser';
import logger from './utils/logger';
import { PublicKey } from '@solana/web3.js';

// Configuration checks
async function checkConfiguration() {
  logger.info('Checking configuration...');
  
  // Check relayer configuration
  logger.info(`Relayer public key: ${solanaService.relayerKeypair?.publicKey.toString() || 'Not configured'}`);
  
  // Check USDC token configuration
  logger.info(`USDC token address: ${solanaService.usdcTokenPublicKey?.toString() || 'Not configured'}`);
  
  // Validate that these are all properly set up
  if (!solanaService.relayerKeypair) {
    logger.error('❌ Relayer keypair not configured. Check your .env file.');
  } else {
    logger.info('✅ Relayer keypair is configured.');
  }
  
  if (!solanaService.usdcTokenPublicKey) {
    logger.warn('⚠️ USDC token address not configured. USDC transfers will not work.');
  } else {
    logger.info('✅ USDC token address is configured.');
  }
}

// Test wallet creation and balance checking
async function testWalletCreation() {
  logger.info('Testing wallet creation...');
  const testPhoneNumber = '+12672147419';
  
  try {
    // Create a wallet
    const wallet = await walletService.createWallet(testPhoneNumber);
    logger.info(`Created test wallet with public key: ${wallet.publicKey}`);
    
    // Get balance
    const solBalance = await solanaService.getSolBalance(wallet.publicKey);
    logger.info(`Test wallet SOL balance: ${solBalance}`);
    
    const usdcBalance = await solanaService.getUsdcBalance(wallet.publicKey);
    logger.info(`Test wallet USDC balance: ${usdcBalance}`);
    
    return wallet.publicKey;
  } catch (error) {
    logger.error(`Failed to create test wallet: ${error}`);
    return null;
  }
}

// Test command processing
async function testCommandProcessing() {
  logger.info('Testing command processing...');
  const testPhoneNumber = '+1234567890';
  
  // Test CREATE command
  logger.info('--- Testing CREATE command ---');
  let response = await commandParser.processCommand(testPhoneNumber, 'CREATE');
  logger.info(`Response: ${response}`);
  
  // Test BALANCE command
  logger.info('--- Testing BALANCE command ---');
  response = await commandParser.processCommand(testPhoneNumber, 'BALANCE');
  logger.info(`Response: ${response}`);
  
  // Test HISTORY command
  logger.info('--- Testing HISTORY command ---');
  response = await commandParser.processCommand(testPhoneNumber, 'HISTORY');
  logger.info(`Response: ${response}`);
  
  // Test SEND command (will fail due to lack of funds, but validates command parsing)
  logger.info('--- Testing SEND command ---');
  const testAddress = 'CEyKYvvqsGkZQm7YaQo9wPP3EH1ERNgV7vjh5GTtpf7Z';
  response = await commandParser.processCommand(testPhoneNumber, `SEND 0.001 SOL TO ${testAddress}`);
  logger.info(`Response: ${response}`);
}

// Validate that a Solana public key is valid
function testAddressValidation() {
  logger.info('Testing address validation...');
  
  const validAddresses = [
    'CEyKYvvqsGkZQm7YaQo9wPP3EH1ERNgV7vjh5GTtpf7Z',
    'So11111111111111111111111111111111111111112', // SOL token mint
  ];
  
  const invalidAddresses = [
    '0x1234567890123456789012345678901234567890', // Ethereum address
    'invalid-address',
    '', // Empty
  ];
  
  for (const address of validAddresses) {
    try {
      new PublicKey(address);
      logger.info(`✅ Valid address: ${address}`);
    } catch (error) {
      logger.error(`❌ Validation failed for supposedly valid address: ${address} - ${error}`);
    }
  }
  
  for (const address of invalidAddresses) {
    try {
      new PublicKey(address);
      logger.warn(`⚠️ Invalid address passed validation: ${address}`);
    } catch (error) {
      logger.info(`✅ Correctly rejected invalid address: ${address}`);
    }
  }
}

// Run all tests
async function runTests() {
  logger.info('Running Phase 2 tests...');
  
  // Step 1: Check configuration
  await checkConfiguration();
  
  // Step 2: Test address validation
  testAddressValidation();
  
  // Step 3: Test wallet creation
  const walletPublicKey = await testWalletCreation();
  
  // Step 4: Test command processing
  await testCommandProcessing();
  
  logger.info('Tests completed!');
}

// Run the tests
runTests().catch(error => {
  logger.error(`Test failed: ${error}`);
}); 