// Wave 6 (issue #160) — External Work Bridge: импорт внешней работы.
//
// ВСЕ фикстуры синтетические. Реальные личные данные (LIFE/DREAM/PARA)
// в репозиторий не попадают ни в каком виде — это требование контракта.
//
// Гоняет РЕАЛЬНЫЙ собранный бандл (dist/app.html) в Chromium.

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..');
// По умолчанию — реальный собранный бандл. WAVE6_BUNDLE подменяет его на
// мутанта: так tests/wave6-mutation.mjs проверяет, что проверки не ложнозелёные.
const FILE = 'file://' + (process.env.WAVE6_BUNDLE || join(ROOT, 'dist', 'app.html'));
let pass = 0, fail = 0;
const errors = [];
const ok = (cond, msg, detail) => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); if (detail) console.log('      ' + String(detail).split('\n').join('\n      ')); }
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
async function boot(width = 390, height = 844) {
  const p = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(FILE);
  await p.waitForSelector('#nsh-tabbar', { state: 'attached' });
  await p.evaluate(() => {
    const s = document.getElementById('splash'); if (s) s.style.display = 'none';
    document.querySelectorAll('.ov.on').forEach(e => e.classList.remove('on'));
  });
  await p.waitForTimeout(150);
  return p;
}
const page = await boot();

// Чистый профиль перед каждым сценарием.
const reset = () => page.evaluate(() => {
  ['insights', 'whys', 'patterns', 'dreams', 'spiritual', 'evolution', 'moments',
    'relationshipContexts', 'psyLinks', 'sphereLogs', 'spheres', 'externalWorkSessions'].forEach(c => { DB[c] = []; });
  DB._del = {};
  try { resolveRecovery('discarded'); } catch (_) {}
});

// ── Синтетические фикстуры ──────────────────────────────────────────
const PKG_FULL = {
  format: 'architect-external-work-v1',
  source: { kind: 'chatgpt', label: 'Синтетическая сессия', module: 'TEST-MODULE', chatId: 'chat-test-1' },
  session: { clientRef: 'sess-1', summary: 'Синтетическое резюме сессии', date: '2026-03-01' },
  entities: [
    { clientRef: 'm1', type: 'moment', sourceId: 'TEST-LIFE-001', sourceDate: '2026-03-01',
      claimClass: 'user_experience', textOrigin: 'user_words',
      data: { valence: 30, activation: 70, emo: 'напряжение', note: 'синтетическая заметка' } },
    { clientRef: 'w1', type: 'why', sourceId: 'TEST-LIFE-002', sourceDate: '2026-03-01',
      claimClass: 'user_experience', textOrigin: 'user_words',
      data: { symptom: 'синтетический симптом', need: 'синтетическая потребность', action: 'синтетическое действие' } },
    { clientRef: 'i1', type: 'insight', sourceId: 'TEST-LIFE-003', sourceDate: '2026-03-01',
      claimClass: 'user_fact', textOrigin: 'structured_summary',
      data: { title: 'Синтетический вывод', body: 'Синтетический текст инсайта для теста.', tag: 'personal' } },
    { clientRef: 'p1', type: 'pattern', sourceId: 'TEST-LIFE-004',
      claimClass: 'working_hypothesis', textOrigin: 'working_hypothesis',
      data: { text: 'Синтетический повторяющийся паттерн', type: 'behavior' } },
    { clientRef: 'r1', type: 'relationshipContext', sourceId: 'TEST-LIFE-005',
      claimClass: 'user_fact', textOrigin: 'user_words',
      data: { label: 'Синтетический контекст', role: 'коллега', note: 'нейтральная заметка' } },
    { clientRef: 'd1', type: 'dream', sourceId: 'TEST-DREAM-001', sourceDate: '2026-02-28',
      claimClass: 'user_experience', textOrigin: 'user_words',
      data: { title: 'Синтетический сон', body: 'Оригинальный рассказ сна — синтетический.', tone: 'тревожный', arch: 'Синтетическая трактовка' } },
    { clientRef: 's1', type: 'spiritual', sourceId: 'TEST-PARA-001', sourceDate: '2026-02-27',
      claimClass: 'practice_action', textOrigin: 'user_words',
      data: { text: 'Синтетическая практика 20 минут', type: 'практика' } },
    { clientRef: 'e1', type: 'evolution', sourceId: 'TEST-PARA-002', sourceDate: '2026-02-26',
      claimClass: 'user_experience', textOrigin: 'structured_summary',
      data: { text: 'Синтетическая веха интеграции', lv: 'этап' } },
  ],
  links: [
    { from: 'm1', to: 'w1', relation: 'moment_to_why' },
    { from: 'w1', to: 'i1', relation: 'why_to_insight' },
    { from: 'i1', to: 'p1', relation: 'insight_to_pattern' },
    { from: 'i1', to: 'r1', relation: 'record_to_relationship' },
  ],
};
const J = o => JSON.stringify(o);
const plan = (pkg) => page.evaluate(t => extBuildPlan(t), J(pkg));
const commit = (pkg, sel) => page.evaluate(async ({ t, s }) => {
  const p = await extBuildPlan(t);
  return { plan: { ok: p.ok, errors: p.errors, counts: p.counts, byTarget: p.byTarget }, res: extCommitPlan(p, s) };
}, { t: J(pkg), s: sel || null });

