const CryptoJS = require('crypto-js');

// Use the same encryption key from .env
const ENCRYPTION_KEY = 'this_is_a_32_character_test_key_12345';

// The actual encrypted private key from the database
const encryptedPrivateKey = 'U2FsdGVkX1/z2DTBsEgLla3KwFIK2N27DTLWjkKB28+3O8tPc7F0Ug3xIsc4m1BGDEW2DCJn7b8EjMk6imRpVJvXC8i4JzfM3CwOEpAsECSxNW1JkPLBFnC9stB0MIvuUASP3yvgQq8ii6jx8EFuS2YVg8g5A0R0HIeWRkQt8noNlTIMn0M7OiSiORUFbEgTc3iVbP+Wx8BFqL+pBxOejw==';

console.log('Testing decryption of existing encrypted private key...');
console.log('Encrypted key length:', encryptedPrivateKey.length);

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

// Test decryption
try {
  const decrypted = decryptPrivateKey(encryptedPrivateKey);
  console.log('✅ Successfully decrypted existing private key');
  console.log('Decrypted private key length:', decrypted.length);
  console.log('First 10 bytes:', Array.from(decrypted.slice(0, 10)));
} catch (error) {
  console.error('❌ Failed to decrypt existing private key:', error.message);
  
  // Try with different possible encryption keys
  console.log('\nTrying alternative encryption keys...');
  
  const alternatives = [
    'default_encryption_key_change_in_production',
    'your_strong_encryption_key_at_least_32_chars',
    'this_is_a_32_character_test_key_12345'
  ];
  
  for (const key of alternatives) {
    try {
      console.log(`Trying key: ${key.substring(0, 10)}...`);
      const decrypted = CryptoJS.AES.decrypt(encryptedPrivateKey, key);
      const decryptedString = decrypted.toString(CryptoJS.enc.Utf8);
      
      if (decryptedString && decryptedString.length > 0) {
        console.log(`✅ Success with key: ${key.substring(0, 10)}...`);
        console.log('Decrypted string length:', decryptedString.length);
        break;
      }
    } catch (e) {
      console.log(`❌ Failed with key: ${key.substring(0, 10)}...`);
    }
  }
} 