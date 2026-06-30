const axios = require('axios');

class YahooFinanceService {
  constructor() {
    this.volumeCache = {};
    this.lastDailyFetch = {};
  }

  // Get daily candles via direct HTTP
  async getDailyCandles(symbol) {
    try {
      console.log(`[${symbol}] Fetching daily candles via HTTP...`);
      
      const now = Math.floor(Date.now() / 1000);
      const oneYearAgo = now - (365 * 24 * 60 * 60);
      
      const url = `https://query1.finance.yahoo.com/v7/finance/download/${symbol}?period1=${oneYearAgo}&period2=${now}&interval=1d&events=history`;
      
      const response = await axios.get(url);
      const lines = response.data.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        throw new Error('No data returned');
      }

      const quotes = [];
      for (let i = lines.length - 1; i >= 1; i--) {
        const parts = lines[i].split(',');
        if (parts.length >= 6 && parts[4] !== 'null') {
          quotes.push({
            date: parts[0],
            open: parseFloat(parts[1]),
            high: parseFloat(parts[2]),
            low: parseFloat(parts[3]),
            close: parseFloat(parts[4]),
            volume: parseInt(parts[5]),
          });
        }
      }

      console.log(`[${symbol}] Got ${quotes.length} daily candles`);
      return quotes;
    } catch (error) {
      console.error(`[${symbol}] Daily error:`, error.message);
      throw new Error(`Could not fetch candles: ${error.message}`);
    }
  }

  // Get 15-min candles (use daily as fallback)
  async get15MinCandles(symbol) {
    try {
      console.log(`[${symbol}] Fetching 15-min candles...`);
      return await this.getDailyCandles(symbol);
    } catch (error) {
      console.error(`[${symbol}] 15m error:`, error.message);
      throw error;
    }
  }

  // Calculate RSI
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
  async getDailyVolume(symbol) {
    try {
      const now = Date.now();
      const cacheKey = symbol;

      if (this.volumeCache[cacheKey] && this.lastDailyFetch[cacheKey] && 
          now - this.lastDailyFetch[cacheKey] < 24 * 60 * 60 * 1000) {
        console.log(`[${symbol}] Using cached volume`);
        return this.volumeCache[cacheKey];
      }

      const candles = await this.getDailyCandles(symbol);
      const volume = candles[0]?.volume || 0;

      this.volumeCache[cacheKey] = volume;
      this.lastDailyFetch[cacheKey] = now;

      console.log(`[${symbol}] Volume: ${volume}`);
      return volume;
    } catch (error) {
      console.error(`[${symbol}] Volume error:`, error.message);
      return 0;
    }
  }

  // Get complete analysis
  async getStockAnalysis(candles, symbol) {
    try {
      if (!candles || candles.length === 0) {
        throw new Error('No candle data');
      }

      const rsi = this.calculateRSI(candles, 14);
      const sma20 = this.calculateSMA(candles, 20);
      const sma50 = this.calculateSMA(candles, 50);
      const currentPrice = candles[0]?.close || 0;
      const volume = await this.getDailyVolume(symbol);

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
      console.error(`[${symbol}] Analysis error:`, error.message);
      throw error;
    }
  }
}

module.exports = new YahooFinanceService();
