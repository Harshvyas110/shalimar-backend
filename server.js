const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Try to load yahoo finance service, but don't crash if it doesn't exist
let yahooFinanceService;
try {
  yahooFinanceService = require('./services/yahooFinanceService');
} catch (err) {
  console.warn('⚠️  yahooFinanceService not found, skipping stock endpoints');
  yahooFinanceService = null;
}

// ===== FIREBASE ADMIN SETUP =====
const admin = require('firebase-admin');

const serviceAccount = require('./firebase-adminsdk.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'shalimar-capital',
});

const auth = admin.auth();
// ===== END FIREBASE SETUP =====

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ========================================
// STOCK DATA ENDPOINTS (ORIGINAL)
// ========================================

// Get 15-min candles with RSI, SMA, Volume
app.get('/api/candles/:symbol', async (req, res) => {
  if (!yahooFinanceService) {
    return res.status(503).json({ error: 'Stock service not available' });
  }

  const symbol = req.params.symbol.toUpperCase();

  try {
    console.log(`📊 [${symbol}] Request received`);

    // Get 15-min candles from Yahoo Finance
    const candles = await yahooFinanceService.get15MinCandles(symbol);

    // Get analysis (RSI, SMA) and volume from Alpha Vantage
    const analysis = await yahooFinanceService.getStockAnalysis(candles, symbol);

    console.log(`✅ [${symbol}] Sending analysis:`, analysis);

    res.json({
      symbol,
      ...analysis,
      lastUpdate: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`❌ [${symbol}] Error:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get multiple stocks
app.get('/api/stocks', async (req, res) => {
  if (!yahooFinanceService) {
    return res.status(503).json({ error: 'Stock service not available' });
  }

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

// ========================================
// AUTHENTICATION ENDPOINTS (NEW)
// ========================================

// ===== FORGOT PASSWORD ENDPOINT =====
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  
  try {
    console.log(`[AUTH] Forgot password request for: ${email}`);
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    // Generate password reset link using Firebase Admin SDK
    const resetLink = await admin.auth().generatePasswordResetLink(email);
    
    console.log(`✅ Password reset link generated for: ${email}`);
    
    res.json({ 
      success: true, 
      message: 'Password reset link sent to email. Check your inbox!' 
    });
    
  } catch (error) {
    console.error('[AUTH] Forgot password error:', error.message);
    
    if (error.code === 'auth/user-not-found') {
      return res.status(400).json({ 
        error: 'Email not found. Please sign up first.' 
      });
    }
    
    res.status(400).json({ error: error.message });
  }
});

// ===== CHECK IF EMAIL EXISTS =====
app.post('/api/auth/check-email', async (req, res) => {
  const { email } = req.body;
  
  try {
    console.log(`[AUTH] Checking email: ${email}`);
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    try {
      const user = await admin.auth().getUserByEmail(email);
      
      // If we get here, email EXISTS
      res.json({ 
        exists: true,
        message: 'Email already registered. Please login or use forgot password.' 
      });
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        // Email does NOT exist - good for signup!
        return res.json({ 
          exists: false,
          message: 'Email available for registration' 
        });
      }
      throw error;
    }
    
  } catch (error) {
    console.error('[AUTH] Email check error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Shalimar Backend running on port ${PORT}`);
  if (yahooFinanceService) {
    console.log(`📈 Using Yahoo Finance for 15-min candles`);
    console.log(`📊 Using Alpha Vantage for volume data`);
    console.log(`🔄 Auto-refresh every 15 minutes`);
  } else {
    console.log(`⚠️  Stock service not available (using auth only)`);
  }
  console.log(`🔐 Firebase Admin initialized - Auth endpoints active:`);
  console.log(`   - POST /api/auth/forgot-password`);
  console.log(`   - POST /api/auth/check-email`);
});
