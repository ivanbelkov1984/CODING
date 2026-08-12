// SOURCE REVISION ORDERING (owner decision §19) — временной порядок версий.
//
// sourceId = identity · entityHash = content version fingerprint ·
// sourceVersion = ordering evidence. Порядок НИКОГДА не выводится из текста,
// даты события, package order или часов устройства.
//
// ВСЕ фикстуры синтетические (TEST-ORD-*). Гоняет собранный dist/app.html.

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
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', e => errors.push(e.message));
await page.route('**/*', r => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
await page.goto(FILE);
await page.waitForSelector('#nsh-tabbar', { state: 'attached' });
await page.evaluate(() => {
  const s = document.getElementById('splash'); if (s) s.style.display = 'none';
  document.querySelectorAll('.ov.on').forEach(e => e.classList.remove('on'));
});

const reset = () => page.evaluate(() => {
  ['externalConnections', 'externalWorkSessions', 'insights', 'dreams'].forEach(c => { DB[c] = []; });
  DB._del = {};
  try { resolveRecovery('discarded'); } catch (_) {}
  if (typeof extBridgeCancel === 'function') extBridgeCancel();
});
// pkg(n, body, sv): sv — sourceVersion сущности (null = без метаданных).
const pkg = (n, body, sv, entityOver) => ({
  format: 'architect-external-work-v1',
  source: { kind: 'google_drive', label: 'TEST-ORD источник', module: 'TEST-ORD-MODULE' },
  session: { clientRef: 'TEST-ORD-S-' + n, summary: 'сессия ' + n, date: '2026-07-0' + ((n % 9) + 1) },
  entities: [{ clientRef: 'e' + n, type: 'insight', sourceId: 'TEST-ORD-SRC-1',
    claimClass: 'user_experience', textOrigin: 'user_words',
    ...(sv ? { sourceVersion: sv } : {}),
    data: { title: 'TEST-ORD запись', body, tag: 'personal' },
    ...(entityOver || {}) }],
  links: [],
});
const feed = (packages) => ({ format: 'architect-external-work-feed-v1', packages });
const connCreate = () => page.evaluate(() => {
  const r = extConnCreate('TEST-ORD источник', 'manual_file');
  return { ok: r.ok, id: r.rec && r.rec.id };
});
const refresh = (id, obj) => page.evaluate(async ({ i, t }) => {
  const r = await extBridgeRefresh(i, t);
  return JSON.parse(JSON.stringify(r));
}, { i: id, t: JSON.stringify(obj) });
const apply = (id) => page.evaluate((i) => JSON.parse(JSON.stringify(extBridgeApply(i))), id);
const commit = (obj, sel) => page.evaluate(async ({ t, s }) => {
  const p = await extBuildPlan(t);
  const res = extCommitPlan(p, s || null);
  return JSON.parse(JSON.stringify({ statuses: (p.items || []).map(i => i.status), res }));
}, { t: JSON.stringify(obj), s: sel || null });
const snap = () => page.evaluate(() => JSON.stringify({
  ins: DB.insights, ews: DB.externalWorkSessions,
  ck: (DB.externalConnections[0] || { checkpoint: {} }).checkpoint.committedPackageHashes || [],
}));

console.log('\n── SOURCE REVISION ORDERING (§19) ──');

// ═══ 1. Matrix: A → B → повтор старого экспорта A → STALE ═══════════
// Known-old-hash защита работает БЕЗ метаданных: hash версии A известен из
// revision provenance. Ноль мутаций, чекпойнт стоит, состояние всплывает.
{
  await reset();
  const c = await connCreate();
  await refresh(c.id, pkg(1, 'версия A'));
  await apply(c.id);
  await refresh(c.id, pkg(2, 'версия B', { sequence: 2 }, { sourceVersion: undefined }));
  // Обновление без ordering evidence заблокировано — сначала докажем это:
  const prNoEv = await refresh(c.id, pkg(2, 'версия B'));
  ok(prNoEv.ok && prNoEv.totals.orderUnknown === 1 && prNoEv.totals.changed === 0,
    'existing changed + нет ordering metadata → ORDER_UNKNOWN, не CHANGED');
  await page.evaluate(() => extBridgeCancel());
  // Применяем B явным решением (manual override) — запись получает версию B.
  const over = await commit(pkg(2, 'версия B'), { conflicts: { 0: 'override' } });
  ok(over.res.ok, 'явный override применяет версию B (после него hash A — в revision history)');
  const before = await snap();
  // Точный повтор старого экспорта A (без метаданных): hash A известен.
  const prA = await refresh(c.id, pkg(3, 'версия A'));
  ok(prA.ok && prA.totals.stale === 1 && prA.totals.changed === 0 && prA.totals.orderUnknown === 0,
    `повтор старого экспорта → STALE_SOURCE_VERSION по known-old-hash (stale=${prA.totals.stale})`);
  const apA = await apply(c.id);
  ok(!apA.ok && apA.blocked === true && before === await snap(),
    'stale-подача остановлена: canonical/журнал/чекпойнт byte-identical');
  const prA2 = await refresh(c.id, pkg(3, 'версия A'));
  ok(prA2.ok && prA2.totals.stale === 1, 'stale всплывает при каждом чтении (не проглочен)');
  await page.evaluate(() => extBridgeCancel());
  // Manual: никакой selection не применяет stale.
  const forced = await commit(pkg(3, 'версия A'), { conflicts: { 0: 'override' }, items: { 0: true } });
  const body = await page.evaluate(() => DB.insights[0].body);
  ok(!forced.res.ok && /более старую/.test(forced.res.error) && body === 'версия B',
    'STALE полностью non-applicable: commit отклоняет при любом выборе');
}

// ═══ 2. Matrix: seq1 → seq2 → CHANGED; seq2 → seq1 → STALE ══════════
{
  await reset();
  const c = await connCreate();
  await refresh(c.id, pkg(1, 'первая ревизия', { sequence: 1 }));
  await apply(c.id);
  const sv = await page.evaluate(() => DB.insights[0].ext.sourceVersion);
  ok(sv && sv.sequence === 1, 'sourceVersion записан на записи при создании (ordering evidence)');
  const pr2 = await refresh(c.id, pkg(2, 'вторая ревизия', { sequence: 2 }));
  ok(pr2.ok && pr2.totals.changed === 1, 'monotonic sequence: rev1 → rev2 → CHANGED');
  const ap2 = await apply(c.id);
  const st = await page.evaluate(() => ({ body: DB.insights[0].body, sv: DB.insights[0].ext.sourceVersion, rev: DB.insights[0].ext.revisions.at(-1).sourceVersion }));
  ok(ap2.ok && st.body === 'вторая ревизия' && st.sv.sequence === 2 && st.rev && st.rev.sequence === 2,
    'update перенёс sourceVersion на запись и в revision provenance');
  // Старая ревизия по метаданным — stale даже с НОВЫМ содержимым (текст,
  // которого нет в истории хешей): метаданные выше исторических хешей.
  const before = await snap();
  const prOld = await refresh(c.id, pkg(3, 'какой-то другой старый текст', { sequence: 1 }));
  ok(prOld.ok && prOld.totals.stale === 1 && prOld.totals.orderUnknown === 0,
    'ревизия с меньшим sequence → STALE (независимо от текста, без text-heuristic)');
  const apOld = await apply(c.id);
  ok(!apOld.ok && before === await snap(), 'stale по метаданным: ноль мутаций');
  await page.evaluate(() => extBridgeCancel());
}

// ═══ 3. Доказанно newer со старым содержимым = сознательный revert ══
// §25: пользователь откатил документ в источнике → новая ревизия со старым
// текстом. Метаданные выше known-old-hash (§5): это CHANGED, не stale.
{
  await reset();
  const c = await connCreate();
  await refresh(c.id, pkg(1, 'исходный текст', { sequence: 1 }));
  await apply(c.id);
  const ov = await commit(pkg(2, 'изменённый текст', { sequence: 2 }), null);
  ok(ov.res.ok, 'rev2 применён (changed по умолчанию)');
  const prRevert = await refresh(c.id, pkg(3, 'исходный текст', { sequence: 3 }));
  ok(prRevert.ok && prRevert.totals.changed === 1 && prRevert.totals.stale === 0,
    'newer-ревизия со старым содержимым (сознательный revert источника) → CHANGED, не STALE');
  const ap = await apply(c.id);
  const body = await page.evaluate(() => DB.insights[0].body);
  ok(ap.ok && body === 'исходный текст', 'revert применён как обычная новая версия');
}

// ═══ 4. Matrix: same revision token + different hash → CONFLICT ═════
{
  await reset();
  const c = await connCreate();
  await refresh(c.id, pkg(1, 'содержимое A', { revisionId: 'TEST-ORD-REV-X' }));
  await apply(c.id);
  const before = await snap();
  const pr = await refresh(c.id, pkg(2, 'содержимое B', { revisionId: 'TEST-ORD-REV-X' }));
  ok(pr.ok && pr.totals.versionConflicts === 1 && pr.totals.changed === 0,
    'та же ревизия источника + другое содержимое → SOURCE_VERSION_CONFLICT');
  const ap = await apply(c.id);
  ok(!ap.ok && ap.blocked === true && before === await snap(),
    'version-conflict останавливает подачу fail-closed, ноль мутаций');
  await page.evaluate(() => extBridgeCancel());
  const forced = await commit(pkg(2, 'содержимое B', { revisionId: 'TEST-ORD-REV-X' }), { conflicts: { 0: 'override' } });
  ok(!forced.res.ok && /конфликт версии/.test(forced.res.error),
    'version-conflict не применим никаким выбором');
}

// ═══ 5. ORDER_UNKNOWN: явное разрешение keep/override ═══════════════
{
  await reset();
  const c = await connCreate();
  await refresh(c.id, pkg(1, 'версия без метаданных'));
  await apply(c.id);
  // keep: терминальное решение, replay той же версии — resolved.
  const keep = await commit(pkg(2, 'другая версия без метаданных'), { conflicts: { 0: 'keep' } });
  const stK = await page.evaluate(() => ({ body: DB.insights[0].body, lr: DB.insights[0].ext.localResolutions.length }));
  ok(keep.res.ok && stK.body === 'версия без метаданных' && stK.lr === 1,
    'ORDER_UNKNOWN + явное «оставить мою версию» → terminal resolution');
  const replay = await refresh(c.id, pkg(3, 'другая версия без метаданных'));
  ok(replay.ok && replay.totals.existing === 1 && replay.totals.orderUnknown === 0,
    'replay той же версии после keep → resolved/existing (детерминизм)');
  await page.evaluate(() => extBridgeCancel());
  // override: явное «заменить версией источника (порядок неизвестен)».
  const over = await commit(pkg(4, 'третья версия без метаданных'), { conflicts: { 0: 'override' } });
  const stO = await page.evaluate(() => ({ body: DB.insights[0].body,
    mode: (DB.insights[0].ext.revisions.at(-1) || {}).mode,
    statuses: null }));
  ok(over.res.ok === true && stO.body === 'третья версия без метаданных' && stO.mode === 'override',
    'ORDER_UNKNOWN + явный override применяет версию источника',
    JSON.stringify({ ok: over.res.ok, err: over.res.error, statuses: over.statuses, body: stO.body, mode: stO.mode }));
  // claim safety не обходится порядком/выбором: эскалация → rejected.
  const esc = pkg(5, 'третья версия без метаданных', null, {
    claimClass: 'user_fact', claimClasses: ['user_fact'], textOrigin: 'user_words',
  });
  esc.entities[0].data.body = 'эскалирующая версия';
  const escR = await commit(esc, { conflicts: { 0: 'override' } });
  const claims = await page.evaluate(() => DB.insights[0].ext.claimClasses);
  ok(!escR.res.ok && /защитой утверждений/.test(escR.res.error) && JSON.stringify(claims) === JSON.stringify(['user_experience']),
    'claim escalation не обходится ни ordering, ни override (UPDATE_REJECTED)');
}

// ═══ 6. Matrix: CREATE без метаданных разрешён ══════════════════════
{
  await reset();
  const c = await connCreate();
  const pr = await refresh(c.id, pkg(1, 'новая сущность без метаданных'));
  const ap = await apply(c.id);
  const n = await page.evaluate(() => DB.insights.length);
  ok(pr.totals.new === 1 && ap.ok && n === 1, 'новая сущность без sourceVersion — CREATE разрешён (fail-open для create)');
}

// ═══ 7. Bounded history: старый hash за пределами revisions[10] ═════
{
  await reset();
  const c = await connCreate();
  await refresh(c.id, pkg(1, 'версия 0', { sequence: 0 }));
  await apply(c.id);
  // 12 обновлений — версия 0 выпадает из bounded revisions (10).
  for (let v = 1; v <= 12; v++) {
    const r = await commit(pkg(100 + v, 'версия ' + v, { sequence: v }), null);
    if (!r.res.ok) { ok(false, 'обновление v' + v + ' не применилось: ' + r.res.error); break; }
  }
  const revLen = await page.evaluate(() => DB.insights[0].ext.revisions.length);
  ok(revLen === 10, `revision history ограничен (${revLen})`);
  // Версия 0: hash уже НЕ в bounded history, но sequence=0 доказывает возраст.
  const prOld = await refresh(c.id, pkg(200, 'версия 0', { sequence: 0 }));
  ok(prOld.ok && prOld.totals.stale === 1,
    'старый hash вне bounded history + старый sourceVersion → всё равно STALE (метаданные)');
  await page.evaluate(() => extBridgeCancel());
  // Тот же старый контент БЕЗ метаданных: не в истории → ORDER_UNKNOWN, не CHANGED.
  const prNoMeta = await refresh(c.id, pkg(201, 'версия 0'));
  ok(prNoMeta.ok && prNoMeta.totals.orderUnknown === 1 && prNoMeta.totals.changed === 0,
    'старый hash вне bounded history без метаданных → ORDER_UNKNOWN (bounded history не ослабляет safety)');
  await page.evaluate(() => extBridgeCancel());
}

// ═══ 8. Matrix: две версии одного sourceId в одном feed ═════════════
{
  // C sequence: newest wins детерминированно при ЛЮБОМ порядке пакетов.
  await reset();
  const c1 = await connCreate();
  const oldNew = feed([pkg(1, 'ранняя версия', { sequence: 1 }), pkg(2, 'поздняя версия', { sequence: 2 })]);
  await refresh(c1.id, oldNew);
  const ap1 = await apply(c1.id);
  const b1 = await page.evaluate(() => DB.insights[0].body);
  ok(ap1.ok && b1 === 'поздняя версия', 'feed [rev1, rev2] → финал rev2 (создание+обновление)');
  await reset();
  const c2 = await connCreate();
  const newOld = feed([pkg(2, 'поздняя версия', { sequence: 2 }), pkg(1, 'ранняя версия', { sequence: 1 })]);
  const pr2 = await refresh(c2.id, newOld);
  const ap2 = await apply(c2.id);
  const st2 = await page.evaluate(() => ({ body: DB.insights[0].body, n: DB.insights.length }));
  ok(pr2.totals.supersededInFeed === 1 && ap2.ok && st2.body === 'поздняя версия' && st2.n === 1,
    `feed [rev2, rev1] → rev1 терминально «заменена в подаче», финал тот же rev2 (superseded=${pr2.totals.supersededInFeed})`);

  // Без ordering evidence: две разные версии в одном feed → STOP.
  await reset();
  const c3 = await connCreate();
  const noOrder = feed([pkg(1, 'версия X'), pkg(2, 'версия Y')]);
  const before = await snap();
  const pr3 = await refresh(c3.id, noOrder);
  const ap3 = await apply(c3.id);
  ok(pr3.ok && pr3.totals.orderUnknown === 1 && !ap3.ok && ap3.blocked === true,
    'две версии без ordering evidence в одном feed → STOP (array order ≠ freshness)');
  ok(before.slice(0, 200) === (await snap()).slice(0, 200) && (await page.evaluate(() => DB.insights.length)) === 0,
    'ничего не применено — canonical пуст');
  await page.evaluate(() => extBridgeCancel());
}

// ═══ 9. Normalizer version: смена парсера ≠ изменение источника ═════
{
  await reset();
  const c = await connCreate();
  await refresh(c.id, pkg(1, 'нормализуемый текст', { revisionId: 'TEST-ORD-NORM-1' }));
  await apply(c.id);
  const norm = await page.evaluate(() => DB.insights[0].ext.normalizerVersion);
  ok(typeof norm === 'number', `normalizerVersion записан на записи (${norm})`);
  // Симуляция: та же ревизия источника, но запись нормализована ДРУГОЙ
  // версией парсера (hash отличается из-за нормализации, не источника).
  await page.evaluate(() => { DB.insights[0].ext.normalizerVersion = 0; DB.insights[0].ext.entityHash = 'f'.repeat(64); persist(); });
  const pr = await refresh(c.id, pkg(2, 'нормализуемый текст', { revisionId: 'TEST-ORD-NORM-1' }));
  ok(pr.ok && pr.totals.normalizationChanges === 1 && pr.totals.changed === 0 && pr.totals.versionConflicts === 0,
    'та же ревизия + другой hash + другой normalizerVersion → NORMALIZATION_CHANGE (не CHANGED, не source-conflict)');
  const ap = await apply(c.id);
  ok(!ap.ok && ap.blocked === true, 'normalization-change блокирует подачу fail-closed');
  await page.evaluate(() => extBridgeCancel());
}

// ═══ 10. modifiedAt: порядок и одинаковое время ═════════════════════
{
  await reset();
  const c = await connCreate();
  await refresh(c.id, pkg(1, 'версия утро', { modifiedAt: '2026-07-01T10:00:00.000Z' }));
  await apply(c.id);
  const prNew = await refresh(c.id, pkg(2, 'версия вечер', { modifiedAt: '2026-07-01T18:00:00.000Z' }));
  ok(prNew.ok && prNew.totals.changed === 1, 'больший source-side modifiedAt → CHANGED');
  await apply(c.id);
  const prOld = await refresh(c.id, pkg(3, 'что-то раннее', { modifiedAt: '2026-07-01T09:00:00.000Z' }));
  ok(prOld.ok && prOld.totals.stale === 1, 'меньший modifiedAt → STALE');
  await page.evaluate(() => extBridgeCancel());
  // §25: одинаковый modifiedAt у двух ревизий порядок НЕ доказывает.
  const prEq = await refresh(c.id, pkg(4, 'другое содержимое, то же время', { modifiedAt: '2026-07-01T18:00:00.000Z' }));
  ok(prEq.ok && prEq.totals.orderUnknown === 1 && prEq.totals.changed === 0 && prEq.totals.stale === 0,
    'одинаковый modifiedAt + другое содержимое → ORDER_UNKNOWN (равное время ≠ та же ревизия)');
  await page.evaluate(() => extBridgeCancel());
}

// ═══ 11. Alias route не откатывает primary (stale alias) ════════════
{
  await reset();
  const c = await connCreate();
  const primary = pkg(1, 'свежий текст primary', { sequence: 5 });
  await refresh(c.id, primary);
  await apply(c.id);
  // Проекция другого модуля со СТАРЫМ содержимым ссылается на запись только
  // псевдонимом: содержимое primary не трогается вовсе (merge-only).
  const aliasPkg = pkg(2, 'старая проекция другого модуля', { sequence: 1 }, {
    sourceId: 'TEST-ORD-ALIAS-VIEW',
    sourceRefs: [
      { sourceId: 'TEST-ORD-ALIAS-VIEW', role: 'primary' },
      { sourceId: 'TEST-ORD-SRC-1', role: 'alias' },
    ],
  });
  const pr = await refresh(c.id, aliasPkg);
  const ap = await apply(c.id);
  const st = await page.evaluate(() => ({ n: DB.insights.length, body: DB.insights[0].body,
    refs: (DB.insights[0].ext.sourceRefs || []).map(r => r.sourceId).sort() }));
  ok(pr.ok && pr.totals.stale === 0 && ap.ok && st.n === 1 && st.body === 'свежий текст primary',
    'stale alias-проекция НЕ откатывает primary: merge-only, содержимое не тронуто');
  ok(st.refs.includes('TEST-ORD-ALIAS-VIEW'), 'псевдоним дописан');
}

// ═══ 12. Валидация sourceVersion (fail-closed на разборе) ═══════════
{
  const bad = await page.evaluate(async (t) => {
    const p = await extBuildPlan(t);
    return { ok: p.ok, errs: (p.errors || []).filter(x => /sourceVersion/.test(x)).length };
  }, JSON.stringify(pkg(1, 'x', { sequence: 'не число' })));
  ok(!bad.ok && bad.errs === 1, 'sourceVersion.sequence не-число отклонён на разборе');
  const bad2 = await page.evaluate(async (t) => {
    const p = await extBuildPlan(t);
    return { ok: p.ok, errs: (p.errors || []).filter(x => /sourceVersion/.test(x)).length };
  }, JSON.stringify(pkg(1, 'x', { modifiedAt: 'вчера' })));
  ok(!bad2.ok && bad2.errs === 1, 'sourceVersion.modifiedAt не-ISO отклонён на разборе');
  const bad3 = await page.evaluate(async (t) => {
    const p = await extBuildPlan(t);
    return { ok: p.ok, errs: (p.errors || []).filter(x => /sourceVersion/.test(x)).length };
  }, JSON.stringify(pkg(1, 'x', {})));
  ok(!bad3.ok && bad3.errs === 1, 'пустой sourceVersion отклонён (нужен sequence/modifiedAt/revisionId)');
}

// ═══ 13. Backup/restore сохраняет ordering-семантику ════════════════
{
  await reset();
  const c = await connCreate();
  await refresh(c.id, feed([pkg(1, 'первая ревизия', { sequence: 1 })]));
  await apply(c.id);
  const up = await commit(pkg(2, 'вторая ревизия', { sequence: 2 }), null);
  ok(up.res.ok, 'rev2 применён перед snapshot');
  const res = await page.evaluate(async ({ latest, older, unknownOrder }) => {
    const snapDb = JSON.stringify(DB);
    Object.keys(DB).forEach(k => { delete DB[k]; });
    Object.assign(DB, JSON.parse(snapDb));
    persist();
    const connId = DB.externalConnections[0].id;
    const rLatest = await extBridgeRefresh(connId, latest); extBridgeCancel();
    const rOlder = await extBridgeRefresh(connId, older); extBridgeCancel();
    const rUnknown = await extBridgeRefresh(connId, unknownOrder); extBridgeCancel();
    return JSON.parse(JSON.stringify({
      sv: DB.insights[0].ext.sourceVersion, norm: DB.insights[0].ext.normalizerVersion,
      latest: rLatest.totals, older: rOlder.totals, unknown: rUnknown.totals,
    }));
  }, {
    latest: JSON.stringify(pkg(3, 'вторая ревизия', { sequence: 2 })),
    older: JSON.stringify(pkg(4, 'первая ревизия', { sequence: 1 })),
    unknownOrder: JSON.stringify(pkg(5, 'загадочная версия')),
  });
  ok(res.sv && res.sv.sequence === 2 && typeof res.norm === 'number',
    'restore сохранил sourceVersion и normalizerVersion');
  ok(res.latest.existing === 1 && res.latest.new === 0 && res.latest.changed === 0,
    'после restore: актуальная версия → EXISTING');
  ok(res.older.stale === 1, 'после restore: старая версия → STALE');
  ok(res.unknown.orderUnknown === 1, 'после restore: версия без метаданных → ORDER_UNKNOWN');
}

// ═══ 14. Cross-profile: ordering-состояние не пересекает профили ════
{
  await reset();
  const c = await connCreate();
  await refresh(c.id, pkg(1, 'запись профиля A', { sequence: 7 }));
  await apply(c.id);
  const iso = await page.evaluate(async (t) => {
    const origin = activeId();
    const list = loadProfiles();
    const nid = 'pTESTORD' + Date.now();
    list.push({ id: nid, name: 'TEST-ORD-B', color: '#1056CC' });
    saveProfiles(list); setActiveId(nid); hydrate();
    const p = await extBuildPlan(t);
    const status = p.items[0].status;
    setActiveId(origin); hydrate();
    saveProfiles(loadProfiles().filter(x => x.id !== nid));
    try { localStorage.removeItem('arch5_db_' + nid); localStorage.removeItem('arch5_cfg_' + nid); } catch (_) {}
    return { status, backSeq: DB.insights[0].ext.sourceVersion.sequence };
  }, JSON.stringify(pkg(2, 'старая версия чужого профиля', { sequence: 1 })));
  ok(iso.status === 'new' && iso.backSeq === 7,
    'sourceVersion/ordering-состояние не пересекает границу профиля (в чужом профиле — new)');
}

// ═══ 15. Санити/privacy ═════════════════════════════════════════════
ok(errors.length === 0, `JS-ошибок нет за весь прогон (${errors.length})`, errors.join('\n'));
{
  const self = readFileSync(join(DIR, 'revisionOrdering.spec.mjs'), 'utf8');
  const banned = [
    new RegExp('GDRIVE' + ':1[A-Za-z0-9_-]{10,}'),
    new RegExp('МОЯ' + '\\s+' + 'ЖИЗНЬ'),
    new RegExp('bel' + 'kov', 'i'),
    new RegExp('MIGRATION' + '-RUN-'),
  ];
  ok(banned.every(rx => !rx.test(self)), 'в сюите нет реальных идентификаторов/названий приватных источников');
  ok(/TEST-ORD-/.test(self), 'все фикстуры несут синтетический префикс TEST-ORD-*');
}

await browser.close();
console.log(`\nREVISION ORDERING (§19): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
