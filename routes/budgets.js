const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireWalletAccess } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/wallets/:id/budgets
router.get('/:id/budgets', requireWalletAccess, (req, res) => {
  const rows = db.prepare('SELECT category, limit_amount FROM budgets WHERE wallet_id = ?').all(req.walletId);
  const obj = {};
  rows.forEach(r => obj[r.category] = r.limit_amount);
  res.json(obj);
});

// PUT /api/wallets/:id/budgets
router.put('/:id/budgets', requireWalletAccess, (req, res) => {
  const budgets = req.body; // { category: limit, ... }
  if (!budgets || typeof budgets !== 'object') {
    return res.status(400).json({ error: 'Données invalides' });
  }

  const update = db.transaction(() => {
    db.prepare('DELETE FROM budgets WHERE wallet_id = ?').run(req.walletId);
    const stmt = db.prepare('INSERT INTO budgets (wallet_id, category, limit_amount) VALUES (?, ?, ?)');
    for (const [cat, limit] of Object.entries(budgets)) {
      if (limit > 0) stmt.run(req.walletId, cat, limit);
    }
  });
  update();
  res.json({ ok: true });
});

module.exports = router;