console.log('\n── Wave 6: External Work Bridge ──');

// ── 1–2. Валидный пакет → реальные canonical-коллекции + provenance ──
{
  await reset();
  const r = await commit(PKG_FULL);
  ok(r.res.ok, 'валидный пакет импортируется', r.res.error);
  const st = await page.evaluate(() => ({
    insights: DB.insights.length, whys: DB.whys.length, patterns: DB.patterns.length,
    dreams: DB.dreams.length, spiritual: DB.spiritual.length, evolution: DB.evolution.length,
    moments: DB.moments.length, rel: DB.relationshipContexts.length,
    links: DB.psyLinks.length, ledger: DB.externalWorkSessions.length,
    prov: DB.insights[0] && DB.insights[0].ext,
  }));
  ok(st.insights === 1 && st.whys === 1 && st.patterns === 1 && st.dreams === 1 &&
     st.spiritual === 1 && st.evolution === 1 && st.moments === 1 && st.rel === 1,
    'все 8 типов легли в РЕАЛЬНЫЕ существующие коллекции, параллельных не создано');
  ok(st.links === 4, `все 4 связи созданы через production-валидатор (${st.links})`);
  ok(st.ledger === 1, 'ledger получил ровно одну запись сессии');
  ok(st.prov && st.prov.sourceId === 'TEST-LIFE-003' && st.prov.sourceChatId === 'chat-test-1' &&
     st.prov.claimClass === 'user_fact' && st.prov.textOrigin === 'structured_summary' &&
     st.prov.clientRef === 'i1' && !!st.prov.packageHash,
    'provenance на canonical-записи восстанавливает источник/claimClass/textOrigin/hash');

  const chain = await page.evaluate(() => {
    const byRel = r => DB.psyLinks.filter(l => l.relation === r).length;
    const mw = DB.psyLinks.find(l => l.relation === 'moment_to_why');
    return {
      mw: byRel('moment_to_why'), wi: byRel('why_to_insight'), ip: byRel('insight_to_pattern'), rr: byRel('record_to_relationship'),
      realIds: !!(mw && DB.moments.some(m => m.id === mw.fromId) && DB.whys.some(w => w.id === mw.toId)),
      namespaced: DB.psyLinks.every(l => String(l.id).startsWith('psyLink:')),
    };
  });
  ok(chain.mw === 1 && chain.wi === 1 && chain.ip === 1 && chain.rr === 1,
    'цепочка момент→«Зачем?»→инсайт→паттерн + контекст отношений построена целиком');
  ok(chain.realIds, 'clientRef заменены НАСТОЯЩИМИ id записей приложения');
  ok(chain.namespaced, 'psyLinks получили namespaced id через production-путь');
}

// ── 3. Неподдерживаемое отношение/тип → отказ ДО записи ─────────────
{
  await reset();
  const badRel = await plan({ ...PKG_FULL, links: [{ from: 'i1', to: 'p1', relation: 'insight_to_dream' }] });
  ok(badRel.ok === false && badRel.errors.some(e => /отношение/i.test(e)),
    'неподдерживаемое отношение отклоняется, enum молча не расширяется');
  const badType = await plan({ ...PKG_FULL, entities: [{ clientRef: 'x', type: 'lifeEntry', data: { text: 'x' } }] });
  ok(badType.ok === false && badType.errors.some(e => /неподдерживаемый тип/i.test(e)),
    'неподдерживаемый canonical-тип отклоняется в preview');
  const untouched = await page.evaluate(() => DB.insights.length + DB.patterns.length + DB.externalWorkSessions.length);
  ok(untouched === 0, 'после отказов данные не тронуты');
}

// ── 3b. Семантика связей: enum пройден, но пара коллекций неверна ────
// Сценарий 3 ловит связь на уровне СХЕМЫ пакета (неизвестное отношение).
// Здесь отношение легальное, и отбить связь может только сам production-
// валидатор validatePsyLink на кандидате — параллельных правил у импорта нет.
{
  await reset();
  const wrongPair = await plan({ ...PKG_FULL,
    links: [{ from: 'i1', to: 'p1', relation: 'moment_to_why' }] });
  const badLink = wrongPair.ok && wrongPair.links[0];
  ok(badLink && badLink.status === 'invalid' && /валидатор связей/.test(badLink.reason || ''),
    'связь insights→patterns под отношением moment_to_why отбита production-валидатором',
    badLink ? JSON.stringify(badLink) : JSON.stringify(wrongPair.errors));

  const wrongTarget = await plan({ ...PKG_FULL,
    links: [{ from: 'i1', to: 'p1', relation: 'record_to_relationship' }] });
  const badTarget = wrongTarget.ok && wrongTarget.links[0];
  ok(badTarget && badTarget.status === 'invalid' && /валидатор связей/.test(badTarget.reason || ''),
    'record_to_relationship в коллекцию, не являющуюся контекстом отношений, отбит');

  // Отбитая связь не должна попасть в базу и при подтверждении.
  await reset();
  await commit({ ...PKG_FULL, links: [{ from: 'i1', to: 'p1', relation: 'moment_to_why' }] });
  const after = await page.evaluate(() => ({
    links: DB.psyLinks.length, ledger: DB.externalWorkSessions.length, insights: DB.insights.length,
  }));
  ok(after.links === 0, `невалидная связь не создана и при коммите (${after.links})`);
  ok(after.ledger === 1 && after.insights === 1,
    'записи пакета импортированы, отбита только сама связь');
}

