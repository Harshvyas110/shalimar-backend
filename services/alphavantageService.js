const axios = require('axios');

const AV_API_KEY = process.env.AV_API_KEY || 'BS14B59F0QPYKZJY';
const AV_URL = 'https://www.alphavantage.co/query';

class AlphaVantageService {
  constructor() {
    this.cache = {};
    console.log('✅ AlphaVantageService (Daily Only) initialized');
  }

  async getDailyCandles(symbol) {
    try {
      console.log(`[${symbol}] Fetching daily candles...`);
      
      const response = await axios.get(AV_URL, {
        params: {
          function: 'TIME_SERIES_DAILY',
          symbol: symbol,
          apikey: AV_API_KEY
        },
        timeout: 15000
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
          volume: parseInt(candle['5. volume'])
        });
      }

      console.log(`[${symbol}] ✅ Got ${quotes.length} daily candles`);
      return quotes;
    } catch (error) {
      console.error(`[${symbol}] ❌ Daily candles error:`, error.message);
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

module.exports = new AlphaVantageService();
