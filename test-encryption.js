const CryptoJS = require('crypto-js');
const { Keypair } = require('@solana/web3.js');

// Use the same encryption key from .env
const ENCRYPTION_KEY = 'this_is_a_32_character_test_key_12345';

// Test encryption/decryption
console.log('Testing encryption/decryption...');

// Generate a test keypair
const testKeypair = Keypair.generate();
const privateKey = testKeypair.secretKey;

console.log('Original private key length:', privateKey.length);
console.log('Original private key (first 10 bytes):', Array.from(privateKey.slice(0, 10)));

// Encrypt like the app does
function encryptPrivateKey(privateKey) {
  const privateKeyString = Buffer.from(privateKey).toString('hex');
  console.log('Private key as hex string:', privateKeyString.substring(0, 20) + '...');
  return CryptoJS.AES.encrypt(privateKeyString, ENCRYPTION_KEY).toString();
}

// Decrypt like the app does
function decryptPrivateKey(encryptedPrivateKey) {
  try {
    const decrypted = CryptoJS.AES.decrypt(encryptedPrivateKey, ENCRYPTION_KEY);
    const decryptedString = decrypted.toString(CryptoJS.enc.Utf8);
    
    console.log('Decrypted string length:', decryptedString.length);
    console.log('Decrypted string (first 20 chars):', decryptedString.substring(0, 20));
    
    if (!decryptedString) {
      throw new Error('Failed to decrypt private key - invalid encryption key or corrupted data');
    }
    
    return Buffer.from(decryptedString, 'hex');
  } catch (error) {
    console.error('Decryption error:', error.message);
    throw error;
  }
}

// Test the process
try {
  const encrypted = encryptPrivateKey(privateKey);
  console.log('Encrypted successfully, length:', encrypted.length);
  
  const decrypted = decryptPrivateKey(encrypted);
  console.log('Decrypted successfully, length:', decrypted.length);
  
  // Verify they match
  const matches = Buffer.compare(privateKey, decrypted) === 0;
  console.log('Encryption/decryption test:', matches ? 'PASSED' : 'FAILED');
  
  if (matches) {
    console.log('✅ Encryption/decryption works correctly');
  } else {
    console.log('❌ Encryption/decryption failed');
  }
} catch (error) {
  console.error('Test failed:', error.message);
} 