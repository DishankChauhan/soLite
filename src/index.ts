import 'dotenv/config';
import app from './app';
import logger from './utils/logger';
import config from './config';
import db from './utils/db';
import scheduler from './utils/scheduler';

// Set up process listeners for graceful shutdown
const setupGracefulShutdown = () => {
  // Handle normal shutdown (SIGTERM)
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM signal received. Shutting down gracefully...');
    await gracefulShutdown();
  });

  // Handle Ctrl+C (SIGINT)
  process.on('SIGINT', async () => {
    logger.info('SIGINT signal received. Shutting down gracefully...');
    await gracefulShutdown();
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', async (error) => {
    logger.error('Uncaught exception:', error);
    await gracefulShutdown(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', async (reason, promise) => {
    logger.error('Unhandled Promise Rejection at:', promise, 'reason:', reason);
    await gracefulShutdown(1);
  });
};

// Graceful shutdown function
const gracefulShutdown = async (exitCode: number = 0) => {
  logger.info('Beginning graceful shutdown...');
  
  try {
    // Stop scheduled tasks first
    logger.info('Stopping scheduled tasks...');
    scheduler.stopScheduledTasks();
    
    // Close database connections
    logger.info('Closing database connections...');
    await db.end();
    
    logger.info('Shutdown complete. Exiting process...');
  } catch (error) {
    logger.error('Error during shutdown:', error);
    exitCode = 1;
  } finally {
    // Exit the process
    process.exit(exitCode);
  }
};

// Initialize and start the server
const startServer = async () => {
  try {
    // Check database connection
    logger.info('Checking database connection...');
    const dbHealthy = await db.healthCheck();
    
    if (!dbHealthy) {
      logger.error('Database connection failed. Exiting...');
      process.exit(1);
    }
    
    logger.info('Database connection successful');
    
    // Initialize scheduled tasks
    logger.info('Initializing scheduler...');
    scheduler.initScheduledTasks();
    
    // Run initial database maintenance
    logger.info('Running initial database maintenance...');
    await scheduler.runDatabaseMaintenance();
    
    // Start the server
    const port = config.server.port;
    app.listen(port, () => {
      logger.info(`Server running on port ${port} in ${config.server.nodeEnv} mode`);
      logger.info('SolaText service initialized');
      logger.info(`Solana Network: ${config.solana.rpcUrl}`);
    });
    
    // Set up graceful shutdown handlers
    setupGracefulShutdown();
  } catch (error) {
    logger.error('Error starting server:', error);
    process.exit(1);
  }
};

// Start the server
startServer(); 