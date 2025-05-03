import { Request, Response } from 'express';
import commandParser from '../services/commandParser';
import smsService from '../services/smsService';
import logger from '../utils/logger';
import twilio from 'twilio';
import config from '../config';

/**
 * Handle incoming SMS webhook from Twilio
 */
export async function handleIncomingSms(req: Request, res: Response): Promise<void> {
  try {
    // Extract SMS details from the request
    const { From, Body } = req.body;

    if (!From || !Body) {
      logger.error('Missing required parameters in SMS webhook');
      res.status(400).send('Missing parameters');
      return;
    }

    // Normalize the phone number
    const phoneNumber = From.trim();
    const messageBody = Body.trim();

    logger.info(`Received SMS from ${phoneNumber}: ${messageBody}`);

    // Process the command
    const response = await commandParser.processCommand(phoneNumber, messageBody);

    // Create a Twilio response
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(response);

    // Send the response
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(twiml.toString());
  } catch (error) {
    logger.error(`Error handling incoming SMS: ${error}`);
    res.status(500).send('Error processing request');
  }
}

/**
 * Send an SMS message (for testing purposes)
 */
export async function sendSmsMessage(req: Request, res: Response): Promise<void> {
  try {
    const { phoneNumber, message } = req.body;
    
    if (!phoneNumber || !message) {
      res.status(400).json({ success: false, error: 'Missing phoneNumber or message' });
      return;
    }
    
    // Log Twilio configuration for debugging
    logger.info(`Twilio config - AccountSid: ${config.twilio.accountSid ? 'Set' : 'Not set'}, AuthToken: ${config.twilio.authToken ? 'Set' : 'Not set'}, Phone: ${config.twilio.phoneNumber || 'Not set'}`);
    
    const success = await smsService.sendSms(phoneNumber, message);
    
    if (success) {
      res.status(200).json({ success: true, message: 'SMS sent successfully' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to send SMS' });
    }
  } catch (error) {
    logger.error(`Error sending SMS: ${error}`);
    res.status(500).json({ success: false, error: 'Error processing request' });
  }
}

/**
 * Process an SMS command directly (for testing purposes)
 */
export async function processCommand(req: Request, res: Response): Promise<void> {
  try {
    const { phoneNumber, message } = req.body;
    
    if (!phoneNumber || !message) {
      res.status(400).json({ success: false, error: 'Missing phoneNumber or message' });
      return;
    }
    
    // Process the command directly
    const response = await commandParser.processCommand(phoneNumber, message);
    
    res.status(200).json({ success: true, response });
  } catch (error) {
    logger.error(`Error processing command: ${error}`);
    res.status(500).json({ success: false, error: 'Error processing command' });
  }
} 