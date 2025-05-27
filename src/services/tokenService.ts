import { PublicKey, Connection } from '@solana/web3.js';
import { 
  getAssociatedTokenAddress,
  getAccount,
  TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import axios from 'axios';
import NodeCache from 'node-cache';
import db from '../utils/db';
import logger from '../utils/logger';
import config from '../config';

// Create a connection to the Solana network
const connection = new Connection(config.solana.rpcUrl);

// Create a cache for token data
// stdTTL: 5 minutes for token cache, checkperiod: check for expired keys every 60 seconds
const tokenCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
const TOKEN_LIST_CACHE_KEY = 'supported_tokens';
const PRICE_CACHE_TTL = 300; // 5 minutes

/**
 * Get all supported tokens (with caching)
 */
async function getSupportedTokens(): Promise<any[]> {
  try {
    // Try to get tokens from cache first
    const cachedTokens = tokenCache.get<any[]>(TOKEN_LIST_CACHE_KEY);
    if (cachedTokens) {
      return cachedTokens;
    }

    // If not in cache, fetch from database
    const result = await db.query(
      'SELECT mint_address, symbol, name, decimals, logo_url FROM supported_tokens WHERE is_active = true ORDER BY symbol ASC'
    );
    
    // Cache the result
    tokenCache.set(TOKEN_LIST_CACHE_KEY, result.rows);
    
    return result.rows;
  } catch (error) {
    logger.error(`Error getting supported tokens: ${error}`);
    return [];
  }
}

/**
 * Get token by symbol (with caching)
 * @param symbol - Token symbol (e.g., 'USDC')
 */
async function getTokenBySymbol(symbol: string): Promise<any | null> {
  try {
    const normalizedSymbol = symbol.toUpperCase();
    const cacheKey = `token_symbol_${normalizedSymbol}`;
    
    // Try to get from cache first
    const cachedToken = tokenCache.get<any>(cacheKey);
    if (cachedToken) {
      return cachedToken;
    }
    
    // If not in cache, fetch from database
    const result = await db.query(
      'SELECT mint_address, symbol, name, decimals, logo_url FROM supported_tokens WHERE symbol = $1 AND is_active = true',
      [normalizedSymbol]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    // Cache the result
    tokenCache.set(cacheKey, result.rows[0]);
    
    return result.rows[0];
  } catch (error) {
    logger.error(`Error getting token by symbol: ${error}`, { symbol });
    return null;
  }
}

/**
 * Get token balance
 * @param walletAddress - The wallet address
 * @param mintAddress - The token mint address
 */
async function getTokenBalance(walletAddress: string, mintAddress: string): Promise<number> {
  try {
    // Special case for SOL native token
    if (mintAddress === 'So11111111111111111111111111111111111111112') {
      const balance = await connection.getBalance(new PublicKey(walletAddress));
      return balance / Math.pow(10, 9); // SOL has 9 decimals
    }
    
    const publicKey = new PublicKey(walletAddress);
    const mint = new PublicKey(mintAddress);
    
    // Get the token account address
    const tokenAddress = await getAssociatedTokenAddress(mint, publicKey);
    
    try {
      // Get token account info
      const tokenAccount = await getAccount(connection, tokenAddress);
      
      // Get token decimals to format the balance correctly
      const cacheKey = `token_mint_${mintAddress}`;
      let tokenInfo = tokenCache.get<any>(cacheKey);
      
      if (!tokenInfo) {
        const result = await db.query(
          'SELECT decimals FROM supported_tokens WHERE mint_address = $1',
          [mintAddress]
        );
        
        tokenInfo = result.rows.length > 0 ? result.rows[0] : { decimals: 6 };
        tokenCache.set(cacheKey, tokenInfo);
      }
      
      const decimals = tokenInfo.decimals;
      
      // Convert raw balance to human-readable format
      return Number(tokenAccount.amount) / Math.pow(10, decimals);
    } catch (error) {
      // Account doesn't exist or has no balance
      return 0;
    }
  } catch (error) {
    logger.error(`Error getting token balance: ${error}`, { walletAddress, mintAddress });
    return 0;
  }
}

/**
 * Add a new supported token
 * @param mintAddress - Token mint address
 * @param symbol - Token symbol
 * @param name - Token name
 * @param decimals - Token decimals
 * @param logoUrl - Optional URL to token logo
 */
async function addSupportedToken(
  mintAddress: string,
  symbol: string,
  name: string,
  decimals: number,
  logoUrl?: string
): Promise<boolean> {
  try {
    // Validate mint address
    new PublicKey(mintAddress);
    
    // Insert token into database
    await db.query(
      `INSERT INTO supported_tokens (mint_address, symbol, name, decimals, logo_url)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (mint_address) DO UPDATE
       SET symbol = $2, name = $3, decimals = $4, logo_url = $5, is_active = true, updated_at = NOW()`,
      [mintAddress, symbol.toUpperCase(), name, decimals, logoUrl]
    );
    
    // Invalidate cache
    tokenCache.del(TOKEN_LIST_CACHE_KEY);
    tokenCache.del(`token_symbol_${symbol.toUpperCase()}`);
    tokenCache.del(`token_mint_${mintAddress}`);
    
    return true;
  } catch (error) {
    logger.error(`Error adding supported token: ${error}`, { mintAddress, symbol });
    return false;
  }
}

/**
 * Get all token balances for a wallet
 * @param walletAddress - The wallet address
 * @param includePrices - Whether to include price data
 */
async function getAllTokenBalances(
  walletAddress: string,
  includePrices: boolean = false
): Promise<Array<{symbol: string, balance: number, usdValue?: number, usdPrice?: number}>> {
  try {
    // Get all supported tokens
    const tokens = await getSupportedTokens();
    
    // Special case for SOL
    const solBalance = await connection.getBalance(new PublicKey(walletAddress)) / Math.pow(10, 9);
    
    // Array to store results
    const balances: Array<{symbol: string, balance: number, usdValue?: number, usdPrice?: number}> = [
      {symbol: 'SOL', balance: solBalance}
    ];
    
    // If we need prices, populate SOL price
    if (includePrices) {
      const solPrice = await getTokenPrice('So11111111111111111111111111111111111111112');
      if (solPrice) {
        balances[0].usdPrice = solPrice;
        balances[0].usdValue = solBalance * solPrice;
      }
    }
    
    // Get balances for all other tokens
    for (const token of tokens) {
      if (token.symbol === 'SOL') continue; // Skip SOL as we already have it
      
      const balance = await getTokenBalance(walletAddress, token.mint_address);
      const balanceEntry: {symbol: string, balance: number, usdValue?: number, usdPrice?: number} = {
        symbol: token.symbol,
        balance
      };
      
      // Add price data if requested
      if (includePrices && balance > 0) {
        const price = await getTokenPrice(token.mint_address);
        if (price) {
          balanceEntry.usdPrice = price;
          balanceEntry.usdValue = balance * price;
        }
      }
      
      balances.push(balanceEntry);
    }
    
    return balances;
  } catch (error) {
    logger.error(`Error getting all token balances: ${error}`, { walletAddress });
    return [{symbol: 'SOL', balance: 0}];
  }
}

/**
 * Get token price in USD
 * @param mintAddress - Token mint address
 */
async function getTokenPrice(mintAddress: string): Promise<number | null> {
  try {
    const cacheKey = `token_price_${mintAddress}`;
    
    // Try to get from cache first
    const cachedPrice = tokenCache.get<number>(cacheKey);
    if (cachedPrice !== undefined) {
      return cachedPrice;
    }
    
    // Check DB for recent price
    const result = await db.query(
      `SELECT usd_price, last_updated FROM token_prices 
       WHERE mint_address = $1 
       ORDER BY last_updated DESC 
       LIMIT 1`,
      [mintAddress]
    );
    
    const now = new Date();
    
    // If we have a recent price (less than 5 minutes old), use it
    if (result.rows.length > 0) {
      const lastUpdated = new Date(result.rows[0].last_updated);
      const ageInSeconds = (now.getTime() - lastUpdated.getTime()) / 1000;
      
      if (ageInSeconds < PRICE_CACHE_TTL) {
        const price = parseFloat(result.rows[0].usd_price);
        tokenCache.set(cacheKey, price, PRICE_CACHE_TTL);
        return price;
      }
    }
    
    // If price is not in database or is stale, try to fetch from external API
    let price: number | null = null;
    let source = '';
    
    // For SOL and USDC use CoinGecko (or other price API)
    if (
      mintAddress === 'So11111111111111111111111111111111111111112' || // SOL
      mintAddress === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'  // USDC
    ) {
      const symbol = mintAddress === 'So11111111111111111111111111111111111111112' ? 'solana' : 'usd-coin';
      try {
        const response = await axios.get(
          `https://api.coingecko.com/api/v3/simple/price?ids=${symbol}&vs_currencies=usd`
        );
        
        if (response.data && response.data[symbol] && response.data[symbol].usd) {
          price = response.data[symbol].usd;
          source = 'coingecko';
        }
      } catch (apiError) {
        logger.warn(`Error fetching ${symbol} price from CoinGecko: ${apiError}`);
      }
    }
    
    // If we got a price, save it to the database
    if (price !== null) {
      await db.query(
        `INSERT INTO token_prices (mint_address, usd_price, source, last_updated)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (mint_address, source) 
         DO UPDATE SET usd_price = $2, last_updated = NOW()`,
        [mintAddress, price, source]
      );
      
      // Cache the price
      tokenCache.set(cacheKey, price, PRICE_CACHE_TTL);
    }
    
    return price;
  } catch (error) {
    logger.error(`Error getting token price: ${error}`, { mintAddress });
    return null;
  }
}

/**
 * Update prices for all supported tokens
 */
async function updateAllTokenPrices(): Promise<number> {
  try {
    const tokens = await getSupportedTokens();
    let updatedCount = 0;
    
    for (const token of tokens) {
      const price = await getTokenPrice(token.mint_address);
      if (price !== null) {
        updatedCount++;
      }
    }
    
    return updatedCount;
  } catch (error) {
    logger.error(`Error updating all token prices: ${error}`);
    return 0;
  }
}

/**
 * Invalidate token cache
 * @param type - Type of cache to invalidate (all, prices, tokens)
 */
function invalidateCache(type: 'all' | 'prices' | 'tokens' = 'all'): void {
  if (type === 'all') {
    tokenCache.flushAll();
    logger.info('Flushed entire token cache');
  } else if (type === 'prices') {
    const keys = tokenCache.keys().filter((key: string) => key.startsWith('token_price_'));
    keys.forEach((key: any) => tokenCache.del(key));
    logger.info(`Flushed ${keys.length} price cache entries`);
  } else if (type === 'tokens') {
    tokenCache.del(TOKEN_LIST_CACHE_KEY);
    const keys = tokenCache.keys().filter((key: string) => 
      key.startsWith('token_symbol_') || key.startsWith('token_mint_')
    );
    keys.forEach((key: any) => tokenCache.del(key));
    logger.info(`Flushed token list and ${keys.length} token cache entries`);
  }
}

export default {
  getSupportedTokens,
  getTokenBySymbol,
  getTokenBalance,
  addSupportedToken,
  getAllTokenBalances,
  getTokenPrice,
  updateAllTokenPrices,
  invalidateCache
}; 