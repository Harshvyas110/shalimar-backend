const axios = require('axios');

const POLYGON_API_KEY = 'rcATbYhlIk2nyM0oathKkYEbXs2pGnUv';
const BASE_URL = 'https://api.polygon.io/v2/aggs/ticker';

class PolygonService {
  constructor() {
    this.rateLimitDelay = 500;
    this.lastRequestTime = 0;
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
async get15MinCandles(symbol) {
  // Force fresh data (bypass cache)
  // ... rest of code
}
  async enforceRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.rateLimitDelay) {
      await this.delay(this.rateLimitDelay - timeSinceLastRequest);
    }
    
    this.lastRequestTime = Date.now();
  }

  formatDate(date) {
    return date.toISOString().split('T')[0];
  }

  async get15MinCandles(symbol) {
    try {
      await this.enforceRateLimit();

      console.log(`[${symbol}] Fetching REAL 15-min candles from Polygon.io...`);

      const toDate = new Date();
      const fromDate = new Date(toDate.getTime() - 7 * 24 * 60 * 60 * 1000);

      const url = `${BASE_URL}/${symbol.toUpperCase()}/range/15/minute/${this.formatDate(fromDate)}/${this.formatDate(toDate)}`;

      console.log(`[${symbol}] Request URL:`, url);

      const response = await axios.get(url, {
        params: {
          apiKey: POLYGON_API_KEY,
          sort: 'asc',
          limit: 50000
        },
        timeout: 10000
      });

      const data = response.data;

      console.log(`[${symbol}] Response status:`, data.status);
      console.log(`[${symbol}] Results count:`, data.resultsCount);

      if (!data.results || data.results.length === 0) {
        console.log(`[${symbol}] No candle results found`);
        throw new Error(`No 15-min data available for ${symbol}`);
      }

      console.log(`[${symbol}] Got ${data.results.length} candles from Polygon`);

      const candles = data.results.map(result => ({
        time: new Date(result.t).toISOString(),
        open: result.o,
        high: result.h,
        low: result.l,
        close: result.c,
        volume: result.v,
      }));

      const last50 = candles.slice(-50);

      console.log(`[${symbol}] ✅ Got ${last50.length} REAL 15-min candles from Polygon.io`);
      console.log(`[${symbol}] Time range: ${last50[0].time} to ${last50[last50.length - 1].time}`);

      return last50;

    } catch (error) {
      console.error(`[${symbol}] Error:`, error.message);
      throw error;
    }
  }

  calculateRSI(candles, period = 14) {
    if (candles.length < period + 1) return 50;

    const closes = candles.map(c => c.close);
    let gains = 0;
    let losses = 0;

    for (let i = closes.length - period; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);

    return rsi;
  }

  calculateSMA(candles, period) {
    if (candles.length < period) {
      return candles.length > 0 ? candles[candles.length - 1].close : 0;
    }

    const closes = candles.map(c => c.close);
    const sum = closes.slice(-period).reduce((a, b) => a + b, 0);
    return sum / period;
  }

  getStockAnalysis(candles) {
    const rsi = this.calculateRSI(candles, 14);
    const sma20 = this.calculateSMA(candles, 20);
    const sma50 = this.calculateSMA(candles, 50);
    const currentPrice = candles[candles.length - 1].close;
    const volume = candles[candles.length - 1].volume;

    return {
      rsi: parseFloat(rsi.toFixed(2)),
      sma20: parseFloat(sma20.toFixed(2)),
      sma50: parseFloat(sma50.toFixed(2)),
      currentPrice: parseFloat(currentPrice.toFixed(2)),
      volume: volume,
    };
  }
}

module.exports = new PolygonService();