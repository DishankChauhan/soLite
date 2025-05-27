import db from '../utils/db';
import logger from '../utils/logger';
import crypto from 'crypto';
import smsService from './smsService';
import notificationService from './notificationService';

/**
 * Generate a random PIN
 */
function generatePin(): string {
  // Generate cryptographically secure random bytes and convert to a 6-digit number
  const randomBytes = crypto.randomBytes(4);
  const num = randomBytes.readUInt32BE(0) % 900000 + 100000;
  return num.toString();
}

/**
 * Generate a verification code
 * @param length - Length of the verification code (default: 6)
 */
function generateVerificationCode(length: number = 6): string {
  // Generate cryptographically secure random bytes
  const randomBytes = crypto.randomBytes(length);
  
  // Convert to numeric code
  let code = '';
  for (let i = 0; i < length; i++) {
    code += randomBytes[i] % 10;
  }
  
  return code;
}

/**
 * Set up a new PIN for a user
 * @param phoneNumber - The user's phone number
 */
async function setupPin(phoneNumber: string): Promise<{ success: boolean; pin?: string; message: string }> {
  return await db.withTransaction(async (client) => {
    try {
      // Check if user exists
      const userResult = await client.query(
        'SELECT id, pin FROM users WHERE phone_number = $1 FOR UPDATE',
        [phoneNumber]
      );

      if (userResult.rows.length === 0) {
        return { 
          success: false, 
          message: 'User not found. Please create a wallet first.' 
        };
      }

      const userId = userResult.rows[0].id;
      const existingPin = userResult.rows[0].pin;

      // If PIN is already set and verified, don't regenerate it
      if (existingPin) {
        return { 
          success: false, 
          message: 'PIN already exists. Use VERIFY PIN <your-pin> to verify your PIN.' 
        };
      }

      // Generate a new PIN
      const newPin = generatePin();

      // Update the user record with the new PIN
      await client.query(
        'UPDATE users SET pin = $1, pin_verified = false, updated_at = NOW() WHERE id = $2',
        [newPin, userId]
      );

      // Queue a security notification
      await notificationService.queueSecurityNotification(
        userId,
        `A new PIN has been set up for your account. NEVER share your PIN with anyone.`
      );

      return { 
        success: true, 
        pin: newPin,
        message: `Your new PIN is ${newPin}. Use VERIFY PIN ${newPin} to activate it.`
      };
    } catch (error) {
      logger.error(`Error setting up PIN: ${error}`, { phoneNumber });
      throw error;
    }
  });
}

/**
 * Verify a user's PIN
 * @param phoneNumber - The user's phone number
 * @param pin - The PIN to verify
 */
async function verifyPin(phoneNumber: string, pin: string): Promise<{ success: boolean; message: string }> {
  return await db.withTransaction(async (client) => {
    try {
      // Look up the user
      const userResult = await client.query(
        'SELECT id, pin, pin_verified FROM users WHERE phone_number = $1 FOR UPDATE',
        [phoneNumber]
      );

      if (userResult.rows.length === 0) {
        return { success: false, message: 'User not found. Please create a wallet first.' };
      }

      const userId = userResult.rows[0].id;
      const storedPin = userResult.rows[0].pin;
      const pinVerified = userResult.rows[0].pin_verified;

      // If no PIN is set yet
      if (!storedPin) {
        return { success: false, message: 'No PIN has been set. Send SETUP PIN to create one.' };
      }

      // Check if the PIN matches using time-constant comparison to prevent timing attacks
      const pinMatches = crypto.timingSafeEqual(
        Buffer.from(pin.padEnd(storedPin.length, ' ')), 
        Buffer.from(storedPin.padEnd(pin.length, ' '))
      );
      
      if (!pinMatches) {
        // Log failed PIN attempt for security monitoring
        logger.warn(`Failed PIN verification attempt for user ${userId}`, { phoneNumber });
        return { success: false, message: 'Incorrect PIN. Please try again.' };
      }

      // If PIN already verified, just confirm
      if (pinVerified) {
        return { success: true, message: 'PIN already verified. Your account is secure.' };
      }

      // Update the user to mark PIN as verified
      await client.query(
        'UPDATE users SET pin_verified = true, updated_at = NOW() WHERE id = $1',
        [userId]
      );

      // Queue a security notification
      await notificationService.queueSecurityNotification(
        userId,
        `Your PIN has been verified. Your account is now secure.`
      );

      return { success: true, message: 'PIN verified successfully. Your account is now secure.' };
    } catch (error) {
      logger.error(`Error verifying PIN: ${error}`, { phoneNumber });
      throw error;
    }
  });
}