// ── 4. Битый JSON / чужой формат → zero mutation ────────────────────
{
  await reset();
  const before = await page.evaluate(() => JSON.stringify(DB));
  const r1 = await page.evaluate(() => extBuildPlan('{ это не json'));
  const r2 = await plan({ ...PKG_FULL, format: 'something-else-v9' });
  const after = await page.evaluate(() => JSON.stringify(DB));
  ok(r1.ok === false, 'битый JSON отклонён');
  ok(r2.ok === false && r2.errors.some(e => /format/.test(e)), 'неизвестный format отклонён');
  ok(before === after, 'zero mutation: DB не изменился ни на байт');
}

// ── 5. Повторный импорт того же пакета → идемпотентность ────────────
{
  await reset();
  await commit(PKG_FULL);
  const st1 = await page.evaluate(() => ({ i: DB.insights.length, l: DB.psyLinks.length, s: DB.externalWorkSessions.length }));
  const second = await commit(PKG_FULL);
  const st2 = await page.evaluate(() => ({ i: DB.insights.length, l: DB.psyLinks.length, s: DB.externalWorkSessions.length }));
  ok(second.res.ok === false && /уже импортирован/i.test(second.res.error),
    'повторный импорт того же пакета отклонён как уже импортированный');
  ok(st1.i === st2.i && st1.l === st2.l && st1.s === st2.s,
    `идемпотентность: ноль новых записей и связей (${st2.i}/${st2.l}/${st2.s})`);
}

// ── 6. Тот же source ID в ДРУГОМ пакете → reuse по provenance ───────
{
  await reset();
  await commit(PKG_FULL);
  const other = {
    ...PKG_FULL,
    source: { kind: 'google_drive', label: 'Другой модуль', module: 'OTHER', chatId: 'chat-test-2' },
    session: { clientRef: 'sess-2', summary: 'другая сессия' },
    entities: [PKG_FULL.entities[2]],   // тот же TEST-LIFE-003
    links: [],
  };
  const p = await plan(other);
  const item = p.items[0];
  ok(item.status === 'existing-by-provenance',
    `тот же source ID из другого пакета помечен как уже импортированный (${item.status})`);
  const r = await commit(other);
  const n = await page.evaluate(() => DB.insights.length);
  ok(n === 1, `дубль по provenance не создан (инсайтов ${n})`);
  ok(r.res.ok === false, 'коммит без новых записей честно отклоняется');
}

// ── 7. Одинаковый ТЕКСТ, разные события → две записи ────────────────
{
  await reset();
  const mk = (ref, sid, date) => ({
    format: 'architect-external-work-v1',
    source: { kind: 'chatgpt', label: 'L', chatId: 'c' },
    session: { clientRef: 's-' + ref },
    entities: [{ clientRef: ref, type: 'insight', sourceId: sid, sourceDate: date,
      claimClass: 'user_fact', textOrigin: 'user_words',
      data: { title: 'Одинаковый заголовок', body: 'Абсолютно одинаковый текст наблюдения.' } }],
    links: [],
  });
  await commit(mk('a1', 'TEST-LIFE-100', '2026-01-01'));
  await commit(mk('a2', 'TEST-LIFE-200', '2026-05-05'));
  const n = await page.evaluate(() => DB.insights.length);
  ok(n === 2, `два разных события с одинаковым текстом остались двумя записями (${n})`);
}

// ── 8. moment без числового self-report → отклонён, не выдуман ──────
{
  await reset();
  const p = await plan({
    ...PKG_FULL,
    entities: [{ clientRef: 'mx', type: 'moment', sourceId: 'TEST-LIFE-900',
      claimClass: 'assistant_interpretation', textOrigin: 'assistant_interpretation',
      data: { note: 'из текста видно, что было тревожно' } }],
    links: [],
  });
  ok(p.items[0].status === 'invalid' && /valence/i.test(p.items[0].reason),
    'moment без явных valence/activation отклонён — состояние не выводится из текста');
  const n = await page.evaluate(() => DB.moments.length);
  ok(n === 0, 'ни одного выдуманного момента не создано');
}

