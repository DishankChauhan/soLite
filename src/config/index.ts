import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config();

const config = {
  server: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'solite',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  },
  solana: {
    network: process.env.SOLANA_NETWORK || 'devnet',
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    usdcTokenAddress: process.env.USDC_TOKEN_ADDRESS || '',
    relayerPrivateKey: process.env.RELAYER_PRIVATE_KEY || '',
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    phoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
  },
  security: {
    encryptionKey: process.env.ENCRYPTION_KEY || 'default_encryption_key_change_in_production',
    jwtSecret: process.env.JWT_SECRET || 'default_jwt_secret_change_in_production',
    webhookApiKey: process.env.WEBHOOK_API_KEY || 'your-webhook-api-key',
    webhookSecret: process.env.WEBHOOK_SECRET || 'default_webhook_secret_change_in_production',
  },
};

export default config; 