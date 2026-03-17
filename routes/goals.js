const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireWalletAccess } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/wallets/:id/goals
router.get('/:id/goals', requireWalletAccess, (req, res) => {
  res.json(db.prepare('SELECT * FROM goals WHERE wallet_id = ? ORDER BY id').all(req.walletId));
});

// POST /api/wallets/:id/goals
router.post('/:id/goals', requireWalletAccess, (req, res) => {
  const { name, target } = req.body;
  if (!name || !target || target <= 0) {
    return res.status(400).json({ error: 'Nom et objectif requis' });
  }
  const result = db.prepare(
    'INSERT INTO goals (wallet_id, name, target, current) VALUES (?, ?, ?, 0)'
  ).run(req.walletId, name.trim(), target);
  res.json({ id: result.lastInsertRowid, name: name.trim(), target, current: 0 });
});

// PUT /api/wallets/:id/goals/:gid
router.put('/:id/goals/:gid', requireWalletAccess, (req, res) => {
  const gid = parseInt(req.params.gid);
  const goal = db.prepare('SELECT * FROM goals WHERE id = ? AND wallet_id = ?').get(gid, req.walletId);
  if (!goal) return res.status(404).json({ error: 'Objectif introuvable' });

  const { name, target, current } = req.body;
  db.prepare('UPDATE goals SET name = ?, target = ?, current = ? WHERE id = ?').run(
    name || goal.name,
    target != null ? target : goal.target,
    current != null ? Math.min(current, target || goal.target) : goal.current,
    gid
  );
  res.json({ ok: true });
});

// DELETE /api/wallets/:id/goals/:gid
router.delete('/:id/goals/:gid', requireWalletAccess, (req, res) => {
  const gid = parseInt(req.params.gid);
  db.prepare('DELETE FROM goals WHERE id = ? AND wallet_id = ?').run(gid, req.walletId);
  res.json({ ok: true });
});

module.exports = router;