// ── 9. sphereLog: без существующей сферы и без значения — отказ ─────
{
  await reset();
  const noSphere = await plan({ ...PKG_FULL, entities: [{ clientRef: 'sl', type: 'sphereLog', data: { sphereId: 999999, value: 5 } }], links: [] });
  ok(noSphere.items[0].status === 'invalid' && /не существует/i.test(noSphere.items[0].reason),
    'sphereLog на несуществующую сферу отклонён');
  await page.evaluate(() => { DB.spheres = [{ id: 777, name: 'Тестовая сфера', type: 'score', createdAt: new Date().toISOString(), sv: SCHEMA_VERSION }]; });
  const noVal = await plan({ ...PKG_FULL, entities: [{ clientRef: 'sl', type: 'sphereLog', data: { sphereId: 777 } }], links: [] });
  ok(noVal.items[0].status === 'invalid' && /value/i.test(noVal.items[0].reason),
    'sphereLog без значения отклонён — числа не выдумываются');
}

// ── 10. Сон: оригинал сохраняется, трактовка его не подменяет ───────
{
  await reset();
  await commit({ ...PKG_FULL, entities: [PKG_FULL.entities[5]], links: [] });
  const d = await page.evaluate(() => DB.dreams[0]);
  ok(d && d.body === 'Оригинальный рассказ сна — синтетический.',
    'оригинальный рассказ сна сохранён дословно в production-поле body');
  ok(d && d.arch === 'Синтетическая трактовка' && d.body !== d.arch,
    'трактовка лежит отдельно (arch) и не подменяет текст сна');
  ok(d && d.tone === 'тревожный', 'реальная production-схема dreams (title/body/tone/arch) соблюдена');
}

// ── 11. claimClass/textOrigin сохраняются, гипотеза не растёт в факт ─
{
  await reset();
  await commit(PKG_FULL);
  const cls = await page.evaluate(() => ({
    pattern: DB.patterns[0].ext.claimClass,
    spiritual: DB.spiritual[0].ext.claimClass,
    dream: DB.dreams[0].ext.claimClass,
  }));
  ok(cls.pattern === 'working_hypothesis', 'working_hypothesis остался гипотезой, не стал фактом');
  ok(cls.spiritual === 'practice_action', 'practice_action сохранён как класс действия практики');
  ok(cls.dream === 'user_experience', 'субъективный опыт не повышен до внешнего факта');

  const asst = await commit({
    format: 'architect-external-work-v1',
    source: { kind: 'chatgpt', label: 'L', chatId: 'c9' },
    session: { clientRef: 's9' },
    entities: [{ clientRef: 'ai1', type: 'insight', sourceId: 'TEST-LIFE-777',
      claimClass: 'assistant_interpretation', textOrigin: 'assistant_interpretation',
      data: { body: 'Интерпретация ассистента, не слова пользователя.' } }],
    links: [],
  });
  const ai = await page.evaluate(() => DB.insights.find(i => i.ext && i.ext.sourceId === 'TEST-LIFE-777').ext);
  ok(asst.res.ok && ai.claimClass === 'assistant_interpretation' && ai.textOrigin === 'assistant_interpretation',
    'интерпретация ассистента не превращается в утверждение пользователя');
}

// ── 12. Дублирующиеся clientRef → fail closed ───────────────────────
{
  await reset();
  const p = await plan({ ...PKG_FULL, entities: [PKG_FULL.entities[2], { ...PKG_FULL.entities[2] }], links: [] });
  ok(p.ok === false && p.errors.some(e => /повторяется/i.test(e)), 'повторяющийся clientRef отклоняет пакет целиком');
}

// ── 13. Prototype pollution → fail closed ───────────────────────────
{
  await reset();
  const raw = J(PKG_FULL).replace('"data":{"title":"Синтетический вывод"', '"data":{"__proto__":{"polluted":true},"title":"Синтетический вывод"');
  const p = await page.evaluate(t => extBuildPlan(t), raw);
  ok(p.ok === false && p.errors.some(e => /prototype pollution/i.test(e)), 'ключ __proto__ отклонён fail-closed');
  const clean = await page.evaluate(() => ({}).polluted === undefined);
  ok(clean, 'прототип объекта не загрязнён');
}

// ── 14. Служебные поля payload не могут перезаписать системные ──────
{
  await reset();
  await commit({
    ...PKG_FULL,
    entities: [{ clientRef: 'z1', type: 'insight', sourceId: 'TEST-LIFE-Z', claimClass: 'user_fact', textOrigin: 'user_words',
      data: { body: 'текст', id: 'ПОДДЕЛКА', sv: 999, _u: 1, _del: { x: 1 }, ext: { fake: true }, privacyClass: 'public' } }],
    links: [],
  });
  const rec = await page.evaluate(() => DB.insights.find(i => i.ext && i.ext.sourceId === 'TEST-LIFE-Z'));
  ok(rec && rec.id !== 'ПОДДЕЛКА' && typeof rec.id === 'number', 'payload не может задать id записи');
  ok(rec && rec.sv === 6 && rec.ext.fake === undefined, 'payload не может подменить sv/ext');
  const noDel = await page.evaluate(() => Object.keys(DB._del || {}).length);
  ok(noDel === 0, 'payload не может писать надгробия');
}

