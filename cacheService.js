module.exports = (redisClient) => {
  const CACHE_TTL = 300; // 5 minutes

  return {
    async getCandles(symbol) {
      try {
        const cached = await redisClient.get(`candles:${symbol}`);
        if (cached) {
          console.log(`[${symbol}] ✅ Cache HIT`);
          return JSON.parse(cached);
        }
        console.log(`[${symbol}] ❌ Cache MISS - Fetching fresh`);
        return null;
      } catch (error) {
        console.warn(`Cache error for ${symbol}:`, error.message);
        return null;
      }
    },

    async setCandles(symbol, candles) {
      try {
        await redisClient.setEx(
          `candles:${symbol}`,
          CACHE_TTL,
          JSON.stringify(candles)
        );
        console.log(`[${symbol}] 💾 Cached for ${CACHE_TTL}s`);
      } catch (error) {
        console.warn(`Cache set error for ${symbol}:`, error.message);
      }
    },
  };
};