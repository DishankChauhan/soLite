import logger from './logger';
import notificationService from '../services/notificationService';
import tokenService from '../services/tokenService';
import db from './db';

// Store interval IDs for proper cleanup
const intervals: NodeJS.Timeout[] = [];

/**
 * Initialize all scheduled tasks
 */
function initScheduledTasks(): void {
  logger.info('Initializing scheduled tasks');
  
  // Process notification queue every minute
  const notificationInterval = setInterval(async () => {
    try {
      const count = await notificationService.processNotificationQueue(50);
      if (count > 0) {
        logger.info(`Processed ${count} notifications`);
      }
    } catch (error) {
      logger.error(`Error processing notification queue: ${error}`);
    }
  }, 60 * 1000); // Every minute
  intervals.push(notificationInterval);
  
  // Update token prices every 10 minutes
  const priceUpdateInterval = setInterval(async () => {
    try {
      const count = await tokenService.updateAllTokenPrices();
      if (count > 0) {
        logger.info(`Updated prices for ${count} tokens`);
      }
    } catch (error) {
      logger.error(`Error updating token prices: ${error}`);
    }
  }, 10 * 60 * 1000); // Every 10 minutes
  intervals.push(priceUpdateInterval);
  
  // Clean up old notifications every day
  const cleanupInterval = setInterval(async () => {
    try {
      await notificationService.cleanupOldNotifications(30); // Keep for 30 days
      logger.info('Cleaned up old notifications');
    } catch (error) {
      logger.error(`Error cleaning up old notifications: ${error}`);
    }
  }, 24 * 60 * 60 * 1000); // Every 24 hours
  intervals.push(cleanupInterval);
}

/**
 * Cleanup all scheduled tasks (for graceful shutdown)
 */
function stopScheduledTasks(): void {
  logger.info('Stopping all scheduled tasks');
  
  intervals.forEach(interval => {
    clearInterval(interval);
  });
  
  intervals.length = 0; // Clear the array
}

/**
 * Run database maintenance tasks
 */
async function runDatabaseMaintenance(): Promise<void> {
  try {
    logger.info('Running database maintenance tasks');
    
    // Cleanup expired verification codes
    const result = await db.query(
      `DELETE FROM verification_codes 
       WHERE expires_at < NOW() 
       RETURNING id`
    );
    
    if (result.rows.length > 0) {
      logger.info(`Cleaned up ${result.rows.length} expired verification codes`);
    }
    
    // Perform VACUUM on important tables periodically
    // This is commented out as it requires superuser privileges in PostgreSQL
    // await db.query('VACUUM ANALYZE notification_queue, verification_codes, token_prices');
    
    logger.info('Database maintenance completed');
  } catch (error) {
    logger.error(`Error during database maintenance: ${error}`);
  }
}

export default {
  initScheduledTasks,
  stopScheduledTasks,
  runDatabaseMaintenance
}; 