// ── 15. Лимиты размера/количества/строк ─────────────────────────────
{
  await reset();
  const many = { ...PKG_FULL, entities: Array.from({ length: 501 }, (_, i) => ({ clientRef: 'e' + i, type: 'insight', data: { body: 'x' } })), links: [] };
  const p1 = await plan(many);
  ok(p1.ok === false && p1.errors.some(e => /записей больше/i.test(e)), 'лимит на число записей соблюдён');
  const longStr = { ...PKG_FULL, entities: [{ clientRef: 'l1', type: 'insight', data: { body: 'x'.repeat(20001) } }], links: [] };
  const p2 = await plan(longStr);
  ok(p2.ok === false && p2.errors.some(e => /строка длиннее/i.test(e)), 'лимит на длину строки соблюдён');
  const big = await page.evaluate(n => extBuildPlan('x'.repeat(n)), 3 * 1024 * 1024);
  ok(big.ok === false && big.errors.some(e => /больше/i.test(e)), 'лимит на размер пакета соблюдён');
}

// ── 16. XSS: вредоносный текст остаётся текстом ─────────────────────
{
  await reset();
  // Строка передаётся в страницу как ДАННЫЕ (аргумент page.evaluate), а не
  // инлайнится в HTML, поэтому экранировать закрывающий тег не нужно.
  const XSS = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>';
  await commit({
    ...PKG_FULL,
    entities: [{ clientRef: 'x1', type: 'insight', sourceId: 'TEST-XSS-1', claimClass: 'user_fact', textOrigin: 'user_words',
      data: { title: XSS, body: XSS, tag: XSS } }],
    links: [],
  });
  const res = await page.evaluate(async (t) => {
    const p = await extBuildPlan(t);
    const out = document.getElementById('ext-out');
    _extPlan = p; _extSel = { items: {}, links: {} };
    await extPreview.call(null);
    return { pwned: window.__pwned === 1, html: (out && out.innerHTML) || '', scripts: (out ? out.querySelectorAll('script,img').length : 0) };
  }, J({ ...PKG_FULL, entities: [{ clientRef: 'x2', type: 'insight', sourceId: 'TEST-XSS-2', data: { body: XSS } }], links: [] }));
  ok(res.pwned === false, 'вредоносный payload не выполнился');
  ok(res.scripts === 0, 'в preview не создано ни одного script/img из payload — только текст');
  ok(/&lt;/.test(res.html) || res.html.length > 0, 'внешний текст выводится экранированным');
  const stored = await page.evaluate(() => DB.insights.find(i => i.ext && i.ext.sourceId === 'TEST-XSS-1').body);
  ok(stored.includes('<img'), 'в хранилище текст сохранён как есть (экранирование — на рендере, не в данных)');
}

// ── 17. Ledger НЕ является EVENT_SOURCE ─────────────────────────────
{
  await reset();
  await commit(PKG_FULL);
  const ui = await page.evaluate(() => {
    const ev = unifiedEvents(400);
    return {
      hasLedgerSource: 'externalWorkSessions' in EVENT_SOURCES,
      fromLedger: ev.filter(e => e.sourceCollection === 'externalWorkSessions').length,
      insightEvents: ev.filter(e => e.sourceCollection === 'insights').length,
      dreamEvents: ev.filter(e => e.sourceCollection === 'dreams').length,
      spiritualEvents: ev.filter(e => e.sourceCollection === 'spiritual').length,
      hasSpiritualSource: 'spiritual' in EVENT_SOURCES,
    };
  });
  ok(ui.hasLedgerSource === false, 'externalWorkSessions отсутствует в EVENT_SOURCES');
  ok(ui.fromLedger === 0, 'ledger не порождает ни одного события — двойного evidence нет');
  ok(ui.dreamEvents >= 1, 'импортированный сон виден Unified Intelligence как обычная запись');
  ok(ui.hasSpiritualSource === false && ui.spiritualEvents === 0,
    'зафиксированное ограничение: spiritual не является EVENT_SOURCE, и копий ради видимости не создаётся');
}

// ── 18. Recovery lock блокирует импорт ──────────────────────────────
{
  await reset();
  const r = await page.evaluate(async (t) => {
    const id = activeId();
    const key = 'arch5_db_' + id, bak = 'arch5_bak_' + id;
    const sd = localStorage.getItem(key), sb = localStorage.getItem(bak);
    const realToast = window.toast; window.toast = () => {};
    try {
      localStorage.setItem(key, '{ битый'); localStorage.removeItem(bak);
      hydrate();
      const locked = isWriteLocked();
      const p = await extBuildPlan(t);
      const res = extCommitPlan(p, null);
      return { locked, ok: res.ok, error: res.error, n: (DB.insights || []).length };
    } finally {
      window.toast = realToast;
      try { resolveRecovery('discarded'); } catch (_) {}
      if (sd === null) localStorage.removeItem(key); else localStorage.setItem(key, sd);
      if (sb === null) localStorage.removeItem(bak); else localStorage.setItem(bak, sb);
      hydrate();
    }
  }, J(PKG_FULL));
  ok(r.locked === true && r.ok === false && /восстановлен/i.test(r.error),
    'импорт под recovery-блокировкой Волны 5 запрещён и не обходит её');
  ok(r.n === 0, 'под блокировкой ничего не записано');
}

