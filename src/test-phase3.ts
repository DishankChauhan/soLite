import 'dotenv/config';
import db from './utils/db';
import logger from './utils/logger';
import authService from './services/authService';
import tokenService from './services/tokenService';
import walletService from './services/walletService';
import notificationService from './services/notificationService';
import transactionService from './services/transactionService';
import crypto from 'crypto';

// Test phone number - use a test number here
const TEST_PHONE = '+12672147419';
const TEST_WALLET_ADDRESS = 'Replace_With_Valid_Solana_Address';

// Test HMAC signature verification
async function testHmacSignature() {
  console.log('\n--- Testing HMAC Signature Verification ---');
  
  const testPayload = {
    recipientAddress: TEST_WALLET_ADDRESS,
    senderAddress: 'AnotherValidSolanaAddress',
    amount: 1.0,
    tokenType: 'SOL',
    signature: crypto.randomBytes(16).toString('hex')
  };
  
  const payload = JSON.stringify(testPayload);
  const signature = crypto
    .createHmac('sha256', process.env.WEBHOOK_SECRET || 'default_webhook_secret_change_in_production')
    .update(payload)
    .digest('hex');
  
  console.log(`Sample payload: ${payload}`);
  console.log(`Generated HMAC signature: ${signature}`);
  console.log('To test: curl -X POST http://localhost:3000/webhook/transaction \\');
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -H "x-webhook-signature: ${signature}" \\`);
  console.log(`  -d '${payload}'`);
}

// Test rate limiting
async function testRateLimiting() {
  console.log('\n--- Testing Rate Limiting ---');
  console.log('To test rate limiting, run the following command multiple times:');
  console.log('curl -X GET http://localhost:3000/webhook/health');
  console.log('You should see rate limit errors after approximately 60 requests within a minute.');
}

// Test notification service with retry logic
async function testNotificationService() {
  console.log('\n--- Testing Notification Service with Retry Logic ---');
  
  try {
    // Fetch a user ID from the database for testing
    const userResult = await db.query(
      'SELECT id FROM users WHERE phone_number = $1',
      [TEST_PHONE]
    );
    
    if (userResult.rows.length === 0) {
      console.log(`No user found with phone number ${TEST_PHONE}`);
      return;
    }
    
    const userId = userResult.rows[0].id;
    
    // Queue a test notification
    const success = await notificationService.queueNotification(
      userId,
      notificationService.NotificationType.SECURITY,
      'This is a test notification for Phase 3 testing'
    );
    
    if (success) {
      console.log(`Test notification queued for user ${userId}`);
      console.log(`To process notifications, run: node -e "require('./dist/utils/scheduler').default.initScheduledTasks()"`);
    } else {
      console.log('Failed to queue test notification');
    }
  } catch (error) {
    console.error('Error testing notification service:', error);
  }
}

// Test token service with caching
async function testTokenService() {
  console.log('\n--- Testing Token Service with Caching ---');
  
  try {
    // Test getting tokens with caching
    console.log('Fetching supported tokens (first request, should hit database)...');
    const tokens = await tokenService.getSupportedTokens();
    console.log(`Found ${tokens.length} supported tokens`);
    
    console.log('Fetching supported tokens again (should hit cache)...');
    const cachedTokens = await tokenService.getSupportedTokens();
    console.log(`Found ${cachedTokens.length} supported tokens from cache`);
    
    // Test price fetching
    console.log('Fetching SOL price...');
    const solPrice = await tokenService.getTokenPrice('So11111111111111111111111111111111111111112');
    console.log(`Current SOL price: $${solPrice}`);
    
    // Test cache invalidation
    console.log('Invalidating token cache...');
    tokenService.invalidateCache('all');
    console.log('Cache invalidated. Next request will hit the database again.');
  } catch (error) {
    console.error('Error testing token service:', error);
  }
}

// Test 2FA functionality
async function test2FAService() {
  console.log('\n--- Testing 2FA Service ---');
  
  try {
    // Test PIN setup
    console.log(`Setting up PIN for ${TEST_PHONE}...`);
    const pinSetup = await authService.setupPin(TEST_PHONE);
    console.log('PIN setup result:', pinSetup);
    
    if (pinSetup.success && pinSetup.pin) {
      // Test PIN verification
      console.log(`Verifying PIN for ${TEST_PHONE}...`);
      const pinVerification = await authService.verifyPin(TEST_PHONE, pinSetup.pin);
      console.log('PIN verification result:', pinVerification);
      
      // Test 2FA setup
      console.log(`Setting up 2FA for ${TEST_PHONE}...`);
      const setup2FA = await authService.setup2FA(TEST_PHONE);
      console.log('2FA setup result:', setup2FA);
      
      // Test sending verification code
      console.log(`Sending verification code for ${TEST_PHONE}...`);
      const sendCode = await authService.sendVerificationCode(TEST_PHONE, 'TEST_OPERATION');
      console.log('Send verification code result:', sendCode);
    }
  } catch (error) {
    console.error('Error testing 2FA service:', error);
  }
}

// Test transaction service with error handling
async function testTransactionService() {
  console.log('\n--- Testing Transaction Service with Idempotency ---');
  
  try {
    // Test checking Solana connection
    console.log('Checking Solana RPC connection...');
    const connected = await transactionService.checkSolanaConnection();
    console.log(`Solana RPC connection working: ${connected}`);
    
    // Test transaction history retrieval
    console.log(`Getting transaction history for ${TEST_PHONE}...`);
    const history = await transactionService.getTransactionHistory(TEST_PHONE);
    console.log(`Found ${history.length} transactions in history`);
    
    // Test supported tokens listing
    console.log('Getting supported tokens list...');
    const tokensList = await transactionService.getSupportedTokensList();
    console.log('Supported tokens message:', tokensList);
  } catch (error) {
    console.error('Error testing transaction service:', error);
  }
}

// Test database transaction support
async function testDatabaseTransactions() {
  console.log('\n--- Testing Database Transaction Support ---');
  
  try {
    console.log('Testing transaction rollback on error...');
    try {
      await db.withTransaction(async (client) => {
        // Start a transaction that will fail
        await client.query('SELECT 1');
        console.log('First query successful');
        
        // This will throw an error
        await client.query('SELECT * FROM non_existent_table');
        
        // This should never execute
        console.log('This should not be printed');
      });
    } catch (error) {
      console.log('Successfully caught transaction error and rolled back');
    }
    
    // Verify that database is still accessible after rollback
    const result = await db.query('SELECT 1 as test');
    console.log(`Database still accessible: ${result.rows[0].test === 1}`);
  } catch (error) {
    console.error('Error testing database transactions:', error);
  }
}

// Main test function
async function runTests() {
  try {
    console.log('=== SOLATEXT PHASE 3 MANUAL TEST SCRIPT ===');
    console.log('This script will help you test the production-ready improvements');
    
    await testHmacSignature();
    await testRateLimiting();
    await testNotificationService();
    await testTokenService();
    await test2FAService();
    await testTransactionService();
    await testDatabaseTransactions();
    
    console.log('\n=== TEST SCRIPT COMPLETED ===');
    console.log('Check the logs for test results and follow any manual test instructions');
  } catch (error) {
    console.error('Error running tests:', error);
  } finally {
    // Close database connection
    await db.end();
  }
}

// Run the tests
runTests(); 