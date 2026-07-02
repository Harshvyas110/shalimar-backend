const finnhub = require('./finnhubService');
const fmp = require('./fmpService');

// Cache with TTL
const CACHE_TTL = 3600000; // 1 hour
const cache = new Map();

function isCacheValid(cacheEntry) {
  if (!cacheEntry) return false;
  const elapsed = Date.now() - cacheEntry.timestamp;
  return elapsed < CACHE_TTL;
}

function getFromCache(key) {
  const entry = cache.get(key);
  if (isCacheValid(entry)) {
    console.log(`[CACHE] HIT: ${key}`);
    return entry.data;
  }
  if (entry) cache.delete(key);
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
  console.log(`[CACHE] SET: ${key}`);
}

class HybridStockService {
  constructor() {
    console.log('✅ HybridStockService initialized (Finnhub + FMP)');
  }

  /**
   * Get complete stock analysis combining Finnhub + FMP
   */
  async getStockAnalysis(symbol) {
    try {
      const cacheKey = `analysis_${symbol}`;

      // Check cache first
      const cached = getFromCache(cacheKey);
      if (cached) return cached;

      console.log(`\n[HYBRID] Getting analysis for ${symbol}...`);

      // 1. Get REAL-TIME quote from Finnhub (instant)
      let quote;
      try {
        quote = await finnhub.getQuote(symbol);
      } catch (err) {
        console.error(`[HYBRID] ❌ Finnhub quote failed:`, err.message);
        throw new Error(`Cannot get real-time quote for ${symbol}`);
      }

      // 2. Get HISTORICAL candles from FMP (for indicators)
      let candles;
      try {
        candles = await fmp.getDailyCandles(symbol);
      } catch (err) {
        console.error(`[HYBRID] ❌ FMP candles failed:`, err.message);
        throw new Error(`Cannot get historical candles for ${symbol}`);
      }

      // 3. Calculate indicators from candles
      const sma20 = fmp.calculateSMA(candles, 20);
      const sma50 = fmp.calculateSMA(candles, 50);
      const sma200 = fmp.calculateSMA(candles, 200);
      const rsi = fmp.calculateRSI(candles, 14);

      // 4. Combine everything
      const analysis = {
        symbol: symbol.toUpperCase(),
        currentPrice: quote.currentPrice,
        change: quote.change,
        changePercent: quote.changePercent,
        dayHigh: quote.dayHigh,
        dayLow: quote.dayLow,
        dayOpen: quote.open,
        previousClose: quote.previousClose,
        rsi: parseFloat(rsi.toFixed(2)),
        sma20: parseFloat(sma20.toFixed(2)),
        sma50: parseFloat(sma50.toFixed(2)),
        sma200: parseFloat(sma200.toFixed(2)),
        volume: candles[0].volume,
        lastUpdated: new Date().toISOString(),
        source: 'Finnhub (quote) + FMP (candles)',
      };

      console.log(`[HYBRID] ✅ Analysis complete for ${symbol}`);
      console.log(`         Price: $${analysis.currentPrice}`);
      console.log(`         RSI: ${analysis.rsi}`);
      console.log(`         SMA200: $${analysis.sma200}`);

      // Cache the result
      setCache(cacheKey, analysis);

      return analysis;
    } catch (error) {
      console.error(`[HYBRID] ❌ Analysis error for ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Get real-time quote only (fast)
   */
  async getQuote(symbol) {
    try {
      const cacheKey = `quote_${symbol}`;

      const cached = getFromCache(cacheKey);
      if (cached) return cached;

      const quote = await finnhub.getQuote(symbol);
      setCache(cacheKey, quote);
      return quote;
    } catch (error) {
      console.error(`[HYBRID] ❌ Quote error:`, error.message);
      throw error;
    }
  }

  /**
   * Get company news (real news!)
   */
  async getNews(symbol) {
    try {
      const cacheKey = `news_${symbol}`;

      const cached = getFromCache(cacheKey);
      if (cached) return cached;

      const news = await finnhub.getNews(symbol);
      setCache(cacheKey, news);
      return news;
    } catch (error) {
      console.error(`[HYBRID] ❌ News error:`, error.message);
      return []; // Return empty instead of throwing
    }
  }

  /**
   * Get company profile
   */
  async getProfile(symbol) {
    try {
      const cacheKey = `profile_${symbol}`;

      const cached = getFromCache(cacheKey);
      if (cached) return cached;

      const profile = await finnhub.getProfile(symbol);
      setCache(cacheKey, profile);
      return profile;
    } catch (error) {
      console.error(`[HYBRID] ❌ Profile error:`, error.message);
      throw error;
    }
  }

  /**
   * Get cache status
   */
  getCacheInfo() {
    return {
      size: cache.size,
      keys: Array.from(cache.keys()),
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    const size = cache.size;
    cache.clear();
    console.log(`[CACHE] CLEARED (${size} entries removed)`);
  }
}

module.exports = new HybridStockService();