/**
 * Check if a user has a verified PIN
 * @param phoneNumber - The user's phone number
 */
async function requirePin(phoneNumber: string): Promise<{ verified: boolean; message?: string }> {
  try {
    const userResult = await db.query(
      'SELECT pin, pin_verified FROM users WHERE phone_number = $1',
      [phoneNumber]
    );

    if (userResult.rows.length === 0) {
      return { 
        verified: false, 
        message: 'User not found. Please create a wallet first.' 
      };
    }

    const storedPin = userResult.rows[0].pin;
    const pinVerified = userResult.rows[0].pin_verified;

    // If no PIN is set or PIN is not verified
    if (!storedPin) {
      return { 
        verified: false, 
        message: 'Security not set up. Send SETUP PIN to secure your wallet.' 
      };
    }

    if (!pinVerified) {
      return { 
        verified: false, 
        message: `PIN not verified. Use VERIFY PIN <your-pin> to verify.` 
      };
    }

    // PIN is verified
    return { verified: true };
  } catch (error) {
    logger.error(`Error checking PIN verification: ${error}`, { phoneNumber });
    return { 
      verified: false, 
      message: 'Error checking security status. Please try again.' 
    };
  }
}

/**
 * Set up 2-factor authentication for a user
 * @param phoneNumber - The user's phone number
 */
async function setup2FA(phoneNumber: string): Promise<{ success: boolean; message: string }> {
  return await db.withTransaction(async (client) => {
    try {
      // Check if user exists and has verified PIN
      const userResult = await client.query(
        'SELECT id, pin_verified, two_factor_enabled FROM users WHERE phone_number = $1 FOR UPDATE',
        [phoneNumber]
      );

      if (userResult.rows.length === 0) {
        return { success: false, message: 'User not found. Please create a wallet first.' };
      }

      const userId = userResult.rows[0].id;
      const pinVerified = userResult.rows[0].pin_verified;
      const twoFactorEnabled = userResult.rows[0].two_factor_enabled;

      // Require PIN verification first
      if (!pinVerified) {
        return { 
          success: false, 
          message: 'You must verify your PIN before enabling 2FA. Use VERIFY PIN <your-pin> to verify.' 
        };
      }

      // If 2FA is already enabled
      if (twoFactorEnabled) {
        return { success: false, message: '2FA is already enabled on your account.' };
      }

      // Enable 2FA
      await client.query(
        'UPDATE users SET two_factor_enabled = true, updated_at = NOW() WHERE id = $1',
        [userId]
      );

      // Queue a security notification
      await notificationService.queueSecurityNotification(
        userId,
        `Two-factor authentication has been enabled on your account.`
      );

      return { 
        success: true, 
        message: 'Two-factor authentication enabled. You will now receive verification codes for sensitive operations.' 
      };
    } catch (error) {
      logger.error(`Error setting up 2FA: ${error}`, { phoneNumber });
      throw error;
    }
  });
}

/**
 * Send a verification code for 2FA
 * @param phoneNumber - The user's phone number
 * @param operation - The operation being performed
 */
