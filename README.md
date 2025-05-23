# soLite - SMS Wallet for Solana Blockchain



## 📱 The Problem

With over 3.5 billion people worldwide still lacking internet access, traditional crypto wallets remain inaccessible to a large portion of the global population. soLite bridges this gap by enabling Solana blockchain interaction through basic SMS technology, making crypto accessible to anyone with a mobile phone, even without internet connectivity or smartphones.

## 💡 The Solution: soLite

soLite is a lightweight SMS-based wallet system for Solana that allows users to interact with the blockchain through basic SMS commands, without requiring a smartphone or internet connection.

This solution enables anyone with a basic feature phone to:
- Create a Solana wallet
- Check balances
- Send/receive SOL and USDC tokens
- View transaction history

All through simple SMS commands.

## 📲 How It Works Without Internet

soLite bridges the gap between traditional SMS networks and the blockchain:

1. **User Side (No Internet Required)**:
   - Users send simple SMS commands from any basic feature phone
   - No smartphone, data plan, or internet connection needed
   - Works on any cellular network with SMS capability
   - Functions in remote areas with minimal infrastructure

2. **System Architecture**:
   - SMS messages are received by a Twilio-powered gateway
   - Our backend server processes commands and interacts with the Solana blockchain
   - The server handles all internet connectivity and blockchain communication
   - Responses are sent back to users via SMS

3. **Use Cases**:
   - Rural communities with limited internet infrastructure
   - Users who cannot afford smartphones or data plans
   - Regions with unreliable internet connectivity
   - Anyone seeking a simple entry point to cryptocurrency

By leveraging existing SMS infrastructure, soLite extends blockchain access to billions of people who would otherwise be excluded from the crypto economy.

## 🛠️ Tech Stack

soLite is built with modern, secure technologies:

- **Backend**: Node.js with Express
- **Blockchain Integration**: Solana Web3.js & SPL Token
- **SMS Gateway**: Twilio
- **Database**: PostgreSQL
- **Security**: AES encryption for key management
- **Monitoring**: Winston logging & Admin dashboard

## 🏗️ Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   SMS       │     │  soLite API │     │   Solana    │
│  Network    │◄───►│  Backend    │◄───►│ Blockchain  │
└─────────────┘     └─────────────┘     └─────────────┘
                          ▲
                          │
                          ▼
                    ┌─────────────┐
                    │ PostgreSQL  │
                    │  Database   │
                    └─────────────┘
```

### Key Components:

1. **SMS Interface**: Receives and sends SMS messages via Twilio
2. **Command Parser**: Interprets user commands (CREATE, SEND, BALANCE, HISTORY)
3. **Transaction Engine**: Securely signs and submits transactions to Solana
4. **Fee Relay System**: Handles transaction fees for users
5. **Secure Key Management**: Encrypts private keys in database
6. **Admin Dashboard**: Monitors system health and user activity

## ✨ Features

| SMS Command | Description |
|-------------|-------------|
| `CREATE` | Creates a new wallet |
| `BALANCE` | Shows SOL and USDC balance |
| `SEND <amount> <SOL\|USDC> TO <address or alias>` | Sends tokens to a wallet address or contact alias |
| `HISTORY` | View your recent transaction history |
| `SETUP PIN` | Set up PIN protection for your wallet |
| `VERIFY PIN <your-pin>` | Verify your PIN to secure your wallet |
| `ADD CONTACT <alias> <address>` | Add an address with a friendly name |
| `CONTACTS` | List all your saved contacts |

### Implemented Features:

#### Phase 1 (Complete)
- ✅ Basic wallet creation
- ✅ Balance checking
- ✅ SMS command parsing
- ✅ Admin dashboard

#### Phase 2 (Complete)
- ✅ Transaction engine for sending tokens
- ✅ USDC token support
- ✅ Fee relay system
- ✅ Transaction history

#### Phase 3 (Complete)
- ✅ PIN-based authentication
- ✅ Contact aliases for easy sending
- ✅ Security measures to prevent unauthorized transactions

## 🚀 Getting Started

### Prerequisites

- Node.js (v14+)
- PostgreSQL
- Twilio Account
- Solana Wallet for the relayer

### Installation

1. Clone the repository
   ```
   git clone https://github.com/DishankChauhan/soLite
   cd soLite
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Set up the database
   ```
   npm run setup-db
   ```

