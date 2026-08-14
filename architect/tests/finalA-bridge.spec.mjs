// FINAL A — Universal External Sources Bridge (provider-neutral).
//
// ВСЕ фикстуры синтетические (TEST-FA-*). Реальные данные владельца в
// репозиторий не попадают ни в каком виде (privacy canary внизу).
//
// Гоняет РЕАЛЬНЫЙ собранный бандл (dist/app.html) в Chromium.

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..');
const FILE = 'file://' + (process.env.FINALA_BUNDLE || join(ROOT, 'dist', 'app.html'));
let pass = 0, fail = 0;
const errors = [];
const ok = (cond, msg, detail) => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); if (detail) console.log('      ' + String(detail).split('\n').join('\n      ')); }
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const netRequests = [];
async function boot() {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  p.on('pageerror', e => errors.push(e.message));
  await p.route('**/*', r => {
    const u = r.request().url();
    if (!u.startsWith('file://')) { netRequests.push(u); return r.abort(); }
    return r.continue();
  });
  await p.goto(FILE);
  await p.waitForSelector('#nsh-tabbar', { state: 'attached' });
  await p.evaluate(() => {
    const s = document.getElementById('splash'); if (s) s.style.display = 'none';
    document.querySelectorAll('.ov.on').forEach(e => e.classList.remove('on'));
  });
  await p.waitForTimeout(120);
  return p;
}
const page = await boot();

const reset = () => page.evaluate(() => {
  ['externalConnections', 'externalWorkSessions', 'insights', 'dreams', 'patterns', 'whys', 'moments',
    'psyFormulations', 'psyGoals', 'psyInterventionEpisodes', 'psyObservations', 'psyReviews',
    'psyLinks', 'relationshipContexts', 'spiritual', 'evolution', 'sphereLogs'].forEach(c => { DB[c] = []; });
  DB._del = {};
  try { resolveRecovery('discarded'); } catch (_) {}
  if (typeof extBridgeCancel === 'function') extBridgeCancel();
});

// Синтетический v2-пакет.
const pkg = (n, over) => ({
  format: 'architect-external-work-v2',
  source: { kind: 'google_drive', label: 'TEST-FA источник', module: 'TEST-FA-MODULE' },   // provenance пакета (Волна 6) — не идентичность
  session: { clientRef: 'TEST-FA-SESSION-' + n, summary: 'синтетическая сессия ' + n, date: '2026-04-0' + ((n % 9) + 1) },
  entities: [
    { clientRef: 'i' + n, type: 'insight', sourceId: 'TEST-FA-SRC-' + n,
      claimClass: 'user_experience', textOrigin: 'user_words',
      sourceVersion: { sequence: n },   // §19: ordering evidence для update-путей
      data: { title: 'TEST-FA инсайт ' + n, body: 'синтетический текст инсайта номер ' + n, tag: 'personal' } },
  ],
  links: [],
  ...over,
});
const feed = (packages) => ({ format: 'architect-external-work-feed-v1', packages });

const connCreate = (label, kind) => page.evaluate(({ l, k }) => {
  const r = extConnCreate(l, k);
  return { ok: r.ok, id: r.rec && r.rec.id, errors: r.errors };
}, { l: label || 'TEST-FA источник', k: kind || 'manual_file' });
const refresh = (id, obj) => page.evaluate(async ({ i, t }) => {
  const r = await extBridgeRefresh(i, t);
  return JSON.parse(JSON.stringify(r));
}, { i: id, t: JSON.stringify(obj) });
const apply = (id) => page.evaluate((i) => JSON.parse(JSON.stringify(extBridgeApply(i))), id);
const snapshot = () => page.evaluate(() =>
  JSON.stringify({ ins: DB.insights, dre: DB.dreams, ews: DB.externalWorkSessions }));
const connState = (id) => page.evaluate((i) => JSON.parse(JSON.stringify(extConnFind(i))), id);

console.log('\n── FINAL A: Universal External Sources Bridge ──');

// ═══ 1. Схема/модель ════════════════════════════════════════════════
{
  const st = await page.evaluate(() => ({
    schema: SCHEMA_VERSION,
    coll: Array.isArray(DB.externalConnections),
    inId: IDCOLS.includes('externalConnections'),
    notEventSource: !('externalConnections' in EVENT_SOURCES),
    notImportable: !('externalConnection' in (typeof PSY_TYPE_TO_COLL === 'object' ? PSY_TYPE_TO_COLL : {})) &&
      !Object.values(EXT_TARGETS_V2).includes('externalConnections'),
    dc: dbCount({ externalConnections: [{ id: 'x' }] }),
    v1len: Object.keys(EXT_TARGETS).length, v2len: Object.keys(EXT_TARGETS_V2).length,
  }));
  ok(st.schema === 9 && st.coll && st.inId, `SCHEMA_VERSION=9, externalConnections в IDCOLS (${st.schema})`);
  ok(st.notEventSource, 'externalConnections НЕ входит в EVENT_SOURCES (не второй ledger)');
  ok(st.notImportable, 'подключения нельзя импортировать извне (не в EXT_TARGETS v1/v2)');
  ok(st.dc === 1, 'dbCount() считает подключения');
  ok(st.v1len === 9 && st.v2len === 14, `v1/v2 контракты НЕ изменены (${st.v1len}/${st.v2len} типов)`);
}

