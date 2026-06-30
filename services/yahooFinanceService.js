const yahooFinance = require('yahoo-finance2').default;

class YahooFinanceService {
  constructor() {
    this.volumeCache = {};
    this.lastDailyFetch = {};
  }

  // Get 15-min candles
  async get15MinCandles(symbol) {
    try {
      console.log(`[${symbol}] Fetching 15-min candles from Yahoo Finance...`);
      
      const result = await yahooFinance.chart(symbol, {
        interval: '15m',
      });

      if (!result || !result.quotes || result.quotes.length === 0) {
        throw new Error('No quotes returned from Yahoo Finance');
      }

      console.log(`[${symbol}] Got ${result.quotes.length} candles`);
      return result.quotes;
    } catch (error) {
      console.error(`[${symbol}] Error fetching 15-min candles:`, error.message);
      throw new Error(`Failed to fetch 15-min candles: ${error.message}`);
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

    // Initial average
    for (let i = 0; i < period; i++) {
      if (changes[i] > 0) {
        avgGain += changes[i];
      } else {
        avgLoss += Math.abs(changes[i]);
      }
    }

    avgGain /= period;
    avgLoss /= period;

    // Wilder's smoothing
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

      // Check cache (24 hour TTL)
      if (
        this.volumeCache[cacheKey] &&
        this.lastDailyFetch[cacheKey] &&
        now - this.lastDailyFetch[cacheKey] < 24 * 60 * 60 * 1000
      ) {
        console.log(`[${symbol}] Using cached daily volume`);
        return this.volumeCache[cacheKey];
      }

      console.log(`[${symbol}] Fetching daily volume from Yahoo Finance...`);

      const result = await yahooFinance.chart(symbol, {
        interval: '1d',
      });

      if (!result || !result.quotes || result.quotes.length === 0) {
        console.warn(`[${symbol}] No daily data found, using 0`);
        return 0;
      }

      const volume = result.quotes[result.quotes.length - 1]?.volume || 0;

      // Cache it
      this.volumeCache[cacheKey] = volume;
      this.lastDailyFetch[cacheKey] = now;

      console.log(`[${symbol}] Daily volume: ${volume}`);
      return volume;
    } catch (error) {
      console.error(`[${symbol}] Error fetching daily volume:`, error.message);
      return 0;
    }
  }

  // Get complete stock analysis
  async getStockAnalysis(candles, symbol) {
    try {
      if (!candles || candles.length === 0) {
        throw new Error('No candle data available');
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

      console.log(`[${symbol}] Analysis complete:`, analysis);
      return analysis;
    } catch (error) {
      console.error(`[${symbol}] Error in getStockAnalysis:`, error.message);
      throw error;
    }
  }
}

module.exports = new YahooFinanceService();
