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
  token_type VARCHAR(10) NOT NULL, -- 'SOL', 'USDC'
  amount DECIMAL(18, 6) NOT NULL,
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

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_phone_number ON users(phone_number);
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_wallets_public_key ON wallets(public_key);
CREATE INDEX IF NOT EXISTS idx_transactions_wallet_id ON transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_message_logs_phone_number ON message_logs(phone_number);
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_alias ON contacts(alias); 