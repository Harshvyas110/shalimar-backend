const axios = require('axios');

const GOOGLE_SHEET_WEBHOOK = 'https://script.google.com/macros/s/AKfycbwOrOYYPg2Ue_7542BrDJ669_fRoydR_uS5U_leCjhV6FGktI8seNDwDoFFgb42peYZ/exec';

async function getStockDataWithIndicators(symbol) {
  try {
    console.log(`[GoogleSheet] Fetching ${symbol}...`);
    
    const response = await axios.get(GOOGLE_SHEET_WEBHOOK, {
      params: { symbol: symbol.toUpperCase() },
      timeout: 30000,
    });

    if (response.data.status !== 'success') {
      throw new Error('Google Sheet error: ' + response.data.message);
    }

    let closingPrices = response.data.closingPrices || [];
    
    if (closingPrices.length < 14) {
      throw new Error(`Not enough data: ${closingPrices.length} prices`);
    }

    console.log(`[${symbol}] Got ${closingPrices.length} prices, first=${closingPrices[0]}, last=${closingPrices[closingPrices.length-1]}`);

    // DON'T REVERSE - Google Sheets already returns oldest to newest!
    // We'll use slice(-period) to get the LAST N prices (which are newest)

    const rsi = calculateRSI(closingPrices, 14);
    const sma20 = calculateSMA(closingPrices, 20);
    const sma50 = calculateSMA(closingPrices, 50);
    const sma200 = calculateSMA(closingPrices, 200);

    const volumeValue = response.data.volume || 0;

    console.log(`[${symbol}] ✅ Price=$${response.data.currentPrice}, SMA20=$${sma20.toFixed(2)}, SMA50=$${sma50.toFixed(2)}, SMA200=$${sma200.toFixed(2)}, RSI=${rsi.toFixed(2)}`);

    return {
      symbol: response.data.symbol,
      currentPrice: response.data.currentPrice,
      change: response.data.change,
      changePercent: response.data.changePercent,
      dayHigh: response.data.dayHigh,
      dayLow: response.data.dayLow,
      dayOpen: response.data.dayOpen,
      previousClose: response.data.currentPrice - response.data.change,
      rsi: parseFloat(rsi.toFixed(2)),
      sma20: parseFloat(sma20.toFixed(2)),
      sma50: parseFloat(sma50.toFixed(2)),
      sma200: parseFloat(sma200.toFixed(2)),
      volume: volumeValue,
      source: 'google-finance-calculated',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`[${symbol}] Error:`, error.message);
    return null;
  }
}

// Calculate SMA - take LAST N prices (which are newest since array is oldest-first)
function calculateSMA(prices, period) {
  if (!prices || prices.length < period) {
    return prices && prices.length > 0 ? prices[prices.length - 1] : 0;
  }

  // Get the LAST N prices (newest)
  const relevantPrices = prices.slice(-period);
  const sum = relevantPrices.reduce((a, b) => a + b, 0);
  return sum / period;
}

// Calculate RSI - prices array is oldest-first, so we work backwards
function calculateRSI(prices, period = 14) {
  if (!prices || prices.length < period + 1) {
    return 50;
  }

  // Get the LAST N+1 prices (newest)
  const recentPrices = prices.slice(-(period + 1));
  
  // Calculate changes (newest to oldest)
  const changes = [];
  for (let i = 0; i < recentPrices.length - 1; i++) {
    changes.push(recentPrices[i] - recentPrices[i + 1]);
  }

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

module.exports = { getStockDataWithIndicators };
