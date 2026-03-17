const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireWalletAccess, requireWalletOwner } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/wallets — list user's wallets
router.get('/', (req, res) => {
  const wallets = db.prepare(`
    SELECT w.id, w.name, w.owner_id, wm.role,
      (SELECT COUNT(*) FROM wallet_members WHERE wallet_id = w.id) as member_count
    FROM wallets w
    JOIN wallet_members wm ON wm.wallet_id = w.id AND wm.user_id = ?
    ORDER BY w.id
  `).all(req.user.id);
  res.json(wallets);
});

// POST /api/wallets — create wallet
router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nom requis' });
  const result = db.prepare('INSERT INTO wallets (name, owner_id) VALUES (?, ?)').run(name.trim(), req.user.id);
  const walletId = result.lastInsertRowid;
  db.prepare('INSERT INTO wallet_members (wallet_id, user_id, role) VALUES (?, ?, ?)').run(walletId, req.user.id, 'owner');
  res.json({ id: walletId, name: name.trim(), owner_id: req.user.id, role: 'owner' });
});

// GET /api/wallets/:id
router.get('/:id', requireWalletAccess, (req, res) => {
  const wallet = db.prepare('SELECT * FROM wallets WHERE id = ?').get(req.walletId);
  const members = db.prepare(`
    SELECT u.id, u.username, wm.role
    FROM wallet_members wm JOIN users u ON u.id = wm.user_id
    WHERE wm.wallet_id = ?
  `).all(req.walletId);
  res.json({ ...wallet, members });
});

// PUT /api/wallets/:id — rename
router.put('/:id', requireWalletAccess, requireWalletOwner, (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nom requis' });
  db.prepare('UPDATE wallets SET name = ? WHERE id = ?').run(name.trim(), req.walletId);
  res.json({ ok: true });
});

// DELETE /api/wallets/:id
router.delete('/:id', requireWalletAccess, requireWalletOwner, (req, res) => {
  // Prevent deleting the last wallet
  const count = db.prepare(
    'SELECT COUNT(*) as c FROM wallet_members WHERE user_id = ?'
  ).get(req.user.id).c;
  if (count <= 1) return res.status(400).json({ error: 'Impossible de supprimer votre dernier wallet' });
  db.prepare('DELETE FROM wallets WHERE id = ?').run(req.walletId);
  res.json({ ok: true });
});

// POST /api/wallets/:id/invite — invite user by username
router.post('/:id/invite', requireWalletAccess, requireWalletOwner, (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username requis' });
  const target = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
  if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'Vous êtes déjà dans ce wallet' });

  const existing = db.prepare(
    'SELECT 1 FROM wallet_members WHERE wallet_id = ? AND user_id = ?'
  ).get(req.walletId, target.id);
  if (existing) return res.status(409).json({ error: 'Cet utilisateur est déjà membre' });

  db.prepare('INSERT INTO wallet_members (wallet_id, user_id, role) VALUES (?, ?, ?)').run(req.walletId, target.id, 'member');
  res.json({ ok: true, username: username.trim() });
});

// DELETE /api/wallets/:id/members/:uid — remove member
router.delete('/:id/members/:uid', requireWalletAccess, requireWalletOwner, (req, res) => {
  const uid = parseInt(req.params.uid);
  if (uid === req.user.id) return res.status(400).json({ error: 'Vous ne pouvez pas vous retirer vous-même' });
  db.prepare('DELETE FROM wallet_members WHERE wallet_id = ? AND user_id = ?').run(req.walletId, uid);
  res.json({ ok: true });
});

module.exports = router;
