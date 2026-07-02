const axios = require('axios');

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || 'd929fb9r01qrfbe98gu0d929fb9r01qrfbe98gug';
const FINNHUB_URL = 'https://finnhub.io/api/v1';

class FinnhubService {
  constructor() {
    console.log('✅ FinnhubService initialized');
  }

  /**
   * Get real-time stock quote from Finnhub
   */
  async getQuote(symbol) {
    try {
      console.log(`[Finnhub] Fetching quote for ${symbol}...`);

      const response = await axios.get(`${FINNHUB_URL}/quote`, {
        params: {
          symbol: symbol.toUpperCase(),
          token: FINNHUB_API_KEY,
        },
        timeout: 10000,
      });

      const data = response.data;

      const quote = {
        symbol: symbol.toUpperCase(),
        currentPrice: data.c,
        dayHigh: data.h,
        dayLow: data.l,
        open: data.o,
        previousClose: data.pc,
        change: data.d,
        changePercent: data.dp,
        timestamp: Date.now(),
      };

      console.log(`[Finnhub] ✅ Quote for ${symbol}: $${quote.currentPrice}`);
      return quote;
    } catch (error) {
      console.error(`[Finnhub] ❌ Quote error for ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Get company news from Finnhub
   */
  async getNews(symbol) {
    try {
      console.log(`[Finnhub] Fetching news for ${symbol}...`);

      const response = await axios.get(`${FINNHUB_URL}/company-news`, {
        params: {
          symbol: symbol.toUpperCase(),
          token: FINNHUB_API_KEY,
          limit: 10,
        },
        timeout: 10000,
      });

      const articles = (response.data || []).map((article, idx) => ({
        id: `${symbol}-${idx}`,
        headline: article.headline,
        summary: article.summary,
        source: article.source,
        url: article.url,
        image: article.image,
        datetime: article.datetime,
        category: article.category,
      }));

      console.log(`[Finnhub] ✅ Got ${articles.length} news articles for ${symbol}`);
      return articles;
    } catch (error) {
      console.error(`[Finnhub] ❌ News error for ${symbol}:`, error.message);
      return []; // Return empty array instead of throwing
    }
  }

  /**
   * Get company profile from Finnhub
   */
  async getProfile(symbol) {
    try {
      console.log(`[Finnhub] Fetching profile for ${symbol}...`);

      const response = await axios.get(`${FINNHUB_URL}/stock/profile2`, {
        params: {
          symbol: symbol.toUpperCase(),
          token: FINNHUB_API_KEY,
        },
        timeout: 10000,
      });

      const profile = {
        symbol: response.data.ticker,
        name: response.data.name,
        exchange: response.data.exchange,
        industry: response.data.finnhubIndustry,
        marketCap: response.data.marketCapitalization,
        employees: response.data.employees,
        ipo: response.data.ipo,
        logo: response.data.logo,
        website: response.data.website,
      };

      console.log(`[Finnhub] ✅ Profile for ${symbol}: ${profile.name}`);
      return profile;
    } catch (error) {
      console.error(`[Finnhub] ❌ Profile error for ${symbol}:`, error.message);
      throw error;
    }
  }
}

module.exports = new FinnhubService();
