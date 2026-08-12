// VARIANT B — явная update-семантика внешнего моста (owner decision).
//
// Полный test matrix владельца (16 разделов, пункт 13) + инварианты
// реализации. ВСЕ фикстуры синтетические (TEST-UPD-*). Реальные данные
// владельца в репозиторий не попадают ни в каком виде (privacy canary внизу).
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
async function boot() {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  p.on('pageerror', e => errors.push(e.message));
  await p.route('**/*', r => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
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
    'psyLinks', 'relationshipContexts', 'spiritual', 'evolution', 'sphereLogs', 'spheres'].forEach(c => { DB[c] = []; });
  DB._del = {};
  try { resolveRecovery('discarded'); } catch (_) {}
  if (typeof extBridgeCancel === 'function') extBridgeCancel();
});

// Синтетические пакеты.
const insightPkg = (n, body, over, entityOver) => ({
  format: 'architect-external-work-v1',
  source: { kind: 'google_drive', label: 'TEST-UPD источник', module: 'TEST-UPD-MODULE' },
  session: { clientRef: 'TEST-UPD-SESSION-' + n, summary: 'синтетическая сессия ' + n, date: '2026-05-0' + ((n % 9) + 1) },
  entities: [
    { clientRef: 'i' + n, type: 'insight', sourceId: 'TEST-UPD-SRC-1',
      claimClass: 'user_experience', textOrigin: 'user_words',
      data: { title: 'TEST-UPD инсайт', body, tag: 'personal' },
      ...(entityOver || {}) },
  ],
  links: [],
  ...(over || {}),
});
const feed = (packages) => ({ format: 'architect-external-work-feed-v1', packages });

const connCreate = (label, kind) => page.evaluate(({ l, k }) => {
  const r = extConnCreate(l, k);
  return { ok: r.ok, id: r.rec && r.rec.id, errors: r.errors };
}, { l: label || 'TEST-UPD источник', k: kind || 'manual_file' });
const refresh = (id, obj) => page.evaluate(async ({ i, t }) => {
  const r = await extBridgeRefresh(i, t);
  return JSON.parse(JSON.stringify(r));
}, { i: id, t: JSON.stringify(obj) });
const apply = (id) => page.evaluate((i) => JSON.parse(JSON.stringify(extBridgeApply(i))), id);
const plan = (obj) => page.evaluate(async (t) => {
  const p = await extBuildPlan(t);
  return JSON.parse(JSON.stringify({ ok: p.ok, errors: p.errors, counts: p.counts, items: (p.items || []).map(i => ({ status: i.status, reason: i.reason, sourceId: i.sourceId, update: i.update ? { updatedFields: i.update.updatedFields, mode: i.update.mode } : null })) }));
}, JSON.stringify(obj));
const commit = (obj, sel) => page.evaluate(async ({ t, s }) => {
  const p = await extBuildPlan(t);
  const res = extCommitPlan(p, s || null);
  return JSON.parse(JSON.stringify({ plan: { counts: p.counts, statuses: (p.items || []).map(i => i.status) }, res }));
}, { t: JSON.stringify(obj), s: sel || null });

console.log('\n── VARIANT B: явная update-семантика внешнего моста ──');

// ═══ 1. Matrix: same sourceId + идентичный payload → EXISTING ═══════
{
  await reset();
  const c = await connCreate();
  const p1 = insightPkg(1, 'синтетический исходный текст');
  await refresh(c.id, p1);
  await apply(c.id);
  const inst = await page.evaluate(() => {
    const r = DB.insights[0];
    return { ext: !!r.ext, eh: r.ext.entityHash, ih: r.ext.importHash, fields: r.ext.importedFields };
  });
  ok(inst.ext && /^[0-9a-f]{64}$/.test(inst.eh) && /^[0-9a-f]{64}$/.test(inst.ih),
    'новая запись несёт снимок версии: ext.entityHash + ext.importHash (sha-256)');
  ok(JSON.stringify(inst.fields) === JSON.stringify(['tag', 'title', 'body']),
    'ext.importedFields фиксирует import-owned поля записи');

  // Тот же payload другой сессией (другой hash пакета) → existing, ноль мутаций.
  const same = insightPkg(2, 'синтетический исходный текст');
  const before = await page.evaluate(() => JSON.stringify(DB.insights));
  const pr = await refresh(c.id, same);
  ok(pr.ok && pr.totals.existing === 1 && pr.totals.new === 0 && pr.totals.changed === 0,
    `same sourceId + неизменённый payload → EXISTING, не CHANGED (existing=${pr.totals.existing})`);
  await apply(c.id);
  const after = await page.evaluate(() => JSON.stringify(DB.insights));
  ok(before === after, 'existing не мутирует запись ни одним байтом');
}

