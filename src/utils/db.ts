import { Pool, PoolClient } from 'pg';
import config from '../config';
import logger from './logger';

// Create a connection pool instead of a single client
const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  user: config.database.user,
  password: config.database.password,
  // Configure connection pool settings for production
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection can't be established
  maxUses: 7500, // Close and replace a client after it has been used 7500 times
});

// Handle pool errors
pool.on('error', (err: Error, client: PoolClient) => {
  logger.error(`Unexpected error on idle client: ${err.message}`, err);
});

/**
 * Execute a database query with automatic error handling and connection management
 * @param text - The query text
 * @param params - The query parameters
 */
async function query(text: string, params?: any[]) {
  const start = Date.now();
  
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    // Log slow queries for optimization (> 200ms)
    if (duration > 200) {
      logger.warn(`Slow query (${duration}ms): ${text}`);
    } else if (process.env.NODE_ENV !== 'production') {
      // In development, log all queries
      logger.debug(`Query executed in ${duration}ms: ${text}`);
    }
    
    return result;
  } catch (error) {
    // Log the error with query details
    logger.error(`Database query error: ${error instanceof Error ? error.message : String(error)}`);
    logger.error(`Query that caused error: ${text}`);
    
    if (params) {
      logger.error(`Query params: ${JSON.stringify(params)}`);
    }
    
    // Rethrow with more context
    if (error instanceof Error) {
      error.message = `Database query failed: ${error.message}`;
    }
    throw error;
  }
}

/**
 * Get a client from the pool for multiple operations in a transaction
 */
async function getClient() {
  const client = await pool.connect();
  const originalRelease = client.release;
  
  // Override the release method to log errors on forgotten clients
  client.release = () => {
    client.query('SELECT pg_advisory_unlock_all()').catch(err => {
      logger.error('Error unlocking advisory locks', err);
    });
    return originalRelease.call(client);
  };
  
  return client;
}

/**
 * Execute a function within a transaction
 * @param callback - Function to execute within transaction
 */
async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Healthcheck for database connection
 */
async function healthCheck(): Promise<boolean> {
  try {
    const result = await pool.query('SELECT 1');
    return result.rows.length === 1;
  } catch (error) {
    logger.error(`Database health check failed: ${error}`);
    return false;
  }
}

/**
 * End the pool - should be called when the application shuts down
 */
async function end() {
  try {
    await pool.end();
    logger.info('Database pool has ended');
  } catch (error) {
    logger.error(`Error ending database pool: ${error}`);
  }
}

export default {
  query,
  getClient,
  withTransaction,
  healthCheck,
  end
}; 