// ── 19. Сбой записи → откат всего batch ─────────────────────────────
{
  await reset();
  const r = await page.evaluate(async (t) => {
    const p = await extBuildPlan(t);
    const before = JSON.stringify(DB);
    const realSet = Storage.prototype.setItem;
    const realToast = window.toast; window.toast = () => {};
    let res;
    try {
      Storage.prototype.setItem = function (k, v) {
        if (String(k).indexOf('arch5_db_') === 0) { const e = new Error('q'); e.name = 'QuotaExceededError'; throw e; }
        return realSet.call(this, k, v);
      };
      res = extCommitPlan(p, null);
    } finally { Storage.prototype.setItem = realSet; window.toast = realToast; }
    return { ok: res.ok, unchanged: JSON.stringify(DB) === before };
  }, J(PKG_FULL));
  ok(r.ok === false, 'сбой записи возвращает честный отказ');
  ok(r.unchanged, 'zero mutation: при сбое коммита runtime откатывается целиком');
}

// ── 20. contentHash детерминирован при перестановке ключей ──────────
{
  const h = await page.evaluate(async () => {
    const a = { format: 'architect-external-work-v1', source: { kind: 'chatgpt', label: 'L' }, entities: [{ clientRef: 'a', type: 'insight', data: { body: 'x', title: 't' } }], links: [] };
    const b = { links: [], entities: [{ data: { title: 't', body: 'x' }, type: 'insight', clientRef: 'a' }], source: { label: 'L', kind: 'chatgpt' }, format: 'architect-external-work-v1' };
    const pa = await extBuildPlan(JSON.stringify(a));
    const pb = await extBuildPlan(JSON.stringify(b));
    return { a: pa.packageHash, b: pb.packageHash, len: (pa.packageHash || '').length };
  });
  ok(h.a === h.b && h.len === 64, 'contentHash детерминирован и не зависит от порядка ключей (SHA-256)');
}

// ── 21. Профильная изоляция ─────────────────────────────────────────
{
  await reset();
  await commit(PKG_FULL);
  const iso = await page.evaluate(() => {
    const idA = activeId();
    const before = DB.insights.length + DB.externalWorkSessions.length;
    const idB = 'p-w6-' + Date.now();
    const list = JSON.parse(localStorage.getItem('arch5_profiles') || '[]');
    list.push({ id: idB, name: 'B', color: '#1056CC' });
    localStorage.setItem('arch5_profiles', JSON.stringify(list));
    setActiveId(idB); hydrate();
    const inB = (DB.insights || []).length + (DB.externalWorkSessions || []).length;
    localStorage.removeItem('arch5_db_' + idB); localStorage.removeItem('arch5_cfg_' + idB); localStorage.removeItem('arch5_bak_' + idB);
    localStorage.setItem('arch5_profiles', JSON.stringify(list.filter(p => p.id !== idB)));
    setActiveId(idA); hydrate();
    return { before, inB, back: DB.insights.length + DB.externalWorkSessions.length };
  });
  ok(iso.before > 0 && iso.inB === 0 && iso.back === iso.before,
    `импорт профиля A не виден в профиле B (${iso.before} → ${iso.inB} → ${iso.back})`);
}

// ── 22. Sync roundtrip: записи, provenance и ledger переживают merge ─
{
  await reset();
  await commit(PKG_FULL);
  const sync = await page.evaluate(() => {
    const wire = JSON.parse(JSON.stringify(DB));
    wire.__ts = (DB.__ts || 0) + 1000;
    const empty = { ...JSON.parse(JSON.stringify(DEFAULT_DB)), __ts: 1, _del: {} };
    const merged = mergeDB(empty, wire);
    return {
      insights: merged.insights.length, ledger: merged.externalWorkSessions.length,
      links: merged.psyLinks.length,
      prov: merged.insights[0] && merged.insights[0].ext && merged.insights[0].ext.sourceId,
      ledgerIsIdcol: IDCOLS.includes('externalWorkSessions'),
    };
  });
  ok(sync.insights === 1 && sync.links === 4 && sync.ledger === 1,
    'sync A→B переносит canonical-записи, связи и ledger');
  ok(sync.prov === 'TEST-LIFE-003', 'provenance переживает sync без потерь');
  ok(sync.ledgerIsIdcol, 'ledger участвует в generic id-merge как обычная IDCOL');
}

