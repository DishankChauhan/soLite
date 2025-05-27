import solanaService from './services/solanaService';
import walletService from './services/walletService';
import commandParser from './services/commandParser';
import contactService from './services/contactService';
import authService from './services/authService';
import logger from './utils/logger';

// Testing data
const TEST_PHONE = '+19998887777';
const RECIPIENT_ADDRESS = 'CEyKYvvqsGkZQm7YaQo9wPP3EH1ERNgV7vjh5GTtpf7Z'; // Example address

async function testPINSetup() {
  logger.info('=== Testing PIN Setup ===');
  
  // 1. Create wallet if not exists
  logger.info('Creating test wallet...');
  let response = await commandParser.processCommand(TEST_PHONE, 'CREATE');
  logger.info(`Response: ${response}`);
  
  // 2. Setup PIN
  logger.info('Setting up PIN...');
  response = await commandParser.processCommand(TEST_PHONE, 'SETUP PIN');
  logger.info(`Response: ${response}`);
  
  // Extract PIN from response
  const pinMatch = response.match(/Your new PIN is (\d+)/);
  const pin = pinMatch ? pinMatch[1] : null;
  
  if (!pin) {
    logger.error('Could not extract PIN from response');
    return false;
  }
  
  // 3. Verify PIN
  logger.info(`Verifying PIN ${pin}...`);
  response = await commandParser.processCommand(TEST_PHONE, `VERIFY PIN ${pin}`);
  logger.info(`Response: ${response}`);
  
  // 4. Try balance check (should work now)
  logger.info('Checking balance with verified PIN...');
  response = await commandParser.processCommand(TEST_PHONE, 'BALANCE');
  logger.info(`Response: ${response}`);
  
  return true;
}

async function testContactAlias() {
  logger.info('=== Testing Contact Aliases ===');
  
  // 1. Add a contact
  logger.info('Adding a contact...');
  let response = await commandParser.processCommand(
    TEST_PHONE, 
    `ADD CONTACT MAMA ${RECIPIENT_ADDRESS}`
  );
  logger.info(`Response: ${response}`);
  
  // 2. List contacts
  logger.info('Listing contacts...');
  response = await commandParser.processCommand(TEST_PHONE, 'CONTACTS');
  logger.info(`Response: ${response}`);
  
  // 3. Test sending to alias (will likely fail due to insufficient funds, but we can check command parsing)
  logger.info('Sending to alias...');
  response = await commandParser.processCommand(TEST_PHONE, 'SEND 0.001 SOL TO MAMA');
  logger.info(`Response: ${response}`);
  
  return true;
}

async function testUSDCPayment() {
  logger.info('=== Testing USDC Payment ===');
  
  // Get test wallet address
  const wallet = await walletService.getWalletByPhoneNumber(TEST_PHONE);
  if (!wallet) {
    logger.error('Test wallet not found');
    return false;
  }
  
  logger.info(`Test wallet address: ${wallet.publicKey}`);
  
  // Check USDC balance
  const usdcBalance = await solanaService.getUsdcBalance(wallet.publicKey);
  logger.info(`Current USDC balance: ${usdcBalance}`);
  
  // Check if USDC token is configured
  if (!solanaService.usdcTokenPublicKey) {
    logger.warn('USDC token not configured properly in environment');
    return false;
  }
  
  // Try to send USDC (will likely fail due to insufficient balance, but will test parsing)
  logger.info('Sending USDC payment...');
  const response = await commandParser.processCommand(
    TEST_PHONE, 
    `SEND 1 USDC TO ${RECIPIENT_ADDRESS}`
  );
  logger.info(`Response: ${response}`);
  
  return true;
}

async function runTests() {
  logger.info('Starting tests for PIN, Contacts, and USDC payments...');
  
  try {
    // Test PIN functionality
    await testPINSetup();
    
    // Test contact functionality
    await testContactAlias();
    
    // Test USDC payment
    await testUSDCPayment();
    
    logger.info('All tests completed!');
  } catch (error) {
    logger.error(`Test failed: ${error}`);
  }
}

// Run the tests
runTests().catch(error => {
  logger.error(`Test failed: ${error}`);
}); 