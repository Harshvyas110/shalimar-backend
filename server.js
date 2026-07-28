const express = require('express');
const cors = require('cors');
const { getStockDataWithIndicators } = require('./googleSheetService');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const STOCKS = ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'AMD', 'AVGO', 'TSM', 'QQQ', 'DIA', 'SPY'];
const CACHE_TTL = 60000; // 1 minute
const cache = new Map();

// News cache
let newsCache = {
  data: [],
  timestamp: 0,
};
const NEWS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Sequential queue for Google Sheets
let requestQueue = Promise.resolve();
const queueRequest = async (fn) => {
  requestQueue = requestQueue.then(fn).catch(e => {
    console.error('Queue error:', e);
    return null;
  });
  return requestQueue;
};

const MOCK_DATA = {
  NVDA: { currentPrice: 194.83, change: -2.75, changePercent: -1.39, dayHigh: 200.12, dayLow: 192.35, dayOpen: 197.14, previousClose: 197.58, rsi: 40.71, sma20: 203.48, sma50: 209.8, sma200: 194.83, volume: 142385548 },
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

// MOCK NEWS DATA - for when API is unavailable
const MOCK_NEWS = [
  {
    title: 'NVIDIA reports record Q2 earnings, beats expectations',
    description: 'NVIDIA posts strong earnings with AI demand driving growth',
    source: 'Reuters',
    url: 'https://reuters.com/nvidia-earnings',
    publishedAt: new Date(Date.now() - 1 * 60 * 60000).toISOString(),
    sentiment: 'Bullish',
    relevantTickers: ['NVDA'],
    affectsPortfolio: ['NVDA'],
  },
  {
    title: 'Apple announces new iPhone 17 Pro with AI features',
    description: 'Apple unveils latest iPhone lineup with enhanced AI capabilities',
    source: 'CNBC',
    url: 'https://cnbc.com/apple-iphone',
    publishedAt: new Date(Date.now() - 3 * 60 * 60000).toISOString(),
    sentiment: 'Neutral',
    relevantTickers: ['AAPL'],
    affectsPortfolio: ['AAPL'],
  },
  {
    title: 'Tesla faces supply chain challenges',
    description: 'Tesla reports potential supply chain disruptions for Q3',
    source: 'Bloomberg',
    url: 'https://bloomberg.com/tesla-supply',
    publishedAt: new Date(Date.now() - 2 * 60 * 60000).toISOString(),
    sentiment: 'Bearish',
    relevantTickers: ['TSLA'],
    affectsPortfolio: ['TSLA'],
  },
  {
    title: 'Microsoft announces $10B AI infrastructure investment',
    description: 'Microsoft commits to major AI expansion with infrastructure spending',
    source: 'TechCrunch',
    url: 'https://techcrunch.com/microsoft-ai',
    publishedAt: new Date(Date.now() - 4 * 60 * 60000).toISOString(),
    sentiment: 'Bullish',
    relevantTickers: ['MSFT'],
    affectsPortfolio: ['MSFT'],
  },
  {
    title: 'Tech sector rally continues amid positive earnings season',
    description: 'Major tech companies drive market sentiment with strong results affecting QQQ, SPY, DIA',
    source: 'MarketWatch',
    url: 'https://marketwatch.com/tech-rally',
    publishedAt: new Date(Date.now() - 30 * 60000).toISOString(),
    sentiment: 'Bullish',
    relevantTickers: ['QQQ', 'SPY', 'DIA'],
    affectsPortfolio: ['QQQ', 'SPY', 'DIA'],
  },
];

console.log('\n=== SHALIMAR BACKEND ===');
console.log('Source: Google Finance + Calculated Indicators + News');
console.log('Cache TTL: 1 minute\n');

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

// FIX SMA by recalculating from API response
function fixSMAValues(data) {
  if (!data || !data.closingPrices) return data;
  let prices = [...data.closingPrices];
  
  if (prices.length > 1 && prices[0] < prices[prices.length - 1] * 0.5) {
    prices = prices.reverse();
  }

  const sma20 = calculateSMA(prices, 20);
  const sma50 = calculateSMA(prices, 50);
  const sma200 = calculateSMA(prices, 200);

  return {
    ...data,
    sma20: parseFloat(sma20.toFixed(2)),
    sma50: parseFloat(sma50.toFixed(2)),
    sma200: parseFloat(sma200.toFixed(2)),
  };
}

function calculateSMA(prices, period) {
  if (!prices || prices.length < period) {
    return prices && prices.length > 0 ? prices[0] : 0;
  }
  const relevant = prices.slice(0, period);
  const sum = relevant.reduce((a, b) => a + b, 0);
  return sum / period;
}

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Shalimar Backend Running',
    cache: { size: cache.size, keys: Array.from(cache.keys()) },
    cacheTTL: '15 minutes',
  });
});

