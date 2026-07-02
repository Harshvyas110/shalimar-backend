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

console.log('\n=== SHALIMAR BACKEND ===');
console.log('All-in-one mode');
console.log('Finnhub + FMP\n');

// CACHE FUNCTIONS
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

// RSI CALCULATION
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

// SMA CALCULATION
function calculateSMA(candles, period) {
  if (!candles || candles.length < period) return candles && candles[0] ? candles[0].close : 0;
  const closes = candles.map((c) => c.close).slice(0, period);
  return closes.reduce((a, b) => a + b, 0) / period;
}

// ENDPOINTS

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Backend running',
    source: 'Finnhub + FMP',
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
      return res.json({ symbol, analysis: cached });
    }

    console.log(`[API] Getting ${symbol}...`);

    // Get real-time quote from Finnhub
    const quoteRes = await axios.get(`${FINNHUB_URL}/quote`, {
      params: { symbol, token: FINNHUB_API_KEY },
      timeout: 10000,
    });

    // Get historical candles from FMP
    const candleRes = await axios.get(
      `${FMP_URL}/historical-price-full/${symbol}`,
      {
        params: { apikey: FMP_API_KEY },
        timeout: 15000,
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
    res.json({ symbol, analysis });
  } catch (error) {
    console.error(`[ERROR] ${req.params.symbol}:`, error.message);
    res.status(500).json({ error: error.message, symbol: req.params.symbol });
  }
});

app.get('/api/quote/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const cacheKey = `quote_${symbol}`;

    const cached = getFromCache(cacheKey);
    if (cached) return res.json({ symbol, quote: cached });

    const response = await axios.get(`${FINNHUB_URL}/quote`, {
      params: { symbol, token: FINNHUB_API_KEY },
      timeout: 10000,
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
    res.json({ symbol, quote });
  } catch (error) {
    res.status(500).json({ error: error.message, symbol: req.params.symbol });
  }
});

app.get('/api/news/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const cacheKey = `news_${symbol}`;

    const cached = getFromCache(cacheKey);
    if (cached) return res.json({ symbol, news: cached });

    const response = await axios.get(`${FINNHUB_URL}/company-news`, {
      params: { symbol, token: FINNHUB_API_KEY, limit: 10 },
      timeout: 10000,
    });

    const news = (response.data || []).map((article, idx) => ({
      id: `${symbol}-${idx}`,
      headline: article.headline,
      summary: article.summary,
      source: article.source,
      url: article.url,
      image: article.image,
      datetime: article.datetime,
    }));

    setCache(cacheKey, news);
    res.json({ symbol, news });
  } catch (error) {
    res.status(500).json({ error: error.message, symbol: req.params.symbol });
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
  console.log(`📊 Ready\n`);
});