// ═══ 2. Matrix: same sourceId + изменённый import-owned → CHANGED ═══
{
  await reset();
  const c = await connCreate();
  await refresh(c.id, insightPkg(1, 'первая версия текста'));
  await apply(c.id);
  const idBefore = await page.evaluate(() => DB.insights[0].id);
  const pr = await refresh(c.id, insightPkg(2, 'вторая версия текста'));
  ok(pr.ok && pr.totals.changed === 1 && pr.totals.new === 0,
    `изменённый payload того же sourceId → CHANGED (changed=${pr.totals.changed})`);
  const ap = await apply(c.id);
  const st = await page.evaluate(() => ({
    n: DB.insights.length, id: DB.insights[0].id, body: DB.insights[0].body,
    revs: DB.insights[0].ext.revisions,
    updAt: DB.insights[0].ext.importUpdatedAt,
    ledger: DB.externalWorkSessions.map(s => ({ u: s.updatedCount, refs: s.updatedRefs })),
  }));
  ok(ap.ok && st.n === 1 && st.id === idBefore,
    'CHANGED обновляет ТУ ЖЕ запись — вторая сущность не создаётся, id сохранён');
  ok(st.body === 'вторая версия текста', 'import-owned поле обновлено новой версией');
  ok(Array.isArray(st.revs) && st.revs.length === 1 &&
    JSON.stringify(st.revs[0].updatedFields) === JSON.stringify(['body']) &&
    /^[0-9a-f]{64}$/.test(st.revs[0].prevEntityHash) && /^[0-9a-f]{64}$/.test(st.revs[0].entityHash) &&
    /^[0-9a-f]{64}$/.test(st.revs[0].packageHash) && st.revs[0].mode === 'update' && !!st.updAt,
    'revision provenance: какие поля, какой пакет, prev/new хеши версии, когда');
  ok(st.ledger.some(s => s.u === 1 && s.refs && s.refs.length === 1 && s.refs[0].updatedFields.join() === 'body'),
    'журнал импорта фиксирует updatedRefs (аудит обновления, без старых текстов)');

  // 8. Matrix: подтверждённый update → replay того же feed без изменений.
  const replay = await refresh(c.id, insightPkg(2, 'вторая версия текста'));
  ok(replay.ok && replay.totals.skippedByCheckpoint === 1 &&
    replay.totals.new === 0 && replay.totals.changed === 0,
    'replay применённого пакета: new 0, changed 0 (чекпойнт/журнал)');
  // Тот же payload НОВОЙ сессией (другой hash) → existing, не changed.
  const replay2 = await refresh(c.id, insightPkg(3, 'вторая версия текста'));
  ok(replay2.ok && replay2.totals.existing === 1 && replay2.totals.changed === 0 && replay2.totals.new === 0,
    'тот же payload новой сессией после update → EXISTING (детерминизм по entityHash)');
}

// ═══ 3. Matrix: разные sourceId + одинаковый текст → NEW (две записи) ═
{
  await reset();
  const c = await connCreate();
  const a = insightPkg(1, 'совершенно одинаковый синтетический текст');
  const b = insightPkg(2, 'совершенно одинаковый синтетический текст');
  b.entities[0].sourceId = 'TEST-UPD-SRC-2';
  await refresh(c.id, feed([a, b]));
  const ap = await apply(c.id);
  const n = await page.evaluate(() => DB.insights.length);
  ok(ap.ok && n === 2,
    `похожесть текста НИКОГДА не identity: разные sourceId → ДВЕ записи (${n})`);
}

// ═══ 4. Matrix: local-only поля переживают update ═══════════════════
{
  await reset();
  const c = await connCreate();
  await refresh(c.id, insightPkg(1, 'исходный текст'));
  await apply(c.id);
  // Пользовательские (user-owned) поля: links/media у insight не входят в
  // import-owned и не могут быть затёрты обновлением.
  await page.evaluate(() => {
    DB.insights[0].links = [{ kind: 'TEST-UPD-manual-link', to: 'x1' }];
    DB.insights[0].media = ['TEST-UPD-media-1'];
    persist();
  });
  const pr = await refresh(c.id, insightPkg(2, 'обновлённый текст'));
  ok(pr.ok && pr.totals.changed === 1,
    'правка user-owned полей НЕ мешает безопасному update (они вне снимка импорта)');
  await apply(c.id);
  const st = await page.evaluate(() => ({
    body: DB.insights[0].body, links: DB.insights[0].links, media: DB.insights[0].media,
  }));
  ok(st.body === 'обновлённый текст' &&
    JSON.stringify(st.links) === JSON.stringify([{ kind: 'TEST-UPD-manual-link', to: 'x1' }]) &&
    JSON.stringify(st.media) === JSON.stringify(['TEST-UPD-media-1']),
    'local-only поля (links/media) пережили обновление нетронутыми');
}

