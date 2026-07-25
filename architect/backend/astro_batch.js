// ═══════════════════════════════════════════════════════════════
//  Астро-интерпретации: серверный запуск OpenAI Batch API.
//  OPENAI_API_KEY живёт ТОЛЬКО в env Railway — клиенту не отдаётся.
//  Защита от злоупотребления: фиксированное содержимое батча (реестр
//  зашит в код), не чаще одного запуска в 24 часа, статус текущего
//  батча хранится в PostgreSQL.
//  Реестр зеркалит architect/tools/astro_texts_batch.py (1861 позиция).
// ═══════════════════════════════════════════════════════════════

const MODEL = process.env.OPENAI_MODEL || 'gpt-5.4';
// Если запрошенная модель недоступна аккаунту — берём первую доступную из списка.
const MODEL_FALLBACKS = ['gpt-5.4', 'gpt-5.2', 'gpt-5.1', 'gpt-5', 'gpt-4.1', 'gpt-4o'];
const API = 'https://api.openai.com/v1';

const PLANETS = [['Sun','Солнце'],['Moon','Луна'],['Mercury','Меркурий'],['Venus','Венера'],['Mars','Марс'],['Jupiter','Юпитер'],['Saturn','Сатурн'],['Uranus','Уран'],['Neptune','Нептун'],['Pluto','Плутон']];
const SIGNS = ['Овен','Телец','Близнецы','Рак','Лев','Дева','Весы','Скорпион','Стрелец','Козерог','Водолей','Рыбы'];
const ASPECTS = ['соединение','трин','секстиль','квадрат','оппозиция'];
const POINTS = [['Chiron','Хирон'],['Ceres','Церера'],['Pallas','Паллада'],['Juno','Юнона'],['Vesta','Веста'],['Lilith','Лилит (средний апогей Луны)'],['Fortune','Точка Судьбы (Парс Фортуны)'],['Vertex','Вертекс']];
const GRAHAS = [['Surya','Сурья (Солнце)'],['Chandra','Чандра (Луна)'],['Mangala','Мангала (Марс)'],['Budha','Будха (Меркурий)'],['Guru','Гуру (Юпитер)'],['Shukra','Шукра (Венера)'],['Shani','Шани (Сатурн)'],['Rahu','Раху'],['Ketu','Кету']];
const RASHI = ['Меша (Овен)','Вришабха (Телец)','Митхуна (Близнецы)','Карка (Рак)','Симха (Лев)','Канья (Дева)','Тула (Весы)','Вришчика (Скорпион)','Дхану (Стрелец)','Макара (Козерог)','Кумбха (Водолей)','Мина (Рыбы)'];
const NAKSHATRAS = ['Ашвини','Бхарани','Криттика','Рохини','Мригашира','Ардра','Пунарвасу','Пушья','Ашлеша','Магха','Пурва-Пхалгуни','Уттара-Пхалгуни','Хаста','Читра','Свати','Вишакха','Анурадха','Джйештха','Мула','Пурва-Ашадха','Уттара-Ашадха','Шравана','Дхаништха','Шатабхиша','Пурва-Бхадрапада','Уттара-Бхадрапада','Ревати'];
const DASHA_LORDS = ['Кету','Венера','Солнце','Луна','Марс','Раху','Юпитер','Сатурн','Меркурий'];
const HOUSES_RU = ['1-й дом (личность, начало)','2-й дом (ресурсы, самоценность)','3-й дом (общение, учёба)','4-й дом (дом, корни)','5-й дом (творчество, радость)','6-й дом (уклад, мастерство)','7-й дом (партнёрство)','8-й дом (глубокие перемены)','9-й дом (смысл, горизонты)','10-й дом (призвание)','11-й дом (друзья, будущее)','12-й дом (внутренний мир)'];

const SYSTEM = 'Ты профессиональный астролог с 20-летним опытом и хороший литературный редактор. '
  + 'Пишешь на живом связном русском языке без астрологического жаргона (никаких терминов «квадрат», «орб», градусов и номеров домов в тексте). '
  + 'Тон описательный, не судьбоносный: никаких предсказаний событий, диагнозов и оценок личности; обращение на «вы». '
  + 'Это символическое описание для личного дневника, не прогноз.';
const TEMPLATE = e => `Напиши развёрнутую интерпретацию: ${e}. Объём 180–220 слов. `
  + 'Структура (без подзаголовков, связным текстом): суть механики; проявления в жизни с конкретными примерами; сильная сторона; зона роста (мягкая формулировка).';

