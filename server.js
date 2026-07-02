const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const stockService = require('./services/stockService');

const STOCKS = ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'AMD', 'AVGO', 'TSM'];

console.log('\n=== SHALIMAR BACKEND ===');
console.log('Source: Finnhub (quotes) + FMP (candles)');
console.log('========================\n');

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Backend running',
    source: 'Finnhub + FMP',
    cache: stockService.getCacheInfo(),
  });
});

app.get('/api/stocks', (req, res) => {
  res.json({ stocks: STOCKS, total: STOCKS.length });
});

app.get('/api/candles/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const analysis = await stockService.getStockAnalysis(symbol);
    res.json({ symbol, analysis });
  } catch (error) {
    res.status(500).json({ error: error.message, symbol: req.params.symbol });
  }
});

app.get('/api/quote/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const quote = await stockService.getQuote(symbol);
    res.json({ symbol, quote });
  } catch (error) {
    res.status(500).json({ error: error.message, symbol: req.params.symbol });
  }
});

app.get('/api/news/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const news = await stockService.getNews(symbol);
    res.json({ symbol, news });
  } catch (error) {
    res.status(500).json({ error: error.message, symbol: req.params.symbol });
  }
});

app.get('/api/cache/info', (req, res) => {
  res.json(stockService.getCacheInfo());
});

app.post('/api/cache/clear', (req, res) => {
  stockService.clearCache();
  res.json({ message: 'Cache cleared' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📊 Ready to accept requests\n`);
});
