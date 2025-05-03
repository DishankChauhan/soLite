import express from 'express';
import * as smsController from '../controllers/smsController';

const router = express.Router();

// Twilio webhook for incoming SMS
router.post('/webhook', smsController.handleIncomingSms);

// Test endpoint to send an SMS
router.post('/send', smsController.sendSmsMessage);

// Test endpoint to process a command directly
router.post('/process', smsController.processCommand);

export default router; 