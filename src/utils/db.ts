import { Pool } from 'pg';
import config from '../config';
import logger from './logger';

// Configure PostgreSQL connection pool
const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  user: config.database.user,
  password: config.database.password,
});

// Test the database connection
pool.connect((err, client, release) => {
  if (err) {
    logger.error('Error connecting to the database:', err.message);
    return;
  }
  logger.info('Connected to PostgreSQL database successfully');
  release();
});

export default {
  query: (text: string, params?: any[]) => pool.query(text, params),
  getClient: () => pool.connect(),
  pool,
}; 