// ═══ 5. Локальная правка import-owned поля → changed-conflict ════════
{
  await reset();
  const c = await connCreate();
  await refresh(c.id, insightPkg(1, 'исходный текст'));
  await apply(c.id);
  await page.evaluate(() => { DB.insights[0].body = 'локально отредактированный текст'; DB.insights[0]._u = Date.now(); persist(); });
  const pr = await refresh(c.id, insightPkg(2, 'новая версия источника'));
  ok(pr.ok && pr.totals.changedConflicts === 1 && pr.totals.changed === 0 && pr.totals.new === 0,
    'локальная правка import-owned поля + изменение источника → конфликт, НЕ молчаливый update');
  const ap = await apply(c.id);
  const st = await page.evaluate(() => ({
    body: DB.insights[0].body, n: DB.insights.length,
    results: null,
  }));
  ok(ap.ok && st.body === 'локально отредактированный текст' && st.n === 1,
    'мост по умолчанию СОХРАНЯЕТ локальные правки (kept local), дубль не создан');
  ok(ap.keptLocal === 1 && ap.results.some(r => r.status === 'needs-decision'),
    'kept-local виден в результате; пакет остаётся «требует решения»');
  const ck = await page.evaluate((i) => extConnFind(i).checkpoint.committedPackageHashes.length, c.id);
  ok(ck === 1, 'чекпойнт НЕ продвинут за пакет с неразрешённым конфликтом — он всплывёт при следующем чтении');

  // Явный override через ручной импорт: пользователь сознательно берёт версию источника.
  const over = await commit(insightPkg(3, 'новая версия источника'), { items: { 0: true }, links: {} });
  const st2 = await page.evaluate(() => ({ body: DB.insights[0].body, revs: DB.insights[0].ext.revisions.length, mode: DB.insights[0].ext.revisions.at(-1).mode }));
  ok(over.res.ok && st2.body === 'новая версия источника' && st2.mode === 'override',
    'явный выбор пользователя применяет версию источника (mode=override, в revision provenance)');

  // Без явного выбора override не происходит (default-безопасность).
  await page.evaluate(() => { DB.insights[0].body = 'снова локальная правка'; persist(); });
  const keep = await commit(insightPkg(4, 'ещё одна версия источника'), null);
  const st3 = await page.evaluate(() => DB.insights[0].body);
  ok(!keep.res.ok || st3 === 'снова локальная правка',
    'без явного выбора локальная правка не затирается никогда');
}

// ═══ 5b. Смешанный пакет в мосту: NEW применяется, локальная правка живёт ═
{
  await reset();
  const c = await connCreate();
  await refresh(c.id, insightPkg(1, 'исходный текст'));
  await apply(c.id);
  await page.evaluate(() => { DB.insights[0].body = 'локально правленный текст'; persist(); });
  const mixed = insightPkg(2, 'версия источника после правки');
  mixed.entities.push({
    clientRef: 'iNEW5b', type: 'insight', sourceId: 'TEST-UPD-SRC-5B',
    claimClass: 'user_experience', textOrigin: 'user_words',
    data: { title: 'TEST-UPD новый объект', body: 'новый объект в том же пакете', tag: 'personal' },
  });
  const pr = await refresh(c.id, mixed);
  ok(pr.ok && pr.totals.new === 1 && pr.totals.changedConflicts === 1,
    'смешанный пакет виден в предпросмотре: NEW + конфликт локальной правки');
  const ap = await apply(c.id);
  const st = await page.evaluate(() => ({
    n: DB.insights.length,
    edited: DB.insights.find(r => r.ext && r.ext.sourceId === 'TEST-UPD-SRC-1').body,
    kept: DB.externalWorkSessions.at(-1).keptLocalRefs,
  }));
  ok(ap.ok && st.n === 2 && st.edited === 'локально правленный текст',
    'смешанный пакет: новое применено, локальная правка сохранена (kept local)');
  ok(Array.isArray(st.kept) && st.kept.length === 1,
    'журнал импорта фиксирует keptLocalRefs — решение «сохранить локальное» аудируемо');
}