// ═══ 2. Connection lifecycle ════════════════════════════════════════
{
  await reset();
  const c = await connCreate();
  ok(c.ok && /^extConn:/.test(c.id), 'источник создаётся с namespaced id');
  const empty = await page.evaluate(() => extConnCreate('', 'other'));
  ok(!empty.ok, 'источник без названия отклонён');
  const st = await connState(c.id);
  ok(st.status === 'ready' && st.privacyClass === 'sensitive' && st.container === null &&
     Array.isArray(st.checkpoint.committedPackageHashes) && st.checkpoint.lastRefreshAt === null,
    'новый источник: ready (НЕ «подключён»), sensitive, пустой чекпойнт, контейнер пуст');

  const dis = await page.evaluate((i) => { extConnDisconnect(i); return extConnFind(i).status; }, c.id);
  ok(dis === 'disconnected', 'отключение переводит в disconnected');
  const refuse = await refresh(c.id, pkg(1));
  ok(!refuse.ok && /отключён/.test(refuse.errors[0]), 'импорт отключённого источника отклонён с причиной');
  const rec = await page.evaluate((i) => { extConnResume(i); return extConnFind(i).status; }, c.id);
  ok(rec === 'ready', 'включение снова возвращает ready');

  const rev = await page.evaluate((i) => { extConnMarkUnavailable(i); return JSON.parse(JSON.stringify(extConnFind(i))); }, c.id);
  ok(rev.status === 'source_unavailable' && /недоступен/.test(rev.checkpoint.lastError),
    'source_unavailable — отдельное provider-neutral состояние с причиной');
  const refuseRev = await refresh(c.id, pkg(1));
  ok(!refuseRev.ok && /недоступ/.test(refuseRev.errors[0]),
    'импорт при недоступном источнике отклонён — НЕ «новых данных нет»');
  await page.evaluate((i) => extConnResume(i), c.id);

  // Forget: tombstone, canonical записи не тронуты. Одна запись остаётся в
  // DB, иначе сработает штатная Wave-5 защита «не затирать непустое пустым».
  await page.evaluate(() => { DB.insights.push({ id: 7001, title: 'TEST-FA якорь', body: 'x', sv: SCHEMA_VERSION, _u: Date.now() }); persist(); });
  const before = await snapshot();
  const fg = await page.evaluate((i) => {
    const r = extConnForget(i);
    return { ok: r.ok, tomb: !!DB._del[i], left: DB.externalConnections.length };
  }, c.id);
  ok(fg.ok && fg.tomb && fg.left === 0, 'forget удаляет ТОЛЬКО состояние источника (tombstone)');
  ok(before === await snapshot(), 'forget не тронул canonical записи');
}

// ═══ 3. Malformed feed → fail closed, ошибка ≠ «нет данных» ════════
{
  await reset();
  const c = await connCreate();
  const before = await snapshot();
  const bad1 = await refresh(c.id, { format: 'architect-external-work-feed-v1', packages: [] });
  ok(!bad1.ok, 'пустой feed отклонён');
  const bad2 = await page.evaluate(async (i) => JSON.parse(JSON.stringify(await extBridgeRefresh(i, 'не json {'))), c.id);
  ok(!bad2.ok && /JSON/.test(bad2.errors[0]), 'битый JSON → явная ошибка разбора');
  const st = await connState(c.id);
  ok(st.status === 'error_requires_user' && st.checkpoint.lastError,
    'ошибка разбора видна статусом error_requires_user с причиной (parser fail ≠ 0 новых)');
  ok(before === await snapshot(), 'ошибки разбора не тронули canonical DB (zero mutation)');
  const bad3 = await refresh(c.id, { format: 'что-то-другое-v9', packages: [] });
  ok(!bad3.ok && /неизвестный format/.test(bad3.errors[0]), 'неизвестный формат отклонён с указанием ожидаемого');
  await page.evaluate((i) => extConnResume(i), c.id);
}

// ═══ 4. Initial import → checkpoint ПОСЛЕ commit ════════════════════
{
  await reset();
  const c = await connCreate();
  const before = await snapshot();
  const prev = await refresh(c.id, feed([pkg(1), pkg(2)]));
  ok(prev.ok && prev.totals.packages === 2 && prev.totals.new === 2 && prev.totals.skippedByCheckpoint === 0,
    `preview: 2 пакета, 2 новых записи (${prev.ok && prev.totals.new})`);
  ok(before === await snapshot(), 'preview НЕ мутирует canonical DB (discovery ≠ commit)');
  let st = await connState(c.id);
  ok(st.checkpoint.committedPackageHashes.length === 0, 'чекпойнт НЕ двигается на preview');
  ok(st.checkpoint.lastRefreshAt !== null && st.stats.refreshes === 1, 'lastRefreshAt/статистика refresh обновлены');

  const ap = await apply(c.id);
  ok(ap.ok && ap.results.filter(r => r.status === 'committed').length === 2, 'apply закоммитил оба пакета');
  const cnt = await page.evaluate(() => ({ ins: DB.insights.length, ews: DB.externalWorkSessions.length }));
  ok(cnt.ins === 2 && cnt.ews === 2, 'canonical записи созданы через штатный importer (2 инсайта, 2 сессии-леджера)');
  st = await connState(c.id);
  ok(st.checkpoint.committedPackageHashes.length === 2 && st.stats.packagesCommitted === 2 && st.stats.recordsCreated === 2,
    'чекпойнт продвинут ПОСЛЕ commit: 2 хэша, статистика верна');
}