4. Create a relayer wallet (if you don't already have one)
   ```
   solana-keygen new --outfile relayer-keypair.json
   solana airdrop 2 --keypair relayer-keypair.json --url devnet
   ```

5. Run the environment setup utility
   ```
   npm run setup-env
   ```

6. Copy the output values to your `.env` file. At minimum, you need:
   ```
   # Solana Configuration
   SOLANA_NETWORK=devnet
   SOLANA_RPC_URL=https://api.devnet.solana.com
   RELAYER_PRIVATE_KEY=your_relayer_private_key
   USDC_TOKEN_ADDRESS=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU

   # Twilio Configuration (needed for real SMS)
   TWILIO_ACCOUNT_SID=your_account_sid
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_PHONE_NUMBER=your_twilio_phone_number

   # Security
   ENCRYPTION_KEY=your_strong_encryption_key
   JWT_SECRET=your_jwt_secret_for_admin_dashboard
   
   # Database
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=solite
   DB_USER=postgres
   DB_PASSWORD=your_db_password
   ```

7. Test the setup
   ```
   npm run test
   npm run test-phase2
   npm run test-features
   ```

8. Start the development server
   ```
   npm run dev
   ```

## 🔒 Security Considerations

soLite takes security seriously as it handles cryptocurrency transactions and private keys:

1. **Secure Key Management**
   - Private keys are encrypted using AES-256 before storage
   - The encryption key is stored in environment variables, not in the code
   - Keys are never exposed in logs or responses

2. **Environment Configuration**
   - All sensitive credentials are loaded from `.env` file (not committed to Git)
   - Default values in the codebase are placeholders and not actual secrets
   - The `.gitignore` file prevents accidental commit of `.env` files

3. **Authentication & Authorization**
   - JWT-based authentication for admin dashboard
   - Rate limiting to prevent brute force attacks
   - CORS protection and other Express security middleware

4. **Deployment Recommendations**
   - Use environment-specific secrets management (AWS Secrets Manager, etc.)
   - Set up proper database access controls
   - Use HTTPS for all API endpoints
   - Consider key rotation policies for production deployments

5. **Auditing & Monitoring**
   - All transactions are logged in the database
   - Winston logger captures system events
   - Admin dashboard provides activity monitoring

## 📁 Project Structure

```
soLite/
├── src/                     # Source code
│   ├── config/              # Configuration files
│   ├── controllers/         # Route controllers
│   │   ├── adminController.ts       # Admin dashboard controller
│   │   ├── smsController.ts         # SMS handling controller
│   │   └── transactionController.ts # Transaction controller
│   ├── routes/              # API routes
│   │   ├── adminRoutes.ts           # Admin dashboard routes
│   │   └── smsRoutes.ts             # SMS webhook routes
│   ├── services/            # Business logic
│   │   ├── commandParser.ts         # SMS command parser
│   │   ├── smsService.ts            # SMS handling service
│   │   ├── solanaService.ts         # Solana blockchain integration
│   │   ├── transactionService.ts    # Transaction logic
│   │   └── walletService.ts         # Wallet management
│   ├── utils/               # Utilities
│   │   ├── db.ts                    # Database connection
│   │   └── logger.ts                # Logging utility
│   ├── app.ts               # Express app setup
│   └── index.ts             # Application entry point
├── public/                  # Static assets for admin dashboard
├── database.sql             # Database schema
├── package.json             # Dependencies and scripts
└── tsconfig.json            # TypeScript configuration
```

### Key Files

- **commandParser.ts**: Parses SMS commands into actionable requests
- **solanaService.ts**: Handles all Solana blockchain interactions
- **transactionService.ts**: Manages token transfers and transaction history
- **walletService.ts**: Creates and manages Solana wallets
- **smsController.ts**: Processes incoming SMS messages via Twilio
- **app.ts**: Sets up Express server with middleware and routes

## 🔮 Future Roadmap (Phase 3)

- 🔄 **Wallet Recovery Functionality**: Enable key recovery through SMS verification
- 🔐 **Enhanced Security Features**: Two-factor authentication and transaction limits
- 🌐 **Multi-Language Support**: Localize for various regions and languages
- 📊 **Analytics Dashboard**: Track usage patterns and optimize user experience
- 🌍 **Cross-Chain Integration**: Support for other blockchains beyond Solana
- 🧩 **Smart Contract Templates**: Allow interaction with common smart contracts via SMS

## 🧪 Testing

- Unit tests for core functionality
- Integration tests for blockchain interactions
- Load testing for SMS gateway

```
npm run test         # Run basic tests
npm run test-phase2  # Test transaction engine
```

## 🔍 Troubleshooting

### Common Issues

#### Solana Connection Problems
```
Error: Failed to fetch from RPC URL: https://api.devnet.solana.com
```
**Solution**: Check your internet connection and verify the Solana RPC URL in your .env file. Consider using a different RPC provider if persistent.

#### Transaction Failures
```
Error: Transaction was not confirmed in 30.00 seconds
```
**Solution**: The Solana network might be congested. Increase the transaction confirmation timeout in `solanaService.ts` or try again later.

#### Insufficient SOL for Transaction
```
Error: Insufficient SOL balance. Required: X, Available: Y
```
**Solution**: Ensure your relayer wallet has enough SOL. You can airdrop more on devnet:
```
solana airdrop 2 --keypair relayer-keypair.json --url devnet
```

#### USDC Token Issues
```
USDC token address not configured
```
**Solution**: Make sure you've set the correct USDC token address in your .env file. For devnet, use:
```
USDC_TOKEN_ADDRESS=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
```

#### Database Connection Errors
```
Error: Could not connect to PostgreSQL database
```
**Solution**: Verify your database is running and credentials are correct in .env file. Try:
```
pg_isready -d solite -h localhost -p 5432 -U postgres
```

#### SMS Gateway Issues
```
Error sending SMS: Authentication error
```
**Solution**: Double-check your Twilio credentials in the .env file. Ensure your Twilio account is active and has sufficient credits.

### Diagnostic Commands

Check Solana wallet balance:
```
solana balance <wallet-address> --url devnet
```

Check database connection:
```
psql -U postgres -d solite -c "SELECT NOW();"
```

Validate Solana keypair:
```
solana-keygen verify <public-key> relayer-keypair.json
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 👨‍💻 Author

**Dishank Chauhan**

- GitHub: [Dishank Chauhan](https://github.com/DishankChauhan)
- LinkedIn: [Dishank Chauhan](https://www.linkedin.com/in/dishank-chauhan-186853207/)

---

<p align="center">Empowering financial inclusion through SMS-based blockchain access</p> 
