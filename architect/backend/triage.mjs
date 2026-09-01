// ═══════════════════════════════════════════════════════════════
//  АРХИТЕКТОР — AI-триаж обратной связи (FEEDBACK_SPEC.md, шаги 2–3).
//  Запускается GitHub Action (cron/вручную). Секреты: DATABASE_URL,
//  ANTHROPIC_API_KEY (серверный, НЕ пользовательский). Без секретов —
//  мягкий выход, чтобы cron не сыпал красным.
// ═══════════════════════════════════════════════════════════════
import pg from 'pg';
const { Pool } = pg;
const DB = process.env.DATABASE_URL, KEY = process.env.ANTHROPIC_API_KEY;
if (!DB || !KEY) {
  console.log(`SKIP: секреты не заданы → DATABASE_URL=${!!DB} ANTHROPIC_API_KEY=${!!KEY}`);
  process.exit(0);
}
const pool = new Pool({ connectionString: DB, ssl: { rejectUnauthorized: false } });
// Классификация — задача для дешёвой модели (AI_ROUTING_BRIEF, этап 4);
// переопределяется без деплоя через переменную TRIAGE_MODEL.
const MODEL = process.env.TRIAGE_MODEL || 'claude-haiku-4-5';

await pool.query(`CREATE TABLE IF NOT EXISTS patterns (
  id BIGSERIAL PRIMARY KEY, summary TEXT NOT NULL, module TEXT NOT NULL,
  mention_count INT NOT NULL DEFAULT 1, priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'open',
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(), last_seen TIMESTAMPTZ NOT NULL DEFAULT now())`);
await pool.query(`CREATE TABLE IF NOT EXISTS classified_feedback (
  feedback_id BIGINT PRIMARY KEY REFERENCES raw_feedback_log(id),
  type TEXT NOT NULL, sentiment TEXT NOT NULL, confidence SMALLINT NOT NULL,
  module TEXT NOT NULL, summary TEXT NOT NULL,
  pattern_id BIGINT REFERENCES patterns(id),
  classified_at TIMESTAMPTZ NOT NULL DEFAULT now())`);

const raw = (await pool.query(
  `SELECT r.id, r.text, r.context FROM raw_feedback_log r
   LEFT JOIN classified_feedback c ON c.feedback_id = r.id
   WHERE c.feedback_id IS NULL ORDER BY r.id LIMIT 20`)).rows;
if (!raw.length) { console.log('Нечего классифицировать — очередь пуста'); await pool.end(); process.exit(0); }
const pats = (await pool.query(`SELECT id, summary FROM patterns WHERE status='open' ORDER BY id DESC LIMIT 100`)).rows;

const schema = { type:'object', additionalProperties:false, required:['items'], properties:{ items:{ type:'array', items:{
  type:'object', additionalProperties:false,
  required:['id','type','sentiment','confidence','module','summary','pattern_id'],
  properties:{
    id:{type:'integer'},
    type:{type:'string', enum:['gratitude','suggestion','bug','ux_complaint','irrelevant']},
    sentiment:{type:'string', enum:['pos','neu','neg','critical']},
    confidence:{type:'integer'},
    module:{type:'string', enum:['today','spheres','mind','results','sync','ai','pwa','feedback','other']},
    summary:{type:'string'},
    pattern_id:{anyOf:[{type:'integer'},{type:'null'}]}
  } } } } };

const user = 'Сообщения пользователей (id, текст, экран):\n' +
  JSON.stringify(raw.map(r => ({ id:+r.id, text:r.text, screen:(r.context||{}).screen||'' }))) +
  '\n\nОткрытые паттерны (для семантической дедупликации; pattern_id=null если нет совпадения):\n' +
  JSON.stringify(pats.map(p => ({ id:+p.id, summary:p.summary }))) +
  '\n\nКлассифицируй каждое сообщение. summary — одна строка по-русски.';
const resp = await fetch('https://api.anthropic.com/v1/messages', {
  method:'POST',
  headers:{ 'x-api-key':KEY, 'anthropic-version':'2023-06-01', 'content-type':'application/json' },
  body: JSON.stringify({ model: MODEL, max_tokens:2000,
    system:'Ты — триаж обратной связи приложения-дневника «Архитектор». Точность важнее уверенности: сомневаешься — снижай confidence.',
    messages:[{ role:'user', content:user }],
    output_config:{ format:{ type:'json_schema', schema } } })
});
const data = await resp.json();
if (!resp.ok) { console.error('Claude API:', (data.error && data.error.message) || resp.status); process.exit(1); }
const out = JSON.parse(data.content.filter(b => b.type==='text').map(b => b.text).join(''));
if (!out || !Array.isArray(out.items) || out.items.some(m => !m || !Number.isInteger(m.confidence) || m.confidence < 0 || m.confidence > 100)) {
  console.error('Claude API: invalid structured triage output (confidence must be integer 0..100)');
  await pool.end();
  process.exit(1);
}

for (const m of out.items) {
  let pid = m.pattern_id || null;
  if (pid) {
    await pool.query(`UPDATE patterns SET mention_count = mention_count + 1, last_seen = now(),
      priority = CASE WHEN mention_count + 1 >= 3 AND first_seen > now() - interval '72 hours' THEN 'high' ELSE priority END
      WHERE id = $1`, [pid]);
  } else if (['bug','suggestion','ux_complaint'].includes(m.type)) {
    pid = (await pool.query(`INSERT INTO patterns (summary, module) VALUES ($1,$2) RETURNING id`, [m.summary, m.module])).rows[0].id;
  }
  await pool.query(`INSERT INTO classified_feedback (feedback_id,type,sentiment,confidence,module,summary,pattern_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (feedback_id) DO NOTHING`,
    [m.id, m.type, m.sentiment, m.confidence, m.module, m.summary, pid]);
  console.log(`#${m.id} → ${m.type}/${m.sentiment} conf=${m.confidence} module=${m.module}${pid ? ' pattern=' + pid : ''} · ${m.summary}`);
}
console.log(`✓ классифицировано: ${out.items.length}`);
await pool.end();
