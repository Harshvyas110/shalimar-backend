const express = require('express');
const cors = require('cors');
require('dotenv').config();

const yahooFinanceService = require('./services/yahooFinanceService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Get 15-min candles with RSI, SMA, Volume
app.get('/api/candles/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();

  try {
    console.log(`📊 [${symbol}] Request received`);

    // Get 15-min candles from Yahoo Finance
    const candles = await yahooFinanceService.get15MinCandles(symbol);

    // Get analysis (RSI, SMA) and daily volume
    const analysis = await yahooFinanceService.getStockAnalysis(candles, symbol);

    console.log(`✅ [${symbol}] Sending analysis:`, analysis);

    res.json({
  symbol,
  analysis,  // ← Nest it under 'analysis' key
  lastUpdate: new Date().toISOString(),
});
  } catch (error) {
    console.error(`❌ [${symbol}] Error:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get multiple stocks
app.get('/api/stocks', async (req, res) => {
  const symbols = ['NVDA', 'AAPL', 'TSLA', 'MSFT'];

  try {
    const results = {};

    for (const symbol of symbols) {
      try {
        const candles = await yahooFinanceService.get15MinCandles(symbol);
        const analysis = await yahooFinanceService.getStockAnalysis(candles, symbol);
        results[symbol] = analysis;
        
        // Rate limit to avoid API throttling
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (err) {
        console.error(`Error fetching ${symbol}:`, err.message);
        results[symbol] = { error: err.message };
      }
    }

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Shalimar Backend running on port ${PORT}`);
  console.log(`📈 Using Yahoo Finance for 15-min candles + daily volume`);
  console.log(`🔄 Auto-refresh every 15 minutes`);
  console.log(`✅ Ready to serve trading data!`);
});
