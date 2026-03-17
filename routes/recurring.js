const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireWalletAccess } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/wallets/:id/recurring
router.get('/:id/recurring', requireWalletAccess, (req, res) => {
  res.json(db.prepare('SELECT * FROM recurring WHERE wallet_id = ? ORDER BY id').all(req.walletId));
});

// POST /api/wallets/:id/recurring
router.post('/:id/recurring', requireWalletAccess, (req, res) => {
  const { name, amount, type, category, frequency, day } = req.body;
  if (!name || !amount || !type || !category || !frequency) {
    return res.status(400).json({ error: 'Tous les champs sont requis' });
  }
  const result = db.prepare(
    'INSERT INTO recurring (wallet_id, name, amount, type, category, frequency, day, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)'
  ).run(req.walletId, name.trim(), Math.abs(amount), type, category, frequency, day || 1);
  res.json({ id: result.lastInsertRowid });
});

// PUT /api/wallets/:id/recurring/:rid
router.put('/:id/recurring/:rid', requireWalletAccess, (req, res) => {
  const rid = parseInt(req.params.rid);
  const rec = db.prepare('SELECT * FROM recurring WHERE id = ? AND wallet_id = ?').get(rid, req.walletId);
  if (!rec) return res.status(404).json({ error: 'Récurrent introuvable' });

  const { name, amount, type, category, frequency, day, active } = req.body;
  db.prepare(`UPDATE recurring SET
    name = ?, amount = ?, type = ?, category = ?, frequency = ?, day = ?, active = ?
    WHERE id = ?`
  ).run(
    name || rec.name,
    amount != null ? Math.abs(amount) : rec.amount,
    type || rec.type,
    category || rec.category,
    frequency || rec.frequency,
    day != null ? day : rec.day,
    active != null ? (active ? 1 : 0) : rec.active,
    rid
  );
  res.json({ ok: true });
});

// DELETE /api/wallets/:id/recurring/:rid
router.delete('/:id/recurring/:rid', requireWalletAccess, (req, res) => {
  const rid = parseInt(req.params.rid);
  db.prepare('DELETE FROM recurring WHERE id = ? AND wallet_id = ?').run(rid, req.walletId);
  res.json({ ok: true });
});

// POST /api/wallets/:id/recurring/generate — auto-generate transactions
router.post('/:id/recurring/generate', requireWalletAccess, (req, res) => {
  const recs = db.prepare('SELECT * FROM recurring WHERE wallet_id = ? AND active = 1').all(req.walletId);
  const now = new Date();
  const mk = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const year = String(now.getFullYear());
  // Week key
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const wk = `${now.getFullYear()}-W${String(Math.ceil(((now - jan1) / 864e5 + jan1.getDay() + 1) / 7)).padStart(2, '0')}`;

  let count = 0;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const generate = db.transaction(() => {
    for (const r of recs) {
      let shouldGenerate = false;
      let newLastGenerated = r.last_generated;

      if (r.frequency === 'monthly' && r.last_generated !== mk) {
        shouldGenerate = true;
        newLastGenerated = mk;
      } else if (r.frequency === 'weekly' && r.last_generated !== wk) {
        shouldGenerate = true;
        newLastGenerated = wk;
      } else if (r.frequency === 'yearly' && r.last_generated !== year) {
        shouldGenerate = true;
        newLastGenerated = year;
      }

      if (shouldGenerate) {
        const day = Math.min(r.day, daysInMonth);
        const date = r.frequency === 'weekly'
          ? now.toISOString().slice(0, 10)
          : `${mk}-${String(day).padStart(2, '0')}`;

        db.prepare(
          'INSERT INTO transactions (wallet_id, name, amount, type, category, date, recurring_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(r.wallet_id, r.name, r.amount, r.type, r.category, date, r.id);

        db.prepare('UPDATE recurring SET last_generated = ? WHERE id = ?').run(newLastGenerated, r.id);
        count++;
      }
    }
  });
  generate();
  res.json({ generated: count });
});

module.exports = router;
