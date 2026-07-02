const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const FINNHUB_API_KEY = 'd929fb9r01qrfbe98gu0d929fb9r01qrfbe98gug';
const AV_API_KEY = 'BS14B59F0QPYKZJY';
const FINNHUB_URL = 'https://finnhub.io/api/v1';
const AV_URL = 'https://www.alphavantage.co/query';

const STOCKS = ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'AMD', 'AVGO', 'TSM'];
const CACHE_TTL = 3600000;
const cache = new Map();

// Rate limit tracking - INCREASED to 15 seconds (safer)
const MIN_REQUEST_DELAY = 15000; // 15 seconds = 4 req/min (safer than 5)
let lastAVRequestTime = 0;

const MOCK_DATA = {
  NVDA: { currentPrice: 200.09, change: 1.23, changePercent: 0.62, dayHigh: 205.12, dayLow: 195.45, dayOpen: 197.32, previousClose: 198.54, rsi: 45.24, sma20: 205.74, sma50: 209.99, sma200: 197.58, volume: 50000000 },
  AAPL: { currentPrice: 302.84, change: 2.15, changePercent: 0.95, dayHigh: 305.45, dayLow: 300.12, dayOpen: 301.32, previousClose: 300.69, rsi: 52.5, sma20: 300.43, sma50: 295.15, sma200: 290.67, volume: 45000000 },
  TSLA: { currentPrice: 413.06, change: 3.12, changePercent: 1.29, dayHigh: 416.99, dayLow: 410.15, dayOpen: 411.15, previousClose: 409.94, rsi: 48.7, sma20: 410.15, sma50: 407.90, sma200: 404.43, volume: 35000000 },
  MSFT: { currentPrice: 386.52, change: 2.45, changePercent: 0.64, dayHigh: 389.45, dayLow: 383.12, dayOpen: 384.32, previousClose: 384.22, rsi: 51.2, sma20: 383.45, sma50: 381.90, sma200: 378.32, volume: 28000000 },
  AMD: { currentPrice: 168.45, change: 1.23, changePercent: 0.74, dayHigh: 170.12, dayLow: 165.32, dayOpen: 166.15, previousClose: 167.22, rsi: 49.3, sma20: 165.32, sma50: 162.15, sma200: 158.90, volume: 32000000 },
  AVGO: { currentPrice: 189.23, change: 0.98, changePercent: 0.52, dayHigh: 191.45, dayLow: 186.55, dayOpen: 187.32, previousClose: 188.25, rsi: 50.1, sma20: 186.55, sma50: 184.32, sma200: 181.67, volume: 15000000 },
  TSM: { currentPrice: 121.56, change: 0.75, changePercent: 0.62, dayHigh: 123.12, dayLow: 119.43, dayOpen: 120.15, previousClose: 120.81, rsi: 48.9, sma20: 119.43, sma50: 117.32, sma200: 115.67, volume: 22000000 },
  QQQ: { currentPrice: 729.95, change: 2.15, changePercent: 0.30, dayHigh: 732.45, dayLow: 725.42, dayOpen: 726.32, previousClose: 727.60, rsi: 52.3, sma20: 725.42, sma50: 720.88, sma200: 715.21, volume: 15000000 },
  DIA: { currentPrice: 526.35, change: 1.88, changePercent: 0.36, dayHigh: 528.45, dayLow: 523.55, dayOpen: 524.32, previousClose: 524.47, rsi: 48.9, sma20: 523.55, sma50: 521.12, sma200: 518.45, volume: 18000000 },
  SPY: { currentPrice: 750.77, change: 2.45, changePercent: 0.33, dayHigh: 753.23, dayLow: 746.33, dayOpen: 747.15, previousClose: 748.32, rsi: 51.2, sma20: 746.33, sma50: 744.67, sma200: 741.89, volume: 25000000 },
};

console.log('\n=== SHALIMAR BACKEND ===');
console.log('Source: Finnhub (quotes) + Alpha Vantage (candles)');
console.log('Mode: IMPROVED Rate Limiting (15 sec delays)\n');

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

// Rate-limited Alpha Vantage call
async function callAlphaVantageWithRateLimit(symbol) {
  const now = Date.now();
  const timeSinceLastRequest = now - lastAVRequestTime;
  
  if (timeSinceLastRequest < MIN_REQUEST_DELAY) {
    const waitTime = MIN_REQUEST_DELAY - timeSinceLastRequest;
    console.log(`[RateLimit] Waiting ${Math.ceil(waitTime/1000)}s before Alpha Vantage call for ${symbol}...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastAVRequestTime = Date.now();
  
  const response = await axios.get(AV_URL, {
    params: {
      function: 'TIME_SERIES_DAILY',
      symbol: symbol,
      apikey: AV_API_KEY,
    },
    timeout: 15000,
  });
  
  return response;
}

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Backend running',
    source: 'Finnhub + Alpha Vantage (15s rate limiting)',
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
      // Get real-time quote from Finnhub
      const quoteRes = await axios.get(`${FINNHUB_URL}/quote`, {
        params: { symbol, token: FINNHUB_API_KEY },
        timeout: 8000,
      });

      console.log(`[Finnhub] ✅ Quote for ${symbol}: $${quoteRes.data.c}`);

      // Get historical candles from Alpha Vantage (with rate limiting)
      const candleRes = await callAlphaVantageWithRateLimit(symbol);

      if (!candleRes.data['Time Series (Daily)']) {
        throw new Error('No candles from Alpha Vantage');
      }

      const timeSeries = candleRes.data['Time Series (Daily)'];
      const candles = [];

      for (const date in timeSeries) {
        const candle = timeSeries[date];
        candles.push({
          date: date,
          close: parseFloat(candle['4. close']),
          open: parseFloat(candle['1. open']),
          high: parseFloat(candle['2. high']),
          low: parseFloat(candle['3. low']),
          volume: parseInt(candle['5. volume']),
        });
      }

      console.log(`[AlphaVantage] ✅ Got ${candles.length} candles for ${symbol}`);

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
      console.log(`[FALLBACK] Using mock data for ${symbol}: ${apiError.message}`);
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
        timeout: 8000,
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
        timeout: 8000,
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
  lastAVRequestTime = 0;
  res.json({ message: 'Cache cleared' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📊 Finnhub + Alpha Vantage (15s rate limiting)\n`);
});
