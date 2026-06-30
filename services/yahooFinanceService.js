const axios = require('axios');
const { HttpProxyAgent } = require('http-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');
class YahooFinanceService {
  constructor() {
    this.volumeCache = {};
    this.lastDailyFetch = {};
    
    const PROXY_USER = process.env.PROXY_USER;
    const PROXY_PASS = process.env.PROXY_PASS;
    const PROXY_HOST = process.env.PROXY_HOST;
    const PROXY_PORT = process.env.PROXY_PORT;
    
    if (!PROXY_USER || !PROXY_PASS || !PROXY_HOST || !PROXY_PORT) {
      console.warn('⚠️ WARNING: Proxy credentials not set!');
      this.proxyUrl = null;
    } else {
      this.proxyUrl = `http://${PROXY_USER}:${PROXY_PASS}@${PROXY_HOST}:${PROXY_PORT}`;
      console.log('✅ Proxy configured');
    }
    
    if (this.proxyUrl) {
      this.httpAgent = new HttpProxyAgent(this.proxyUrl);
      this.httpsAgent = new HttpsProxyAgent(this.proxyUrl);
    }
  }

  async getDailyCandles(symbol) {
    try {
      console.log(`[${symbol}] Fetching via proxy...`);
      
      const now = Math.floor(Date.now() / 1000);
      const oneYearAgo = now - (365 * 24 * 60 * 60);
      
      const url = `https://query1.finance.yahoo.com/v7/finance/download/${symbol}?period1=${oneYearAgo}&period2=${now}&interval=1d&events=history`;
      
      const response = await axios.get(url, {
        httpAgent: this.httpAgent,
        httpsAgent: this.httpsAgent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
        },
        timeout: 15000,
      });

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

      console.log(`[${symbol}] ✅ Got ${quotes.length} candles`);
      return quotes;
    } catch (error) {
      console.error(`[${symbol}] ❌ Error:`, error.message);
      throw new Error(`Failed to fetch candles: ${error.message}`);
    }
  }

  async get15MinCandles(symbol) {
    try {
      console.log(`[${symbol}] Fetching 15-min candles...`);
      return await this.getDailyCandles(symbol);
    } catch (error) {
      console.error(`[${symbol}] ❌ 15m error:`, error.message);
      throw error;
    }
  }

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

  calculateSMA(candles, period) {
    if (!candles || candles.length < period) {
      return candles?.[0]?.close || 0;
    }

    const closes = candles.map(c => c.close).slice(0, period);
    const sum = closes.reduce((a, b) => a + b, 0);
    return sum / period;
  }

  async getDailyVolume(symbol) {
    try {
      const now = Date.now();
      const cacheKey = symbol;

      if (this.volumeCache[cacheKey] && this.lastDailyFetch[cacheKey] && 
          now - this.lastDailyFetch[cacheKey] < 24 * 60 * 60 * 1000) {
        return this.volumeCache[cacheKey];
      }

      const candles = await this.getDailyCandles(symbol);
      const volume = candles[0]?.volume || 0;

      this.volumeCache[cacheKey] = volume;
      this.lastDailyFetch[cacheKey] = now;

      return volume;
    } catch (error) {
      console.error(`[${symbol}] Volume error:`, error.message);
      return 0;
    }
  }

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

      console.log(`[${symbol}] ✅ Analysis:`, analysis);
      return analysis;
    } catch (error) {
      console.error(`[${symbol}] Analysis error:`, error.message);
      throw error;
    }
  }
}

module.exports = new YahooFinanceService();