export function registry() {
  const out = [];
  for (const [pb, pr] of PLANETS) for (const s of SIGNS) out.push([`planetInSign.${pb}.${s}`, `${pr} в знаке ${s} (натальная карта)`]);
  for (const [pb, pr] of PLANETS) HOUSES_RU.forEach((h, i) => out.push([`planetInHouse.${pb}.${i + 1}`, `${pr} в ${h} натальной карты`]));
  for (const s of SIGNS) out.push([`ascInSign.${s}`, `Асцендент в знаке ${s} (как человека видят при встрече)`]);
  HOUSES_RU.forEach((h, i) => { for (const s of SIGNS) out.push([`houseCusp.${i + 1}.${s}`, `${h}, начинающийся в знаке ${s}`]); });
  for (let i = 0; i < PLANETS.length; i++) for (let j = i + 1; j < PLANETS.length; j++) for (const a of ASPECTS)
    out.push([`aspectMeaning.${PLANETS[i][0]}-${PLANETS[j][0]}.${a}`, `натальный аспект «${a}» между ${PLANETS[i][1]} и ${PLANETS[j][1]}`]);
  for (const [tb, tr] of PLANETS) for (const [nb, nr] of PLANETS) for (const a of ASPECTS)
    out.push([`transit.${tb}.${a}.${nb}`, `транзитный ${tr} в аспекте «${a}» к натальному ${nr} (временное влияние периода)`]);
  for (const [qb, qr] of POINTS) for (const s of SIGNS) out.push([`pointInSign.${qb}.${s}`, `${qr} в знаке ${s} (натальная карта)`]);
  for (const [gb, gr] of GRAHAS) for (const r of RASHI) out.push([`grahaInRashi.${gb}.${r.split(' ')[0]}`, `${gr} в знаке ${r} (ведическая карта, сидерический зодиак)`]);
  for (const n of NAKSHATRAS) out.push([`nakshatraMoon.${n}`, `Луна в накшатре ${n} (ведическая традиция)`]);
  for (const d of DASHA_LORDS) out.push([`mahadasha.${d}`, `период маха-даша ${d} (Вимшоттари, ведическая традиция)`]);
  for (const [ab, ar] of PLANETS) for (const [bb, br] of PLANETS) for (const a of ASPECTS)
    out.push([`synastry.${ab}.${a}.${bb}`, `синастрический аспект «${a}»: ${ar} человека к ${br} партнёра (взаимодействие в паре)`]);
  return out;
}

function jsonl(model) {
  return registry().map(([id, entity]) => JSON.stringify({
    custom_id: id, method: 'POST', url: '/v1/chat/completions',
    body: { model, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: TEMPLATE(entity) }], max_completion_tokens: 900 },
  })).join('\n');
}

// Выбор реально доступной модели: запрошенная, иначе первый доступный fallback.
async function pickModel() {
  const list = await (await oa('/models')).json();
  const have = new Set((list.data || []).map(m => m.id));
  if (have.has(MODEL)) return MODEL;
  for (const m of MODEL_FALLBACKS) if (have.has(m)) return m;
  // Последний шанс: любой gpt-* чат (самый «старший» по имени).
  const gpts = [...have].filter(id => /^gpt-[45]/.test(id) && !/audio|realtime|image|search|transcribe|tts/.test(id)).sort().reverse();
  if (gpts.length) return gpts[0];
  throw new Error('Ни одна подходящая gpt-модель недоступна этому ключу');
}

