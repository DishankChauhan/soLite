import app from './app';
import config from './config';
import logger from './utils/logger';

// Start the server
const PORT = config.server.port;

app.listen(PORT, () => {
  logger.info(`SolaText server running on port ${PORT} in ${config.server.nodeEnv} mode`);
  logger.info(`Health check available at http://localhost:${PORT}/health`);
  logger.info(`Admin dashboard available at http://localhost:${PORT}/admin`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error(`Uncaught Exception: ${error.message}`);
  process.exit(1);
}); 