// ═══ 6. Matrix: эскалация claim-семантики при update → STOP ═════════
{
  await reset();
  const c = await connCreate();
  const base = insightPkg(1, 'текст наблюдения', null, {
    claimClass: 'working_hypothesis', claimClasses: ['working_hypothesis'], textOrigin: 'structured_summary',
  });
  await refresh(c.id, base);
  await apply(c.id);
  // Гипотеза «дорастает» до факта повторным импортом — запрещено.
  const esc = insightPkg(2, 'текст наблюдения', null, {
    claimClass: 'user_fact', claimClasses: ['user_fact'], textOrigin: 'user_words',
  });
  const pr = await refresh(c.id, esc);
  ok(pr.ok && pr.totals.updateRejected === 1 && pr.totals.changed === 0,
    'working_hypothesis → user_fact обновлением ЗАПРЕЩЕНО (update-rejected)');
  await apply(c.id);
  const st = await page.evaluate(() => ({
    claims: DB.insights[0].ext.claimClasses, body: DB.insights[0].body, revs: (DB.insights[0].ext.revisions || []).length,
  }));
  ok(JSON.stringify(st.claims) === JSON.stringify(['working_hypothesis']) && st.revs === 0,
    'запись не изменена: claim-слой и содержимое остались прежними');

  // Де-эскалация (снятие фактического слоя) разрешена.
  const deesc = insightPkg(3, 'текст наблюдения', null, {
    claimClass: 'assistant_summary', claimClasses: ['assistant_summary'], textOrigin: 'structured_summary',
  });
  const pr2 = await refresh(c.id, deesc);
  ok(pr2.ok && pr2.totals.changed === 1 && pr2.totals.updateRejected === 0,
    'де-эскалация claim-слоя — безопасный CHANGED (ext-only update)');
  await apply(c.id);
  const st2 = await page.evaluate(() => ({ claims: DB.insights[0].ext.claimClasses, body: DB.insights[0].body }));
  ok(JSON.stringify(st2.claims) === JSON.stringify(['assistant_summary']) && st2.body === 'текст наблюдения',
    'ext-only update: claim-слой обновлён, содержимое не тронуто');
}

// ═══ 7. Matrix: stale preview → CONFLICT (optimistic concurrency) ═══
{
  await reset();
  const c = await connCreate();
  await refresh(c.id, insightPkg(1, 'исходный текст'));
  await apply(c.id);
  // Предпросмотр обновления построен...
  const pr = await refresh(c.id, insightPkg(2, 'версия источника A'));
  ok(pr.ok && pr.totals.changed === 1, 'предпросмотр видит безопасное обновление');
  // ...затем запись меняется ЛОКАЛЬНО до Apply.
  await page.evaluate(() => { DB.insights[0].body = 'локальное изменение после предпросмотра'; persist(); });
  const ap = await apply(c.id);
  const st = await page.evaluate(() => ({ body: DB.insights[0].body, n: DB.insights.length, ews: DB.externalWorkSessions.length }));
  ok(!ap.ok && ap.rolledBack === true,
    'apply устаревшего предпросмотра НЕ затирает молча: feed отклонён целиком');
  ok(st.body === 'локальное изменение после предпросмотра' && st.n === 1 && st.ews === 1,
    'локальное изменение сохранено; canonical и журнал не мутированы (re-preview требуется)');
}

// ═══ 8. Matrix: сбой в смешанном feed → полный rollback ═════════════
{
  await reset();
  const c = await connCreate();
  await refresh(c.id, insightPkg(1, 'первая версия'));
  await apply(c.id);
  const before = await page.evaluate(() => JSON.stringify({ ins: DB.insights, ews: DB.externalWorkSessions }));
  // Пакет A — валидный NEW; пакет B — update; пакет C — «висячая» ссылка → сбой.
  const pkgNew = insightPkg(2, 'совсем новый объект');
  pkgNew.entities[0].sourceId = 'TEST-UPD-SRC-NEW';
  pkgNew.entities[0].clientRef = 'iNEW';
  const pkgUpd = insightPkg(3, 'обновлённая версия');
  const pkgBad = {
    format: 'architect-external-work-v2',
    source: { kind: 'google_drive', label: 'TEST-UPD источник', module: 'TEST-UPD-MODULE' },
    session: { clientRef: 'TEST-UPD-SESSION-BAD', summary: 'сбойный пакет', date: '2026-05-09' },
    entities: [{ clientRef: 'r1', type: 'psyReview', sourceId: 'TEST-UPD-REV-1',
      claimClass: 'assistant_summary', textOrigin: 'structured_summary',
      data: { periodStart: '2026-05-01T00:00:00.000Z', periodEnd: '2026-05-07T00:00:00.000Z',
        outcomeSummary: 'итог', decision: 'continue',
        goalRefs: [{ clientRef: 'TEST-UPD-нет-такого' }] } }],
    links: [],
  };
  const pr = await refresh(c.id, feed([pkgNew, pkgUpd, pkgBad]));
  ok(pr.ok && pr.totals.new === 1 && pr.totals.changed === 1 && pr.totals.unresolved === 1,
    'смешанный feed: NEW + CHANGED + сбойный пакет виден в предпросмотре');
  const ap = await apply(c.id);
  const after = await page.evaluate(() => JSON.stringify({ ins: DB.insights, ews: DB.externalWorkSessions }));
  ok(!ap.ok && ap.rolledBack === true && before === after,
    'сбой одного пакета откатывает ВЕСЬ feed: ни NEW, ни CHANGED не применены (byte-identical)');
  const ck = await page.evaluate((i) => extConnFind(i).checkpoint.committedPackageHashes.length, c.id);
  ok(ck === 1, 'чекпойнт не продвинут за откаченный feed');
}