// ═══ 5. Incremental + replay: 0 дублей ══════════════════════════════
{
  // Продолжение состояния из §4: тот же connection, повтор того же feed.
  const c = await page.evaluate(() => DB.externalConnections[0].id);
  const prev = await refresh(c, feed([pkg(1), pkg(2), pkg(3)]));
  ok(prev.ok && prev.totals.skippedByCheckpoint === 2 && prev.totals.new === 1,
    `инкрементальный refresh: 2 старых пакета пропущены чекпойнтом, 1 новый (${prev.totals.new})`);
  const ap = await apply(c);
  const cnt = await page.evaluate(() => DB.insights.length);
  ok(ap.ok && cnt === 3, 'применён только новый пакет — записей стало 3');

  // Полный replay всего feed.
  const replayPrev = await refresh(c, feed([pkg(1), pkg(2), pkg(3)]));
  ok(replayPrev.ok && replayPrev.totals.skippedByCheckpoint === 3 && replayPrev.totals.new === 0,
    'полный replay: все пакеты пропущены, 0 новых');
  const replayAp = await apply(c);
  const cnt2 = await page.evaluate(() => ({ ins: DB.insights.length, ews: DB.externalWorkSessions.length }));
  ok(replayAp.ok && cnt2.ins === 3 && cnt2.ews === 3, 'replay создал 0 дублей (записей по-прежнему 3)');

  // Stale cursor: чекпойнт обнулён (симуляция потери) — ledger страхует.
  const stale = await page.evaluate(async (i) => {
    extConnUpdate(i, x => { x.checkpoint.committedPackageHashes = []; });
    return null;
  }, c);
  const stalePrev = await refresh(c, feed([pkg(1), pkg(2), pkg(3)]));
  ok(stalePrev.ok && stalePrev.totals.skippedByCheckpoint === 3,
    'stale/потерянный cursor безопасен: ledger (already-imported) даёт те же 0 новых');
  const staleAp = await apply(c);
  const cnt3 = await page.evaluate(() => DB.insights.length);
  ok(staleAp.ok && cnt3 === 3, 'apply после stale cursor: 0 дублей');
  const recovered = await page.evaluate((i) => extConnFind(i).checkpoint.committedPackageHashes.length, c);
  ok(recovered === 3, 'checkpoint recovery: apply догоняет потерянный чекпойнт по ledger (3 хэша)');
}

// ═══ 6. Изменённый источник: same sourceId ≠ дубль ═════════════════
{
  await reset();
  const c = await connCreate();
  await refresh(c.id, pkg(7));
  await apply(c.id);
  // Тот же sourceId приходит из ДРУГОЙ сессии (другой пакет/хэш) — identity одна.
  const changed = pkg(8, { session: { clientRef: 'TEST-FA-SESSION-CH', summary: 'другая сессия', date: '2026-04-09' } });
  changed.entities[0].sourceId = 'TEST-FA-SRC-7';   // тот же семантический объект
  changed.entities[0].data.body = 'обновлённый синтетический текст';
  const prev = await refresh(c.id, changed);
  // Variant B: изменённый payload того же sourceId — это новая ВЕРСИЯ той же
  // записи (changed), не новая запись и не молчаливый existing.
  ok(prev.ok && prev.totals.changed === 1 && prev.totals.new === 0 && prev.totals.existing === 0,
    `same sourceId из другой сессии + изменённый текст → changed, НЕ новая запись (changed=${prev.totals.changed})`);
  const ap = await apply(c.id);
  const st6 = await page.evaluate(() => ({
    n: DB.insights.length,
    body: DB.insights[0].body,
    revs: (DB.insights[0].ext.revisions || []).length,
  }));
  ok(ap.ok && ap.results.some(r => r.status === 'committed' && r.updated === 1) && st6.n === 1,
    'подтверждённое обновление применено к ТОЙ ЖЕ записи — дубль не создан, чекпойнт продвинут');
  ok(st6.body === 'обновлённый синтетический текст' && st6.revs === 1,
    'содержимое обновлено, revision provenance записан');

  // Одинаковый текст + разные sourceId → ДВЕ записи (запрет text-dedup).
  // Импорт ПОСЛЕДОВАТЕЛЬНЫЙ: второй пакет планируется, когда первый текст
  // уже в canonical DB — text-dedup здесь дал бы ложный existing.
  const t1 = pkg(20); t1.entities[0].data.body = 'абсолютно одинаковый синтетический текст';
  const t2 = pkg(21); t2.entities[0].data.body = 'абсолютно одинаковый синтетический текст';
  await refresh(c.id, t1);
  await apply(c.id);
  const prevT = await refresh(c.id, t2);
  ok(prevT.ok && prevT.totals.new === 1, 'второй пакет с тем же текстом, но другим sourceId виден как НОВЫЙ');
  await apply(c.id);
  const cnt2 = await page.evaluate(() => DB.insights.length);
  ok(cnt2 === 3, 'одинаковый текст + разные sourceId → две записи (text-dedup запрещён)');
}

