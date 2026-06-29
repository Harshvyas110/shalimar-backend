const express = require('express');

module.exports = (cacheService, finnhubService) => {
  const router = express.Router();

  router.get('/:symbol', async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();

    console.log(`\n📊 [${symbol}] Request received`);

    try {
      // Check cache first
      const cached = await cacheService.getCandles(symbol);
      if (cached) {
        return res.json({
          symbol,
          candles: cached.candles,
          analysis: cached.analysis,
          fromCache: true,
          message: 'Served from cache (REAL 15-min data)',
        });
      }

      // Fetch REAL 15-min data from Finnhub
      console.log(`[${symbol}] Fetching REAL 15-min data from Finnhub...`);
      const candles = await finnhubService.get15MinCandles(symbol);

      // Calculate REAL analysis
      const analysis = finnhubService.getStockAnalysis(candles);

      // Cache it
      await cacheService.setCandles(symbol, { candles, analysis });

      res.json({
        symbol,
        candles,
        analysis,
        fromCache: false,
        message: 'REAL 15-min data from Finnhub',
      });

    } catch (error) {
      console.error(`[${symbol}] Error:`, error.message);
      res.status(500).json({
        error: error.message,
        symbol,
      });
    }
  });

  return router;
};