// ═══ 9. Matrix: backup/restore → replay без изменений ═══════════════
{
  await reset();
  const c = await connCreate();
  await refresh(c.id, feed([insightPkg(1, 'версия один')]));
  await apply(c.id);
  await refresh(c.id, feed([insightPkg(2, 'версия два')]));
  await apply(c.id);
  // Полный snapshot состояния (эквивалент data-слоя резервной копии) →
  // wipe → restore → replay: new 0, changed 0.
  const res = await page.evaluate(async (t) => {
    const snap = JSON.stringify(DB);
    Object.keys(DB).forEach(k => { delete DB[k]; });
    Object.assign(DB, JSON.parse(snap));
    persist();
    const connId = DB.externalConnections[0].id;
    const r = await extBridgeRefresh(connId, t);
    return JSON.parse(JSON.stringify({
      totals: r.totals,
      ext: DB.insights[0].ext && {
        eh: !!DB.insights[0].ext.entityHash, ih: !!DB.insights[0].ext.importHash,
        fields: DB.insights[0].ext.importedFields, revs: (DB.insights[0].ext.revisions || []).length,
        refs: (DB.insights[0].ext.sourceRefs || []).length,
      },
    }));
  }, JSON.stringify(feed([insightPkg(2, 'версия два')])));
  ok(res.ext.eh && res.ext.ih && res.ext.revs === 1 && res.ext.fields.length === 3 && res.ext.refs >= 1,
    'restore сохранил снимки версии, importedFields, revisions и sourceRefs');
  ok(res.totals.new === 0 && res.totals.changed === 0 && res.totals.skippedByCheckpoint === 1,
    'replay после restore: NEW 0, CHANGED 0');
}

// ═══ 10. Matrix: исчезновение источника ≠ delete ════════════════════
{
  await reset();
  const c = await connCreate();
  await refresh(c.id, insightPkg(1, 'запись из источника'));
  await apply(c.id);
  // Feed приходит БЕЗ этой записи (объект «исчез» из источника) + новый объект.
  const other = insightPkg(2, 'другой объект');
  other.entities[0].sourceId = 'TEST-UPD-SRC-OTHER';
  await refresh(c.id, other);
  await apply(c.id);
  const st = await page.evaluate(() => ({
    n: DB.insights.length,
    first: DB.insights.find(r => r.ext && r.ext.sourceId === 'TEST-UPD-SRC-1'),
  }));
  ok(st.n === 2 && !!st.first && st.first.body === 'запись из источника',
    'исчезновение объекта из подачи НИКОГДА не удаляет canonical запись (delete-семантики нет)');
}

// ═══ 11. Один sourceId впервые в ДВУХ пакетах одного feed ═══════════
// Устранённый дефект: планы строились на независимых клонах — оба пакета
// видели объект «новым», apply создавал дубль.
{
  await reset();
  const c = await connCreate();
  const a = insightPkg(1, 'общий объект, версия A');
  const b = insightPkg(2, 'общий объект, версия A');   // тот же sourceId, тот же payload
  const pr = await refresh(c.id, feed([a, b]));
  ok(pr.ok && pr.totals.new === 1 && pr.totals.existing === 1,
    'sourceId в двух пакетах одного feed: первый NEW, второй EXISTING (последовательный кандидат)');
  const ap = await apply(c.id);
  const n = await page.evaluate(() => DB.insights.length);
  ok(ap.ok && n === 1, `apply не создал дубль (записей: ${n})`);

  // Второй пакет несёт ИЗМЕНЁННУЮ версию того же нового объекта → changed внутри одного feed.
  await reset();
  const c2 = await connCreate();
  const a2 = insightPkg(3, 'общий объект, версия A');
  const b2 = insightPkg(4, 'общий объект, версия B');
  const pr2 = await refresh(c2.id, feed([a2, b2]));
  ok(pr2.ok && pr2.totals.new === 1 && pr2.totals.changed === 1,
    'изменённая версия во втором пакете того же feed → CHANGED, не дубль');
  const ap2 = await apply(c2.id);
  const st2 = await page.evaluate(() => ({ n: DB.insights.length, body: DB.insights[0].body }));
  ok(ap2.ok && st2.n === 1 && st2.body === 'общий объект, версия B',
    'feed применён последовательно: одна запись, финальная версия B');
}

