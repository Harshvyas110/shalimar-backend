const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const finnhubService = require('./services/finnhubService');

const STOCKS = ['NVDA', 'AAPL', 'TSLA', 'MSFT'];

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/stocks', (req, res) => {
  res.json({ stocks: STOCKS });
});

app.get('/api/candles/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    console.log(`[API] GET /api/candles/${symbol}`);
    
    const analysis = await finnhubService.getStockAnalysis(symbol);
    
    res.json({
      symbol: symbol,
      analysis: analysis,
      lastUpdate: new Date().toISOString()
    });
  } catch (error) {
    console.error(`[API] Error:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📊 Using Finnhub API for stock data`);
});
