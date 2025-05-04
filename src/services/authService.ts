import db from '../utils/db';
import logger from '../utils/logger';
import crypto from 'crypto';

/**
 * Generate a random PIN
 */
function generatePin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Set up a new PIN for a user
 * @param phoneNumber - The user's phone number
 */
async function setupPin(phoneNumber: string): Promise<{ success: boolean; pin?: string; message: string }> {
  try {
    // Check if user exists
    const userResult = await db.query(
      'SELECT id, pin FROM users WHERE phone_number = $1',
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
    await db.query(
      'UPDATE users SET pin = $1, pin_verified = false, updated_at = NOW() WHERE id = $2',
      [newPin, userId]
    );

    return { 
      success: true, 
      pin: newPin,
      message: `Your new PIN is ${newPin}. Use VERIFY PIN ${newPin} to activate it.`
    };
  } catch (error) {
    logger.error(`Error setting up PIN: ${error}`);
    return { success: false, message: 'Failed to set up PIN. Please try again.' };
  }
}

/**
 * Verify a user's PIN
 * @param phoneNumber - The user's phone number
 * @param pin - The PIN to verify
 */
async function verifyPin(phoneNumber: string, pin: string): Promise<{ success: boolean; message: string }> {
  try {
    // Look up the user
    const userResult = await db.query(
      'SELECT id, pin, pin_verified FROM users WHERE phone_number = $1',
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

    // Check if the PIN matches
    if (pin !== storedPin) {
      return { success: false, message: 'Incorrect PIN. Please try again.' };
    }

    // If PIN already verified, just confirm
    if (pinVerified) {
      return { success: true, message: 'PIN already verified. Your account is secure.' };
    }

    // Update the user to mark PIN as verified
    await db.query(
      'UPDATE users SET pin_verified = true, updated_at = NOW() WHERE id = $1',
      [userId]
    );

    return { success: true, message: 'PIN verified successfully. Your account is now secure.' };
  } catch (error) {
    logger.error(`Error verifying PIN: ${error}`);
    return { success: false, message: 'Failed to verify PIN. Please try again.' };
  }
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
    logger.error(`Error checking PIN verification: ${error}`);
    return { 
      verified: false, 
      message: 'Error checking security status. Please try again.' 
    };
  }
}

export default {
  setupPin,
  verifyPin,
  requirePin,
}; 