// ═══ 7. Interrupted transaction: пакет-ошибка не двигает чекпойнт ═══
{
  await reset();
  const c = await connCreate();
  const good = pkg(30);
  const conflictPkg = pkg(31);
  // Конфликт: тот же sourceId проецируется в ДРУГОЙ canonical тип.
  conflictPkg.entities[0] = {
    clientRef: 'd31', type: 'dream', sourceId: 'TEST-FA-SRC-30',
    claimClass: 'user_experience', textOrigin: 'user_words',
    data: { title: 'TEST-FA сон', body: 'синтетический сон' } };
  const after = pkg(32);
  await refresh(c.id, feed([good]));
  await apply(c.id);
  const prev = await refresh(c.id, feed([conflictPkg, after]));
  ok(prev.ok && prev.totals.conflicts === 1, 'cross-type конфликт идентичности виден в preview');
  const ap = await apply(c.id);
  ok(!ap.ok, 'apply останавливается на конфликтном пакете');
  const st = await connState(c.id);
  const cnt = await page.evaluate(() => ({ ins: DB.insights.length, dre: DB.dreams.length }));
  ok(cnt.dre === 0 && cnt.ins === 1, 'конфликтный пакет: zero mutation (сон не создан)');
  ok(st.checkpoint.committedPackageHashes.length === 1 && st.status === 'error_requires_user',
    'чекпойнт НЕ продвинут за ошибочный пакет; статус ошибки с причиной');

  // Сбой persist во время commit → zero mutation пакета, чекпойнт на месте.
  await page.evaluate((i) => extConnResume(i), c.id);
  const persistFail = await page.evaluate(async ({ i, t }) => {
    const r0 = await extBridgeRefresh(i, t);
    if (!r0.ok) return { setup: false };
    const before = JSON.stringify({ ins: DB.insights, ews: DB.externalWorkSessions });
    const real = window.persist;
    window.persist = () => false;
    let ap2;
    try { ap2 = extBridgeApply(i); } finally { window.persist = real; }
    const afterS = JSON.stringify({ ins: DB.insights, ews: DB.externalWorkSessions });
    return { setup: true, apOk: ap2.ok, same: before === afterS,
      hashes: extConnFind(i).checkpoint.committedPackageHashes.length };
  }, { i: c.id, t: JSON.stringify(pkg(33)) });
  ok(persistFail.setup && !persistFail.apOk && persistFail.same && persistFail.hashes === 1,
    'сбой persist при commit: canonical byte-identical, чекпойнт не двигался');
}

// ═══ 7b. Atomic feed: good A + merge M + failing B + good C → полный откат ═══
{
  await reset();
  const c = await connCreate();
  // База: SRC-80 закоммичен как insight.
  await refresh(c.id, pkg(80));
  await apply(c.id);
  const A = pkg(81);   // хороший новый пакет ДО ошибки
  const M = pkg(83, { session: { clientRef: 'TEST-FA-SESSION-M83', summary: 'псевдоним', date: '2026-04-05' } });
  M.entities[0].sourceId = 'TEST-FA-SRC-80';   // тот же объект + новый alias → addRefs-merge
  M.entities[0].sourceRefs = [{ sourceId: 'TEST-FA-ALIAS-80', role: 'alias' }];
  const B = pkg(84);   // детерминированный конфликт: SRC-80 другим canonical типом
  B.entities[0] = { clientRef: 'd84', type: 'dream', sourceId: 'TEST-FA-SRC-80',
    claimClass: 'user_experience', textOrigin: 'user_words',
    data: { title: 'TEST-FA конфликт', body: 'синтетический конфликт типов' } };
  const C = pkg(82);   // хороший пакет ПОСЛЕ ошибки
  const canonicalSnap = (id) => page.evaluate((i) => JSON.stringify({
    ins: DB.insights, dre: DB.dreams, ews: DB.externalWorkSessions,
    ck: extConnFind(i).checkpoint.committedPackageHashes,
  }), id);
  const beforeAll = await canonicalSnap(c.id);
  const prev = await refresh(c.id, feed([A, M, B, C]));
  ok(prev.ok && prev.totals.conflicts === 1, 'atomic feed: конфликтный пакет виден в preview');
  const ap = await apply(c.id);
  ok(!ap.ok && ap.rolledBack === true &&
     ap.results.some(r => r.status === 'rolled_back') && ap.results.some(r => r.status === 'failed'),
    'atomic feed: apply падает и честно сообщает об откате уже применённых пакетов');
  ok(beforeAll === await canonicalSnap(c.id),
    'atomic feed: canonical, ledger, sourceRefs и checkpoint byte-identical после сбоя (A и merge M откатены, partial import отсутствует)');
  const stored = await page.evaluate((i) => {
    const raw = JSON.parse(localStorage.getItem('arch5_db_' + activeId()) || '{}');
    return JSON.stringify({ ins: raw.insights, dre: raw.dreams, ews: raw.externalWorkSessions,
      ck: ((raw.externalConnections || []).find(x => x.id === i) || { checkpoint: {} }).checkpoint.committedPackageHashes });
  }, c.id);
  ok(stored === beforeAll, 'atomic feed: откат сохранён и в localStorage (persisted rollback)');
  // Пользователь исправляет feed (без B) и повторяет его ЦЕЛИКОМ.
  const prev2 = await refresh(c.id, feed([A, M, C]));
  const ap2 = await apply(c.id);
  const after2 = await page.evaluate((i) => ({
    ins: DB.insights.length,
    refs: ((DB.insights.find(r => r.ext && r.ext.sourceId === 'TEST-FA-SRC-80') || { ext: {} }).ext.sourceRefs || []).length,
    ck: extConnFind(i).checkpoint.committedPackageHashes.length,
  }), c.id);
  ok(prev2.ok && ap2.ok && after2.ins === 3 && after2.ck === 4,
    `исправленный feed применяется целиком: 3 записи, чекпойнт 4 хэша (${after2.ins}/${after2.ck})`);
  ok(after2.refs >= 2, `merge M применился только в успешном feed: у SRC-80 несколько sourceRefs (${after2.refs})`);
}