async function sendVerificationCode(
  phoneNumber: string,
  operation: string
): Promise<{ success: boolean; message: string }> {
  return await db.withTransaction(async (client) => {
    try {
      // Check if user exists and has 2FA enabled
      const userResult = await client.query(
        'SELECT id, two_factor_enabled FROM users WHERE phone_number = $1 FOR UPDATE',
        [phoneNumber]
      );

      if (userResult.rows.length === 0) {
        return { success: false, message: 'User not found. Please create a wallet first.' };
      }

      const userId = userResult.rows[0].id;
      const twoFactorEnabled = userResult.rows[0].two_factor_enabled;

      // If 2FA is not enabled
      if (!twoFactorEnabled) {
        return { success: true, message: 'No verification required (2FA not enabled).' };
      }

      // Generate a verification code
      const verificationCode = generateVerificationCode();
      
      // Set expiration time (15 minutes)
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      // Clean up any old verification codes for this user and operation
      await client.query(
        `DELETE FROM verification_codes 
         WHERE user_id = $1 AND operation = $2`,
        [userId, operation]
      );

      // Store in database
      await client.query(
        `INSERT INTO verification_codes (user_id, code, operation, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [userId, verificationCode, operation, expiresAt]
      );

      // Send the verification code via SMS
      const message = `Your SolaText verification code for ${operation} is: ${verificationCode}. Valid for 15 minutes.`;
      await smsService.sendSms(phoneNumber, message);

      // Queue security notification about verification code
      await notificationService.queueSecurityNotification(
        userId,
        `A verification code was requested for ${operation}. If this wasn't you, please contact support.`
      );

      return { 
        success: true,
        message: `Verification code sent. Please reply with CODE ${verificationCode} to proceed.` 
      };
    } catch (error) {
      logger.error(`Error sending verification code: ${error}`, { phoneNumber, operation });
      throw error;
    }
  });
}

/**
 * Verify a 2FA code
 * @param phoneNumber - The user's phone number
 * @param code - The verification code
 * @param operation - The operation being verified
 */
async function verifyCode(
  phoneNumber: string,
  code: string,
  operation: string
): Promise<{ success: boolean; message: string }> {
  return await db.withTransaction(async (client) => {
    try {
      // Get the user ID
      const userResult = await client.query(
        'SELECT id FROM users WHERE phone_number = $1',
        [phoneNumber]
      );

      if (userResult.rows.length === 0) {
        return { success: false, message: 'User not found. Please create a wallet first.' };
      }

      const userId = userResult.rows[0].id;

      // Get the verification code from the database
      const codeResult = await client.query(
        `SELECT id, code, expires_at, is_used 
         FROM verification_codes 
         WHERE user_id = $1 AND operation = $2 
         ORDER BY created_at DESC 
         LIMIT 1`,
        [userId, operation]
      );

      if (codeResult.rows.length === 0) {
        return { 
          success: false, 
          message: 'No verification code found. Please request a new code.' 
        };
      }

      const verificationId = codeResult.rows[0].id;
      const storedCode = codeResult.rows[0].code;
      const expiresAt = new Date(codeResult.rows[0].expires_at);
      const isUsed = codeResult.rows[0].is_used;

      // Check if the code has already been used
      if (isUsed) {
        return { 
          success: false, 
          message: 'This code has already been used. Please request a new code.' 
        };
      }

      // Check if the code has expired
      if (expiresAt < new Date()) {
        return { 
          success: false, 
          message: 'This code has expired. Please request a new code.' 
        };
      }

      // Verify the code using constant-time comparison
      const codeMatches = crypto.timingSafeEqual(
        Buffer.from(code.padEnd(storedCode.length, ' ')), 
        Buffer.from(storedCode.padEnd(code.length, ' '))
      );

      if (!codeMatches) {
        // Log failed verification attempt
        logger.warn(`Failed verification code attempt for user ${userId}`, { 
          phoneNumber, operation 
        });
        
        return { success: false, message: 'Invalid verification code. Please try again.' };
      }

      // Mark the code as used
      await client.query(
        'UPDATE verification_codes SET is_used = true WHERE id = $1',
        [verificationId]
      );

      // Queue security notification
      await notificationService.queueSecurityNotification(
        userId,
        `A verification code for ${operation} was successfully validated.`
      );

      return { 
        success: true, 
        message: 'Verification code accepted. You may proceed with the operation.' 
      };
    } catch (error) {
      logger.error(`Error verifying code: ${error}`, { phoneNumber, operation });
      throw error;
    }
  });
}

/**
 * Disable 2-factor authentication for a user
 * @param phoneNumber - The user's phone number
 */
