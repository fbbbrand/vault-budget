const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { JWT_SECRET, requireAuth } = require('../middleware/auth');

module.exports = function (loginLimiter, registerLimiter) {
  const router = express.Router();

  // POST /api/register
  router.post('/register', registerLimiter, (req, res) => {
    const { username, pin } = req.body;
    if (!username || typeof username !== 'string' || username.trim().length < 2 || username.trim().length > 20) {
      return res.status(400).json({ error: 'Username entre 2 et 20 caractères requis' });
    }
    if (!pin || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ error: 'PIN de 4 chiffres requis' });
    }
    const clean = username.trim();
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(clean);
    if (existing) {
      return res.status(409).json({ error: 'Ce nom d\'utilisateur est déjà pris' });
    }

    const pin_hash = bcrypt.hashSync(pin, 10);
    const result = db.prepare('INSERT INTO users (username, pin_hash) VALUES (?, ?)').run(clean, pin_hash);
    const userId = result.lastInsertRowid;

    // Create default wallet
    const wallet = db.prepare('INSERT INTO wallets (name, owner_id) VALUES (?, ?)').run('Mon Budget', userId);
    db.prepare('INSERT INTO wallet_members (wallet_id, user_id, role) VALUES (?, ?, ?)').run(wallet.lastInsertRowid, userId, 'owner');

    const token = jwt.sign({ id: userId, username: clean }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: userId, username: clean } });
  });

  // POST /api/login
  router.post('/login', loginLimiter, (req, res) => {
    const { username, pin } = req.body;
    if (!username || !pin) {
      return res.status(400).json({ error: 'Username et PIN requis' });
    }
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
    if (!user || !bcrypt.compareSync(pin, user.pin_hash)) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, username: user.username } });
  });

  // GET /api/me
  router.get('/me', requireAuth, (req, res) => {
    const user = db.prepare('SELECT id, username, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json(user);
  });

  return router;
};
