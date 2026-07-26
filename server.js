const express = require('express');
const cors = require('cors');
require('dotenv').config();

const yahooFinanceService = require('./services/yahooFinanceService');

// ===== FIREBASE ADMIN SETUP =====
const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('./firebase-adminsdk.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'shalimar-capital',
});

const auth = admin.auth();
const db = admin.firestore();
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
// STOCK DATA ENDPOINTS (YOUR ORIGINAL CODE)
// ========================================

// Get 15-min candles with RSI, SMA, Volume
app.get('/api/candles/:symbol', async (req, res) => {
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
    
    // Send password reset email via Firebase
    await auth.sendPasswordResetEmail(email);
    
    res.json({ 
      success: true, 
      message: 'Password reset link sent to email. Check your inbox!' 
    });
    
  } catch (error) {
    console.error('[AUTH] Forgot password error:', error);
    
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
    
    // Try to get user by email
    const user = await auth.getUserByEmail(email);
    
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
    
    console.error('[AUTH] Email check error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Shalimar Backend running on port ${PORT}`);
  console.log(`📈 Stock data endpoints active:`);
  console.log(`   - GET /api/candles/:symbol`);
  console.log(`   - GET /api/stocks`);
  console.log(`🔐 Firebase Admin initialized - Auth enabled:`);
  console.log(`   - POST /api/auth/forgot-password`);
  console.log(`   - POST /api/auth/check-email`);
});
