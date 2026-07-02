const axios = require('axios');

const FINNHUB_API_KEY = 'd929fb9r01qrfbe98gu0d929fb9r01qrfbe98gug';
const FMP_API_KEY = 'A8XCCHUl5cGroCXXvf9gQxpZewiRnVN0';
const FINNHUB_URL = 'https://finnhub.io/api/v1';
const FMP_URL = 'https://financialmodelingprep.com/api/v3';

const CACHE_TTL = 3600000;
const cache = new Map();

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

class StockService {
  constructor() {
    console.log('[StockService] Initialized (Finnhub + FMP, All-in-One)');
  }

  async getStockAnalysis(symbol) {
    const cacheKey = `analysis_${symbol}`;
    const cached = getFromCache(cacheKey);
    if (cached) {
      console.log(`[CACHE] HIT: ${symbol}`);
      return cached;
    }

    console.log(`[StockService] Getting ${symbol}...`);

    try {
      // Get real-time quote from Finnhub
      const quoteResponse = await axios.get(`${FINNHUB_URL}/quote`, {
        params: { symbol: symbol.toUpperCase(), token: FINNHUB_API_KEY },
        timeout: 10000,
      });

      const quote = quoteResponse.data;

      // Get historical candles from FMP
      const candleResponse = await axios.get(
        `${FMP_URL}/historical-price-full/${symbol.toUpperCase()}`,
        {
          params: { apikey: FMP_API_KEY },
          timeout: 15000,
        }
      );

      if (!candleResponse.data.historical || candleResponse.data.historical.length === 0) {
        throw new Error('No candles');
      }

      const candles = candleResponse.data.historical.map((c) => ({
        close: parseFloat(c.close),
        open: parseFloat(c.open),
        high: parseFloat(c.high),
        low: parseFloat(c.low),
        volume: parseInt(c.volume),
      }));

      // Calculate indicators
      const sma20 = calculateSMA(candles, 20);
      const sma50 = calculateSMA(candles, 50);
      const sma200 = calculateSMA(candles, 200);
      const rsi = calculateRSI(candles, 14);

      const analysis = {
        symbol: symbol.toUpperCase(),
        currentPrice: quote.c,
        change: quote.d,
        changePercent: quote.dp,
        dayHigh: quote.h,
        dayLow: quote.l,
        dayOpen: quote.o,
        previousClose: quote.pc,
        rsi: parseFloat(rsi.toFixed(2)),
        sma20: parseFloat(sma20.toFixed(2)),
        sma50: parseFloat(sma50.toFixed(2)),
        sma200: parseFloat(sma200.toFixed(2)),
        volume: candles[0].volume,
        lastUpdated: new Date().toISOString(),
      };

      setCache(cacheKey, analysis);
      console.log(`[StockService] ✅ ${symbol}: $${analysis.currentPrice}`);
      return analysis;
    } catch (error) {
      console.error(`[StockService] ❌ Error for ${symbol}:`, error.message);
      throw error;
    }
  }

  async getQuote(symbol) {
    const cacheKey = `quote_${symbol}`;
    const cached = getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(`${FINNHUB_URL}/quote`, {
        params: { symbol: symbol.toUpperCase(), token: FINNHUB_API_KEY },
        timeout: 10000,
      });

      const quote = {
        symbol: symbol.toUpperCase(),
        currentPrice: response.data.c,
        change: response.data.d,
        changePercent: response.data.dp,
        dayHigh: response.data.h,
        dayLow: response.data.l,
        dayOpen: response.data.o,
        previousClose: response.data.pc,
      };

      setCache(cacheKey, quote);
      return quote;
    } catch (error) {
      throw error;
    }
  }

  async getNews(symbol) {
    const cacheKey = `news_${symbol}`;
    const cached = getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(`${FINNHUB_URL}/company-news`, {
        params: { symbol: symbol.toUpperCase(), token: FINNHUB_API_KEY, limit: 10 },
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
      return news;
    } catch (error) {
      return [];
    }
  }

  getCacheInfo() {
    return { size: cache.size, keys: Array.from(cache.keys()) };
  }

  clearCache() {
    cache.clear();
  }
}

module.exports = new StockService();
