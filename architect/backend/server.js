// ═══════════════════════════════════════════════════════════════
//  АРХИТЕКТОР — Backend
//  Express + PostgreSQL · кросс-девайс синхронизация
//  Данные каждого пользователя хранятся в «пространстве» (space),
//  доступ по секретному ключу-UUID. Никакого внешнего доступа без ключа.
// ═══════════════════════════════════════════════════════════════
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pg from 'pg';
import mountPush from './push.js';   // Web Push (под VAPID-guard; без ключей — no-op)
import mountFeedback from './feedback.js'; // Обратная связь (append-only лог)

const { Pool } = pg;
const PORT = process.env.PORT || 3000;

// ─── ПОДКЛЮЧЕНИЕ К БАЗЕ ─────────────────────────────────────────
// Railway автоматически выдаёт DATABASE_URL при добавлении PostgreSQL.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});

// ─── ИНИЦИАЛИЗАЦИЯ СХЕМЫ ────────────────────────────────────────
async function initSchema() {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS spaces (
      key        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name       TEXT,
      db         JSONB NOT NULL DEFAULT '{}'::jsonb,
      cfg        JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  console.log('✓ Схема готова');
}

// ─── APP ────────────────────────────────────────────────────────
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);                // Railway за прокси — для корректного rate-limit по IP

// Заголовки безопасности (это API, не HTML — CSP не нужен)
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));

// CORS: только доверенные origin (по умолчанию GitHub Pages); запросы без
// Origin (curl, health, нативные webview) пропускаем.
const ALLOWED = (process.env.ALLOWED_ORIGINS || 'https://ivanbelkov1984.github.io')
  .split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    if (!origin || ALLOWED.includes(origin)) return cb(null, true);
    return cb(null, false);               // чужой origin — без CORS-заголовков, браузер заблокирует
  },
}));

app.use(express.json({ limit: '5mb' }));  // данные объёмны, но не безграничны

// Троттлинг только на API-запись/чтение пространств (health не ограничиваем)
app.use('/api', rateLimit({
  windowMs: 60_000, max: 120,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Слишком много запросов, попробуй позже' },
}));

// Web Push — аддитивно и защищённо: любая ошибка не роняет сервер/синхронизацию.
try { mountPush(app, pool); } catch (e) { console.error('push mount failed:', e.message); }
try { mountFeedback(app, pool); } catch (e) { console.error('feedback mount failed:', e.message); }

const isUuid = s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s || '');
const isObj  = v => v && typeof v === 'object' && !Array.isArray(v);
// Проверка тела: db/cfg должны быть объектами (не массив/примитив)
function badPayload(res, db, cfg) {
  if (!isObj(db) || !isObj(cfg)) { res.status(400).json({ error: 'db и cfg должны быть объектами' }); return true; }
  return false;
}

// ─── ЗДОРОВЬЕ ───────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'architect-backend', time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── СОЗДАТЬ ПРОСТРАНСТВО ───────────────────────────────────────
//  POST /api/space  { name?, db?, cfg? }  →  { key, updated_at }
app.post('/api/space', async (req, res) => {
  try {
    const { name = null, db = {}, cfg = {} } = req.body || {};
    if (badPayload(res, db, cfg)) return;
    const r = await pool.query(
      `INSERT INTO spaces (name, db, cfg) VALUES ($1, $2, $3)
       RETURNING key, updated_at`,
      [name, db, cfg]
    );
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── ЗАГРУЗИТЬ ПРОСТРАНСТВО (pull) ──────────────────────────────
//  GET /api/space/:key  →  { name, db, cfg, updated_at }
app.get('/api/space/:key', async (req, res) => {
  const { key } = req.params;
  if (!isUuid(key)) return res.status(400).json({ error: 'Некорректный ключ' });
  try {
    const r = await pool.query(
      'SELECT name, db, cfg, created_at, updated_at FROM spaces WHERE key = $1',
      [key]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Пространство не найдено' });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── СОХРАНИТЬ ПРОСТРАНСТВО (push) ──────────────────────────────
//  PUT /api/space/:key  { db, cfg, name? }  →  { updated_at }
app.put('/api/space/:key', async (req, res) => {
  const { key } = req.params;
  if (!isUuid(key)) return res.status(400).json({ error: 'Некорректный ключ' });
  const { db = {}, cfg = {}, name = null } = req.body || {};
  if (badPayload(res, db, cfg)) return;
  try {
    const r = await pool.query(
      `UPDATE spaces
         SET db = $2, cfg = $3,
             name = COALESCE($4, name),
             updated_at = now()
       WHERE key = $1
       RETURNING updated_at`,
      [key, db, cfg, name]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Пространство не найдено' });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── УДАЛИТЬ ПРОСТРАНСТВО ───────────────────────────────────────
//  DELETE /api/space/:key  →  { deleted: true }
app.delete('/api/space/:key', async (req, res) => {
  const { key } = req.params;
  if (!isUuid(key)) return res.status(400).json({ error: 'Некорректный ключ' });
  try {
    const r = await pool.query('DELETE FROM spaces WHERE key = $1', [key]);
    res.json({ deleted: r.rowCount > 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── СТАРТ ──────────────────────────────────────────────────────
initSchema()
  .then(() => app.listen(PORT, () => console.log(`✓ Архитектор backend на :${PORT}`)))
  .catch(e => { console.error('Ошибка инициализации БД:', e); process.exit(1); });
