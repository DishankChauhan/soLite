import db from '../utils/db';
import logger from '../utils/logger';
import { PublicKey } from '@solana/web3.js';

/**
 * Add a new contact alias for a user
 * @param phoneNumber - The user's phone number
 * @param alias - The alias name (e.g., "MAMA")
 * @param walletAddress - The Solana wallet address
 */
async function addContact(
  phoneNumber: string,
  alias: string,
  walletAddress: string
): Promise<{ success: boolean; message: string }> {
  try {
    // Validate the wallet address
    try {
      new PublicKey(walletAddress);
    } catch (error) {
      return { success: false, message: 'Invalid wallet address format' };
    }

    // Normalize alias (uppercase, trim)
    const normalizedAlias = alias.trim().toUpperCase();
    
    // Get user ID from phone number
    const userResult = await db.query(
      'SELECT id FROM users WHERE phone_number = $1',
      [phoneNumber]
    );

    if (userResult.rows.length === 0) {
      return { success: false, message: 'User not found. Please create a wallet first.' };
    }

    const userId = userResult.rows[0].id;

    // Check if the alias already exists for this user
    const contactResult = await db.query(
      'SELECT id FROM contacts WHERE user_id = $1 AND alias = $2',
      [userId, normalizedAlias]
    );

    if (contactResult.rows.length > 0) {
      // Update existing contact
      await db.query(
        'UPDATE contacts SET wallet_address = $1, updated_at = NOW() WHERE user_id = $2 AND alias = $3',
        [walletAddress, userId, normalizedAlias]
      );
      return { success: true, message: `Updated contact "${normalizedAlias}" with new address` };
    } else {
      // Create new contact
      await db.query(
        'INSERT INTO contacts (user_id, alias, wallet_address) VALUES ($1, $2, $3)',
        [userId, normalizedAlias, walletAddress]
      );
      return { success: true, message: `Added "${normalizedAlias}" to your contacts` };
    }
  } catch (error) {
    logger.error(`Error adding contact: ${error}`);
    return { success: false, message: 'Failed to add contact. Please try again.' };
  }
}

/**
 * List all contacts for a user
 * @param phoneNumber - The user's phone number
 */
async function listContacts(phoneNumber: string): Promise<{ alias: string; wallet_address: string }[]> {
  try {
    const result = await db.query(
      `SELECT c.alias, c.wallet_address 
       FROM contacts c
       JOIN users u ON c.user_id = u.id
       WHERE u.phone_number = $1
       ORDER BY c.alias ASC`,
      [phoneNumber]
    );

    return result.rows;
  } catch (error) {
    logger.error(`Error listing contacts: ${error}`);
    return [];
  }
}

/**
 * Resolve an alias to a wallet address
 * @param phoneNumber - The user's phone number
 * @param alias - The alias to resolve
 */
async function resolveAlias(
  phoneNumber: string,
  alias: string
): Promise<string | null> {
  try {
    // Normalize alias
    const normalizedAlias = alias.trim().toUpperCase();
    
    // Query the database
    const result = await db.query(
      `SELECT c.wallet_address
       FROM contacts c
       JOIN users u ON c.user_id = u.id
       WHERE u.phone_number = $1 AND c.alias = $2`,
      [phoneNumber, normalizedAlias]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].wallet_address;
  } catch (error) {
    logger.error(`Error resolving alias: ${error}`);
    return null;
  }
}

export default {
  addContact,
  listContacts,
  resolveAlias,
}; 