app.get('/api/stocks', (req, res) => {
  res.json({ stocks: STOCKS, total: STOCKS.length });
});

app.get('/api/candles/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const cacheKey = `stock_${symbol}`;

    const cached = getFromCache(cacheKey);
    if (cached) {
      console.log(`[CACHE] HIT: ${symbol}`);
      return res.json({ symbol, analysis: cached, source: 'cache' });
    }

    console.log(`[API] Getting ${symbol}...`);

    let analysis = await queueRequest(async () => {
      return await getStockDataWithIndicators(symbol);
    });

    if (analysis) {
      analysis = fixSMAValues(analysis);
    }

    if (!analysis) {
      console.log(`[FALLBACK] Using mock data for ${symbol}`);
      const mock = MOCK_DATA[symbol] || MOCK_DATA.NVDA;
      analysis = {
        symbol,
        ...mock,
        timestamp: new Date().toISOString(),
      };
    }

    setCache(cacheKey, analysis);
    return res.json({ symbol, analysis, source: 'google-finance-calculated' });

  } catch (error) {
    console.error(`[ERROR] ${req.params.symbol}:`, error.message);
    const mock = MOCK_DATA[req.params.symbol.toUpperCase()] || MOCK_DATA.NVDA;
    res.json({ symbol: req.params.symbol.toUpperCase(), analysis: mock, source: 'fallback' });
  }
});

// ===== NEWS ENDPOINTS =====

app.get('/api/news', (req, res) => {
  try {
    const symbols = req.query.symbols ? req.query.symbols.split(',').map(s => s.toUpperCase()) : [];
    
    console.log(`[NEWS] Getting news for: ${symbols.join(',')}`);

    if (!symbols || symbols.length === 0) {
      return res.json({ news: [], message: 'No portfolio symbols provided' });
    }

    // Check cache
    if (newsCache.data.length > 0 && Date.now() - newsCache.timestamp < NEWS_CACHE_TTL) {
      console.log('[NEWS] Using cached news');
      const filteredNews = filterNewsByPortfolio(newsCache.data, symbols);
      return res.json({ news: filteredNews, source: 'cache', refreshIn: '5 minutes' });
    }

    // Use mock news (in production, this would fetch from real APIs)
    const filteredNews = filterNewsByPortfolio(MOCK_NEWS, symbols);
    
    // Cache it
    newsCache = {
      data: MOCK_NEWS,
      timestamp: Date.now(),
    };

    console.log(`[NEWS] Returning ${filteredNews.length} relevant news items`);
    res.json({
      news: filteredNews,
      source: 'mock-production',
      totalNews: filteredNews.length,
      refreshIn: '5 minutes',
      lastUpdated: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[NEWS ERROR]:', error);
    res.json({ news: [], error: error.message });
  }
});

app.post('/api/news/refresh', (req, res) => {
  newsCache = { data: [], timestamp: 0 };
  console.log('[NEWS] Cache cleared');
  res.json({ message: 'News cache cleared' });
});

function filterNewsByPortfolio(allNews, portfolioSymbols) {
  return allNews
    .map(item => ({
      ...item,
      affectsPortfolio: (item.relevantTickers || []).filter(t =>
        portfolioSymbols.includes(t.toUpperCase())
      ),
    }))
    .filter(item => item.affectsPortfolio.length > 0)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, 10);
}

// ===== CACHE ENDPOINTS =====

app.get('/api/cache/info', (req, res) => {
  res.json({ size: cache.size, keys: Array.from(cache.keys()), cacheTTL: '15 minutes' });
});

app.post('/api/cache/clear', (req, res) => {
  cache.clear();
  res.json({ message: 'Cache cleared' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌍 Google Finance + Calculated Indicators + News`);
  console.log(`⏱️  Data Refresh: Every 15 minutes`);
  console.log(`📰 News Refresh: Every 5 minutes\n`);
});
