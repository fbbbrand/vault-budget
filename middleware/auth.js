const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'vault-budget-secret-change-in-prod';

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    req.user = { id: payload.id, username: payload.username };
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide' });
  }
}

function requireWalletAccess(req, res, next) {
  const walletId = parseInt(req.params.id);
  if (!walletId) return res.status(400).json({ error: 'Wallet ID invalide' });

  const member = db.prepare(
    'SELECT role FROM wallet_members WHERE wallet_id = ? AND user_id = ?'
  ).get(walletId, req.user.id);

  if (!member) return res.status(403).json({ error: 'Accès refusé à ce wallet' });

  req.walletId = walletId;
  req.walletRole = member.role;
  next();
}

function requireWalletOwner(req, res, next) {
  if (req.walletRole !== 'owner') {
    return res.status(403).json({ error: 'Réservé au propriétaire du wallet' });
  }
  next();
}

module.exports = { JWT_SECRET, requireAuth, requireWalletAccess, requireWalletOwner };
