const express = require('express');
const cors = require('cors');
const { getStockDataWithIndicators } = require('./googleSheetService');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const STOCKS = ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'AMD', 'AVGO', 'TSM', 'QQQ', 'DIA', 'SPY'];
const CACHE_TTL = 3600000; // 1 hour
const cache = new Map();

const MOCK_DATA = {
  NVDA: { currentPrice: 194.83, change: -2.75, changePercent: -1.39, dayHigh: 200.12, dayLow: 192.35, dayOpen: 197.14, previousClose: 197.58, rsi: 41.15, sma20: 203.48, sma50: 209.8, sma200: 194.83, volume: 142385548 },
  AAPL: { currentPrice: 302.84, change: 2.15, changePercent: 0.95, dayHigh: 305.45, dayLow: 300.12, dayOpen: 301.32, previousClose: 300.69, rsi: 52.5, sma20: 300.43, sma50: 295.15, sma200: 290.67, volume: 45000000 },
  TSLA: { currentPrice: 413.06, change: 3.12, changePercent: 1.29, dayHigh: 416.99, dayLow: 410.15, dayOpen: 411.15, previousClose: 409.94, rsi: 48.7, sma20: 410.15, sma50: 407.90, sma200: 404.43, volume: 35000000 },
  MSFT: { currentPrice: 386.52, change: 2.45, changePercent: 0.64, dayHigh: 389.45, dayLow: 383.12, dayOpen: 384.32, previousClose: 384.22, rsi: 51.2, sma20: 383.45, sma50: 381.90, sma200: 378.32, volume: 28000000 },
  AMD: { currentPrice: 168.45, change: 1.23, changePercent: 0.74, dayHigh: 170.12, dayLow: 165.32, dayOpen: 166.15, previousClose: 167.22, rsi: 49.3, sma20: 165.32, sma50: 162.15, sma200: 158.90, volume: 32000000 },
  AVGO: { currentPrice: 189.23, change: 0.98, changePercent: 0.52, dayHigh: 191.45, dayLow: 186.55, dayOpen: 187.32, previousClose: 188.25, rsi: 50.1, sma20: 186.55, sma50: 184.32, sma200: 181.67, volume: 15000000 },
  TSM: { currentPrice: 121.56, change: 0.75, changePercent: 0.62, dayHigh: 123.12, dayLow: 119.43, dayOpen: 120.15, previousClose: 120.81, rsi: 48.9, sma20: 119.43, sma50: 117.32, sma200: 115.67, volume: 22000000 },
  QQQ: { currentPrice: 730.36, change: 2.15, changePercent: 0.30, dayHigh: 732.45, dayLow: 725.42, dayOpen: 726.32, previousClose: 727.60, rsi: 52.3, sma20: 725.42, sma50: 720.88, sma200: 715.21, volume: 15000000 },
  DIA: { currentPrice: 525.41, change: 1.88, changePercent: 0.36, dayHigh: 528.45, dayLow: 523.55, dayOpen: 524.32, previousClose: 524.47, rsi: 48.9, sma20: 523.55, sma50: 521.12, sma200: 518.45, volume: 18000000 },
  SPY: { currentPrice: 750.80, change: 2.45, changePercent: 0.33, dayHigh: 753.23, dayLow: 746.33, dayOpen: 747.15, previousClose: 748.32, rsi: 51.2, sma20: 746.33, sma50: 744.67, sma200: 741.89, volume: 25000000 },
};

console.log('\n=== SHALIMAR BACKEND ===');
console.log('Source: Google Finance (historical prices)');
console.log('Calculation: RSI/SMA (calculated locally)\n');

function getFromCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Shalimar Backend Running',
    source: 'Google Finance + Calculated Indicators',
    cache: { size: cache.size, keys: Array.from(cache.keys()) },
  });
});

app.get('/api/stocks', (req, res) => {
  res.json({ stocks: STOCKS, total: STOCKS.length });
});

app.get('/api/candles/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const cacheKey = `stock_${symbol}`;

    // Check cache first
    const cached = getFromCache(cacheKey);
    if (cached) {
      console.log(`[CACHE] HIT: ${symbol}`);
      return res.json({ symbol, analysis: cached, source: 'cache' });
    }

    console.log(`[API] Getting ${symbol}...`);

    try {
      // Get data from Google Finance (with calculated RSI/SMA)
      const analysis = await getStockDataWithIndicators(symbol);

      if (analysis) {
        setCache(cacheKey, analysis);
        return res.json({ symbol, analysis, source: 'google-finance-calculated' });
      }
    } catch (error) {
      console.log(`[GoogleFinance] Error: ${error.message}`);
    }

    // FALLBACK to mock data
    console.log(`[FALLBACK] Using mock data for ${symbol}`);
    const mock = MOCK_DATA[symbol] || MOCK_DATA.NVDA;
    const analysis = {
      symbol,
      ...mock,
      timestamp: new Date().toISOString(),
    };
    setCache(cacheKey, analysis);
    res.json({ symbol, analysis, source: 'mock' });

  } catch (error) {
    console.error(`[ERROR] ${req.params.symbol}:`, error.message);
    const mock = MOCK_DATA[req.params.symbol.toUpperCase()] || MOCK_DATA.NVDA;
    res.json({ symbol: req.params.symbol.toUpperCase(), analysis: mock, source: 'fallback' });
  }
});

app.get('/api/quote/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const cacheKey = `quote_${symbol}`;

    const cached = getFromCache(cacheKey);
    if (cached) return res.json({ symbol, quote: cached, source: 'cache' });

    try {
      const data = await getStockDataWithIndicators(symbol);
      if (data) {
        const quote = {
          symbol,
          currentPrice: data.currentPrice,
          change: data.change,
          changePercent: data.changePercent,
        };
        setCache(cacheKey, quote);
        return res.json({ symbol, quote, source: 'google-finance' });
      }
    } catch (error) {
      console.log(`Error: ${error.message}`);
    }

    res.status(500).json({ error: 'Unable to fetch quote' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/cache/info', (req, res) => {
  res.json({ size: cache.size, keys: Array.from(cache.keys()) });
});

app.post('/api/cache/clear', (req, res) => {
  cache.clear();
  res.json({ message: 'Cache cleared' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌍 Google Finance + Local RSI/SMA Calculation\n`);
});
