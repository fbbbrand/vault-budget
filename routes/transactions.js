const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireWalletAccess } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/wallets/:id/transactions
router.get('/:id/transactions', requireWalletAccess, (req, res) => {
  const { month, type, category, search } = req.query;
  let sql = 'SELECT * FROM transactions WHERE wallet_id = ?';
  const params = [req.walletId];

  if (month) {
    sql += ' AND substr(date, 1, 7) = ?';
    params.push(month);
  }
  if (type && type !== 'all') {
    sql += ' AND type = ?';
    params.push(type);
  }
  if (category && category !== 'all') {
    sql += ' AND category = ?';
    params.push(category);
  }
  if (search) {
    sql += ' AND name LIKE ?';
    params.push('%' + search + '%');
  }
  sql += ' ORDER BY date DESC, id DESC';

  res.json(db.prepare(sql).all(...params));
});

// POST /api/wallets/:id/transactions
router.post('/:id/transactions', requireWalletAccess, (req, res) => {
  const { name, amount, type, category, date } = req.body;
  if (!name || !amount || !type || !category || !date) {
    return res.status(400).json({ error: 'Tous les champs sont requis' });
  }
  if (!['income', 'expense'].includes(type)) {
    return res.status(400).json({ error: 'Type invalide' });
  }
  const result = db.prepare(
    'INSERT INTO transactions (wallet_id, name, amount, type, category, date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(req.walletId, name.trim(), Math.abs(amount), type, category, date, req.user.id);
  res.json({ id: result.lastInsertRowid, wallet_id: req.walletId, name: name.trim(), amount: Math.abs(amount), type, category, date, created_by: req.user.id });
});

// PUT /api/wallets/:id/transactions/:tid
router.put('/:id/transactions/:tid', requireWalletAccess, (req, res) => {
  const tid = parseInt(req.params.tid);
  const tx = db.prepare('SELECT * FROM transactions WHERE id = ? AND wallet_id = ?').get(tid, req.walletId);
  if (!tx) return res.status(404).json({ error: 'Transaction introuvable' });

  const { name, amount, date } = req.body;
  db.prepare('UPDATE transactions SET name = ?, amount = ?, date = ? WHERE id = ?').run(
    name || tx.name, amount != null ? Math.abs(amount) : tx.amount, date || tx.date, tid
  );
  res.json({ ok: true });
});

// DELETE /api/wallets/:id/transactions/:tid
router.delete('/:id/transactions/:tid', requireWalletAccess, (req, res) => {
  const tid = parseInt(req.params.tid);
  const tx = db.prepare('SELECT * FROM transactions WHERE id = ? AND wallet_id = ?').get(tid, req.walletId);
  if (!tx) return res.status(404).json({ error: 'Transaction introuvable' });
  db.prepare('DELETE FROM transactions WHERE id = ?').run(tid);
  res.json({ ok: true });
});

// POST /api/wallets/:id/import — bulk import (migration from localStorage)
router.post('/:id/import', requireWalletAccess, (req, res) => {
  const { transactions, recurring, budgets, goals } = req.body;
  const insert = db.transaction(() => {
    if (transactions && Array.isArray(transactions)) {
      const stmt = db.prepare(
        'INSERT INTO transactions (wallet_id, name, amount, type, category, date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      for (const t of transactions) {
        stmt.run(req.walletId, t.name, Math.abs(t.amount), t.type, t.category, t.date, req.user.id);
      }
    }
    if (recurring && Array.isArray(recurring)) {
      const stmt = db.prepare(
        'INSERT INTO recurring (wallet_id, name, amount, type, category, frequency, day, active, last_generated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      for (const r of recurring) {
        stmt.run(req.walletId, r.name, Math.abs(r.amount), r.type, r.category, r.frequency, r.day || 1, r.active ? 1 : 0, r.lastGenerated || null);
      }
    }
    if (budgets && typeof budgets === 'object') {
      const stmt = db.prepare(
        'INSERT OR REPLACE INTO budgets (wallet_id, category, limit_amount) VALUES (?, ?, ?)'
      );
      for (const [cat, limit] of Object.entries(budgets)) {
        if (limit > 0) stmt.run(req.walletId, cat, limit);
      }
    }
    if (goals && Array.isArray(goals)) {
      const stmt = db.prepare(
        'INSERT INTO goals (wallet_id, name, target, current) VALUES (?, ?, ?, ?)'
      );
      for (const g of goals) {
        stmt.run(req.walletId, g.name, g.target, g.current || 0);
      }
    }
  });
  insert();
  res.json({ ok: true });
});

module.exports = router;