// ═══ 12. Volatile-поля не сдвигаются при update ═════════════════════
{
  await reset();
  await page.evaluate(() => { DB.spheres = [{ id: 501, name: 'TEST-UPD-сфера' }]; persist(); });
  const c = await connCreate();
  const sl = (n, val, date) => ({
    format: 'architect-external-work-v1',
    source: { kind: 'google_drive', label: 'TEST-UPD источник', module: 'TEST-UPD-MODULE' },
    session: { clientRef: 'TEST-UPD-SL-' + n, summary: 'сессия ' + n, date: '2026-05-02' },
    entities: [{ clientRef: 's' + n, type: 'sphereLog', sourceId: 'TEST-UPD-SL-1',
      claimClass: 'user_fact', textOrigin: 'user_words',
      data: { sphereId: 501, value: val, note: 'TEST-UPD заметка', ...(date ? { date } : {}) } }],
    links: [],
  });
  await refresh(c.id, sl(1, 5, '2026-05-01'));
  await apply(c.id);
  // Обновление значения БЕЗ даты в payload: дата записи не должна «переехать»
  // на день импорта.
  const pr = await refresh(c.id, sl(2, 7));
  await apply(c.id);
  const st = await page.evaluate(() => ({ v: DB.sphereLogs[0].value, d: DB.sphereLogs[0].date }));
  ok(pr.ok && pr.totals.changed === 1 && st.v === 7 && st.d === '2026-05-01',
    `volatile-поле date сохранено при update без даты в payload (${st.d}), value обновлён (${st.v})`);
  // Явная дата в payload обновляется как обычное import-owned поле.
  await refresh(c.id, sl(3, 7, '2026-05-03'));
  await apply(c.id);
  const st2 = await page.evaluate(() => DB.sphereLogs[0].date);
  ok(st2 === '2026-05-03', 'явная дата payload обновляет поле date');
}

// ═══ 13. Update психологической записи (v2, с внутрипакетными ссылками) ═
{
  await reset();
  const c = await connCreate();
  const v2pkg = (n, outcome) => ({
    format: 'architect-external-work-v2',
    source: { kind: 'google_drive', label: 'TEST-UPD психология', module: 'TEST-UPD-PSY' },
    session: { clientRef: 'TEST-UPD-PSY-S' + n, summary: 'сессия ' + n, date: '2026-05-04' },
    entities: [
      { clientRef: 'g1', type: 'psyGoal', sourceId: 'TEST-UPD-GOAL-1',
        claimClass: 'assistant_summary', textOrigin: 'structured_summary',
        data: { label: 'TEST-UPD цель', proximalOutcome: outcome, startedAt: '2026-05-01T10:00:00.000Z' } },
      { clientRef: 'e1', type: 'psyInterventionEpisode', sourceId: 'TEST-UPD-INT-1',
        claimClass: 'practice_action', textOrigin: 'user_words',
        data: { methodId: 'behavioral_activation', interventionSummary: 'TEST-UPD применение',
          dateTime: '2026-05-01T11:00:00.000Z', adherence: 'done' } },
    ],
    links: [],
  });
  await refresh(c.id, v2pkg(1, 'наблюдаемый результат, версия 1'));
  await apply(c.id);
  const goalId = await page.evaluate(() => DB.psyGoals[0].id);
  const pr = await refresh(c.id, v2pkg(2, 'наблюдаемый результат, версия 2'));
  ok(pr.ok && pr.totals.changed === 1 && pr.totals.existing === 1,
    'v2: изменённая цель → CHANGED, неизменённый эпизод → EXISTING');
  const ap = await apply(c.id);
  const st = await page.evaluate(() => ({
    n: DB.psyGoals.length, id: DB.psyGoals[0].id, out: DB.psyGoals[0].proximalOutcome,
    started: DB.psyGoals[0].startedAt, ints: DB.psyInterventionEpisodes.length,
  }));
  ok(ap.ok && st.n === 1 && st.id === goalId && st.out === 'наблюдаемый результат, версия 2',
    'psy-запись обновлена через ТОТ ЖЕ write-contract (PSY_BUILDERS), id стабилен');
  ok(st.started === '2026-05-01T10:00:00.000Z' && st.ints === 1,
    'неизменённые поля и соседняя запись не тронуты');
}