// ═══ 7c. Commit прошёл, чекпойнт не сохранился → честное degraded ═══
{
  await reset();
  const c = await connCreate();
  const deg = await page.evaluate(async ({ i, t }) => {
    const r0 = await extBridgeRefresh(i, t);
    if (!r0.ok) return { setup: false };
    // persist №1 — commit пакета (успех), №2 — сохранение чекпойнта (сбой).
    const real = window.persist;
    let n = 0;
    window.persist = () => { n++; return n === 2 ? false : real(); };
    let ap;
    try { ap = extBridgeApply(i); } finally { window.persist = real; }
    const conn = extConnFind(i);
    return { setup: true, apOk: ap.ok, degraded: ap.degraded === true, msg: ap.errors[0] || '',
      ins: DB.insights.length, ews: DB.externalWorkSessions.length,
      hashes: conn.checkpoint.committedPackageHashes.length,
      status: conn.status, lastError: conn.checkpoint.lastError || '' };
  }, { i: c.id, t: JSON.stringify(pkg(90)) });
  ok(deg.setup && !deg.apOk && deg.degraded && deg.ins === 1 && deg.ews === 1 && deg.hashes === 0,
    'commit прошёл, а чекпойнт не сохранился: НЕ full success — canonical применён, checkpoint не сохранён (degraded)');
  ok(/контрольная точка|checkpoint/.test(deg.msg) && /дубли исключены/.test(deg.msg),
    'degraded-сообщение честно объясняет состояние и безопасность повтора');
  ok(deg.status === 'error_requires_user' && /не сохранена/.test(deg.lastError),
    'подключение видно как требующее вмешательства, не как «всё в порядке»');
  // Replay: ledger даёт 0 дублей, apply догоняет чекпойнт.
  const replay = await refresh(c.id, pkg(90));
  ok(replay.ok && replay.totals.skippedByCheckpoint === 1 && replay.totals.new === 0,
    'replay после degraded: пакет узнан ledger\'ом (0 новых)');
  const replayAp = await apply(c.id);
  const rec = await page.evaluate((i) => ({
    ins: DB.insights.length, hashes: extConnFind(i).checkpoint.committedPackageHashes.length,
    status: extConnFind(i).status,
  }), c.id);
  ok(replayAp.ok && rec.ins === 1 && rec.hashes === 1,
    'replay: 0 дублей и checkpoint recovery — чекпойнт догнал ledger');
}

// ═══ 8. Claim safety: интерпретации не становятся фактами ═══════════
{
  await reset();
  const c = await connCreate();
  // Adversarial: сон пользователя + утверждение ассистента «это инициация».
  const adv = pkg(40);
  adv.entities = [
    { clientRef: 'dr1', type: 'dream', sourceId: 'TEST-FA-DREAM-1',
      claimClass: 'user_experience', textOrigin: 'user_words',
      data: { title: 'TEST-FA сон', body: 'мне приснился синтетический полёт' } },
    { clientRef: 'in1', type: 'spiritual', sourceId: 'TEST-FA-INTERP-1',
      claimClass: 'symbolic_interpretation', textOrigin: 'assistant_interpretation',
      data: { text: 'это означает синтетическую инициацию', type: 'интерпретация' } },
  ];
  await refresh(c.id, adv);
  const ap = await apply(c.id);
  const claims = await page.evaluate(() => ({
    dream: DB.dreams[0] && DB.dreams[0].ext.claimClass,
    interp: DB.spiritual[0] && DB.spiritual[0].ext.claimClass,
    interpOrigin: DB.spiritual[0] && DB.spiritual[0].ext.textOrigin,
  }));
  ok(ap.ok && claims.dream === 'user_experience', 'сон сохранён как опыт пользователя');
  ok(claims.interp === 'symbolic_interpretation' && claims.interpOrigin === 'assistant_interpretation',
    'интерпретация ассистента осталась symbolic_interpretation/assistant_interpretation — НЕ повышена до факта');

  // Попытка пакета объявить слова ассистента фактом: класс+origin сохранены
  // как есть в provenance и видимы; повышения в movе-инвариантах нет.
  const promo = pkg(41);
  promo.entities = [{ clientRef: 'p1', type: 'insight', sourceId: 'TEST-FA-PROMO-1',
    claimClass: 'user_fact', textOrigin: 'assistant_interpretation',
    data: { title: 'TEST-FA', body: 'ассистент решил, что это факт' } }];
  const prev = await refresh(c.id, promo);
  const item = prev.ok ? null : prev.errors[0];
  ok(!prev.ok && /не является фактом/.test(String(item)),
    'пакет, объявляющий слова ассистента фактом, отклонён fail-closed (новое правило A7)', String(item));

  // Adversarial multi-claim: primary честный (symbolic_interpretation), но
  // фактический слой протаскивается ВТОРЫМ элементом claimClasses[].
  const layered = pkg(43);
  layered.entities = [{ clientRef: 'l1', type: 'spiritual', sourceId: 'TEST-FA-LAYER-1',
    claimClass: 'symbolic_interpretation', claimClasses: ['symbolic_interpretation', 'user_fact'],
    textOrigin: 'assistant_interpretation',
    data: { text: 'интерпретация с протащенным фактом', type: 'интерпретация' } }];
  const beforeL = await snapshot();
  const prevL = await refresh(c.id, layered);
  ok(!prevL.ok && /не является фактом/.test(String(prevL.errors[0])),
    'multi-claim: слой user_fact при textOrigin ассистента отклонён (full-set guard, не только primary)');
  ok(beforeL === await snapshot(), 'multi-claim promotion: zero mutation');

  // То же для других фактических классов taxonomy (external_event, practice_action).
  const layered2 = pkg(44);
  layered2.entities = [{ clientRef: 'l2', type: 'spiritual', sourceId: 'TEST-FA-LAYER-2',
    claimClass: 'symbolic_interpretation', claimClasses: ['symbolic_interpretation', 'external_event'],
    textOrigin: 'assistant_interpretation',
    data: { text: 'интерпретация с протащенным событием', type: 'интерпретация' } }];
  const prevL2 = await refresh(c.id, layered2);
  const layered3 = pkg(45);
  layered3.entities = [{ clientRef: 'l3', type: 'spiritual', sourceId: 'TEST-FA-LAYER-3',
    claimClass: 'practice_action', textOrigin: 'assistant_interpretation',
    data: { text: 'ассистент утверждает действие практики', type: 'интерпретация' } }];
  const prevL3 = await refresh(c.id, layered3);
  ok(!prevL2.ok && !prevL3.ok,
    'фактические классы external_event/practice_action тоже не совместимы со словами ассистента');

  // Честная многослойность БЕЗ фактических классов по-прежнему проходит.
  const honest = pkg(46);
  honest.entities = [{ clientRef: 'h1', type: 'spiritual', sourceId: 'TEST-FA-HONEST-1',
    claimClass: 'symbolic_interpretation', claimClasses: ['symbolic_interpretation', 'working_hypothesis'],
    textOrigin: 'assistant_interpretation',
    data: { text: 'интерпретация и гипотеза, честно помеченные', type: 'интерпретация' } }];
  const prevH = await refresh(c.id, honest);
  const apH = await apply(c.id);
  const hRec = await page.evaluate(() =>
    JSON.parse(JSON.stringify((DB.spiritual.find(r => r.ext && r.ext.sourceId === 'TEST-FA-HONEST-1') || { ext: {} }).ext)));
  ok(prevH.ok && apH.ok && JSON.stringify(hRec.claimClasses) === JSON.stringify(['symbolic_interpretation', 'working_hypothesis']),
    'многослойная честная интерпретация проходит со всеми слоями (guard не сломал Wave 6 контракт)');
}

