const axios = require('axios');

const AV_API_KEY = process.env.AV_API_KEY || 'BS14B59F0QPYKZJY';
const AV_URL = 'https://www.alphavantage.co/query';

// Cache with TTL (Time To Live)
const CACHE_TTL = 3600000; // 1 hour in milliseconds
const cache = new Map();

/**
 * Check if cached data is still valid
 */
function isCacheValid(cacheEntry) {
  if (!cacheEntry) return false;
  const now = Date.now();
  const elapsed = now - cacheEntry.timestamp;
  return elapsed < CACHE_TTL;
}

/**
 * Get from cache or return null
 */
function getFromCache(key) {
  const entry = cache.get(key);
  if (isCacheValid(entry)) {
    console.log(`[CACHE] HIT for ${key} (${Math.round((Date.now() - entry.timestamp) / 1000)}s old)`);
    return entry.data;
  }
  if (entry) {
    console.log(`[CACHE] EXPIRED for ${key}`);
    cache.delete(key);
  }
  return null;
}

/**
 * Set cache
 */
function setCache(key, data) {
  cache.set(key, {
    data: data,
    timestamp: Date.now(),
  });
  console.log(`[CACHE] SET ${key} (TTL: 1 hour)`);
}

/**
 * Get cache stats
 */
function getCacheStats() {
  return {
    size: cache.size,
    keys: Array.from(cache.keys()),
  };
}

/**
 * Clear cache
 */
function clearCache() {
  console.log(`[CACHE] CLEARED (was ${cache.size} entries)`);
  cache.clear();
}

class AlphaVantageService {
  constructor() {
    console.log('✅ AlphaVantageService initialized (with caching)');
  }

  async getDailyCandles(symbol) {
    try {
      const cacheKey = `daily_${symbol}`;
      
      // Check cache first
      const cached = getFromCache(cacheKey);
      if (cached) return cached;

      console.log(`[${symbol}] Fetching daily candles from API...`);
      
      const response = await axios.get(AV_URL, {
        params: {
          function: 'TIME_SERIES_DAILY',
          symbol: symbol,
          apikey: AV_API_KEY,
        },
        timeout: 15000,
      });

      if (!response.data['Time Series (Daily)']) {
        throw new Error('No daily data returned');
      }

      const timeSeries = response.data['Time Series (Daily)'];
      const quotes = [];

      for (const date in timeSeries) {
        const candle = timeSeries[date];
        quotes.push({
          date: date,
          close: parseFloat(candle['4. close']),
          open: parseFloat(candle['1. open']),
          high: parseFloat(candle['2. high']),
          low: parseFloat(candle['3. low']),
          volume: parseInt(candle['5. volume']),
        });
      }

      console.log(`[${symbol}] ✅ Got ${quotes.length} daily candles from API`);
      
      // Cache the result
      setCache(cacheKey, quotes);
      
      return quotes;
    } catch (error) {
      console.error(`[${symbol}] ❌ Daily candles error:`, error.message);
      throw error;
    }
  }

  calculateRSI(candles, period = 14) {
    if (!candles || candles.length < period + 1) return 50;

    const closes = candles.map((c) => c.close).reverse();
    const changes = [];

    for (let i = 1; i < closes.length; i++) {
      changes.push(closes[i] - closes[i - 1]);
    }

    let avgGain = 0,
      avgLoss = 0;

    for (let i = 0; i < period; i++) {
      if (changes[i] > 0) avgGain += changes[i];
      else avgLoss += Math.abs(changes[i]);
    }

    avgGain /= period;
    avgLoss /= period;

    for (let i = period; i < changes.length; i++) {
      const change = changes[i];
      if (change > 0) {
        avgGain = (avgGain * (period - 1) + change) / period;
        avgLoss = (avgLoss * (period - 1)) / period;
      } else {
        avgGain = (avgGain * (period - 1)) / period;
        avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
      }
    }

    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    return Math.max(0, Math.min(100, rsi));
  }

  calculateSMA(candles, period) {
    if (!candles || candles.length < period) return candles && candles[0] ? candles[0].close : 0;
    const closes = candles.map((c) => c.close).slice(0, period);
    const sum = closes.reduce((a, b) => a + b, 0);
    return sum / period;
  }

  async getStockAnalysis(symbol) {
    try {
      const cacheKey = `analysis_${symbol}`;
      
      // Check cache first
      const cached = getFromCache(cacheKey);
      if (cached) return cached;

      const dailyCandles = await this.getDailyCandles(symbol);

      const sma20 = this.calculateSMA(dailyCandles, 20);
      const sma50 = this.calculateSMA(dailyCandles, 50);
      const sma200 = this.calculateSMA(dailyCandles, 200);
      const rsi = this.calculateRSI(dailyCandles, 14);
      const currentPrice = dailyCandles[0].close;

      const analysis = {
        rsi: parseFloat(rsi.toFixed(2)),
        sma20: parseFloat(sma20.toFixed(2)),
        sma50: parseFloat(sma50.toFixed(2)),
        sma200: parseFloat(sma200.toFixed(2)),
        currentPrice: parseFloat(currentPrice.toFixed(2)),
        volume: dailyCandles[0].volume,
      };

      console.log(`[${symbol}] ✅ Analysis complete:`, analysis);
      
      // Cache the result
      setCache(cacheKey, analysis);
      
      return analysis;
    } catch (error) {
      console.error(`[${symbol}] ❌ Analysis error:`, error.message);
      throw error;
    }
  }

  /**
   * Get cache info (for debugging)
   */
  getCacheInfo() {
    return getCacheStats();
  }

  /**
   * Clear cache (for manual reset)
   */
  clearAllCache() {
    clearCache();
  }
}

module.exports = new AlphaVantageService();