// ═══ 14. Кросс-модульный псевдоним НЕ обновляет содержимое ══════════
{
  await reset();
  const c = await connCreate();
  const primary = insightPkg(1, 'содержимое первичного источника', null, {
    claimClasses: ['user_experience', 'assistant_summary'],
  });
  await refresh(c.id, primary);
  await apply(c.id);
  // Другой модуль ссылается на тот же объект СВОИМ primary sourceId, известный
  // объект — только псевдонимом; содержимое у него «своё» (проекция).
  const aliasPkg = insightPkg(2, 'проекция другого модуля', null, {
    sourceId: 'TEST-UPD-ALIAS-VIEW',
    sourceRefs: [
      { sourceId: 'TEST-UPD-ALIAS-VIEW', role: 'primary' },
      { sourceId: 'TEST-UPD-SRC-1', role: 'alias' },
    ],
    claimClass: 'assistant_summary', claimClasses: ['assistant_summary'],
  });
  aliasPkg.entities[0].clientRef = 'alias1';
  const pr = await refresh(c.id, aliasPkg);
  ok(pr.ok && pr.totals.existing === 1 && pr.totals.changed === 0 && pr.totals.new === 0,
    'совпадение по псевдониму → existing + merge ссылок, НЕ update содержимого');
  await apply(c.id);
  const st = await page.evaluate(() => ({
    n: DB.insights.length, body: DB.insights[0].body,
    claims: DB.insights[0].ext.claimClasses,
    refs: (DB.insights[0].ext.sourceRefs || []).map(r => r.sourceId).sort(),
  }));
  ok(st.n === 1 && st.body === 'содержимое первичного источника' &&
    JSON.stringify(st.claims) === JSON.stringify(['user_experience', 'assistant_summary']),
    'содержимое и claim-слои первичного источника не затёрты проекцией другого модуля');
  ok(st.refs.includes('TEST-UPD-ALIAS-VIEW'), 'ссылка нового модуля дописана как псевдоним');
}

// ═══ 15. Legacy-записи (без снимка импорта) ═════════════════════════
{
  await reset();
  const c = await connCreate();
  // Запись «из прошлой версии моста»: ext без entityHash/importHash/importedFields.
  await page.evaluate(() => {
    DB.insights.push({
      id: 887001, tag: 'personal', w: 1, title: 'TEST-UPD legacy',
      body: 'legacy содержимое', date: '01.05.2026',
      createdAt: new Date().toISOString(), day: '2026-05-01', sv: SCHEMA_VERSION,
      src: 'Внешняя работа', links: [], media: [],
      ext: {
        format: 'architect-external-work-v1', sourceId: 'TEST-UPD-LEGACY-1',
        claimClass: 'user_experience', claimClasses: ['user_experience'], textOrigin: 'user_words',
        sourceRefs: [{ sourceId: 'TEST-UPD-LEGACY-1', role: 'primary' }],
      },
    });
    persist();
  });
  // Идентичный payload → existing (прямое сравнение полей, ноль мутаций).
  const samePkg = insightPkg(1, 'legacy содержимое', null, { sourceId: 'TEST-UPD-LEGACY-1', data: { title: 'TEST-UPD legacy', body: 'legacy содержимое', tag: 'personal' } });
  samePkg.entities[0].clientRef = 'lg1';
  const prSame = await refresh(c.id, samePkg);
  ok(prSame.ok && prSame.totals.existing === 1 && prSame.totals.changed === 0,
    'legacy + идентичные поля → EXISTING (без снимка сравниваются сами поля)');
  // Изменённый payload → конфликт fail-closed («не угадываем»), содержимое сохранено.
  const chPkg = insightPkg(2, 'источник переписал текст', null, { sourceId: 'TEST-UPD-LEGACY-1' });
  chPkg.entities[0].clientRef = 'lg2';
  const prCh = await refresh(c.id, chPkg);
  await apply(c.id);
  const st = await page.evaluate(() => DB.insights[0].body);
  ok(prCh.ok && prCh.totals.changedConflicts === 1 && st === 'legacy содержимое',
    'legacy + изменённые поля → changed-conflict, содержимое не тронуто (не угадываем владение)');
}

