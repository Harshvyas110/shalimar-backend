const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const FINNHUB_API_KEY = 'd929fb9r01qrfbe98gu0d929fb9r01qrfbe98gug';
const FMP_API_KEY = 'A8XCCHUl5cGroCXXvf9gQxpZewiRnVN0';
const FINNHUB_URL = 'https://finnhub.io/api/v1';
const FMP_URL = 'https://financialmodelingprep.com/api/v3';

const STOCKS = ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'AMD', 'AVGO', 'TSM'];
const CACHE_TTL = 3600000;
const cache = new Map();

// MOCK DATA FALLBACK
const MOCK_DATA = {
  NVDA: { currentPrice: 200.09, change: 1.23, changePercent: 0.62, dayHigh: 205.12, dayLow: 195.45, dayOpen: 197.32, previousClose: 198.54, rsi: 45.24, sma20: 205.74, sma50: 209.99, sma200: 197.58, volume: 50000000 },
  AAPL: { currentPrice: 227.84, change: 2.15, changePercent: 0.95, dayHigh: 230.45, dayLow: 225.12, dayOpen: 226.32, previousClose: 225.69, rsi: 52.5, sma20: 225.43, sma50: 220.15, sma200: 215.67, volume: 45000000 },
  TSLA: { currentPrice: 245.32, change: 3.12, changePercent: 1.29, dayHigh: 248.99, dayLow: 242.15, dayOpen: 243.15, previousClose: 242.20, rsi: 48.7, sma20: 242.15, sma50: 238.90, sma200: 235.43, volume: 35000000 },
  MSFT: { currentPrice: 423.67, change: 2.45, changePercent: 0.58, dayHigh: 426.45, dayLow: 420.12, dayOpen: 421.32, previousClose: 421.22, rsi: 51.2, sma20: 420.45, sma50: 418.90, sma200: 415.32, volume: 28000000 },
  AMD: { currentPrice: 168.45, change: 1.23, changePercent: 0.74, dayHigh: 170.12, dayLow: 165.32, dayOpen: 166.15, previousClose: 167.22, rsi: 49.3, sma20: 165.32, sma50: 162.15, sma200: 158.90, volume: 32000000 },
  AVGO: { currentPrice: 189.23, change: 0.98, changePercent: 0.52, dayHigh: 191.45, dayLow: 186.55, dayOpen: 187.32, previousClose: 188.25, rsi: 50.1, sma20: 186.55, sma50: 184.32, sma200: 181.67, volume: 15000000 },
  TSM: { currentPrice: 121.56, change: 0.75, changePercent: 0.62, dayHigh: 123.12, dayLow: 119.43, dayOpen: 120.15, previousClose: 120.81, rsi: 48.9, sma20: 119.43, sma50: 117.32, sma200: 115.67, volume: 22000000 },
  QQQ: { currentPrice: 418.75, change: 2.15, changePercent: 0.52, dayHigh: 420.45, dayLow: 415.42, dayOpen: 416.32, previousClose: 416.60, rsi: 52.3, sma20: 415.42, sma50: 410.88, sma200: 405.21, volume: 15000000 },
  DIA: { currentPrice: 395.22, change: 1.88, changePercent: 0.48, dayHigh: 397.45, dayLow: 393.55, dayOpen: 394.32, previousClose: 393.34, rsi: 48.9, sma20: 393.55, sma50: 391.12, sma200: 388.45, volume: 18000000 },
  SPY: { currentPrice: 548.91, change: 2.45, changePercent: 0.45, dayHigh: 551.23, dayLow: 546.33, dayOpen: 547.15, previousClose: 546.46, rsi: 51.2, sma20: 546.33, sma50: 544.67, sma200: 541.89, volume: 25000000 },
};

console.log('\n=== SHALIMAR BACKEND ===');
console.log('Mode: Finnhub + FMP (with fallback)\n');

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

function calculateRSI(candles, period = 14) {
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

function calculateSMA(candles, period) {
  if (!candles || candles.length < period) return candles && candles[0] ? candles[0].close : 0;
  const closes = candles.map((c) => c.close).slice(0, period);
  return closes.reduce((a, b) => a + b, 0) / period;
}

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Backend running',
    mode: 'Fallback enabled',
    cache: { size: cache.size, keys: Array.from(cache.keys()) },
  });
});

app.get('/api/stocks', (req, res) => {
  res.json({ stocks: STOCKS, total: STOCKS.length });
});

