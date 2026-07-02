// ═══════════════════════════════════════════════════════════════
//  АРХИТЕКТОР — Web Push (модуль, ГОТОВ К АКТИВАЦИИ)
//  НЕ импортируется server.js, пока не заданы VAPID-ключи. Активация:
//    1) npm install web-push  (в architect/backend)
//    2) railway env: VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT=mailto:you@mail
//    3) в server.js добавить:  import mountPush from './push.js';  mountPush(app, pool);
//  Всё под guard — если ключей нет, роуты отвечают 501, sync не затрагивается.
// ═══════════════════════════════════════════════════════════════
import webpush from 'web-push';

export default function mountPush(app, pool) {
  const PUB = process.env.VAPID_PUBLIC, PRIV = process.env.VAPID_PRIVATE;
  const SUBJ = process.env.VAPID_SUBJECT || 'mailto:admin@architect.app';
  const enabled = !!(PUB && PRIV);
  if (enabled) {
    try { webpush.setVapidDetails(SUBJ, PUB, PRIV); }
    catch (e) { console.error('VAPID setup failed:', e.message); }
  } else {
    console.log('ℹ push отключён (нет VAPID_PUBLIC/PRIVATE)');
  }

  // Таблица подписок — создаём аккуратно, ошибка не роняет сервер.
  (async () => {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS push_subs (
          id         BIGSERIAL PRIMARY KEY,
          space_key  UUID,
          endpoint   TEXT UNIQUE NOT NULL,
          sub        JSONB NOT NULL,
          hour       INT NOT NULL DEFAULT 20,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`);
      console.log('✓ push_subs готова');
    } catch (e) { console.error('push_subs init:', e.message); }
  })();

  const need = (res) => { if (!enabled) { res.status(501).json({ error: 'push не сконфигурирован' }); return true; } return false; };

  // Публичный VAPID-ключ для подписки на клиенте
  app.get('/api/push/vapid', (_req, res) => {
    if (need(res)) return;
    res.json({ publicKey: PUB });
  });

  // Сохранить подписку
  app.post('/api/push/subscribe', async (req, res) => {
    if (need(res)) return;
    const { spaceKey = null, subscription, hour = 20 } = req.body || {};
    if (!subscription || !subscription.endpoint) return res.status(400).json({ error: 'нет subscription' });
    try {
      await pool.query(
        `INSERT INTO push_subs (space_key, endpoint, sub, hour)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (endpoint) DO UPDATE SET sub = EXCLUDED.sub, space_key = EXCLUDED.space_key, hour = EXCLUDED.hour`,
        [spaceKey, subscription.endpoint, subscription, Math.max(0, Math.min(23, +hour || 20))]
      );
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Отписаться
  app.post('/api/push/unsubscribe', async (req, res) => {
    if (need(res)) return;
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'нет endpoint' });
    try { await pool.query('DELETE FROM push_subs WHERE endpoint = $1', [endpoint]); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Тестовый пуш (проверка пайплайна)
  app.post('/api/push/test', async (req, res) => {
    if (need(res)) return;
    const { endpoint } = req.body || {};
    try {
      const q = endpoint
        ? await pool.query('SELECT sub FROM push_subs WHERE endpoint = $1', [endpoint])
        : await pool.query('SELECT sub FROM push_subs ORDER BY created_at DESC LIMIT 1');
      if (!q.rows.length) return res.status(404).json({ error: 'нет подписок' });
      await sendTo(q.rows[0].sub, { title: 'Архитектор', body: 'Проверка уведомлений ✓' });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  async function sendTo(sub, payload) {
    try { await webpush.sendNotification(sub, JSON.stringify(payload)); }
    catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) // подписка мертва — чистим
        await pool.query('DELETE FROM push_subs WHERE endpoint = $1', [sub.endpoint]).catch(() => {});
      else throw e;
    }
  }

  // Ежедневный отправитель: раз в час проверяем, кому пора (по их hour, UTC).
  if (enabled) {
    setInterval(async () => {
      try {
        const h = new Date().getUTCHours();
        const q = await pool.query('SELECT sub FROM push_subs WHERE hour = $1', [h]);
        for (const row of q.rows)
          await sendTo(row.sub, { title: 'Архитектор', body: 'Хороший момент отметить день?', url: './' });
      } catch (e) { console.error('daily push:', e.message); }
    }, 60 * 60 * 1000);
  }
}
