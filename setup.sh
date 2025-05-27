#!/bin/bash

# Generate a random encryption key
ENCRYPTION_KEY=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 16)

# Copy .env.example to .env
cp .env.example .env

# Replace placeholder values with generated ones
sed -i '' "s/your_strong_encryption_key_at_least_32_chars/$ENCRYPTION_KEY/g" .env
sed -i '' "s/your_jwt_secret_for_admin_dashboard/$JWT_SECRET/g" .env

echo "Created .env file with random encryption key and JWT secret"
echo "Please update the remaining values in the .env file with your own values"
echo "Especially:\n- Twilio credentials\n- Solana relayer private key\n- USDC token address"

# Make the script executable
chmod +x setup.sh 