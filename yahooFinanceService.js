const YahooFinance = require('yahoo-finance2').default;

const yahooFinance = new YahooFinance();

class YahooFinanceService {
  constructor() {
    this.volumeCache = {};
    this.lastDailyFetch = {};
  }

  // Get daily volume from Yahoo Finance
  async getDailyVolumeFromYahoo(symbol) {
    try {
      // Cache for 24 hours (daily data doesn't change intraday)
      const now = Date.now();
      if (this.lastDailyFetch[symbol] && now - this.lastDailyFetch[symbol] < 24 * 60 * 60 * 1000) {
        console.log(`[${symbol}] Using cached daily volume`);
        return this.volumeCache[symbol] || 0;
      }

      console.log(`[${symbol}] Fetching daily volume from Yahoo Finance...`);

      const result = await yahooFinance.chart(symbol, {
        interval: '1d',
        period1: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        period2: new Date(),
      });

      if (!result.quotes || result.quotes.length === 0) {
        console.log(`[${symbol}] No daily data from Yahoo Finance`);
        return 0;
      }

      // Get YESTERDAY's volume (most recent completed day)
      const yesterdayCandle = result.quotes[result.quotes.length - 1];
      const volume = parseInt(yesterdayCandle.volume) || 0;

      console.log(`[${symbol}] Yesterday's date: ${yesterdayCandle.date}`);
      console.log(`[${symbol}] ✅ Got daily volume from Yahoo Finance: ${volume}`);

      this.volumeCache[symbol] = volume;
      this.lastDailyFetch[symbol] = now;

      return volume;
    } catch (error) {
      console.error(`[${symbol}] Yahoo Finance daily error:`, error.message);
      return this.volumeCache[symbol] || 0;
    }
  }

  // Get 15-min candles from Yahoo Finance
  async get15MinCandles(symbol) {
    try {
      console.log(`[${symbol}] Fetching 15-min candles from Yahoo Finance...`);

      const result = await yahooFinance.chart(symbol, {
        interval: '15m',
        period1: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        period2: new Date(),
      });

      if (!result.quotes || result.quotes.length === 0) {
        throw new Error(`No data for ${symbol}`);
      }

      const candles = result.quotes.map(q => ({
        time: new Date(q.date).toISOString(),
        open: q.open,
        high: q.high,
        low: q.low,
        close: q.close,
        volume: 0, // Will be filled from daily data
      }));

      console.log(`[${symbol}] ✅ Got ${candles.length} candles from Yahoo Finance`);
      console.log(`[${symbol}] Time range: ${candles[0].time} to ${candles[candles.length - 1].time}`);

      return candles.slice(-50); // Last 50 candles = ~12.5 hours of 15-min data
    } catch (error) {
      console.error(`[${symbol}] Yahoo Finance error:`, error.message);
      throw error;
    }
  }

  // Calculate RSI with Wilder's Smoothing
  calculateRSI(candles, period = 14) {
    if (candles.length < period + 1) return 50;

    const closes = candles.map(c => c.close);
    const changes = [];

    // Step 1: Calculate price changes
    for (let i = 1; i < closes.length; i++) {
      changes.push(closes[i] - closes[i - 1]);
    }

    // Step 2: Separate gains and losses for FIRST period only
    let sumGains = 0;
    let sumLosses = 0;

    for (let i = 0; i < period; i++) {
      if (changes[i] > 0) {
        sumGains += changes[i];
      } else {
        sumLosses += Math.abs(changes[i]);
      }
    }

    // Step 3: Initial averages (first calculation)
    let avgGain = sumGains / period;
    let avgLoss = sumLosses / period;

    console.log(`[RSI] Initial: avgGain=${avgGain.toFixed(4)}, avgLoss=${avgLoss.toFixed(4)}`);

    // Step 4: Wilder's smoothing for REMAINING changes
    for (let i = period; i < changes.length; i++) {
      if (changes[i] > 0) {
        avgGain = (avgGain * (period - 1) + changes[i]) / period;
        avgLoss = (avgLoss * (period - 1)) / period;
      } else {
        avgGain = (avgGain * (period - 1)) / period;
        avgLoss = (avgLoss * (period - 1) + Math.abs(changes[i])) / period;
      }
    }

    console.log(`[RSI] Final: avgGain=${avgGain.toFixed(4)}, avgLoss=${avgLoss.toFixed(4)}`);

    // Step 5: Calculate RS and RSI
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);

    console.log(`[RSI] RS=${rs.toFixed(4)}, RSI=${rsi.toFixed(2)}`);

    return rsi;
  }

  // Calculate SMA
  calculateSMA(candles, period) {
    if (candles.length < period) {
      return candles.length > 0 ? candles[candles.length - 1].close : 0;
    }

    const closes = candles.map(c => c.close);
    const sum = closes.slice(-period).reduce((a, b) => a + b, 0);
    return sum / period;
  }

  // Get complete stock analysis
  async getStockAnalysis(candles, symbol) {
    const rsi = this.calculateRSI(candles, 14);
    const sma20 = this.calculateSMA(candles, 20);
    const sma50 = this.calculateSMA(candles, 50);
    const currentPrice = candles[candles.length - 1].close;

    // Get daily volume from Yahoo Finance
    const volume = await this.getDailyVolumeFromYahoo(symbol);

    return {
      rsi: parseFloat(rsi.toFixed(2)),
      sma20: parseFloat(sma20.toFixed(2)),
      sma50: parseFloat(sma50.toFixed(2)),
      currentPrice: parseFloat(currentPrice.toFixed(2)),
      volume: parseInt(volume) || 0,
    };
  }
}

module.exports = new YahooFinanceService();