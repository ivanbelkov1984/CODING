// ═══════════════════════════════════════════════════════════════
//  АРХИТЕКТОР — Обратная связь (приём + статус). См. FEEDBACK_SPEC.md.
//  Сырой лог append-only; AI-триаж — отдельным cron-процессом (не здесь).
//  Приватность: сюда попадает ТОЛЬКО текст формы и явно выбранный,
//  повторно минимизированный тех-контекст. Дневник и ключи запрещены.
// ═══════════════════════════════════════════════════════════════
import rateLimit from 'express-rate-limit';
import { FEEDBACK_PRIVACY, sanitizeFeedbackPayload, publicFeedbackError } from './feedback-privacy.js';

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

  const feedbackWriteLimit = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Слишком много сообщений, попробуй позже', code: 'feedback_rate_limit' },
  });

  // Приём: мгновенная серверная минимизация + INSERT, никакой AI-обработки.
  app.post('/api/feedback', feedbackWriteLimit, async (req, res) => {
    try {
      const safe = sanitizeFeedbackPayload(req.body || {});
      const context = { ...safe.context, feedbackPrivacy: safe.privacy };
      const r = await pool.query(
        'INSERT INTO raw_feedback_log (text, screenshot, context, space_hint) VALUES ($1,$2,$3,$4) RETURNING id',
        [safe.text, null, context, null]
      );
      res.json({ id: r.rows[0].id, retention: FEEDBACK_PRIVACY.RETENTION, access: FEEDBACK_PRIVACY.ACCESS });
    } catch (error) {
      if (!(error && error.status && error.status < 500)) console.error('feedback submit:', error?.message || error);
      const reply = publicFeedbackError(error);
      res.status(reply.status).json(reply.body);
    }
  });

  // Статус для замыкания цикла: received → triaged → fixed.
  // Таблицы триажа создаёт cron; до первого запуска честно отвечаем received.
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
      } catch (_) { /* триаж ещё не создавал таблиц */ }
      const byId = new Map(rows.map(row => [+row.id, row]));
      res.json({ items: ids.map(id => {
        const row = byId.get(id);
        return row ? { id, status: row.pstatus === 'fixed' ? 'fixed' : 'triaged', type: row.type }
                   : { id, status: 'received' };
      }) });
    } catch (error) {
      console.error('feedback status:', error?.message || error);
      const reply = publicFeedbackError(error);
      res.status(reply.status).json(reply.body);
    }
  });
}