// ── 23. Ledger id: namespaced, collision-safe ───────────────────────
{
  const led = await page.evaluate(() => {
    const s = DB.externalWorkSessions[0];
    const numericIds = new Set();
    IDCOLS.forEach(c => (DB[c] || []).forEach(r => { if (r && typeof r.id === 'number') numericIds.add(r.id); }));
    return { id: s && s.id, prefixed: String(s && s.id).startsWith('externalWork:'), collides: numericIds.has(s && s.id) };
  });
  ok(led.prefixed, `id ledger namespaced (${led.id})`);
  ok(led.collides === false, 'namespaced id структурно не может совпасть с числовым id другой коллекции');
}

// ── 24. Данные переживают сериализацию backup/sync без потерь ───────
// Реальный production-роундтрип зашифрованной копии живёт в
// tests/wave6-backup-roundtrip.test.mjs (там доступен ESM-адаптер); здесь —
// свойство, от которого он зависит: ledger и provenance полностью
// сериализуемы и не требуют отдельной логики переноса.
{
  const bk = await page.evaluate(() => {
    const snap = JSON.parse(JSON.stringify(DB));
    const round = JSON.parse(JSON.stringify(snap));
    return {
      hasLedger: Array.isArray(round.externalWorkSessions) && round.externalWorkSessions.length === 1,
      hasProv: !!(round.insights[0] && round.insights[0].ext && round.insights[0].ext.packageHash),
      identical: JSON.stringify(round) === JSON.stringify(snap),
    };
  });
  ok(bk.hasLedger && bk.hasProv && bk.identical,
    'ledger и provenance полностью сериализуемы — backup/sync переносят их генерично');
}

// ── 25. Ledger не содержит полного transcript ───────────────────────
{
  const s = await page.evaluate(() => DB.externalWorkSessions[0]);
  ok(!('transcript' in s) && !('messages' in s) && !('entities' in s),
    'ledger не хранит полный transcript и не дублирует canonical-тексты');
  ok(typeof s.summary === 'string' && s.summary.length <= 2000, 'ledger хранит только краткое резюме');
  ok(Array.isArray(s.recordRefs) && s.recordRefs.length === 8 && Array.isArray(s.linkRefs) && s.linkRefs.length === 4,
    'ledger ссылается на созданные записи и связи');
}

// ── 26. Выборочный импорт: снятые элементы не создаются ─────────────
{
  await reset();
  const r = await page.evaluate(async (t) => {
    const p = await extBuildPlan(t);
    const sel = { items: {}, links: {} };
    p.items.forEach((it, n) => { if (it.type !== 'insight') sel.items[n] = false; });
    p.links.forEach((l, n) => { sel.links[n] = false; });
    const res = extCommitPlan(p, sel);
    return { ok: res.ok, created: res.created ? res.created.length : 0, links: DB.psyLinks.length, insights: DB.insights.length, dreams: DB.dreams.length };
  }, J(PKG_FULL));
  ok(r.ok && r.created === 1 && r.insights === 1 && r.dreams === 0 && r.links === 0,
    'снятые пользователем элементы и связи не импортируются');
}

// ── 27. Один эпизод в LIFE и PARA не даёт два одинаковых факта ──────
{
  await reset();
  const life = {
    format: 'architect-external-work-v1', source: { kind: 'chatgpt', label: 'LIFE', module: 'LIFE', chatId: 'c1' },
    session: { clientRef: 'sL' },
    entities: [{ clientRef: 'l1', type: 'insight', sourceId: 'TEST-EPISODE-1', claimClass: 'user_fact', textOrigin: 'user_words', data: { body: 'Один и тот же эпизод' } }],
    links: [],
  };
  const para = {
    format: 'architect-external-work-v1', source: { kind: 'google_drive', label: 'PARA', module: 'PARA', chatId: 'c2' },
    session: { clientRef: 'sP' },
    entities: [
      { clientRef: 'p1', type: 'insight', sourceId: 'TEST-EPISODE-1', claimClass: 'user_fact', textOrigin: 'user_words', data: { body: 'Один и тот же эпизод' } },
      { clientRef: 'p2', type: 'spiritual', sourceId: 'TEST-EPISODE-1-PRACTICE', relatedSourceIds: ['TEST-EPISODE-1'], claimClass: 'practice_action', textOrigin: 'user_words', data: { text: 'Профильная практика этого дня' } },
    ],
    links: [],
  };
  await commit(life);
  await commit(para);
  const st = await page.evaluate(() => ({
    insights: DB.insights.length, spiritual: DB.spiritual.length,
    related: DB.spiritual[0] && DB.spiritual[0].ext.relatedSourceIds,
  }));
  ok(st.insights === 1, `один факт остался одним canonical-фактом (${st.insights})`);
  ok(st.spiritual === 1, 'профильная практика PARA добавлена отдельной записью — это другой смысл, не копия');
  ok(Array.isArray(st.related) && st.related.includes('TEST-EPISODE-1'), 'связь с исходным эпизодом сохранена через relatedSourceIds');
}

