# SolaText Phase 3 Testing Guide

This guide provides instructions for manually testing the production-ready improvements implemented in Phase 3 of the SolaText SMS wallet system.

## Prerequisites

Before starting the tests, make sure you have:

1. A running PostgreSQL database with the schema set up using the `database.sql` file.
2. Environment variables properly configured in a `.env` file.
3. The application built and ready to run.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up the database (if not already done):
   ```bash
   npm run setup-db
   ```

3. Build the application:
   ```bash
   npm run build
   ```

## Running the Tests

### Automated Test Suite

To run the automated test suite that checks all Phase 3 improvements:

```bash
npm run test-phase3
```

This will run a series of tests and provide instructions for manual verification steps.

### Testing Instructions

#### 1. Database Connection Pooling and Transaction Support

The test script will verify:
- Connection pool is properly configured
- Transaction support with automatic rollback on error
- Advisory lock handling
- Connection lifecycle management

To manually verify proper database connection pooling:
1. Start the application: `npm run dev`
2. Monitor database connections during operation: 
   ```sql
   SELECT * FROM pg_stat_activity WHERE datname = 'solite';
   ```
3. Verify that connections are being reused, not continuously created.

#### 2. Notification System with Retry Logic

After running the test script, it will have queued a test notification with retry logic.

To manually verify:
1. Check the `notification_queue` table to see the queued notification:
   ```sql
   SELECT * FROM notification_queue ORDER BY created_at DESC LIMIT 10;
   ```
2. Run the notification processor:
   ```bash
   node -e "require('./dist/utils/scheduler').default.initScheduledTasks()"
   ```
3. Check the logs to verify retry behavior.

#### 3. Token Service with Caching

The test script tests caching behavior. To manually verify:

1. Check the token cache is working by looking at log output
2. Verify token prices are being fetched from external APIs
3. Test cache invalidation with:
   ```bash
   curl -X POST http://localhost:3000/webhook/update-prices \
     -H "Content-Type: application/json" \
     -H "x-webhook-signature: <signature>" \
     -d '{"forceUpdate": true}'
   ```
   
#### 4. HMAC Signature Validation for Webhooks

The test script will provide an example HMAC signature and curl command.
Use the provided command to verify that:

1. Valid signatures are accepted
2. Invalid signatures are rejected with a 401 error
3. The fallback to API key authentication works (for backward compatibility)

#### 5. Rate Limiting for API Endpoints

To verify rate limiting:

1. Run the curl command provided by the test script multiple times (60+ times within a minute)
2. Verify you receive a 429 "Too Many Requests" response after exceeding the rate limit
3. Wait one minute and verify requests work again

#### 6. Two-Factor Authentication

The test script will attempt to set up 2FA for a test account.
To manually verify:

1. Check the `verification_codes` table to see generated codes:
   ```sql
   SELECT * FROM verification_codes ORDER BY created_at DESC LIMIT 10;
   ```
2. Verify codes have proper expiration times
3. Test code verification with correct and incorrect codes

#### 7. Transaction Idempotency

To verify transaction idempotency:

1. Use the HMAC webhook test from step 4 with a specific transaction signature
2. Run the same request again and verify the response indicates the transaction was already processed
3. Check the database to ensure no duplicate records were created

#### 8. Graceful Shutdown

To test graceful shutdown:

1. Start the application: `npm run start`
2. Send a termination signal: `kill -SIGTERM <pid>` or press Ctrl+C
3. Observe the logs to verify:
   - Scheduled tasks are properly stopped
   - Database connections are closed cleanly
   - The process exits with code 0

## Troubleshooting

If any tests fail, check the following:

1. Database connection parameters in `.env` file
2. Required tables in the database (check `database.sql`)
3. External dependencies (Solana RPC, price API connections)
4. Log files for detailed error messages

## Additional Manual Tests

Beyond the automated test script, consider manually testing:

1. Running the application under load with concurrent requests
2. Monitoring database connection usage during peak loads
3. Testing webhook security with various authentication scenarios
4. Verifying notification deliveries end-to-end
5. Testing the scheduled maintenance tasks over longer periods

## Support

If you encounter issues, check the logs and database state for detailed error information. 