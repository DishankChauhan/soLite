import db from '../utils/db';
import logger from '../utils/logger';
import smsService from './smsService';

// Notification types
export enum NotificationType {
  TRANSACTION = 'TRANSACTION',
  SECURITY = 'SECURITY',
  MARKETING = 'MARKETING'
}

/**
 * Queue a notification for a user
 * @param userId - The user's ID
 * @param type - The notification type
 * @param message - The notification message
 */
async function queueNotification(
  userId: string,
  type: NotificationType,
  message: string
): Promise<boolean> {
  try {
    // Check if user has enabled this notification type
    const userResult = await db.query(
      'SELECT notification_preferences FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      logger.warn(`User ${userId} not found when queueing notification`);
      return false;
    }
    
    const preferences = userResult.rows[0].notification_preferences || {};
    const typeKey = type.toLowerCase();
    
    // If this notification type is disabled for the user, skip it
    if (preferences[typeKey] === false) {
      logger.info(`Notification of type ${type} skipped for user ${userId} (disabled in preferences)`);
      return false;
    }
    
    // Queue the notification
    await db.query(
      'INSERT INTO notification_queue (user_id, notification_type, message, next_retry_at) VALUES ($1, $2, $3, NOW())',
      [userId, type, message]
    );
    
    logger.info(`Notification of type ${type} queued for user ${userId}`);
    return true;
  } catch (error) {
    logger.error(`Error queueing notification: ${error}`, { userId, type });
    return false;
  }
}

/**
 * Process notifications in the queue
 * @param limit - Maximum number of notifications to process
 */
async function processNotificationQueue(limit: number = 50): Promise<number> {
  return await db.withTransaction(async (client) => {
    let processed = 0;
    
    try {
      // Get ready-to-send notifications (not sent and retry time has passed)
      const queueResult = await client.query(
        `SELECT nq.id, nq.user_id, nq.notification_type, nq.message, nq.retry_count,
          u.phone_number
         FROM notification_queue nq
         JOIN users u ON nq.user_id = u.id
         WHERE nq.is_sent = false 
           AND nq.next_retry_at <= NOW()
           AND nq.retry_count < nq.max_retries
         ORDER BY nq.created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED`,  // Prevent concurrent processing of the same notifications
        [limit]
      );
      
      // Process each notification
      for (const notification of queueResult.rows) {
        try {
          // Send SMS
          const sent = await smsService.sendSms(
            notification.phone_number,
            notification.message
          );
          
          if (sent) {
            // Mark as sent
            await client.query(
              'UPDATE notification_queue SET is_sent = true, sent_at = NOW() WHERE id = $1',
              [notification.id]
            );
            processed++;
          } else {
            // Increment retry count and set next retry time with exponential backoff
            const newRetryCount = notification.retry_count + 1;
            const backoffMinutes = Math.pow(2, newRetryCount); // Exponential backoff: 2, 4, 8, 16 minutes
            
            await client.query(
              `UPDATE notification_queue 
               SET retry_count = $1, 
                   next_retry_at = NOW() + INTERVAL '${backoffMinutes} minutes'
               WHERE id = $2`,
              [newRetryCount, notification.id]
            );
            
            logger.info(`Scheduled retry #${newRetryCount} for notification ${notification.id} in ${backoffMinutes} minutes`);
          }
        } catch (error) {
          // Log error and update retry information
          logger.error(`Error processing notification ${notification.id}: ${error}`);
          
          const newRetryCount = notification.retry_count + 1;
          const backoffMinutes = Math.pow(2, newRetryCount);
          
          if (newRetryCount >= notification.max_retries) {
            // Mark as failed after max retries
            await client.query(
              `UPDATE notification_queue 
               SET retry_count = $1, 
                   is_sent = false,
                   next_retry_at = NULL
               WHERE id = $2`,
              [newRetryCount, notification.id]
            );
            
            logger.warn(`Notification ${notification.id} failed after maximum retry attempts`);
          } else {
            // Schedule another retry
            await client.query(
              `UPDATE notification_queue 
               SET retry_count = $1, 
                   next_retry_at = NOW() + INTERVAL '${backoffMinutes} minutes'
               WHERE id = $2`,
              [newRetryCount, notification.id]
            );
            
            logger.info(`Scheduled retry #${newRetryCount} for notification ${notification.id} in ${backoffMinutes} minutes`);
          }
        }
      }
      
      return processed;
    } catch (error) {
      logger.error(`Error processing notification queue: ${error}`);
      throw error; // Let the transaction wrapper handle the rollback
    }
  });
}

