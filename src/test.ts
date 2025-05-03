import solanaService from './services/solanaService';
import walletService from './services/walletService';
import logger from './utils/logger';

async function testWalletCreation() {
  try {
    logger.info('Running test wallet creation...');
    // Test with a fake phone number
    const testPhoneNumber = '+1234567890';
    const wallet = await walletService.createWallet(testPhoneNumber);
    
    logger.info(`Created test wallet with public key: ${wallet.publicKey}`);
    
    // Test getting balance
    const balance = await solanaService.getSolBalance(wallet.publicKey);
    logger.info(`Test wallet SOL balance: ${balance}`);
    
    logger.info('Test completed successfully!');
  } catch (error) {
    logger.error(`Test failed: ${error}`);
  }
}

// Run the test
testWalletCreation(); 