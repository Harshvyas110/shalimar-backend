const axios = require('axios');

const GOOGLE_SHEET_WEBHOOK = 'https://script.google.com/macros/s/AKfycbwOrOYYPg2Ue_7542BrDJ669_fRoydR_uS5U_leCjhV6FGktI8seNDwDoFFgb42peYZ/exec';

// Get stock data with calculated RSI/SMA
async function getStockDataWithIndicators(symbol) {
  try {
    console.log(`[GoogleSheet] Fetching ${symbol}...`);
    
    const response = await axios.get(GOOGLE_SHEET_WEBHOOK, {
      params: { symbol: symbol.toUpperCase() },
      timeout: 10000,
    });

    if (response.data.status !== 'success') {
      throw new Error('Google Sheet returned error');
    }

    const closingPrices = response.data.closingPrices || [];
    
    if (closingPrices.length < 14) {
      throw new Error(`Not enough historical data. Got ${closingPrices.length}, need at least 14`);
    }

    // Calculate indicators
    const rsi = calculateRSI(closingPrices, 14);
    const sma20 = calculateSMA(closingPrices, 20);
    const sma50 = calculateSMA(closingPrices, 50);
    const sma200 = calculateSMA(closingPrices, 200);

    console.log(`[GoogleSheet] ✅ ${symbol}: Price=$${response.data.currentPrice}, RSI=${rsi.toFixed(2)}`);

    return {
      symbol: response.data.symbol,
      currentPrice: response.data.currentPrice,
      change: response.data.change,
      changePercent: response.data.changePercent,
      rsi: parseFloat(rsi.toFixed(2)),
      sma20: parseFloat(sma20.toFixed(2)),
      sma50: parseFloat(sma50.toFixed(2)),
      sma200: parseFloat(sma200.toFixed(2)),
      volume: 0,
      dayHigh: 0,
      dayLow: 0,
      dayOpen: 0,
      previousClose: response.data.currentPrice - response.data.change,
      source: 'google-finance-calculated',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`[GoogleSheet] Error for ${symbol}:`, error.message);
    return null;
  }
}

// Calculate Simple Moving Average
function calculateSMA(prices, period) {
  if (!prices || prices.length < period) {
    return prices && prices.length > 0 ? prices[0] : 0;
  }

  const relevantPrices = prices.slice(0, period);
  const sum = relevantPrices.reduce((a, b) => a + b, 0);
  return sum / period;
}

// Calculate Relative Strength Index
function calculateRSI(prices, period = 14) {
  if (!prices || prices.length < period + 1) {
    return 50; // Default neutral RSI
  }

  // Calculate price changes
  const changes = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  // Calculate initial gains and losses
  let gains = 0;
  let losses = 0;

  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) {
      gains += changes[i];
    } else {
      losses += Math.abs(changes[i]);
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Smooth the averages (Wilder's smoothing)
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

  // Calculate RS and RSI
  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));

  return Math.max(0, Math.min(100, rsi)); // Clamp between 0-100
}

module.exports = { getStockDataWithIndicators };
