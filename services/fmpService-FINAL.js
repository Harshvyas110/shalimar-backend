const axios = require('axios');

const FMP_API_KEY = 'A8XCCHUl5cGroCXXvf9gQxpZewiRnVN0';
const FMP_URL = 'https://financialmodelingprep.com/api/v3';

class FMPService {
  constructor() {
    console.log('[FMP] Service initialized');
  }

  async getDailyCandles(symbol) {
    try {
      const response = await axios.get(
        `${FMP_URL}/historical-price-full/${symbol.toUpperCase()}`,
        {
          params: { apikey: FMP_API_KEY },
          timeout: 15000,
        }
      );

      if (!response.data.historical || response.data.historical.length === 0) {
        throw new Error('No data');
      }

      return response.data.historical.map((c) => ({
        date: c.date,
        open: parseFloat(c.open),
        high: parseFloat(c.high),
        low: parseFloat(c.low),
        close: parseFloat(c.close),
        adjClose: parseFloat(c.adjClose),
        volume: parseInt(c.volume),
      }));
    } catch (error) {
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
    const closes = candles.map((c) => c.close).slice(0, period);
    return closes.reduce((a, b) => a + b, 0) / period;
  }
}

module.exports = new FMPService();
