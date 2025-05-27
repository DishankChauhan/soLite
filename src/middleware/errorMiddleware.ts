import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

/**
 * Global error handling middleware
 */
export default function errorMiddleware(
  err: Error, 
  req: Request, 
  res: Response, 
  next: NextFunction
) {
  // Log the error
  logger.error(`Error: ${err.message}`, err);
  
  // Send response
  res.status(500).json({ 
    error: 'An internal server error occurred',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
} 