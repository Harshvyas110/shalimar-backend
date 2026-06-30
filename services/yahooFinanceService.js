const yf = require('yahoo-finance2');

class YahooFinanceService {
  constructor() {
    this.volumeCache = {};
    this.lastDailyFetch = {};
  }

  // Get 15-min candles
  async get15MinCandles(symbol) {
    try {
      console.log(`[${symbol}] Fetching 15-min candles from Yahoo Finance...`);
      
      // Calculate date range (last 5 days)
      const now = new Date();
      const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
      
      const result = await yf.chart(symbol, { 
        interval: '15m',
        period1: fiveDaysAgo,
        period2: now,
      });

      if (!result || !result.quotes || result.quotes.length === 0) {
        console.warn(`[${symbol}] No 15m quotes, trying daily fallback...`);
        return await this.getDailyCandles(symbol);
      }

      console.log(`[${symbol}] Got ${result.quotes.length} candles`);
      return result.quotes || [];
    } catch (error) {
      console.error(`[${symbol}] 15m error:`, error.message);
      return await this.getDailyCandles(symbol);
    }
  }

  // Get daily candles as fallback
  async getDailyCandles(symbol) {
    try {
      console.log(`[${symbol}] Fetching daily candles...`);
      
      const now = new Date();
      const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      
      const result = await yf.chart(symbol, {
        interval: '1d',
        period1: oneYearAgo,
        period2: now,
      });

      if (!result || !result.quotes || result.quotes.length === 0) {
        throw new Error('No daily quotes found');
      }

      console.log(`[${symbol}] Got ${result.quotes.length} daily candles`);
      return result.quotes || [];
    } catch (error) {
      console.error(`[${symbol}] Daily fallback error:`, error.message);
      throw new Error(`Could not fetch candles: ${error.message}`);
    }
  }

  // Calculate RSI with Wilder's smoothing
  calculateRSI(candles, period = 14) {
    if (!candles || candles.length < period + 1) {
      return 50;
    }

    const closes = candles.map(c => c.close).reverse();
    const changes = [];

    for (let i = 1; i < closes.length; i++) {
      changes.push(closes[i] - closes[i - 1]);
    }

    let avgGain = 0;
    let avgLoss = 0;

    for (let i = 0; i < period; i++) {
      if (changes[i] > 0) {
        avgGain += changes[i];
      } else {
        avgLoss += Math.abs(changes[i]);
      }
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

  // Calculate SMA
  calculateSMA(candles, period) {
    if (!candles || candles.length < period) {
      return candles?.[0]?.close || 0;
    }

    const closes = candles.map(c => c.close).slice(0, period);
    const sum = closes.reduce((a, b) => a + b, 0);
    return sum / period;
  }

  // Get daily volume
  async getDailyVolumeFromYahoo(symbol) {
    try {
      const now = Date.now();
      const cacheKey = symbol;

      if (
        this.volumeCache[cacheKey] &&
        this.lastDailyFetch[cacheKey] &&
        now - this.lastDailyFetch[cacheKey] < 24 * 60 * 60 * 1000
      ) {
        console.log(`[${symbol}] Using cached volume`);
        return this.volumeCache[cacheKey];
      }

      console.log(`[${symbol}] Fetching daily volume...`);

      const today = new Date();
      const oneMonthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

      const result = await yf.chart(symbol, {
        interval: '1d',
        period1: oneMonthAgo,
        period2: today,
      });

      if (!result || !result.quotes || result.quotes.length === 0) {
        return 0;
      }

      const volume = result.quotes[result.quotes.length - 1]?.volume || 0;

      this.volumeCache[cacheKey] = volume;
      this.lastDailyFetch[cacheKey] = now;

      console.log(`[${symbol}] Volume: ${volume}`);
      return volume;
    } catch (error) {
      console.error(`[${symbol}] Volume error:`, error.message);
      return 0;
    }
  }

  // Get complete stock analysis
  async getStockAnalysis(candles, symbol) {
    try {
      if (!candles || candles.length === 0) {
        throw new Error('No candle data');
      }

      const rsi = this.calculateRSI(candles, 14);
      const sma20 = this.calculateSMA(candles, 20);
      const sma50 = this.calculateSMA(candles, 50);
      const currentPrice = candles[0]?.close || 0;
      const volume = await this.getDailyVolumeFromYahoo(symbol);

      const analysis = {
        rsi: parseFloat(rsi.toFixed(2)),
        sma20: parseFloat(sma20.toFixed(2)),
        sma50: parseFloat(sma50.toFixed(2)),
        currentPrice: parseFloat(currentPrice.toFixed(2)),
        volume: Math.round(volume),
      };

      console.log(`[${symbol}] Analysis:`, analysis);
      return analysis;
    } catch (error) {
      console.error(`[${symbol}] Analysis error:`, error.message);
      throw error;
    }
  }
}

module.exports = new YahooFinanceService();
