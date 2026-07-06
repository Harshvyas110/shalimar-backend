const express = require('express');
const { getStockDataWithIndicators } = require('./googleSheetService');
const app = express();
const PORT = process.env.PORT || 3000;

// ===== SEQUENTIAL QUEUE FOR GOOGLE SHEETS =====
let requestQueue = Promise.resolve();
const queueRequest = async (fn) => {
  requestQueue = requestQueue.then(fn).catch(e => {
    console.error('Queue error:', e);
    return null;
  });
  return requestQueue;
};

// ===== IN-MEMORY CACHE =====
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const cache = new Map();

function getCachedData(symbol) {
  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[CACHE] HIT: ${symbol}`);
    return cached.data;
  }
  return null;
}

function setCachedData(symbol, data) {
  cache.set(symbol, {
    data: data,
    timestamp: Date.now()
  });
}

// ===== MOCK DATA FALLBACK =====
function getMockData(symbol) {
  const mockData = {
    'NVDA': { currentPrice: 194.83, change: -2.75, changePercent: -1.39, dayHigh: 200.06, dayLow: 192.35, dayOpen: 197.14, previousClose: 197.58, rsi: 43.76, sma20: 204.37, sma50: 210.16, sma200: 191.27, volume: 142385548 },
    'AAPL': { currentPrice: 308.63, change: 14.25, changePercent: 4.84, dayHigh: 309.42, dayLow: 293.68, dayOpen: 294.12, previousClose: 294.38, rsi: 25.43, sma20: 295.6, sma50: 293.01, sma200: 270.54, volume: 45000000 },
    'TSLA': { currentPrice: 393.45, change: -31.85, changePercent: -7.49, dayHigh: 432.35, dayLow: 389.3, dayOpen: 428.01, previousClose: 425.3, rsi: 41.8, sma20: 399.67, sma50: 405.47, sma200: 418.7, volume: 35000000 },
    'MSFT': { currentPrice: 390.49, change: 6.21, changePercent: 1.62, dayHigh: 392.2, dayLow: 383.7, dayOpen: 384.48, previousClose: 384.28, rsi: 53.32, sma20: 389.33, sma50: 407.79, sma200: 445.86, volume: 28000000 },
    'AMD': { currentPrice: 165.23, change: 2.45, changePercent: 1.51, dayHigh: 167.89, dayLow: 162.15, dayOpen: 162.78, previousClose: 162.78, rsi: 48.5, sma20: 160.5, sma50: 155.2, sma200: 150.1, volume: 25000000 },
    'AVGO': { currentPrice: 145.67, change: -1.23, changePercent: -0.84, dayHigh: 147.5, dayLow: 144.2, dayOpen: 146.9, previousClose: 146.9, rsi: 45.2, sma20: 144.8, sma50: 142.3, sma200: 140.5, volume: 15000000 },
    'TSM': { currentPrice: 192.34, change: 3.56, changePercent: 1.88, dayHigh: 193.2, dayLow: 188.9, dayOpen: 188.78, previousClose: 188.78, rsi: 52.1, sma20: 189.5, sma50: 187.2, sma200: 185.3, volume: 20000000 },
    'QQQ': { currentPrice: 712.6, change: -12.57, changePercent: -1.73, dayHigh: 730.83, dayLow: 707.56, dayOpen: 725.58, previousClose: 725.17, rsi: 40.78, sma20: 723.84, sma50: 708.8, sma200: 634.89, volume: 15000000 },
    'DIA': { currentPrice: 525.41, change: -2.34, changePercent: -0.45, dayHigh: 528.5, dayLow: 523.1, dayOpen: 527.75, previousClose: 527.75, rsi: 48.9, sma20: 523.55, sma50: 521.12, sma200: 518.45, volume: 18000000 },
    'SPY': { currentPrice: 750.80, change: 2.45, changePercent: 0.33, dayHigh: 753.23, dayLow: 746.33, dayOpen: 747.15, previousClose: 748.32, rsi: 51.2, sma20: 746.33, sma50: 744.67, sma200: 741.89, volume: 25000000 },
    'LLY': { currentPrice: 895.23, change: 12.45, changePercent: 1.41, dayHigh: 897.5, dayLow: 882.8, dayOpen: 882.78, previousClose: 882.78, rsi: 55.3, sma20: 887.2, sma50: 880.1, sma200: 875.5, volume: 8000000 },
    'RDW': { currentPrice: 28.45, change: 0.85, changePercent: 3.07, dayHigh: 28.9, dayLow: 27.6, dayOpen: 27.6, previousClose: 27.6, rsi: 58.2, sma20: 27.8, sma50: 27.2, sma200: 26.9, volume: 5000000 },
  };
  
  return mockData[symbol] || mockData['NVDA'];
}

// ===== API ENDPOINT =====
app.get('/api/candles/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  
  console.log(`[API] Getting ${symbol}...`);
  
  try {
    // Check cache first
    const cached = getCachedData(symbol);
    if (cached) {
      return res.json({
        symbol: symbol,
        analysis: cached,
        source: 'cache'
      });
    }

    // Queue the request to Google Sheets
    let data = await queueRequest(async () => {
      return await getStockDataWithIndicators(symbol);
    });

    // Use mock if Google Sheets fails
    if (!data) {
      console.log(`[FALLBACK] Using mock data for ${symbol}`);
      data = getMockData(symbol);
    }

    // Cache the result
    if (data) {
      setCachedData(symbol, data);
    }

    res.json({
      symbol: symbol,
      analysis: data,
      source: data ? 'google-finance-calculated' : 'mock'
    });

  } catch (error) {
    console.error(`[ERROR] ${symbol}:`, error.message);
    const mockData = getMockData(symbol);
    res.json({
      symbol: symbol,
      analysis: mockData,
      source: 'mock'
    });
  }
});

// ===== CACHE ENDPOINTS =====
app.get('/api/cache/info', (req, res) => {
  const info = {
    size: cache.size,
    items: Array.from(cache.keys()),
    ttl: CACHE_TTL / 1000 + 's'
  };
  res.json(info);
});

app.post('/api/cache/clear', (req, res) => {
  const size = cache.size;
  cache.clear();
  console.log(`[CACHE] Cleared ${size} items`);
  res.json({ message: `Cleared ${size} cached items` });
});

// ===== HEALTH CHECK =====
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`🚀 Shalimar Capital API running on port ${PORT}`);
  console.log(`📊 Endpoints: GET /api/candles/:symbol, POST /api/cache/clear`);
});