/**
 * Clean up old notifications
 * @param daysToKeep - Number of days to keep notifications before deletion
 */
async function cleanupOldNotifications(daysToKeep: number = 30): Promise<number> {
  try {
    const result = await db.query(
      `DELETE FROM notification_queue 
       WHERE (is_sent = true AND sent_at < NOW() - INTERVAL '${daysToKeep} days')
          OR (retry_count >= max_retries AND created_at < NOW() - INTERVAL '${daysToKeep} days')
       RETURNING id`
    );
    
    const count = result.rows.length;
    if (count > 0) {
      logger.info(`Cleaned up ${count} old notifications`);
    }
    
    return count;
  } catch (error) {
    logger.error(`Error cleaning up old notifications: ${error}`);
    return 0;
  }
}

/**
 * Queue a transaction notification
 * @param userId - The user's ID
 * @param transactionType - The transaction type ('SEND' or 'RECEIVE')
 * @param amount - The transaction amount
 * @param tokenType - The token type (e.g., 'SOL', 'USDC')
 * @param counterparty - The other party's address
 */
async function queueTransactionNotification(
  userId: string,
  transactionType: 'SEND' | 'RECEIVE',
  amount: number,
  tokenType: string,
  counterparty: string
): Promise<boolean> {
  try {
    // Format a user-friendly message
    const action = transactionType === 'SEND' ? 'sent to' : 'received from';
    const shortAddress = `${counterparty.substring(0, 4)}...${counterparty.substring(counterparty.length - 4)}`;
    
    const message = `SolaText Alert: ${amount} ${tokenType} ${action} ${shortAddress}`;
    
    return await queueNotification(userId, NotificationType.TRANSACTION, message);
  } catch (error) {
    logger.error(`Error queueing transaction notification: ${error}`, { userId, transactionType, amount, tokenType });
    return false;
  }
}

/**
 * Queue a security notification
 * @param userId - The user's ID
 * @param message - The security message
 */
async function queueSecurityNotification(
  userId: string,
  message: string
): Promise<boolean> {
  return await queueNotification(userId, NotificationType.SECURITY, `SolaText Security: ${message}`);
}

/**
 * Update notification preferences for a user
 * @param phoneNumber - The user's phone number
 * @param preferences - Object with preference settings
 */
async function updateNotificationPreferences(
  phoneNumber: string,
  preferences: {transactions?: boolean, security?: boolean, marketing?: boolean}
): Promise<boolean> {
  try {
    // Get current preferences
    const userResult = await db.query(
      'SELECT id, notification_preferences FROM users WHERE phone_number = $1',
      [phoneNumber]
    );
    
    if (userResult.rows.length === 0) {
      return false;
    }
    
    const userId = userResult.rows[0].id;
    const currentPreferences = userResult.rows[0].notification_preferences || {};
    
    // Merge new preferences with current
    const updatedPreferences = {
      ...currentPreferences,
      ...preferences
    };
    
    // Update in database
    await db.query(
      'UPDATE users SET notification_preferences = $1, updated_at = NOW() WHERE id = $2',
      [updatedPreferences, userId]
    );
    
    return true;
  } catch (error) {
    logger.error(`Error updating notification preferences: ${error}`, { phoneNumber });
    return false;
  }
}

export default {
  queueNotification,
  processNotificationQueue,
  queueTransactionNotification,
  queueSecurityNotification,
  updateNotificationPreferences,
  cleanupOldNotifications,
  NotificationType
}; 