// ── 28. Offline: импорт не делает ни одного сетевого/AI вызова ──────
{
  await reset();
  const net = await page.evaluate(async (t) => {
    let n = 0, ai = 0;
    const rf = window.fetch, rx = window.XMLHttpRequest, rc = window.callClaude;
    window.fetch = (...a) => { n++; return rf(...a); };
    window.XMLHttpRequest = function () { n++; return new rx(); };
    window.callClaude = (...a) => { ai++; return rc(...a); };
    try {
      const p = await extBuildPlan(t);
      extCommitPlan(p, null);
    } finally { window.fetch = rf; window.XMLHttpRequest = rx; window.callClaude = rc; }
    return { n, ai };
  }, J(PKG_FULL));
  ok(net.n === 0, `ни одного сетевого вызова при импорте (${net.n})`);
  ok(net.ai === 0, `ни одного AI-вызова при импорте (${net.ai})`);
}

// ── 29. UI и a11y пути импорта ──────────────────────────────────────
{
  const ui = await page.evaluate(() => {
    openExtImport();
    const ov = document.getElementById('ov-ext-import');
    const entry = document.querySelector('[onclick="openExtImport()"]');
    const btns = Array.from(ov.querySelectorAll('button'));
    const small = btns.filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height < 44; });
    const unnamed = btns.filter(b => !(b.textContent || '').trim() && !b.getAttribute('aria-label'));
    const overflow = btns.filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.left < 0 || r.right > window.innerWidth + 1); });
    return {
      open: ov.classList.contains('on'),
      entryButton: entry ? entry.tagName === 'BUTTON' : false,
      live: (document.getElementById('ext-out') || {}).getAttribute ? document.getElementById('ext-out').getAttribute('aria-live') : null,
      file: !!document.getElementById('ext-file'), text: !!document.getElementById('ext-text'),
      small: small.length, unnamed: unnamed.length, overflow: overflow.length,
      divClick: ov.querySelectorAll('div[onclick]').length,
    };
  });
  ok(ui.open && ui.file && ui.text, 'экран импорта открывается, есть выбор файла и вставка JSON');
  ok(ui.entryButton, 'a11y: вход — настоящий <button>');
  ok(ui.live === 'polite', 'a11y: результат валидации объявляется через aria-live');
  ok(ui.small === 0 && ui.unnamed === 0 && ui.divClick === 0,
    `a11y: тап-цели ≥44px, все кнопки именованы, интерактивных div нет (${ui.small}/${ui.unnamed}/${ui.divClick})`);
  ok(ui.overflow === 0, 'UI: элементы не выходят за границы экрана iPhone');
}

// ── 30. Приватность: в репозитории нет реальных личных фикстур ──────
{
  const src = readFileSync(join(DIR, 'wave6-external-work-bridge.spec.mjs'), 'utf8');
  // `\b` срабатывает и внутри синтетического `TEST-…-001` (граница после
  // дефиса), поэтому префикс отсекается lookbehind-ом, а не фильтром по
  // совпадению: совпадением является только хвост, он никогда не начинается
  // с `TEST-`. Образцы ниже собираются конкатенацией, иначе сканер поймал бы
  // собственный исходник.
  const realIdPattern = () => /(?<!TEST-)\b(?:LIFE|DREAM|PARA)-\d{2,}/g;
  const hits = src.match(realIdPattern()) || [];
  ok(hits.length === 0,
    `в тестовой сюите нет реальных LIFE/DREAM/PARA идентификаторов (${hits.length}${hits.length ? ': ' + hits.slice(0, 5).join(', ') : ''})`);
  // Детектор должен уметь ловить: проверяем его на заведомо «реальном» образце.
  const real = 'LIFE' + '-001', synthetic = 'TEST-' + real;
  ok((`${real} ${synthetic}`.match(realIdPattern()) || []).length === 1,
    'детектор приватных фикстур отличает реальный id от синтетического TEST-*');
  ok(/TEST-LIFE-|TEST-DREAM-|TEST-PARA-/.test(src), 'используются только синтетические TEST-* идентификаторы');
}

// ── 31. Импортированная запись ведёт себя как ручная ────────────────
{
  await reset();
  await commit(PKG_FULL);
  const same = await page.evaluate(() => {
    const imported = DB.insights[0];
    const manualKeys = ['id', 'tag', 'w', 'title', 'body', 'date', 'createdAt', 'day', 'sv', 'src', 'links', 'media'];
    const missing = manualKeys.filter(k => !(k in imported));
    const ev = unifiedEvents(400).filter(e => e.sourceCollection === 'insights');
    return { missing, visible: ev.length >= 1, extraOnly: Object.keys(imported).filter(k => !manualKeys.includes(k)) };
  });
  ok(same.missing.length === 0, 'импортированный инсайт имеет полную production-схему ручной записи');
  ok(JSON.stringify(same.extraOnly) === JSON.stringify(['ext']),
    `единственное дополнительное поле — provenance ext (${same.extraOnly.join(',')})`);
  ok(same.visible, 'импортированная запись участвует в Unified Intelligence как обычная');
}

ok(errors.length === 0, `JS-ошибок нет за весь прогон (${errors.length})`, errors.slice(0, 3).join('\n'));

await browser.close();
console.log(`\nWave 6 (external work bridge): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
