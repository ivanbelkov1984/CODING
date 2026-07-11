// ═══════════════════════════════════════════════════════════════
//  АРХИТЕКТОР — Обратная связь (приём + статус). См. FEEDBACK_SPEC.md.
//  Сырой лог append-only; AI-триаж — отдельным cron-процессом (не здесь).
//  Приватность: сюда попадает ТОЛЬКО текст формы и явный тех-контекст,
//  никогда — содержимое дневника.
// ═══════════════════════════════════════════════════════════════
export default function mountFeedback(app, pool) {
  (async () => {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS raw_feedback_log (
          id          BIGSERIAL PRIMARY KEY,
          received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          text        TEXT NOT NULL CHECK (length(text) BETWEEN 3 AND 4000),
          screenshot  TEXT,
          context     JSONB NOT NULL DEFAULT '{}'::jsonb,
          space_hint  UUID
        )`);
      console.log('✓ feedback готова');
    } catch (e) { console.error('feedback init:', e.message); }
  })();

  // Приём: мгновенный INSERT, никакой обработки в запросе.
  app.post('/api/feedback', async (req, res) => {
    try {
      const { text, context = {}, screenshot = null, spaceHint = null } = req.body || {};
      const t = String(text || '').trim();
      if (t.length < 3 || t.length > 4000) return res.status(400).json({ error: 'Текст: 3–4000 символов' });
      if (screenshot && String(screenshot).length > 1_400_000) return res.status(400).json({ error: 'Скриншот слишком большой' });
      if (typeof context !== 'object' || Array.isArray(context)) return res.status(400).json({ error: 'context — объект' });
      const r = await pool.query(
        'INSERT INTO raw_feedback_log (text, screenshot, context, space_hint) VALUES ($1,$2,$3,$4) RETURNING id',
        [t, screenshot ? String(screenshot) : null, context, spaceHint]
      );
      res.json({ id: r.rows[0].id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Статус для замыкания цикла: received → triaged → fixed.
  // Таблицы триажа создаёт cron (triage.mjs); до первого запуска их нет —
  // тогда честно отвечаем «received», не падаем.
  app.get('/api/feedback/status', async (req, res) => {
    try {
      const ids = String(req.query.ids || '').split(',').map(n => +n).filter(n => n > 0).slice(0, 50);
      if (!ids.length) return res.json({ items: [] });
      let rows = [];
      try {
        rows = (await pool.query(
          `SELECT c.feedback_id AS id, c.type, p.status AS pstatus
             FROM classified_feedback c LEFT JOIN patterns p ON p.id = c.pattern_id
            WHERE c.feedback_id = ANY($1)`, [ids])).rows;
      } catch (e) { /* триаж ещё не создавал таблиц */ }
      const m = new Map(rows.map(r => [+r.id, r]));
      res.json({ items: ids.map(id => {
        const r = m.get(id);
        return r ? { id, status: r.pstatus === 'fixed' ? 'fixed' : 'triaged', type: r.type }
                 : { id, status: 'received' };
      }) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}
