import app from './app';
import config from './config';
import logger from './utils/logger';
import blockchainMonitor from './utils/blockchainMonitor';

const port = config.server.port;

app.listen(port, () => {
  logger.info(`Server running on port ${port}`);
  
  // Start blockchain monitoring after server starts
  if (config.server.nodeEnv !== 'test') {
    setTimeout(() => {
      blockchainMonitor.start()
        .catch(err => logger.error(`Failed to start blockchain monitor: ${err}`));
    }, 5000); // Give the server 5 seconds to fully initialize
  }
}); 