async function oa(path, opts = {}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw Object.assign(new Error('OPENAI_API_KEY не задан на сервере'), { noKey: true });
  const res = await fetch(API + path, { ...opts, headers: { Authorization: `Bearer ${key}`, ...(opts.headers || {}) } });
  if (!res.ok) throw new Error(`OpenAI ${path}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res;
}

export default function mountAstroBatch(app, pool) {
  const ready = pool.query(`CREATE TABLE IF NOT EXISTS astro_batches (
    id SERIAL PRIMARY KEY, batch_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'created',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`).catch(e => console.error('astro_batches schema:', e.message));

  // Диагностика: есть ли ключ на сервере (сам ключ не раскрывается).
  app.get('/api/astro-batch/health', (_req, res) => {
    res.json({ keyPresent: !!process.env.OPENAI_API_KEY, model: MODEL, combos: registry().length });
  });

  // Запуск: фиксированный реестр, не чаще 1 раза в 24 ч, один активный батч.
  app.post('/api/astro-batch/run', async (_req, res) => {
    try {
      await ready;
      const last = (await pool.query('SELECT * FROM astro_batches ORDER BY id DESC LIMIT 1')).rows[0];
      if (last && Date.now() - new Date(last.created_at).getTime() < 24 * 3600e3) {
        // Перезапуск разрешён, только если прошлый батч закончился без результата
        // (все запросы отклонены / failed) — иначе держим лимит 1/24ч.
        let dead = last.status === 'failed';
        if (!dead) {
          try {
            const b = await (await oa(`/batches/${last.batch_id}`)).json();
            const rc = b.request_counts || {};
            dead = ['failed', 'cancelled', 'expired'].includes(b.status) || (b.status === 'completed' && !b.output_file_id && rc.completed === 0);
          } catch (e) { /* статус не получить — считаем живым */ }
        }
        if (!dead) return res.status(409).json({ error: 'Батч уже запускался за последние 24 часа', batch_id: last.batch_id, status: last.status });
      }
      const model = await pickModel();
      const content = jsonl(model);
      const fd = new FormData();
      fd.append('purpose', 'batch');
      fd.append('file', new Blob([content], { type: 'application/jsonl' }), 'astro_batch.jsonl');
      const up = await (await oa('/files', { method: 'POST', body: fd })).json();
      const batch = await (await oa('/batches', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input_file_id: up.id, endpoint: '/v1/chat/completions', completion_window: '24h' }),
      })).json();
      await pool.query('INSERT INTO astro_batches (batch_id, status) VALUES ($1, $2)', [batch.id, batch.status || 'created']);
      res.json({ batch_id: batch.id, status: batch.status, requests: registry().length, model });
    } catch (e) {
      res.status(e.noKey ? 503 : 500).json({ error: e.message });
    }
  });

  // Статус последнего батча (форвард из OpenAI + обновление в БД).
  app.get('/api/astro-batch/status', async (_req, res) => {
    try {
      await ready;
      const last = (await pool.query('SELECT * FROM astro_batches ORDER BY id DESC LIMIT 1')).rows[0];
      if (!last) return res.json({ status: 'none' });
      const b = await (await oa(`/batches/${last.batch_id}`)).json();
      if (b.status !== last.status) await pool.query('UPDATE astro_batches SET status=$1 WHERE id=$2', [b.status, last.id]);
      res.json({ batch_id: b.id, status: b.status, counts: b.request_counts || null, output_file_id: b.output_file_id || null });
    } catch (e) { res.status(e.noKey ? 503 : 500).json({ error: e.message }); }
  });

  // Диагностика: первые строки error-файла последнего батча (почему упали запросы).
  app.get('/api/astro-batch/errors', async (_req, res) => {
    try {
      await ready;
      const last = (await pool.query('SELECT * FROM astro_batches ORDER BY id DESC LIMIT 1')).rows[0];
      if (!last) return res.status(404).json({ error: 'Батчей не было' });
      const b = await (await oa(`/batches/${last.batch_id}`)).json();
      if (!b.error_file_id) return res.json({ batch_id: b.id, status: b.status, errors: b.errors || null, note: 'error-файла нет' });
      const txt = await (await oa(`/files/${b.error_file_id}/content`)).text();
      res.json({ batch_id: b.id, status: b.status, sample: txt.split('\n').slice(0, 3) });
    } catch (e) { res.status(e.noKey ? 503 : 500).json({ error: e.message }); }
  });

  // Результат завершённого батча (jsonl-стрим; это сгенерированные тексты, не секрет).
  app.get('/api/astro-batch/result', async (_req, res) => {
    try {
      await ready;
      const last = (await pool.query('SELECT * FROM astro_batches ORDER BY id DESC LIMIT 1')).rows[0];
      if (!last) return res.status(404).json({ error: 'Батчей не было' });
      const b = await (await oa(`/batches/${last.batch_id}`)).json();
      if (b.status !== 'completed' || !b.output_file_id) return res.status(409).json({ error: `Батч ещё не готов (${b.status})` });
      const out = await oa(`/files/${b.output_file_id}/content`);
      res.setHeader('Content-Type', 'application/jsonl; charset=utf-8');
      res.send(Buffer.from(await out.arrayBuffer()));
    } catch (e) { res.status(e.noKey ? 503 : 500).json({ error: e.message }); }
  });
}
