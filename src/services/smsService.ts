import twilio from 'twilio';
import config from '../config';
import logger from '../utils/logger';
import db from '../utils/db';

// Initialize Twilio client
const twilioClient = twilio(
  config.twilio.accountSid,
  config.twilio.authToken
);

/**
 * Send an SMS message
 * @param phoneNumber - The recipient's phone number
 * @param message - The message content
 */
async function sendSms(phoneNumber: string, message: string): Promise<boolean> {
  try {
    // Log outbound message
    await logSmsMessage(phoneNumber, message, 'OUTBOUND');

    // Send SMS via Twilio
    const result = await twilioClient.messages.create({
      body: message,
      from: config.twilio.phoneNumber,
      to: phoneNumber,
    });

    logger.info(`SMS sent to ${phoneNumber}, SID: ${result.sid}`);
    return true;
  } catch (error) {
    logger.error(`Error sending SMS to ${phoneNumber}: ${error}`);
    return false;
  }
}

/**
 * Log an SMS message to the database
 * @param phoneNumber - The phone number (sender or recipient)
 * @param message - The message content
 * @param direction - The message direction (INBOUND or OUTBOUND)
 * @param error - Optional error message
 */
async function logSmsMessage(
  phoneNumber: string,
  message: string,
  direction: 'INBOUND' | 'OUTBOUND',
  error?: string
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO message_logs 
      (phone_number, message_content, direction, processed, error_message) 
      VALUES ($1, $2, $3, $4, $5)`,
      [phoneNumber, message, direction, direction === 'OUTBOUND', error || null]
    );
  } catch (dbError) {
    logger.error(`Error logging SMS message: ${dbError}`);
  }
}

export default {
  sendSms,
  logSmsMessage,
}; 