async function disable2FA(phoneNumber: string): Promise<{ success: boolean; message: string }> {
  return await db.withTransaction(async (client) => {
    try {
      // Check if user exists and has 2FA enabled
      const userResult = await client.query(
        'SELECT id, two_factor_enabled FROM users WHERE phone_number = $1 FOR UPDATE',
        [phoneNumber]
      );

      if (userResult.rows.length === 0) {
        return { success: false, message: 'User not found. Please create a wallet first.' };
      }

      const userId = userResult.rows[0].id;
      const twoFactorEnabled = userResult.rows[0].two_factor_enabled;

      // If 2FA is not enabled
      if (!twoFactorEnabled) {
        return { success: false, message: '2FA is not enabled on your account.' };
      }

      // Disable 2FA
      await client.query(
        'UPDATE users SET two_factor_enabled = false, updated_at = NOW() WHERE id = $1',
        [userId]
      );

      // Clean up any pending verification codes
      await client.query(
        'DELETE FROM verification_codes WHERE user_id = $1',
        [userId]
      );

      // Queue a security notification
      await notificationService.queueSecurityNotification(
        userId,
        `Two-factor authentication has been disabled on your account.`
      );

      return { 
        success: true, 
        message: 'Two-factor authentication has been disabled.' 
      };
    } catch (error) {
      logger.error(`Error disabling 2FA: ${error}`, { phoneNumber });
      throw error;
    }
  });
}

/**
 * Reset a user's PIN (requires verification)
 * @param phoneNumber - The user's phone number
 */
async function resetPin(phoneNumber: string): Promise<{ success: boolean; message: string }> {
  return await db.withTransaction(async (client) => {
    try {
      // Check if user exists
      const userResult = await client.query(
        'SELECT id FROM users WHERE phone_number = $1 FOR UPDATE',
        [phoneNumber]
      );

      if (userResult.rows.length === 0) {
        return { success: false, message: 'User not found. Please create a wallet first.' };
      }

      const userId = userResult.rows[0].id;

      // Generate a verification code for PIN reset
      const resetCode = generateVerificationCode();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      // Clean up any old verification codes for PIN reset
      await client.query(
        `DELETE FROM verification_codes 
         WHERE user_id = $1 AND operation = 'PIN_RESET'`,
        [userId]
      );

      // Store the verification code
      await client.query(
        `INSERT INTO verification_codes (user_id, code, operation, expires_at)
         VALUES ($1, $2, 'PIN_RESET', $3)`,
        [userId, resetCode, expiresAt]
      );

      // Send the reset code via SMS
      const message = `Your SolaText PIN reset code is: ${resetCode}. Reply with CODE ${resetCode} to confirm PIN reset.`;
      await smsService.sendSms(phoneNumber, message);

      // Queue security notification
      await notificationService.queueSecurityNotification(
        userId,
        `A PIN reset was requested for your account. If this wasn't you, please contact support immediately.`
      );

      return { 
        success: true, 
        message: `A verification code has been sent to your phone. Reply with CODE ${resetCode} to confirm PIN reset.` 
      };
    } catch (error) {
      logger.error(`Error initiating PIN reset: ${error}`, { phoneNumber });
      throw error;
    }
  });
}

/**
 * Complete PIN reset after verification
 * @param phoneNumber - The user's phone number
 */
async function completeResetPin(phoneNumber: string): Promise<{ success: boolean; pin?: string; message: string }> {
  return await db.withTransaction(async (client) => {
    try {
      // Check if user exists
      const userResult = await client.query(
        'SELECT id FROM users WHERE phone_number = $1 FOR UPDATE',
        [phoneNumber]
      );

      if (userResult.rows.length === 0) {
        return { success: false, message: 'User not found. Please create a wallet first.' };
      }

      const userId = userResult.rows[0].id;

      // Generate a new PIN
      const newPin = generatePin();

      // Update the user's PIN
      await client.query(
        'UPDATE users SET pin = $1, pin_verified = true, updated_at = NOW() WHERE id = $2',
        [newPin, userId]
      );

      // Queue security notification
      await notificationService.queueSecurityNotification(
        userId,
        `Your PIN has been reset. If this wasn't you, please contact support immediately.`
      );

      return { 
        success: true, 
        pin: newPin,
        message: `Your PIN has been reset. Your new PIN is: ${newPin}` 
      };
    } catch (error) {
      logger.error(`Error completing PIN reset: ${error}`, { phoneNumber });
      throw error;
    }
  });
}

export default {
  setupPin,
  verifyPin,
  requirePin,
  setup2FA,
  disable2FA,
  sendVerificationCode,
  verifyCode,
  resetPin,
  completeResetPin
}; 