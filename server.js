const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Body parsing
app.use(express.json({ limit: '5mb' }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiters
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Trop de tentatives, réessayez dans 1 minute' },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  message: { error: 'Trop de tentatives, réessayez dans 1 minute' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Routes
const authRoutes = require('./routes/auth');
const walletRoutes = require('./routes/wallets');
const transactionRoutes = require('./routes/transactions');
const recurringRoutes = require('./routes/recurring');
const budgetRoutes = require('./routes/budgets');
const goalRoutes = require('./routes/goals');

app.use('/api', authRoutes(loginLimiter, registerLimiter));
app.use('/api/wallets', walletRoutes);
app.use('/api/wallets', transactionRoutes);
app.use('/api/wallets', recurringRoutes);
app.use('/api/wallets', budgetRoutes);
app.use('/api/wallets', goalRoutes);

// Health check / keepalive
app.get('/api/ping', (req, res) => res.send('ok'));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Vault server running on http://localhost:${PORT}`);
});