app.get('/api/candles/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const cacheKey = `analysis_${symbol}`;

    const cached = getFromCache(cacheKey);
    if (cached) {
      console.log(`[CACHE] HIT: ${symbol}`);
      return res.json({ symbol, analysis: cached, source: 'cache' });
    }

    console.log(`[API] Getting ${symbol}...`);

    try {
      // Try to get real data
      const quoteRes = await axios.get(`${FINNHUB_URL}/quote`, {
        params: { symbol, token: FINNHUB_API_KEY },
        timeout: 5000,
      });

      const candleRes = await axios.get(
        `${FMP_URL}/historical-price-full/${symbol}`,
        {
          params: { apikey: FMP_API_KEY },
          timeout: 5000,
        }
      );

      if (!candleRes.data.historical || candleRes.data.historical.length === 0) {
        throw new Error('No candles');
      }

      const candles = candleRes.data.historical.map((c) => ({
        close: parseFloat(c.close),
        open: parseFloat(c.open),
        high: parseFloat(c.high),
        low: parseFloat(c.low),
        volume: parseInt(c.volume),
      }));

      const sma20 = calculateSMA(candles, 20);
      const sma50 = calculateSMA(candles, 50);
      const sma200 = calculateSMA(candles, 200);
      const rsi = calculateRSI(candles, 14);

      const analysis = {
        symbol,
        currentPrice: quoteRes.data.c,
        change: quoteRes.data.d,
        changePercent: quoteRes.data.dp,
        dayHigh: quoteRes.data.h,
        dayLow: quoteRes.data.l,
        dayOpen: quoteRes.data.o,
        previousClose: quoteRes.data.pc,
        rsi: parseFloat(rsi.toFixed(2)),
        sma20: parseFloat(sma20.toFixed(2)),
        sma50: parseFloat(sma50.toFixed(2)),
        sma200: parseFloat(sma200.toFixed(2)),
        volume: candles[0].volume,
        lastUpdated: new Date().toISOString(),
      };

      setCache(cacheKey, analysis);
      res.json({ symbol, analysis, source: 'real' });
    } catch (apiError) {
      // Fallback to mock data
      console.log(`[FALLBACK] Using mock data for ${symbol}`);
      const mock = MOCK_DATA[symbol] || MOCK_DATA.NVDA;
      const analysis = {
        symbol,
        ...mock,
        lastUpdated: new Date().toISOString(),
      };
      setCache(cacheKey, analysis);
      res.json({ symbol, analysis, source: 'mock' });
    }
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
      const response = await axios.get(`${FINNHUB_URL}/quote`, {
        params: { symbol, token: FINNHUB_API_KEY },
        timeout: 5000,
      });

      const quote = {
        symbol,
        currentPrice: response.data.c,
        change: response.data.d,
        changePercent: response.data.dp,
        dayHigh: response.data.h,
        dayLow: response.data.l,
        dayOpen: response.data.o,
        previousClose: response.data.pc,
      };

      setCache(cacheKey, quote);
      res.json({ symbol, quote, source: 'real' });
    } catch {
      const mock = MOCK_DATA[symbol] || MOCK_DATA.NVDA;
      const quote = {
        symbol,
        currentPrice: mock.currentPrice,
        change: mock.change,
        changePercent: mock.changePercent,
        dayHigh: mock.dayHigh,
        dayLow: mock.dayLow,
        dayOpen: mock.dayOpen,
        previousClose: mock.previousClose,
      };
      setCache(cacheKey, quote);
      res.json({ symbol, quote, source: 'fallback' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/news/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const cacheKey = `news_${symbol}`;

    const cached = getFromCache(cacheKey);
    if (cached) return res.json({ symbol, news: cached, source: 'cache' });

    try {
      const response = await axios.get(`${FINNHUB_URL}/company-news`, {
        params: { symbol, token: FINNHUB_API_KEY, limit: 10 },
        timeout: 5000,
      });

      const news = (response.data || []).map((article, idx) => ({
        id: `${symbol}-${idx}`,
        headline: article.headline,
        summary: article.summary,
        source: article.source,
        url: article.url,
      }));

      setCache(cacheKey, news);
      res.json({ symbol, news, source: 'real' });
    } catch {
      res.json({ symbol, news: [], source: 'fallback' });
    }
  } catch (error) {
    res.json({ symbol: req.params.symbol, news: [], error: error.message });
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
  console.log(`📊 Mode: Real data + Mock fallback\n`);
});
