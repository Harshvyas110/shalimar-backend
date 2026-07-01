const axios = require('axios');

const FINNHUB_API_KEY = 'd929fb9r01qrfbe98gu0d929fb9r01qrfbe98gug';
const FINNHUB_URL = 'https://finnhub.io/api/v1';

class FinnhubService {
  constructor() {
    this.cache = {};
    this.lastFetch = {};
    console.log('✅ FinnhubService initialized');
  }

  async getDailyCandles(symbol) {
    try {
      console.log(`[${symbol}] Fetching daily candles...`);
      
      const response = await axios.get(`${FINNHUB_URL}/stock/candle`, {
        params: {
          symbol: symbol,
          resolution: 'D',
          from: Math.floor(Date.now() / 1000) - (365 * 24 * 60 * 60),
          to: Math.floor(Date.now() / 1000),
          token: FINNHUB_API_KEY
        },
        timeout: 10000
      });

      if (!response.data.c || response.data.c.length === 0) {
        throw new Error('No candle data returned');
      }

      const closes = response.data.c;
      const quotes = closes.map((close, i) => ({
        close: close,
        volume: response.data.v ? response.data.v[i] : 0
      }));

      console.log(`[${symbol}] ✅ Got ${quotes.length} daily candles`);
      return quotes;
    } catch (error) {
      console.error(`[${symbol}] ❌ Daily candles error:`, error.message);
      throw error;
    }
  }

  async get15MinCandles(symbol) {
    try {
      console.log(`[${symbol}] Fetching 15-min candles...`);
      
      const response = await axios.get(`${FINNHUB_URL}/stock/candle`, {
        params: {
          symbol: symbol,
          resolution: '15',
          from: Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60),
          to: Math.floor(Date.now() / 1000),
          token: FINNHUB_API_KEY
        },
        timeout: 10000
      });

      if (!response.data.c || response.data.c.length === 0) {
        throw new Error('No 15-min candle data');
      }

      const closes = response.data.c;
      const quotes = closes.map((close, i) => ({
        close: close,
        volume: response.data.v ? response.data.v[i] : 0
      }));

      console.log(`[${symbol}] ✅ Got ${quotes.length} 15-min candles`);
      return quotes;
    } catch (error) {
      console.error(`[${symbol}] ❌ 15-min candles error:`, error.message);
      throw error;
    }
  }

  calculateRSI(candles, period = 14) {
    if (!candles || candles.length < period + 1) return 50;

    const closes = candles.map(c => c.close).reverse();
    const changes = [];

    for (let i = 1; i < closes.length; i++) {
      changes.push(closes[i] - closes[i - 1]);
    }

    let avgGain = 0, avgLoss = 0;

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
    const closes = candles.map(c => c.close).slice(0, period);
    const sum = closes.reduce((a, b) => a + b, 0);
    return sum / period;
  }

  async getStockAnalysis(symbol) {
    try {
      const dailyCandles = await this.getDailyCandles(symbol);
      const candles15m = await this.get15MinCandles(symbol);

      const sma20 = this.calculateSMA(dailyCandles, 20);
      const sma50 = this.calculateSMA(dailyCandles, 50);
      const sma200 = this.calculateSMA(dailyCandles, 200);
      const rsi15m = this.calculateRSI(candles15m, 14);
      const currentPrice = dailyCandles[0].close;

      const analysis = {
        rsi: parseFloat(rsi15m.toFixed(2)),
        sma20: parseFloat(sma20.toFixed(2)),
        sma50: parseFloat(sma50.toFixed(2)),
        sma200: parseFloat(sma200.toFixed(2)),
        currentPrice: parseFloat(currentPrice.toFixed(2))
      };

      console.log(`[${symbol}] ✅ Analysis complete:`, analysis);
      return analysis;
    } catch (error) {
      console.error(`[${symbol}] ❌ Analysis error:`, error.message);
      throw error;
    }
  }
}

module.exports = new FinnhubService();

