const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const hybridStockService = require('./services/hybridStockService');

const STOCKS = ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'AMD', 'AVGO', 'TSM'];

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Shalimar Backend is running',
    dataSource: 'Finnhub (quotes) + FMP (candles)',
    cacheInfo: hybridStockService.getCacheInfo(),
  });
});

/**
 * Get available stocks
 */
app.get('/api/stocks', (req, res) => {
  res.json({
    stocks: STOCKS,
    dataSource: 'Finnhub + FMP Hybrid',
  });
});

/**
 * Get complete stock analysis (quote + candles + indicators)
 * GET /api/candles/:symbol
 */
app.get('/api/candles/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    console.log(`\n[API] GET /api/candles/${symbol}`);

    const analysis = await hybridStockService.getStockAnalysis(symbol);

    res.json({
      symbol: symbol,
      analysis: analysis,
      lastUpdate: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[API] Error:`, error.message);
    res.status(500).json({
      error: error.message,
      symbol: req.params.symbol.toUpperCase(),
    });
  }
});

/**
 * Get real-time quote only (faster)
 * GET /api/quote/:symbol
 */
app.get('/api/quote/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    console.log(`[API] GET /api/quote/${symbol}`);

    const quote = await hybridStockService.getQuote(symbol);

    res.json({
      symbol: symbol,
      quote: quote,
    });
  } catch (error) {
    console.error(`[API] Error:`, error.message);
    res.status(500).json({
      error: error.message,
      symbol: req.params.symbol.toUpperCase(),
    });
  }
});

/**
 * Get company news
 * GET /api/news/:symbol
 */
app.get('/api/news/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    console.log(`[API] GET /api/news/${symbol}`);

    const news = await hybridStockService.getNews(symbol);

    res.json({
      symbol: symbol,
      news: news,
    });
  } catch (error) {
    console.error(`[API] Error:`, error.message);
    res.status(500).json({
      error: error.message,
      symbol: req.params.symbol.toUpperCase(),
    });
  }
});

/**
 * Get company profile
 * GET /api/profile/:symbol
 */
app.get('/api/profile/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    console.log(`[API] GET /api/profile/${symbol}`);

    const profile = await hybridStockService.getProfile(symbol);

    res.json({
      symbol: symbol,
      profile: profile,
    });
  } catch (error) {
    console.error(`[API] Error:`, error.message);
    res.status(500).json({
      error: error.message,
      symbol: req.params.symbol.toUpperCase(),
    });
  }
});

/**
 * Get cache info (for debugging)
 * GET /api/cache/info
 */
app.get('/api/cache/info', (req, res) => {
  res.json(hybridStockService.getCacheInfo());
});

/**
 * Clear cache (for manual reset)
 * POST /api/cache/clear
 */
app.post('/api/cache/clear', (req, res) => {
  hybridStockService.clearCache();
  res.json({
    message: 'Cache cleared',
    cacheInfo: hybridStockService.getCacheInfo(),
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✅ Server running on port ${PORT}`);
  console.log(`📊 Data Source: Finnhub (quotes/news) + FMP (candles)`);
  console.log(`🎯 Supported stocks: ${STOCKS.join(', ')}`);
  console.log(`⏱️  Cache TTL: 1 hour\n`);
});