// ═══ 9. Source disappearance ≠ canonical delete ═════════════════════
{
  await reset();
  const c = await connCreate();
  await refresh(c.id, pkg(50));
  await apply(c.id);
  // Источник «исчез»: новый feed его не содержит + владелец пометил revoked.
  const prev = await refresh(c.id, feed([pkg(51)]));
  await apply(c.id);
  await page.evaluate((i) => extConnMarkUnavailable(i), c.id);
  const cnt = await page.evaluate(() => ({ ins: DB.insights.length, del: Object.keys(DB._del).filter(k => String(k).includes('TEST')).length }));
  ok(cnt.ins === 2, 'исчезновение объекта из источника/недоступность НЕ удаляет canonical записи');
  const st = await connState(c.id);
  ok(st.status === 'source_unavailable',
    'недоступность источника — статус канала, не операция над данными');
}

// ═══ 10. Изоляция профилей + recovery lock ══════════════════════════
{
  await reset();
  const c = await connCreate();
  await refresh(c.id, pkg(60));
  await apply(c.id);
  const iso = await page.evaluate(async () => {
    const origin = activeId();
    const a = { conns: DB.externalConnections.length, ins: DB.insights.length };
    const list = loadProfiles();
    const nid = 'pTESTFA' + Date.now();
    list.push({ id: nid, name: 'TEST-FA-B', color: '#1056CC' });
    saveProfiles(list); setActiveId(nid); hydrate();
    const b = { conns: (DB.externalConnections || []).length, ins: (DB.insights || []).length };
    setActiveId(origin); hydrate();
    const back = { conns: DB.externalConnections.length, ins: DB.insights.length };
    saveProfiles(loadProfiles().filter(p2 => p2.id !== nid));
    try { localStorage.removeItem('arch5_db_' + nid); localStorage.removeItem('arch5_cfg_' + nid); } catch (_) {}
    return { a, b, back };
  });
  ok(iso.b.conns === 0 && iso.b.ins === 0, 'подключения и импортированные записи не пересекают границу профиля');
  ok(iso.back.conns === 1 && iso.back.ins === 1, 'возврат в профиль — всё на месте');

  const lock = await page.evaluate(() => {
    enterCriticalState(activeId(), []);
    const r1 = extConnCreate('TEST-FA lock', 'other');
    const r2 = extConnForget(DB.externalConnections[0].id);
    resolveRecovery('discarded');
    return { create: r1.ok, forget: r2.ok };
  });
  ok(!lock.create && !lock.forget, 'recovery lock блокирует изменение подключений');
}

// ═══ 11. XSS в имени источника и содержимом feed ════════════════════
{
  await reset();
  const xss = await page.evaluate(async () => {
    window.__faxss = false;
    extConnCreate('<img src=x onerror="window.__faxss=true">', 'other');
    openExtImport();
    const el = document.getElementById('ext-connections');
    const bad = !!el.querySelector('img[src="x"]');
    closeOv('ov-ext-import');
    return { fired: window.__faxss, bad };
  });
  await page.waitForTimeout(120);
  const fired = await page.evaluate(() => window.__faxss);
  ok(!fired && !xss.bad, 'враждебное имя источника не исполняется в UI подключений');
}

