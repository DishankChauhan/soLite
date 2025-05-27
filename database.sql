-- Create database if not exists
CREATE DATABASE IF NOT EXISTS solite;

-- Connect to the database
\c solite;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  pin VARCHAR(6),  -- Add PIN for authentication
  pin_verified BOOLEAN DEFAULT FALSE,  -- Track whether PIN has been verified
  two_factor_enabled BOOLEAN DEFAULT FALSE, -- For 2FA feature
  notification_preferences JSONB DEFAULT '{"transactions": true, "security": true, "marketing": false}'::JSONB, -- Notification settings
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Wallets table
CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key VARCHAR(50) UNIQUE NOT NULL,
  encrypted_private_key TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Contacts table (for address aliases)
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alias VARCHAR(20) NOT NULL,  -- User-friendly name like "MAMA"
  wallet_address VARCHAR(50) NOT NULL,  -- The actual Solana address
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, alias)  -- Each alias must be unique per user
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id UUID NOT NULL REFERENCES wallets(id),
  transaction_type VARCHAR(20) NOT NULL, -- 'SEND', 'RECEIVE'
  token_type VARCHAR(20) NOT NULL, -- 'SOL', 'USDC', or SPL token mint address
  amount DECIMAL(18, 9) NOT NULL,
  recipient_address VARCHAR(50),
  sender_address VARCHAR(50),
  transaction_signature VARCHAR(100),
  status VARCHAR(20) NOT NULL, -- 'PENDING', 'COMPLETED', 'FAILED'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Message logs table
CREATE TABLE IF NOT EXISTS message_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_number VARCHAR(20) NOT NULL,
  message_content TEXT NOT NULL,
  direction VARCHAR(10) NOT NULL, -- 'INBOUND', 'OUTBOUND'
  processed BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Supported SPL tokens table (NEW in Phase 3)
CREATE TABLE IF NOT EXISTS supported_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mint_address VARCHAR(50) UNIQUE NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  name VARCHAR(50) NOT NULL, 
  decimals INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notification queue table (NEW in Phase 3)
CREATE TABLE IF NOT EXISTS notification_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type VARCHAR(20) NOT NULL, -- 'TRANSACTION', 'SECURITY', 'MARKETING'
  message TEXT NOT NULL,
  is_sent BOOLEAN DEFAULT FALSE,
  retry_count INTEGER DEFAULT 0, -- Track retry attempts
  max_retries INTEGER DEFAULT 3, -- Maximum number of retry attempts
  next_retry_at TIMESTAMP WITH TIME ZONE, -- When to attempt next retry
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sent_at TIMESTAMP WITH TIME ZONE
);

-- Verification codes table for 2FA (NEW)
CREATE TABLE IF NOT EXISTS verification_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code VARCHAR(6) NOT NULL, -- The verification code
  operation VARCHAR(50) NOT NULL, -- What operation this code is for
  is_used BOOLEAN DEFAULT FALSE, -- Whether the code has been used
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL, -- When the code expires
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Rate limiting table for API and notifications (NEW)
CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ip_address VARCHAR(45), -- Support for IPv6
  endpoint VARCHAR(100), -- The API endpoint or action being rate limited
  request_count INTEGER DEFAULT 1,
  window_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT user_or_ip_required CHECK (user_id IS NOT NULL OR ip_address IS NOT NULL)
);

-- Token price cache table (NEW)
CREATE TABLE IF NOT EXISTS token_prices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mint_address VARCHAR(50) NOT NULL REFERENCES supported_tokens(mint_address),
  usd_price DECIMAL(18, 6) NOT NULL,
  source VARCHAR(50) NOT NULL, -- Source of price data (e.g., 'coingecko', 'pyth')
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(mint_address, source)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_phone_number ON users(phone_number);
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_wallets_public_key ON wallets(public_key);
CREATE INDEX IF NOT EXISTS idx_transactions_wallet_id ON transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_message_logs_phone_number ON message_logs(phone_number);
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_alias ON contacts(alias);
CREATE INDEX IF NOT EXISTS idx_supported_tokens_symbol ON supported_tokens(symbol);
CREATE INDEX IF NOT EXISTS idx_notification_queue_user_id ON notification_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_queue_is_sent ON notification_queue(is_sent);
CREATE INDEX IF NOT EXISTS idx_notification_queue_next_retry ON notification_queue(next_retry_at) WHERE is_sent = FALSE;
CREATE INDEX IF NOT EXISTS idx_verification_codes_user_id ON verification_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_codes_expires_at ON verification_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_id_endpoint ON rate_limits(user_id, endpoint);
CREATE INDEX IF NOT EXISTS idx_rate_limits_ip_endpoint ON rate_limits(ip_address, endpoint);
CREATE INDEX IF NOT EXISTS idx_token_prices_last_updated ON token_prices(last_updated);

-- Insert default supported tokens
INSERT INTO supported_tokens (mint_address, symbol, name, decimals) 
VALUES 
  ('So11111111111111111111111111111111111111112', 'SOL', 'Solana', 9),
  ('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'USDC', 'USD Coin', 6)
ON CONFLICT (mint_address) DO NOTHING; 