// ═══ 16. Кросс-модульная целостность: update не оставляет вторую сущность ═
{
  await reset();
  const c = await connCreate();
  await refresh(c.id, insightPkg(1, 'первичный текст для поиска УПД-МАРКЕР-А'));
  await apply(c.id);
  await refresh(c.id, insightPkg(2, 'обновлённый текст для поиска УПД-МАРКЕР-Б'));
  await apply(c.id);
  const st = await page.evaluate(() => {
    const hitsA = DB.insights.filter(r => (r.body || '').includes('УПД-МАРКЕР-А')).length;
    const hitsB = DB.insights.filter(r => (r.body || '').includes('УПД-МАРКЕР-Б')).length;
    // Unified Intelligence / timeline читают живые записи на рендере — из
    // канонического состояния старая версия исчезла вместе с обновлением.
    return { hitsA, hitsB, total: DB.insights.length };
  });
  ok(st.hitsA === 0 && st.hitsB === 1 && st.total === 1,
    'после update старая версия НЕ существует нигде в canonical: поиск/движки видят только новую');
}

// ═══ 17. Изоляция профилей для update-состояния ═════════════════════
{
  await reset();
  const c = await connCreate();
  await refresh(c.id, insightPkg(1, 'запись профиля A'));
  await apply(c.id);
  const iso = await page.evaluate(async (t) => {
    const origin = activeId();
    const list = loadProfiles();
    const nid = 'pTESTUPD' + Date.now();
    list.push({ id: nid, name: 'TEST-UPD-B', color: '#1056CC' });
    saveProfiles(list); setActiveId(nid); hydrate();
    // В чужом профиле тот же пакет обязан быть «новым» — снимки версий не протекают.
    const p = await extBuildPlan(t);
    const status = p.items[0].status;
    const cnt = (DB.insights || []).length;
    setActiveId(origin); hydrate();
    saveProfiles(loadProfiles().filter(p2 => p2.id !== nid));
    try { localStorage.removeItem('arch5_db_' + nid); localStorage.removeItem('arch5_cfg_' + nid); } catch (_) {}
    return { status, cnt, backCnt: DB.insights.length };
  }, JSON.stringify(insightPkg(2, 'запись профиля A')));
  ok(iso.status === 'new' && iso.cnt === 0 && iso.backCnt === 1,
    'update-состояние (entityHash/importHash) не пересекает границу профиля');
}

// ═══ 18. UI: ручной предпросмотр разводит статусы и выборы ══════════
{
  await reset();
  const c = await connCreate();
  await refresh(c.id, insightPkg(1, 'исходный текст'));
  await apply(c.id);
  await page.evaluate(() => { DB.insights[0].body = 'локально правленный'; persist(); });
  const ui = await page.evaluate(async (t) => {
    openExtImport();
    document.getElementById('ext-text').value = t;
    await extPreview();
    const out = document.getElementById('ext-out');
    const boxes = [...out.querySelectorAll('input[type=checkbox]')].map(b => ({ checked: b.checked, disabled: b.disabled }));
    const text = out.textContent;
    closeOv('ov-ext-import');
    return { boxes, text };
  }, JSON.stringify(insightPkg(2, 'версия источника')));
  ok(ui.boxes.length === 1 && ui.boxes[0].disabled === false && ui.boxes[0].checked === false,
    'changed-conflict в ручном предпросмотре: чекбокс доступен, но ПО УМОЛЧАНИЮ снят');
  ok(/сохраняются твои изменения/.test(ui.text) && /запись правилась локально/.test(ui.text),
    'конфликт объяснён человеческим языком с безопасным дефолтом');
}

// ═══ 19. Санити после update: JS-ошибки/сеть ════════════════════════
ok(errors.length === 0, `JS-ошибок нет за весь прогон (${errors.length})`, errors.join('\n'));

// ═══ 20. Privacy canary: только синтетика ═══════════════════════════
{
  const self = readFileSync(join(DIR, 'updateSemantics.spec.mjs'), 'utf8');
  // Паттерны собираются из частей, чтобы canary не ловил сам себя.
  const banned = [
    new RegExp('GDRIVE' + ':1[A-Za-z0-9_-]{10,}'),
    new RegExp('МОЯ' + '\\s+' + 'ЖИЗНЬ'),
    new RegExp('bel' + 'kov', 'i'),
    new RegExp('MIGRATION' + '-RUN-'),
  ];
  ok(banned.every(rx => !rx.test(self)), 'в сюите нет реальных идентификаторов/названий приватных источников');
  ok(/TEST-UPD-/.test(self), 'все фикстуры несут синтетический префикс TEST-UPD-*');
}

await browser.close();
console.log(`\nVARIANT B (update semantics): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