// ═══ 12. Provider-neutral ядро: канал ≠ идентичность ════════════════
{
  await reset();
  // Один и тот же семантический sourceId приходит ТРЕМЯ разными каналами.
  const cDrive = await connCreate('TEST-FA Drive-подача', 'google_drive_export');
  const cChat = await connCreate('TEST-FA ChatGPT-экспорт', 'chatgpt_export');
  const cFile = await connCreate('TEST-FA файл', 'manual_file');
  const same = (n, sid, srcKind) => {
    const p = pkg(n, { source: { kind: srcKind, label: 'TEST-FA канал ' + srcKind, module: 'TEST-FA-' + srcKind } });
    p.entities[0].sourceId = sid;
    return p;
  };
  await refresh(cDrive.id, same(100, 'TEST-FA-UNIVERSAL-1', 'google_drive'));
  await apply(cDrive.id);
  const prevChat = await refresh(cChat.id, same(101, 'TEST-FA-UNIVERSAL-1', 'chatgpt'));
  // Variant B: канал не влияет на identity; текст пакета 101 отличается от
  // 100 → это ВЕРСИЯ той же записи (changed), но НЕ новая запись.
  ok(prevChat.ok && prevChat.totals.new === 0 && (prevChat.totals.existing + prevChat.totals.changed) === 1,
    'тот же sourceId другим каналом (ChatGPT) → та же запись (existing/changed), НЕ новая');
  await apply(cChat.id);
  const prevFile = await refresh(cFile.id, same(102, 'TEST-FA-UNIVERSAL-1', 'other'));
  await apply(cFile.id);
  const one = await page.evaluate(() => DB.insights.filter(r => r.ext && (r.ext.sourceId === 'TEST-FA-UNIVERSAL-1' ||
    (r.ext.sourceRefs || []).some(x => x.sourceId === 'TEST-FA-UNIVERSAL-1'))).length);
  ok(prevFile.ok && one === 1,
    `один семантический sourceId через три канала (Drive/ChatGPT/файл) → ОДНА canonical запись (${one})`);

  // Один контейнер (файл Drive) с несколькими sourceId → несколько записей.
  // Подачи ПОСЛЕДОВАТЕЛЬНЫЕ: вторая планируется, когда первая уже в canonical
  // DB — склейка по контейнеру дала бы здесь ложное «уже существует».
  const contFeed = (p) => ({
    format: 'architect-external-work-feed-v1',
    container: { kind: 'google_drive_file', id: 'TEST-FA-CONTAINER-1', label: 'TEST-FA папка выгрузки' },
    packages: [p],
  });
  await refresh(cDrive.id, contFeed(pkg(110)));
  await apply(cDrive.id);
  const prevMulti = await refresh(cDrive.id, contFeed(pkg(111)));
  await apply(cDrive.id);
  const st = await connState(cDrive.id);
  const cnt = await page.evaluate(() => DB.insights.filter(r => r.ext && /TEST-FA-SRC-11/.test(r.ext.sourceId || '')).length);
  ok(prevMulti.ok && cnt === 2,
    `один контейнер источника с двумя sourceId → ДВЕ canonical записи (${cnt}) — контейнер не склеивает идентичности`);
  ok(st.container && st.container.id === 'TEST-FA-CONTAINER-1' && st.container.kind === 'google_drive_file',
    'контейнер сохранён как provenance канала (id файла/архива), отдельно от идентичности записей');
  const recIds = await page.evaluate(() => DB.insights.filter(r => r.ext && /TEST-FA-SRC-11/.test(r.ext.sourceId || ''))
    .map(r => JSON.stringify(r.ext)).join('|'));
  ok(!recIds.includes('TEST-FA-CONTAINER-1'),
    'идентификатор контейнера НЕ попал в identity записей (sourceId остаётся семантическим)');
}

// ═══ 13. Никаких провайдерских учётных данных и сети ════════════════
{
  const bundle = readFileSync(FILE.replace('file://', ''), 'utf8');
  // ИЗМЕНЕНИЕ КОНТРАКТА (решение владельца D-1, Drive Sync Hub v1).
  // Раньше здесь проверялось, что обращений к Google в сборке нет вовсе.
  // Прямой Drive OAuth утверждён владельцем, поэтому запрет «ни одного
  // упоминания» больше не соответствует продукту. Защитный смысл проверки
  // сохранён и стал точнее: Google допустим ТОЛЬКО как read-адаптер Drive
  // и только в узкой границе.
  const restricted = ['auth/drive.readonly', 'auth/drive.metadata', 'auth/drive.activity'];
  ok(restricted.every(s => !bundle.includes(s)),
    'restricted-скоупы Google (drive.readonly / metadata / activity) в сборке не запрашиваются');
  ok(bundle.includes('auth/drive.file'),
    'Drive использует ровно non-sensitive per-file scope drive.file');
  ok(!/<script[^>]+(accounts\.google\.com|apis\.google\.com)/.test(bundle),
    'скрипты Google не подключены в разметке — только ленивая загрузка по действию владельца');
  ok(!/AIza[0-9A-Za-z_-]{20,}|GOCSPX-[0-9A-Za-z_-]{10,}|client_secret/.test(bundle),
    'учётных данных и секретов провайдера в сборке нет');
  const adapters = await page.evaluate(() => ({
    kinds: EXT_CHANNEL_KINDS.slice(),
    reads: Object.values(EXT_CHANNEL_ADAPTERS).map(a => a.read),
  }));
  ok(adapters.kinds.length === 5 && adapters.reads.every(r => r === 'owner_mediated'),
    'каналы моста читаются owner-mediated — ядро приёма остаётся provider-neutral');
  const creds = await page.evaluate(() => {
    const c = DB.externalConnections[0] || {};
    const keys = JSON.stringify(Object.keys(c));
    const ls = Object.keys(localStorage).filter(k => /token|oauth|credential|refresh_token|client_secret/i.test(k));
    return { keys, ls, hasToken: /token|credential|secret|oauth/i.test(keys) };
  });
  ok(!creds.hasToken && creds.ls.length === 0,
    'учётные данные провайдеров не хранятся ни в записи источника, ни в localStorage');
}

