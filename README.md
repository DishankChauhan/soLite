# SolaText - SMS Wallet for Solana

SolaText is a lightweight SMS-based wallet system for Solana that allows users to interact with the Solana blockchain through basic SMS commands, without requiring a smartphone or internet connection.

## Features

- **Wallet Creation**: Create a new Solana wallet via SMS
- **Balance Check**: Check your SOL and USDC balance via SMS
- **Send Funds**: Send tokens to another wallet address (Coming in Phase 2)
- **Admin Dashboard**: Monitor users, transactions, logs, and service status

## Architecture

- **Backend**: Node.js with Express
- **SMS Gateway**: Twilio
- **Blockchain Integration**: Solana Web3.js
- **Database**: PostgreSQL
- **Key Management**: Encrypted storage in PostgreSQL

## Getting Started

### Prerequisites

- Node.js (v14+)
- PostgreSQL
- Twilio Account
- Solana Wallet for the relayer

### Installation

1. Clone the repository
   ```
   git clone https://github.com/yourusername/solatext.git
   cd solatext
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Copy the environment template and update with your values
   ```
   cp .env.example .env
   ```

4. Set up the database
   ```
   psql -U postgres -f database.sql
   ```

5. Start the development server
   ```
   npm run dev
   ```

### Usage

| SMS Command | Description |
|-------------|-------------|
| `CREATE` | Creates a new wallet |
| `BALANCE` | Shows SOL and USDC balance |
| `SEND <amount> <SOL|USDC> TO <address>` | Sends tokens to a wallet address |

## Development Phases

### Phase 1 (Current)
- Basic wallet creation
- Balance checking
- SMS command parsing
- Admin dashboard

### Phase 2
- Transaction engine for sending tokens
- USDC token support
- Fee relay system

### Phase 3
- Wallet recovery functionality
- Advanced security features
- Performance optimizations

## License

This project is licensed under the MIT License - see the LICENSE file for details. 