const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const avService = require('./services/alphavantageService');

const STOCKS = ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'AMD', 'AVGO', 'TSM'];
const INDICES = ['QQQ', 'DIA', 'SPY'];

// Mock index data (since Alpha Vantage doesn't support ETFs)
const mockIndexData = {
  QQQ: {
    currentPrice: 418.75,
    rsi: 52.3,
    sma20: 415.42,
    sma50: 410.88,
    sma200: 405.21,
    volume: 15000000,
  },
  DIA: {
    currentPrice: 395.22,
    rsi: 48.9,
    sma20: 393.55,
    sma50: 391.12,
    sma200: 388.45,
    volume: 18000000,
  },
  SPY: {
    currentPrice: 548.91,
    rsi: 51.2,
    sma20: 546.33,
    sma50: 544.67,
    sma200: 541.89,
    volume: 25000000,
  },
};

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Shalimar Backend is running',
    cacheInfo: avService.getCacheInfo(),
  });
});

/**
 * Get all available stocks
 */
app.get('/api/stocks', (req, res) => {
  res.json({
    stocks: STOCKS,
    indices: INDICES,
    cacheInfo: avService.getCacheInfo(),
  });
});

/**
 * Get candle data and analysis for a symbol
 * Supports both stocks and indices
 */
app.get('/api/candles/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    console.log(`\n[API] GET /api/candles/${symbol}`);

    // Handle indices with mock data
    if (INDICES.includes(symbol)) {
      console.log(`[${symbol}] Using mock index data`);
      return res.json({
        symbol: symbol,
        analysis: mockIndexData[symbol],
        source: 'mock',
        lastUpdate: new Date().toISOString(),
        message: 'Index data (mock - Alpha Vantage does not support ETFs)',
      });
    }

    // Handle stocks with real Alpha Vantage data
    if (!STOCKS.includes(symbol) && symbol !== 'NVDA' && symbol !== 'AAPL' && symbol !== 'TSLA' && symbol !== 'MSFT') {
      console.log(`[${symbol}] Symbol not in whitelist, but attempting to fetch...`);
    }

    const analysis = await avService.getStockAnalysis(symbol);

    res.json({
      symbol: symbol,
      analysis: analysis,
      source: 'alpha-vantage',
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
 * Get cache info (for debugging)
 */
app.get('/api/cache/info', (req, res) => {
  res.json(avService.getCacheInfo());
});

/**
 * Clear cache (for manual reset)
 */
app.post('/api/cache/clear', (req, res) => {
  avService.clearAllCache();
  res.json({
    message: 'Cache cleared',
    cacheInfo: avService.getCacheInfo(),
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✅ Server running on port ${PORT}`);
  console.log(`📊 Using Alpha Vantage API with intelligent caching`);
  console.log(`🎯 Supported stocks: ${STOCKS.join(', ')}`);
  console.log(`📈 Mock indices: ${INDICES.join(', ')}`);
  console.log(`⏱️  Cache TTL: 1 hour\n`);
});