// ═══ 14. Честный UI: ручной источник не называется «подключён» ══════
{
  await reset();
  const ui = await page.evaluate(async () => {
    const r = extConnCreate('TEST-FA Drive-подача', 'google_drive_export');
    _extConnActive = r.rec.id;
    openExtImport();
    const el = document.getElementById('ext-connections');
    return { html: el.innerHTML, text: el.textContent };
  });
  ok(!/подключ[её]н\b/i.test(ui.text) && !/connected/i.test(ui.text),
    'источник Google Drive не назван «подключён»/«connected» — постоянного соединения нет');
  ok(/источник настроен/i.test(ui.text), 'состояние показано честно: «источник настроен»');
  ok(/файл/i.test(ui.text) && /встав/i.test(ui.text),
    'пользователю объяснено, что данные приходят файлом или вставкой');
  ok(/ChatGPT/i.test(ui.text) && /Google Drive/i.test(ui.text) && /JSON/i.test(ui.text),
    'перечислены поддерживаемые источники человеческим языком');
  ok(!/architect-external-work|sourceRefs|claimClasses/.test(ui.text),
    'технические термины не вынесены в основной интерфейс');

  // Предпросмотр человеческим языком + обязательное подтверждение перед мутацией.
  const before = await snapshot();
  const prev = await page.evaluate(async (t) => {
    document.getElementById('ext-text').value = t;
    await extConnUiRefresh();
    return document.getElementById('ext-conn-out').textContent;
  }, JSON.stringify(feed([pkg(120)])));
  // P1 (owner, пункт 10): пакеты и записи считаются раздельно и называют
  // свои единицы; появилась строка «Будут обновлены».
  ok(/Новых записей/.test(prev) && /Записей уже существует/.test(prev) &&
     /Пакетов уже импортировано/.test(prev) && /Будут обновлены/.test(prev) &&
     /Будут объединены источники/.test(prev) && /Конфликты/.test(prev) && /Отклонено/.test(prev),
    'предпросмотр показан человеческим языком (новые/обновляемые/существуют-записи/пакеты-по-журналу/объединения/конфликты/отклонено)');
  ok(/Подробности для продвинутых/.test(prev), 'технические детали спрятаны в раскрывающийся блок');
  const confirmStep = await page.evaluate(() => {
    extConnUiConfirm();
    return document.getElementById('ext-conn-out').textContent;
  });
  ok(/Импортировать эти записи/.test(confirmStep), 'перед применением требуется явное подтверждение');
  ok(before === await snapshot(), 'до подтверждения canonical DB не изменилась');
  const applied = await page.evaluate(() => { extConnUiApply(); return DB.insights.length; });
  ok(applied === 1, 'после подтверждения импорт применён');

  // Выбор файла при выбранном источнике идёт ЧЕРЕЗ мост (а не в техническую
  // разовую проверку): пользователь видит человеческий предпросмотр.
  const viaFile = await page.evaluate(async (t) => {
    document.getElementById('ext-text').value = '';
    const file = new File([t], 'TEST-FA-подача.json', { type: 'application/json' });
    extPickFile({ target: { files: [file] } });
    await new Promise(r => setTimeout(r, 400));
    const out = document.getElementById('ext-conn-out');
    const det = out.querySelector('details');
    const plain = det ? out.textContent.replace(det.textContent, '') : out.textContent;
    return {
      bridge: out.textContent, plain,
      advanced: det ? det.textContent : '',
      legacy: (document.getElementById('ext-out') || {}).textContent || '',
    };
  }, JSON.stringify(feed([pkg(121)])));
  ok(/Новых записей/.test(viaFile.bridge) && !/claimClass|sourceId/.test(viaFile.plain),
    'выбор файла при выбранном источнике открывает человеческий предпросмотр моста (без техтерминов на виду)');
  ok(/sourceId/.test(viaFile.advanced),
    'технические подробности доступны, но только в раскрывающемся блоке');
  ok(!/Пакет не принят|статус:/.test(viaFile.legacy),
    'разовая техническая проверка не перехватывает файл, когда выбран источник');
  await page.evaluate(() => closeOv('ov-ext-import'));
}

// ═══ 15. Privacy canary ═════════════════════════════════════════════
{
  // Канарейка: этот файл и бандл не должны содержать реальные приватные
  // маркеры владельца. Образцы собраны конкатенацией, чтобы канарейка не
  // ловила саму себя.
  const own = readFileSync(new URL(import.meta.url)).toString();
  const bundle = readFileSync(FILE.replace('file://', ''), 'utf8');
  const priv = ['МОЯ ЖИЗ' + 'НЬ →', 'GDRIVE:1eRP' + 'F3a', 'MIGRATION-RUN-' + '2026-08'];
  const leakSpec = priv.filter(s => own.includes(s));
  const leakBundle = priv.filter(s => bundle.includes(s));
  ok(leakSpec.length === 0 && leakBundle.length === 0,
    `privacy canary: приватных маркеров нет ни в тесте, ни в бандле (${leakSpec.length}/${leakBundle.length})`);
}

const nonBoot = netRequests.filter(u => !u.includes('/health'));
ok(nonBoot.length === 0, `bridge не делает сетевых вызовов (${nonBoot.length})`, nonBoot.slice(0, 3).join('\n'));
ok(errors.length === 0, `JS-ошибок нет за весь прогон (${errors.length})`, errors.slice(0, 3).join('\n'));

await browser.close();
console.log(`\nFINAL A (continuous bridge): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
