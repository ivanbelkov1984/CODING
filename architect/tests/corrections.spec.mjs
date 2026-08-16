// ЕДИНАЯ ПРОЕКЦИЯ ИСПРАВЛЕНИЙ (решения владельца §1–§8).
//
// Что защищено здесь:
//   1. Цепочка: одна активная голова на «запись + поле»; более новая
//      коррекция обязана явно заменять прежнюю (supersedesCorrectionId).
//      Молчаливый last-write-wins запрещён.
//   2. Ветвление двух неподчинённых голов → CORRECTION_CONFLICT, fail closed:
//      действует ОРИГИНАЛ, «кто новее» не выбирается.
//   3. Конкурентная/устаревшая запись коррекции отклоняется.
//   4. Родитель в tombstone → коррекции неактивны; отмена удаления возвращает
//      цепочку в силу; сами коррекции из истории не исчезают.
//   5. Все семантические потребители читают ЭФФЕКТИВНОЕ значение: Unified
//      Intelligence, Mind–Body, корреляции, smartInsights, stateScore,
//      deriveAxes, тренды, тепловая карта, серии, обзор периода, контекст для
//      ИИ, N-of-1, лента здоровья.
//   6. Variant B: активная коррекция по import-owned полю — это локальная
//      правка. Replay той же версии сохраняет её; более новая ревизия,
//      меняющая это же поле, даёт changed-conflict; override явно заменяет
//      коррекцию и не оставляет её висеть поверх значения источника.
//   7. Копия/восстановление и синхронизация переносят цепочку целиком.
//   8. Оригинальные записи НИКОГДА не переписываются.
//
// ВСЕ фикстуры синтетические (TEST-CORR-*). Реальных данных владельца нет
// (privacy canary внизу). Гоняет РЕАЛЬНЫЙ собранный бандл в Chromium.

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import { encryptPayload, decryptEnvelope, serializeEnvelope } from '../backup/backup-core.mjs';
import { createBackupAdapter, KEYS } from '../backup/backup-adapter.mjs';
import { restoreBackup } from '../backup/backup-restore.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..');
const FILE = 'file://' + (process.env.CORRECTIONS_BUNDLE || join(ROOT, 'dist', 'app.html'));
let pass = 0, fail = 0;
const errors = [];
const ok = (c, m, d) => {
  if (c) { pass++; console.log('  ✓ ' + m); }
  else { fail++; console.log('  ✗ ' + m); if (d) console.log('      ' + String(d).split('\n').join('\n      ')); }
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', e => errors.push(e.message));
await page.route('**/*', r => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
await page.goto(FILE);
await page.waitForSelector('#nsh-tabbar', { state: 'attached' });
await page.evaluate(() => {
  const s = document.getElementById('splash'); if (s) s.style.display = 'none';
  document.querySelectorAll('.ov.on').forEach(e => e.classList.remove('on'));
});

const reset = () => page.evaluate(() => {
  ['corrections', 'moments', 'whys', 'checkins', 'sphereLogs', 'psyObservations', 'medIntakes',
    'cravings', 'symptoms', 'measures', 'labObservations', 'spheres', 'meds', 'insights',
    'dreams', 'externalConnections', 'externalWorkSessions', 'psyExperiments'].forEach(c => { DB[c] = []; });
  DB._del = {};
  try { resolveRecovery('discarded'); } catch (_) { }
  if (typeof extBridgeCancel === 'function') extBridgeCancel();
  _extConnActive = null;
});

console.log('\nЕДИНАЯ ПРОЕКЦИЯ ИСПРАВЛЕНИЙ\n');

// ── 1. Цепочка и явное замещение ─────────────────────────────────────
{
  await reset();
  const r = await page.evaluate(() => {
    DB.moments = [{ id: 'TEST-CORR-M1', valence: 50, activation: 60, emo: 'тревога', note: 'n', day: '2026-04-01', sv: SCHEMA_VERSION }];
    const out = {};
    const c1 = addCorrection('moments', 'TEST-CORR-M1', { valence: 70 }, 'ошибся при вводе');
    out.first = c1.ok;
    out.eff1 = projOne('moments', 'TEST-CORR-M1').valence;
    const bad = addCorrection('moments', 'TEST-CORR-M1', { valence: 80 }, 'без ссылки');
    out.noSupersedeRejected = !bad.ok && !!bad.stale;
    const c2 = addCorrection('moments', 'TEST-CORR-M1', { valence: 80 }, 'уточнил', { supersedes: c1.rec.id });
    out.second = c2.ok;
    out.eff2 = projOne('moments', 'TEST-CORR-M1').valence;
    out.stale = (() => { const s = addCorrection('moments', 'TEST-CORR-M1', { valence: 90 }, 'stale', { supersedes: c1.rec.id }); return !s.ok && !!s.stale; })();
    out.rawUntouched = DB.moments[0].valence === 50;
    out.chainLen = corrHistory('moments', DB.moments[0])[0].chain.length;
    return out;
  });
  ok(r.first && r.eff1 === 70, 'первое исправление применяется к эффективному значению');
  ok(r.noSupersedeRejected, 'второе исправление БЕЗ явной ссылки отклонено (молчаливый LWW запрещён)');
  ok(r.second && r.eff2 === 80, 'исправление с явной ссылкой заменяет прежнее');
  ok(r.stale, 'исправление с устаревшей ссылкой отклонено (конкурентная запись поймана)');
  ok(r.rawUntouched, 'оригинал записи НЕ переписан ни разу');
  ok(r.chainLen === 2, `цепочка хранит обе версии (${r.chainLen})`);
}

// ── 2. Ветвление → fail-closed конфликт ──────────────────────────────
{
  const r = await page.evaluate(() => {
    const head = DB.corrections.find(c => c.patch.valence === 80);
    const first = DB.corrections.find(c => c.patch.valence === 70);
    // Ветвь приходит «с другого устройства»: обе заменяют одну и ту же.
    DB.corrections.push({ id: 'TEST-CORR-BRANCH', kType: 'correction', coll: 'moments',
      targetId: 'TEST-CORR-M1', patch: { valence: 95 }, supersedesCorrectionId: first.id,
      origin: 'user', createdAt: nowISO(), sv: SCHEMA_VERSION });
    const eff = projOne('moments', 'TEST-CORR-M1');
    const h = corrHistory('moments', DB.moments[0])[0];
    const blocked = addCorrection('moments', 'TEST-CORR-M1', { valence: 60 }, 'поверх конфликта', { supersedes: head.id });
    return { value: eff.valence, conflicts: eff._corrConflicts || [], histConflict: h.conflict,
      heads: h.heads.length, writeBlocked: !blocked.ok && blocked.conflict === 'CORRECTION_CONFLICT' };
  });
  ok(r.value === 50 && r.conflicts.includes('valence'),
    'две неподчинённые головы → действует ОРИГИНАЛ (fail closed), а не «кто новее»', JSON.stringify(r));
  ok(r.histConflict && r.heads === 2, 'история честно показывает конфликт и обе головы');
  ok(r.writeBlocked, 'запись нового исправления поверх конфликта отклонена');
}

// ── 3. Tombstone родителя ────────────────────────────────────────────
{
  const r = await page.evaluate(() => {
    DB.corrections = DB.corrections.filter(c => c.id !== 'TEST-CORR-BRANCH');
    const before = projOne('moments', 'TEST-CORR-M1').valence;
    const nCorr = DB.corrections.length;
    DB._del['TEST-CORR-M1'] = Date.now();
    const during = projOne('moments', 'TEST-CORR-M1');
    const inHistory = corrHistory('moments', DB.moments[0]).length;
    const stillStored = DB.corrections.length;
    delete DB._del['TEST-CORR-M1'];
    const after = projOne('moments', 'TEST-CORR-M1').valence;
    return { before, during: during.valence, corrected: during._corrected, inHistory, stillStored, nCorr, after };
  });
  ok(r.before === 80 && r.during === 50 && r.corrected === undefined,
    'удалённый родитель → исправления НЕ участвуют в эффективном значении', JSON.stringify(r));
  ok(r.stillStored === r.nCorr && r.inHistory > 0,
    'исправления удалённой записи остаются в истории и в хранилище (аудит)');
  ok(r.after === 80, 'отмена удаления возвращает цепочку в силу');
}

// ── 4. Derived-движки: одинаковый результат raw vs эквивалентная проекция ──
{
  await reset();
  const parity = await page.evaluate(() => {
    // Готовим набор: у половины записей значение исправлено коррекцией,
    // у контрольного набора то же значение записано сразу в оригинал.
    const mk = (idp, day, sl, st, cl, mv, sq) => ({ id: idp, date: day, sl, sq, cl, st, mv, note: '', sv: SCHEMA_VERSION });
    // Даты обязаны попадать в 14-дневное окно, иначе stateScore/deriveAxes
    // просто не выполняются и паритет ничего не доказывает.
    // Включая СЕГОДНЯ — иначе серия (calcStreak) законно равна нулю и
    // паритет по ней ничего не проверяет.
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - i); return d.toISOString().slice(0, 10);
    });
    const target = days.map((d, i) => mk('TEST-CORR-C' + i, d, 5, 5, 5, 5, 5));
    // A: исправляем sl до 8 коррекциями
    DB.checkins = JSON.parse(JSON.stringify(target));
    DB.corrections = [];
    DB.checkins.forEach(c => addCorrection('checkins', c.id, { sl: 8 }, 'исправление'));
    const withCorr = {
      streak: calcStreak(), consistency: calcConsistency(7),
      axes: JSON.stringify(deriveAxes()), state: JSON.stringify(stateScore()),
      corr: JSON.stringify(correlations()), smart: JSON.stringify(smartInsights()),
      period: JSON.stringify(periodReview(30)),
    };
    // B: то же значение записано в оригинал, коррекций нет
    DB.checkins = days.map((d, i) => mk('TEST-CORR-C' + i, d, 8, 5, 5, 5, 5));
    DB.corrections = [];
    const withRaw = {
      streak: calcStreak(), consistency: calcConsistency(7),
      axes: JSON.stringify(deriveAxes()), state: JSON.stringify(stateScore()),
      corr: JSON.stringify(correlations()), smart: JSON.stringify(smartInsights()),
      period: JSON.stringify(periodReview(30)),
    };
    const diff = Object.keys(withRaw).filter(k => withRaw[k] !== withCorr[k]);
    // Защита от «зелёного из-за пустых данных»: движки обязаны выдать результат.
    const exercised = withRaw.axes !== 'null' && !/"ok":false/.test(withRaw.state) && withRaw.streak > 0;
    return { diff, exercised, sample: withRaw.axes, state: withRaw.state.slice(0, 80) };
  });
  ok(parity.exercised,
    'паритет-фикстура реально прогоняет движки (окно не пустое)', JSON.stringify(parity).slice(0, 160));
  ok(parity.diff.length === 0,
    'паритет: серии, консистентность, оси, состояние, корреляции, smartInsights и обзор периода дают ОДИНАКОВЫЙ результат для «исправлено коррекцией» и «то же значение в оригинале»',
    'расходятся: ' + parity.diff.join(', '));
}

// ── 5. Mind–Body использует исправленные значения ────────────────────
{
  const mb = await page.evaluate(() => {
    DB.corrections = []; DB.symptoms = []; DB.moments = []; DB.psyObservations = []; DB.medIntakes = [];
    // Симптом «TEST-CORR-голова» в 6 днях + психологические события тех же дней.
    const days = ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06'];
    days.forEach((d, i) => {
      DB.symptoms.push({ id: 'TEST-CORR-S' + i, name: 'ДРУГОЕ', severity: 5, day: d, sv: SCHEMA_VERSION });
      DB.moments.push({ id: 'TEST-CORR-MB' + i, valence: 30, activation: 70, emo: 'тревога', note: 'тревога перед сном', day: d, createdAt: d + 'T10:00:00.000Z', sv: SCHEMA_VERSION });
    });
    const before = JSON.stringify(mindBodyAssociations());
    // Исправляем имя симптома коррекцией — движок обязан увидеть новое имя.
    DB.symptoms.forEach(s => addCorrection('symptoms', s.id, { name: 'головная боль' }, 'уточнил формулировку'));
    const after = JSON.stringify(mindBodyAssociations());
    const raws = DB.symptoms.map(s => s.name).join(',');
    return { changed: before !== after, afterHasCorrected: /головная боль/.test(after), raws };
  });
  ok(mb.changed && mb.afterHasCorrected,
    'Mind–Body считает по ИСПРАВЛЕННЫМ симптомам, а не по оригиналам', JSON.stringify(mb).slice(0, 200));
  ok(/ДРУГОЕ/.test(mb.raws), 'при этом оригиналы симптомов не переписаны');
}

// ── 6. N-of-1 использует исправленные наблюдения ─────────────────────
{
  const nof1 = await page.evaluate(() => {
    DB.corrections = []; DB.psyObservations = [];
    for (let i = 0; i < 6; i++) {
      DB.psyObservations.push({ id: 'TEST-CORR-O' + i, metricId: 'TEST-CORR-METRIC',
        valueNumber: 2, unit: 'балл', contextTag: i < 3 ? 'A' : 'B',
        timestamp: `2026-03-0${i + 1}T10:00:00.000Z`, entryMode: 'event_based', source: 'user', sv: SCHEMA_VERSION });
    }
    const exp = { id: 'TEST-CORR-EXP', targetOutcomeMetricIds: ['TEST-CORR-METRIC'],
      conditions: ['A', 'B'], designType: 'alternating', status: 'active' };
    DB.psyExperiments = [exp];
    const before = JSON.stringify(psyExpAnalysis(exp, DB));
    DB.psyObservations.slice(3).forEach(o => addCorrection('psyObservations', o.id, { valueNumber: 9 }, 'пересчитал'));
    const after = JSON.stringify(psyExpAnalysis(exp, DB));
    return { changed: before !== after, rawKept: DB.psyObservations[3].valueNumber === 2, after: after.slice(0, 160) };
  });
  ok(nof1.changed, 'N-of-1 считает по ИСПРАВЛЕННЫМ наблюдениям', nof1.after);
  ok(nof1.rawKept, 'оригиналы наблюдений не переписаны');
}

// ── 7. Unified Intelligence и лента здоровья на эффективных значениях ──
{
  const ui = await page.evaluate(() => {
    DB.corrections = []; DB.medIntakes = []; DB.meds = [{ id: 1, name: 'TEST-CORR-препарат', active: true, sv: SCHEMA_VERSION }];
    DB.medIntakes = [{ id: 'TEST-CORR-I1', medId: 1, status: 'taken', at: '2026-03-01T09:00:00.000Z', day: '2026-03-01', sv: SCHEMA_VERSION }];
    const evBefore = unifiedEvents(3650).filter(e => e.type === 'medIntakes').length;
    addCorrection('medIntakes', 'TEST-CORR-I1', { status: 'skipped' }, 'не принял на самом деле');
    const evAfter = unifiedEvents(3650).filter(e => e.type === 'medIntakes').length;
    const timeline = healthTimelineItems ? healthTimelineItems(3650) : [];
    return { evBefore, evAfter, rawKept: DB.medIntakes[0].status === 'taken',
      effective: projOne('medIntakes', 'TEST-CORR-I1').status, timelineLen: timeline.length };
  });
  ok(ui.effective === 'skipped' && ui.rawKept,
    'исправление приёма видно эффективно, оригинал сохранён', JSON.stringify(ui));
  ok(ui.evBefore === 1 && ui.evAfter === 0,
    'Unified Intelligence перестал считать приём принятым после исправления (событие пересчиталось)',
    JSON.stringify(ui));
}

// ── 8. Variant B: активная коррекция = локальная правка ──────────────
const v1Pkg = (n, body) => ({
  format: 'architect-external-work-v1',
  source: { kind: 'google_drive', label: 'TEST-CORR источник', module: 'TEST-CORR-M' },
  session: { clientRef: 'TEST-CORR-S' + n, summary: 'синтетическая сессия', date: '2026-04-0' + ((n % 9) + 1) },
  entities: [{ clientRef: 'i' + n, type: 'moment', sourceId: 'TEST-CORR-SRC-1',
    claimClass: 'user_experience', textOrigin: 'user_words', sourceVersion: { sequence: n },
    data: { valence: 40, activation: 55, emo: 'тревога', note: body } }],
  links: [],
});
{
  await reset();
  const setup = await page.evaluate(async (pkg) => {
    const c = extConnCreate('TEST-CORR приём', 'manual_file');
    await extBridgeRefresh(c.rec.id, pkg);
    const a = extBridgeApply(c.rec.id);
    const rec = DB.moments[0];
    return { ok: a.ok, connId: c.rec.id, id: rec && rec.id, fields: rec && rec.ext.importedFields, hash: rec && rec.ext.importHash };
  }, JSON.stringify(v1Pkg(1, 'исходная заметка источника')));
  ok(setup.ok && setup.id != null, 'момент импортирован мостом', JSON.stringify(setup).slice(0, 160));

  // Коррекция по import-owned полю.
  const corrected = await page.evaluate((id) => {
    const r = addCorrection('moments', id, { valence: 90 }, 'исправление владельца');
    const rec = DB.moments[0];
    return { ok: r.ok, eff: projOne('moments', id).valence, raw: rec.valence,
      extSame: rec.ext.importHash, fields: rec.ext.importedFields };
  }, setup.id);
  ok(corrected.ok && corrected.eff === 90 && corrected.raw === 40,
    'активная коррекция меняет эффективное значение, но не сырое', JSON.stringify(corrected).slice(0, 140));
  ok(corrected.extSame === setup.hash, 'коррекция НЕ переписала ext.importHash');

  // Replay ТОЙ ЖЕ версии: коррекция выживает.
  const replay = await page.evaluate(async ({ connId, pkg }) => {
    const pr = await extBridgeRefresh(connId, pkg);
    const ap = extBridgeApply(connId);
    return { totals: pr.totals, ok: ap.ok, eff: projOne('moments', DB.moments[0].id).valence };
  }, { connId: setup.connId, pkg: JSON.stringify(v1Pkg(2, 'исходная заметка источника')) });
  ok(replay.totals.existing === 1 && replay.totals.changed === 0 && replay.totals.changedConflicts === 0,
    'точный replay той же версии → existing', JSON.stringify(replay.totals));
  ok(replay.eff === 90, 'replay НЕ стёр коррекцию владельца');

  // Более новая ревизия, меняющая ИСПРАВЛЕННОЕ поле → changed-conflict.
  const conflictPkg = JSON.parse(JSON.stringify(v1Pkg(3, 'исходная заметка источника')));
  conflictPkg.entities[0].data.valence = 20;
  const newer = await page.evaluate(async ({ connId, pkg }) => {
    const pr = await extBridgeRefresh(connId, pkg);
    const ap = extBridgeApply(connId);
    const st = { totals: pr.totals, applied: ap.ok, eff: projOne('moments', DB.moments[0].id).valence };
    extBridgeCancel();
    return st;
  }, { connId: setup.connId, pkg: JSON.stringify(conflictPkg) });
  ok(newer.totals.changedConflicts === 1 && newer.totals.changed === 0,
    'более новая ревизия по ИСПРАВЛЕННОМУ полю → changed-conflict, а не тихая перезапись',
    JSON.stringify(newer.totals));
  ok(!newer.applied && newer.eff === 90, 'подача остановлена, коррекция владельца жива');

  // Более новая ревизия, меняющая ДРУГОЕ поле → безопасное обновление.
  const otherPkg = JSON.parse(JSON.stringify(v1Pkg(4, 'ДРУГАЯ заметка источника')));
  const other = await page.evaluate(async ({ connId, pkg }) => {
    const pr = await extBridgeRefresh(connId, pkg);
    const ap = extBridgeApply(connId);
    return { totals: pr.totals, ok: ap.ok, eff: projOne('moments', DB.moments[0].id),
      raw: DB.moments[0] };
  }, { connId: setup.connId, pkg: JSON.stringify(otherPkg) });
  ok(other.totals.changed === 1 && other.totals.changedConflicts === 0 && other.ok,
    'более новая ревизия по НЕ исправленному полю применяется безопасно', JSON.stringify(other.totals));
  ok(other.eff.valence === 90 && other.eff.note === 'ДРУГАЯ заметка источника',
    'коррекция владельца сохранена, обновление источника применено', JSON.stringify(other.eff).slice(0, 140));
}

// ── 9. keep-local и override ─────────────────────────────────────────
{
  const commitPkg = (n, valence) => {
    const p = JSON.parse(JSON.stringify(v1Pkg(n, 'ДРУГАЯ заметка источника')));
    p.entities[0].data.valence = valence;
    return JSON.stringify(p);
  };
  const keep = await page.evaluate(async (pkg) => {
    const p = await extBuildPlan(pkg);
    const res = extCommitPlan(p, { conflicts: { 0: 'keep' } });
    const id = DB.moments[0].id;
    return { ok: res.ok, eff: projOne('moments', id).valence, raw: DB.moments[0].valence,
      resolutions: (DB.moments[0].ext.localResolutions || []).length };
  }, commitPkg(5, 25));
  ok(keep.ok && keep.eff === 90 && keep.resolutions === 1,
    'keep-local: коррекция владельца остаётся активной, решение записано', JSON.stringify(keep));

  const over = await page.evaluate(async (pkg) => {
    const p = await extBuildPlan(pkg);
    const res = extCommitPlan(p, { conflicts: { 0: 'override' } });
    const id = DB.moments[0].id;
    const eff = projOne('moments', id);
    const chain = corrHistory('moments', DB.moments[0]).find(h => h.field === 'valence');
    return { ok: res.ok, eff: eff.valence, raw: DB.moments[0].valence,
      chainLen: chain ? chain.chain.length : 0,
      lastOrigin: chain && chain.chain.length ? chain.chain[chain.chain.length - 1].origin : null,
      errors: res.error || '' };
  }, commitPkg(6, 15));
  ok(over.ok && over.raw === 15,
    'override: сырое значение заменено версией источника', JSON.stringify(over));
  ok(over.eff === 15,
    'override РАЗРЕШИЛ коррекцию — она не наложилась поверх значения источника', JSON.stringify(over));
  ok(over.lastOrigin === 'import_override' && over.chainLen >= 2,
    'разрешение записано append-only с честным происхождением, прежняя правка осталась в истории',
    JSON.stringify(over));
}

// ── 10. Провенанс не подделан ────────────────────────────────────────
{
  const prov = await page.evaluate(() => {
    const r = DB.moments[0];
    return { sourceId: r.ext.sourceId, classes: r.ext.claimClasses || [r.ext.claimClass],
      textOrigin: r.ext.textOrigin, revisions: (r.ext.revisions || []).length };
  });
  ok(prov.sourceId === 'TEST-CORR-SRC-1' && prov.textOrigin === 'user_words',
    'sourceId и textOrigin не изменены исправлениями', JSON.stringify(prov));
  ok(!prov.classes.some(c => ['user_fact', 'external_event', 'clinical_fact'].includes(c)),
    'класс утверждения не повышен до фактического', JSON.stringify(prov.classes));
}

// ── 11. Синхронизация переносит цепочку ──────────────────────────────
{
  const sync = await page.evaluate(async () => {
    const before = JSON.stringify(DB.corrections);
    const oa = api, ot = toast; const toasts = [];
    api = async (p, o = {}) => ((o.method || 'GET') === 'GET'
      ? { name: 'x', updated_at: '2026-04-01T00:00:00Z', data: null } : { updated_at: '2026-04-02T00:00:00Z' });
    toast = (m, k) => toasts.push(k + ':' + m);
    CFG.apiUrl = 'https://example.invalid'; CFG.spaceKey = 'TEST-CORR-SPACE';
    setPass('test-corr-pass'); _syncing = false;
    await runSync({ manual: true });
    api = oa; toast = ot;
    return { toasts, same: before === JSON.stringify(DB.corrections), n: DB.corrections.length };
  });
  ok(sync.toasts.some(t => /^ok:Синхронизировано/.test(t)) && sync.same && sync.n > 0,
    `синхронизация зелёная, цепочка исправлений не изменилась (${sync.n})`, sync.toasts.join(' | '));
}

// ── 12. Копия/восстановление переносят цепочку ───────────────────────
{
  const snap = await page.evaluate(() => JSON.parse(JSON.stringify(DB)));
  const mkS = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, keys: () => [...m.keys()] }; };
  const mkM = () => { const m = new Map(); return { get: async i => m.get(i), put: async (i, v) => { m.set(i, v); }, del: async i => { m.delete(i); }, keys: async () => [...m.keys()] }; };
  const NOW = '2026-12-31T00:00:00.000Z';
  const st = mkS({ [KEYS.PKEY]: JSON.stringify([{ id: 'pC', name: 'C', color: '#1056CC' }]), [KEYS.AKEY]: 'pC',
    [KEYS.db('pC')]: JSON.stringify(snap), [KEYS.cfg('pC')]: JSON.stringify({ userName: 'C' }) });
  const ad = createBackupAdapter({ storage: st, media: mkM(), now: () => NOW });
  const { payload } = await ad.buildBundle({ id: 'pC', mode: 'data-only' });
  const env = await encryptPayload(payload, 'test-corr-backup');
  const ser = serializeEnvelope(env);
  await decryptEnvelope(env, 'test-corr-backup');
  const dest = { storage: mkS({ [KEYS.PKEY]: '[]', [KEYS.AKEY]: '' }), media: mkM() };
  const ad2 = createBackupAdapter({ storage: dest.storage, media: dest.media, now: () => NOW });
  const r = await restoreBackup({ adapter: ad2, file: { size: ser.length, text: async () => ser }, password: 'test-corr-backup', mode: 'new', genProfileId: () => 'pCR', now: () => NOW });
  const rdb = JSON.parse(dest.storage.getItem(KEYS.db('pCR')));
  ok(r.ok && JSON.stringify(rdb.corrections) === JSON.stringify(snap.corrections),
    `восстановление сохранило цепочку исправлений byte-identical (${(rdb.corrections || []).length})`);
  const post = await page.evaluate((db) => {
    const keep = JSON.stringify(DB);
    Object.keys(DB).forEach(k => { delete DB[k]; });
    Object.assign(DB, JSON.parse(db));
    const eff = projOne('moments', DB.moments[0].id);
    const hist = corrHistory('moments', DB.moments[0]);
    Object.keys(DB).forEach(k => { delete DB[k]; });
    Object.assign(DB, JSON.parse(keep));
    return { valence: eff.valence, chains: hist.length };
  }, JSON.stringify(rdb));
  ok(post.chains > 0, 'после восстановления история исправлений на месте', JSON.stringify(post));
}

// ── 13. Изоляция профилей ────────────────────────────────────────────
{
  const iso = await page.evaluate(() => {
    const raw = localStorage.getItem('arch5_db_' + activeId());
    localStorage.setItem('arch5_db_TEST-CORR-OTHER', raw);
    const before = localStorage.getItem('arch5_db_TEST-CORR-OTHER');
    DB.moments = [{ id: 'TEST-CORR-ISO', valence: 10, activation: 10, note: '', day: '2026-04-01', sv: SCHEMA_VERSION }];
    DB.corrections = [];
    persist();
    addCorrection('moments', 'TEST-CORR-ISO', { valence: 77 }, 'изоляция');
    const after = localStorage.getItem('arch5_db_TEST-CORR-OTHER');
    const mine = JSON.parse(localStorage.getItem('arch5_db_' + activeId()));
    localStorage.removeItem('arch5_db_TEST-CORR-OTHER');
    return { untouched: before === after, leaked: /TEST-CORR-ISO/.test(after || ''),
      mineHas: (mine.corrections || []).some(c => c.targetId === 'TEST-CORR-ISO') };
  });
  ok(iso.mineHas, 'исправление записано в активный профиль');
  ok(iso.untouched && !iso.leaked, 'соседний профиль не изменился — межпрофильного протекания нет');
}

// ── 14. Двойного счёта нет ───────────────────────────────────────────
{
  const dbl = await page.evaluate(() => {
    DB.corrections = []; DB.symptoms = [];
    DB.symptoms = [{ id: 'TEST-CORR-D1', name: 'боль', severity: 5, day: '2026-03-01', sv: SCHEMA_VERSION }];
    const n0 = projAll('symptoms').length;
    const c = addCorrection('symptoms', 'TEST-CORR-D1', { severity: 8 }, 'уточнил');
    addCorrection('symptoms', 'TEST-CORR-D1', { severity: 9 }, 'ещё раз', { supersedes: c.rec.id });
    const list = projAll('symptoms');
    return { n0, n1: list.length, sev: list[0].severity, ids: list.map(x => x.id) };
  });
  ok(dbl.n0 === 1 && dbl.n1 === 1 && dbl.sev === 9,
    'две коррекции одной записи НЕ создают вторую запись (двойного счёта нет)', JSON.stringify(dbl));
}

// ── 15. Инспектор: effective, метка, история, технический блок ───────
{
  const insp = await page.evaluate(() => {
    DB.corrections = [];
    DB.checkins = [{ id: 'TEST-CORR-CI', date: '2026-04-01', sl: 5, sq: 5, cl: 5, st: 5, mv: 5, note: 'заметка', sv: SCHEMA_VERSION }];
    const c = addCorrection('checkins', 'TEST-CORR-CI', { sl: 8 }, 'пересчитал по трекеру');
    recOpen('checkins', 'TEST-CORR-CI');
    const box = $('rec-det-body');
    const human = [...box.children].filter(e => !e.matches('details.psy-det')).map(e => e.textContent).join(' ');
    const all = box.textContent.replace(/\s+/g, ' ');
    const acts = [...$('rec-det-actions').querySelectorAll('button')].map(b => b.textContent.trim());
    const out = {
      effShown: /8/.test(human), marked: /Исправлено/.test(human),
      hist: /История исправлений/.test(all), orig: /Базовое значение текущей версии: 5/.test(all),
      reason: /пересчитал по трекеру/.test(all),
      // Подпись «Оригинал» семантически неверна: после обновления из
      // источника (Variant B) сырое поле уже переписано, и «оригиналом»
      // текущее базовое значение не является. UI обязан этого не утверждать.
      noOriginalClaim: !/Оригинал/.test(all),
      techA: /A · Базовая запись текущей версии/.test(all), techB: /B · Цепочка исправлений/.test(all), techC: /C · Эффективная запись/.test(all),
      corrBtn: acts.some(a => /Исправить значение/.test(a)),
      noRawJsonInNormal: !/"sv":/.test(human),
    };
    closeOv('ov-rec-det');
    return out;
  });
  ok(insp.effShown && insp.marked, 'инспектор показывает ЭФФЕКТИВНОЕ значение и метку «Исправлено»', JSON.stringify(insp));
  ok(insp.hist && insp.orig && insp.reason, 'универсальная история: базовое значение, цепочка, причина', JSON.stringify(insp));
  ok(insp.noOriginalClaim, 'инспектор больше не называет базовое значение «Оригиналом»', JSON.stringify(insp));
  ok(insp.techA && insp.techB && insp.techC, 'технический блок: A базовая запись · B цепочка · C эффективная запись');
  ok(insp.noRawJsonInNormal, 'в обычном виде сырого JSON нет');
  ok(insp.corrBtn, 'у доказательной записи есть путь «Исправить значение»');
}

// ── 16. Писатель исправлений: доменная валидация ─────────────────────
{
  const wr = await page.evaluate(() => {
    const out = {};
    const step = fn => { try { fn(); } catch (e) { out.crash = (out.crash || '') + ' ' + e.message; } };
    DB.corrections = [];
    DB.checkins = [{ id: 'TEST-CORR-W1', date: '2026-04-01', sl: 7, sq: 5, cl: 5, st: 5, mv: 5, note: '', sv: SCHEMA_VERSION }];
    recOpen('checkins', 'TEST-CORR-W1'); recCorrOpen();
    step(() => { $('rec-c-sl').value = '99'; recCorrSave(); });
    out.rangeRejected = DB.corrections.length === 0;
    step(() => { $('rec-c-sl').value = '8'; $('rec-c-reason').value = 'по трекеру'; recCorrSave(); });
    out.saved = DB.corrections.length === 1 && (projOne('checkins', 'TEST-CORR-W1') || {}).sl === 8;
    out.rawKept = DB.checkins[0].sl === 7;
    DB.medIntakes = [{ id: 'TEST-CORR-W2', medId: 1, status: 'taken', at: nowISO(), sv: SCHEMA_VERSION }];
    recOpen('medIntakes', 'TEST-CORR-W2'); recCorrOpen();
    step(() => { $('rec-c-status').value = 'выдумка'; recCorrSave(); });
    out.enumRejected = DB.corrections.length === 1;
    step(() => { $('rec-c-status').value = 'skipped'; recCorrSave(); });
    out.enumOk = (projOne('medIntakes', 'TEST-CORR-W2') || {}).status === 'skipped';
    DB.psyObservations = [{ id: 'TEST-CORR-W3', metricId: 'm', valueNumber: 3, timestamp: nowISO(), sv: SCHEMA_VERSION }];
    recOpen('psyObservations', 'TEST-CORR-W3'); recCorrOpen();
    step(() => { $('rec-c-valueNumber').value = 'не число'; recCorrSave(); });
    out.numRejected = DB.corrections.length === 2;
    DB.cravings = [{ id: 'TEST-CORR-W4', kind: 'сигарета', intensity: 5, outcome: 'held', sv: SCHEMA_VERSION }];
    recOpen('cravings', 'TEST-CORR-W4'); recCorrOpen();
    step(() => { $('rec-c-outcome').value = 'может быть'; recCorrSave(); });
    out.cravEnumRejected = DB.corrections.length === 2;
    closeOv('ov-rec-det');
    return out;
  });
  ok(wr.rangeRejected, 'исправление вне диапазона отклонено (checkins.sl)');
  ok(wr.saved && wr.rawKept, 'корректное исправление сохранено, оригинал не тронут');
  ok(wr.enumRejected && wr.enumOk, 'medIntakes.status: чужое значение отклонено, допустимое принято');
  ok(wr.numRejected, 'psyObservations.valueNumber: не-число отклонено');
  ok(wr.cravEnumRejected, 'cravings.outcome: значение вне перечисления отклонено');
}

// ── 17. Коллекции без поддержки исправлений ──────────────────────────
{
  const un = await page.evaluate(() => {
    DB.insights = [{ id: 'TEST-CORR-N1', title: 't', body: 'b', sv: SCHEMA_VERSION }];
    const r = addCorrection('insights', 'TEST-CORR-N1', { title: 'x' }, 'нельзя');
    return { rejected: !r.ok, projIsRaw: projOne('insights', 'TEST-CORR-N1') === null || proj('insights', DB.insights[0]) === DB.insights[0] };
  });
  ok(un.rejected, 'исправление для коллекции без поддержки отклонено');
  ok(un.projIsRaw, 'проекция для неподдерживаемой коллекции возвращает запись как есть');
}

// ── 18. §1 БЛОКЕР: снимок берётся в момент ПОКАЗА формы ──────────────
// Между показом формы и сохранением с другого устройства может прилететь
// чужая коррекция. Если снимок брать при сохранении, владелец молча заместит
// исправление, которого никогда не видел. Здесь это ровно и проверяется.
{
  // A. Форма открыта: значение 5, исправлений НЕТ.
  // B. С другого устройства приходит исправление на 7 (форму не переоткрывали).
  // C. Владелец вводит 8 и сохраняет.
  const st = await page.evaluate(() => {
    DB.corrections = []; DB.psyObservations = [];
    DB.psyObservations = [{ id: 'TEST-CORR-S1', metricId: 'm', valueNumber: 5, timestamp: nowISO(), sv: SCHEMA_VERSION }];
    persist();
    const out = {};
    // Снимок читаем защищённо: под мутацией его может не быть вовсе, и тест
    // обязан это ПОКАЗАТЬ красным, а не упасть исключением.
    const snapOf = f => ((_recDet && _recDet.corrSnap && _recDet.corrSnap.heads && _recDet.corrSnap.heads[f]) || { state: 'НЕТ-СНИМКА' });
    recOpen('psyObservations', 'TEST-CORR-S1'); recCorrOpen();
    out.sawFive = /сейчас: 5/.test($('rec-det-body').textContent);
    out.snapNone = snapOf('valueNumber').state === 'none';
    // B — приходит с синхронизацией, форма НЕ перерисовывается человеком.
    DB.corrections.push({ id: 'TEST-CORR-S1-C1', kType: 'correction', coll: 'psyObservations',
      targetId: 'TEST-CORR-S1', patch: { valueNumber: 7 }, reason: 'со второго устройства',
      supersedesCorrectionId: null, origin: 'user', createdAt: nowISO(), sv: SCHEMA_VERSION });
    const nBefore = DB.corrections.length;
    const rawBefore = JSON.stringify(DB.psyObservations[0]);
    const storeBefore = localStorage.getItem('arch5_db_' + activeId());
    // C
    $('rec-c-valueNumber').value = '8';
    recCorrSave();
    out.noNewCorrection = DB.corrections.length === nBefore;
    out.noEight = !DB.corrections.some(c => c.patch && c.patch.valueNumber === 8);
    out.effStays7 = projOne('psyObservations', 'TEST-CORR-S1').valueNumber === 7;
    out.rawUntouched = JSON.stringify(DB.psyObservations[0]) === rawBefore;
    out.noPersist = localStorage.getItem('arch5_db_' + activeId()) === storeBefore;
    out.banner = /Данные изменились с момента открытия формы/.test($('rec-det-body').textContent);
    out.stillCorrecting = _recDet.correcting === true;
    // Ожидание НЕ обновилось само: повтор сохранения снова отклоняется.
    out.snapNotRefreshed = snapOf('valueNumber').state === 'none';
    // Явное действие человека — и только оно — обновляет ожидание.
    recCorrReload();
    out.afterReloadHead = snapOf('valueNumber').state === 'head'
      && snapOf('valueNumber').id === 'TEST-CORR-S1-C1';
    if ($('rec-c-valueNumber')) $('rec-c-valueNumber').value = '8';
    recCorrSave();
    out.afterReloadSaved = projOne('psyObservations', 'TEST-CORR-S1').valueNumber === 8;
    out.afterReloadSupersedes = (DB.corrections.find(c => c.patch && c.patch.valueNumber === 8) || {}).supersedesCorrectionId === 'TEST-CORR-S1-C1';
    closeOv('ov-rec-det');
    return out;
  });
  ok(st.sawFive && st.snapNone, 'снимок берётся при ПОКАЗЕ формы и типизирован (нет головы)', JSON.stringify(st));
  ok(st.noNewCorrection && st.noEight, 'устаревший показ → исправление НЕ записано (ноль мутаций)', JSON.stringify(st));
  ok(st.effStays7, 'эффективное значение осталось 7 — чужая коррекция не замещена', JSON.stringify(st));
  ok(st.rawUntouched && st.noPersist, 'провалившееся сохранение ничего не записало в хранилище', JSON.stringify(st));
  ok(st.banner && st.stillCorrecting, 'человеку честно сказано, что данные изменились с момента открытия');
  ok(st.snapNotRefreshed, 'ожидание НЕ обновилось автоматически после отказа');
  ok(st.afterReloadHead && st.afterReloadSaved && st.afterReloadSupersedes,
    'после ЯВНОГО обновления формы исправление проходит и явно заменяет увиденную голову', JSON.stringify(st));

  // Второй сценарий: форма открыта поверх головы C1, синк добавляет C2,
  // заменяющую C1. Сохранение против визуально устаревшей C1 отклоняется.
  const st2 = await page.evaluate(() => {
    DB.corrections = []; DB.checkins = [];
    DB.checkins = [{ id: 'TEST-CORR-S2', date: '2026-04-02', sl: 5, sq: 5, cl: 5, st: 5, mv: 5, note: '', sv: SCHEMA_VERSION }];
    const c1 = addCorrection('checkins', 'TEST-CORR-S2', { sl: 6 }, 'первое');
    recOpen('checkins', 'TEST-CORR-S2'); recCorrOpen();
    const seenId = ((_recDet.corrSnap && _recDet.corrSnap.heads && _recDet.corrSnap.heads.sl) || {}).id;
    DB.corrections.push({ id: 'TEST-CORR-S2-C2', kType: 'correction', coll: 'checkins',
      targetId: 'TEST-CORR-S2', patch: { sl: 7 }, reason: 'со второго устройства',
      supersedesCorrectionId: c1.rec.id, origin: 'user', createdAt: nowISO(), sv: SCHEMA_VERSION });
    const nBefore = DB.corrections.length;
    $('rec-c-sl').value = '9';
    recCorrSave();
    const out = {
      seenWasC1: seenId === String(c1.rec.id),
      rejected: DB.corrections.length === nBefore && !DB.corrections.some(c => c.patch && c.patch.sl === 9),
      eff: projOne('checkins', 'TEST-CORR-S2').sl,
      banner: /Данные изменились с момента открытия формы/.test($('rec-det-body').textContent),
    };
    closeOv('ov-rec-det');
    return out;
  });
  ok(st2.seenWasC1, 'снимок показа зафиксировал именно ту голову, которую видел человек');
  ok(st2.rejected && st2.eff === 7 && st2.banner,
    'замещение головы, которую человек не видел, отклонено (эффективное осталось 7)', JSON.stringify(st2));

  // Многополевое исправление: КАЖДОЕ поле сверяется со своим снимком.
  const st3 = await page.evaluate(() => {
    DB.corrections = []; DB.checkins = [];
    DB.checkins = [{ id: 'TEST-CORR-S3', date: '2026-04-03', sl: 5, sq: 5, cl: 5, st: 5, mv: 5, note: '', sv: SCHEMA_VERSION }];
    recOpen('checkins', 'TEST-CORR-S3'); recCorrOpen();
    // Чужая коррекция приходит ТОЛЬКО по одному из двух правимых полей.
    DB.corrections.push({ id: 'TEST-CORR-S3-C1', kType: 'correction', coll: 'checkins',
      targetId: 'TEST-CORR-S3', patch: { sq: 9 }, reason: 'со второго устройства',
      supersedesCorrectionId: null, origin: 'user', createdAt: nowISO(), sv: SCHEMA_VERSION });
    const nBefore = DB.corrections.length;
    $('rec-c-sl').value = '8'; $('rec-c-sq').value = '3';
    recCorrSave();
    const out = {
      rejected: DB.corrections.length === nBefore,
      slNotWritten: !DB.corrections.some(c => c.patch && c.patch.sl === 8),
      eff: projOne('checkins', 'TEST-CORR-S3'),
    };
    closeOv('ov-rec-det');
    return { rejected: out.rejected, slNotWritten: out.slNotWritten, sl: out.eff.sl, sq: out.eff.sq };
  });
  ok(st3.rejected && st3.slNotWritten && st3.sl === 5 && st3.sq === 9,
    'многополевое исправление: расхождение по ОДНОМУ полю отклоняет всё исправление целиком', JSON.stringify(st3));

  // Введённое значение СЛУЧАЙНО совпало с чужой коррекцией. Это всё равно
  // устаревший показ: сказать «Изменений нет» значит выдать чужую правку за
  // свою уже применённую.
  const st4 = await page.evaluate(() => {
    DB.corrections = []; DB.checkins = [];
    DB.checkins = [{ id: 'TEST-CORR-S4', date: '2026-04-04', sl: 5, sq: 5, cl: 5, st: 5, mv: 5, note: '', sv: SCHEMA_VERSION }];
    recOpen('checkins', 'TEST-CORR-S4'); recCorrOpen();
    DB.corrections.push({ id: 'TEST-CORR-S4-C1', kType: 'correction', coll: 'checkins',
      targetId: 'TEST-CORR-S4', patch: { sl: 7 }, reason: 'со второго устройства',
      supersedesCorrectionId: null, origin: 'user', createdAt: nowISO(), sv: SCHEMA_VERSION });
    $('rec-c-sl').value = '7';   // ровно то же значение, что прилетело
    recCorrSave();
    const out = {
      staleBanner: /Данные изменились с момента открытия формы/.test($('rec-det-body').textContent),
      notSilentNoop: _recDet.correcting === true,
    };
    closeOv('ov-rec-det');
    return out;
  });
  ok(st4.staleBanner && st4.notSilentNoop,
    'совпадение с чужой коррекцией — это устаревший показ, а не «Изменений нет»', JSON.stringify(st4));
}

// ── 19. §2 ЦЕЛОСТНОСТЬ ЦЕПОЧКИ (слитые/легаси данные) ────────────────
// Повреждённую структуру нельзя «починить по времени»: createdAt при слиянии
// с другого устройства ничего не доказывает. Любая поломка = fail closed.
{
  const mk = (id, coll, targetId, patch, sup) => ({
    id, kType: 'correction', coll, targetId, patch, reason: 'фикстура',
    supersedesCorrectionId: sup === undefined ? null : sup, origin: 'user',
    createdAt: '2026-04-01T10:00:00.000Z', sv: 9,
  });
  const cases = [
    ['цикл A↔B', [['A', { severity: 8 }, 'B'], ['B', { severity: 9 }, 'A']]],
    ['самозамещение', [['A', { severity: 8 }, 'A']]],
    ['висячая ссылка на несуществующее', [['A', { severity: 8 }, 'НЕТ-ТАКОЙ']]],
    ['дубль идентификатора', [['A', { severity: 8 }, null], ['A', { severity: 9 }, null]]],
    ['цикл рядом с валидной ветвью', [['R', { severity: 6 }, null], ['H', { severity: 7 }, 'R'],
      ['X', { severity: 8 }, 'Y'], ['Y', { severity: 9 }, 'X']]],
  ];
  for (const [name, nodes] of cases) {
    const r = await page.evaluate(({ nodes, mkSrc }) => {
      const mk = eval('(' + mkSrc + ')');
      DB.corrections = []; DB.symptoms = [];
      DB.symptoms = [{ id: 'TEST-CORR-BAD', name: 'боль', severity: 3, day: dayAgo(1), sv: SCHEMA_VERSION }];
      DB.corrections = nodes.map(([id, patch, sup]) => mk('TEST-CORR-' + id, 'symptoms', 'TEST-CORR-BAD', patch, sup));
      const eff = projOne('symptoms', 'TEST-CORR-BAD');
      const hist = corrHistory('symptoms', DB.symptoms[0]);
      const write = addCorrection('symptoms', 'TEST-CORR-BAD', { severity: 4 }, 'поверх поломки');
      const head = corrActiveHead('symptoms', 'TEST-CORR-BAD', 'severity');
      recOpen('symptoms', 'TEST-CORR-BAD');
      const shown = $('rec-det-body').textContent.replace(/\s+/g, ' ');
      const list = projAll('symptoms');
      closeOv('ov-rec-det');
      return {
        effOriginal: eff.severity === 3,
        flagged: Array.isArray(eff._corrInvalid) && eff._corrInvalid.includes('severity'),
        noApplied: !(eff._corrFields || []).length,
        histInvalid: !!(hist[0] && hist[0].invalid && hist[0].invalid.length),
        writeBlocked: !write.ok && write.invalid === 'INVALID_CORRECTION_CHAIN',
        headNotGuessed: head.head === null,
        uiShows: /История исправлений повреждена|повреждена/.test(shown),
        engineOriginal: list[0].severity === 3,
      };
    }, { nodes, mkSrc: mk.toString() });
    ok(r.effOriginal && r.flagged && r.noApplied,
      `[${name}] эффективное значение = ОРИГИНАЛ, поле помечено повреждённым`, JSON.stringify(r));
    ok(r.writeBlocked && r.headNotGuessed,
      `[${name}] запись новых исправлений закрыта, голова не угадана`, JSON.stringify(r));
    ok(r.histInvalid && r.uiShows, `[${name}] инспектор показывает проблему целостности`, JSON.stringify(r));
    ok(r.engineOriginal, `[${name}] движки не потребляют угаданное исправленное значение`, JSON.stringify(r));
  }

  // Две независимые первые коррекции — это КОНФЛИКТ, а не поломка данных:
  // приложение не должно объявлять честную конкурентную правку «повреждением».
  const two = await page.evaluate(() => {
    DB.corrections = []; DB.symptoms = [];
    DB.symptoms = [{ id: 'TEST-CORR-TWOROOT', name: 'боль', severity: 3, day: dayAgo(1), sv: SCHEMA_VERSION }];
    DB.corrections = [
      { id: 'TEST-CORR-R1', kType: 'correction', coll: 'symptoms', targetId: 'TEST-CORR-TWOROOT', patch: { severity: 7 }, supersedesCorrectionId: null, origin: 'user', createdAt: nowISO(), sv: SCHEMA_VERSION },
      { id: 'TEST-CORR-R2', kType: 'correction', coll: 'symptoms', targetId: 'TEST-CORR-TWOROOT', patch: { severity: 9 }, supersedesCorrectionId: null, origin: 'user', createdAt: nowISO(), sv: SCHEMA_VERSION },
    ];
    const eff = projOne('symptoms', 'TEST-CORR-TWOROOT');
    return { conflict: (eff._corrConflicts || []).includes('severity'),
      notInvalid: !(eff._corrInvalid || []).length, value: eff.severity };
  });
  ok(two.conflict && two.notInvalid && two.value === 3,
    'две независимые первые коррекции = КОНФЛИКТ (не «повреждение»), действует оригинал', JSON.stringify(two));

  // Variant B: по записи с повреждённой цепочкой обновление источника
  // не считается безопасным — fail closed, а не тихая перезапись.
  const vb = await page.evaluate(() => {
    DB.corrections = []; DB.symptoms = [];
    DB.symptoms = [{ id: 'TEST-CORR-VB', name: 'боль', severity: 3, day: dayAgo(1), sv: SCHEMA_VERSION }];
    DB.corrections = [
      { id: 'TEST-CORR-VB-A', kType: 'correction', coll: 'symptoms', targetId: 'TEST-CORR-VB', patch: { severity: 8 }, supersedesCorrectionId: 'TEST-CORR-VB-B', origin: 'user', createdAt: nowISO(), sv: SCHEMA_VERSION },
      { id: 'TEST-CORR-VB-B', kType: 'correction', coll: 'symptoms', targetId: 'TEST-CORR-VB', patch: { severity: 9 }, supersedesCorrectionId: 'TEST-CORR-VB-A', origin: 'user', createdAt: nowISO(), sv: SCHEMA_VERSION },
    ];
    const eff = proj('symptoms', DB.symptoms[0]);
    return { broken: (eff._corrInvalid || []).includes('severity'), value: eff.severity };
  });
  ok(vb.broken && vb.value === 3, 'повреждённая цепочка видна потребителям как _corrInvalid + оригинал', JSON.stringify(vb));
}

// ── 20. §3 Явная очистка nullable-значения ───────────────────────────
// Пустое поле ввода означает «не трогать» — переинтерпретировать его как
// null нельзя. Значит для явного «нет числового значения» нужен отдельный
// путь, иначе ошибочное число нечем убрать.
{
  const nl = await page.evaluate(() => {
    DB.corrections = []; DB.psyObservations = [];
    DB.psyObservations = [{ id: 'TEST-CORR-NULL', metricId: 'm', valueNumber: 42, valueText: '', timestamp: nowISO(), sv: SCHEMA_VERSION }];
    const out = {};
    recOpen('psyObservations', 'TEST-CORR-NULL'); recCorrOpen();
    out.hasClearAction = !!$('rec-c-null-valueNumber');
    // Пустой ввод без отметки — по-прежнему «оставить как есть».
    $('rec-c-valueNumber').value = '';
    recCorrSave();
    out.blankIsNoop = DB.corrections.length === 0 && projOne('psyObservations', 'TEST-CORR-NULL').valueNumber === 42;
    // Явная очистка.
    recOpen('psyObservations', 'TEST-CORR-NULL'); recCorrOpen();
    $('rec-c-null-valueNumber').checked = true;
    recCorrSave();
    const eff = projOne('psyObservations', 'TEST-CORR-NULL');
    out.effNull = eff.valueNumber === null;
    out.originalKept = DB.psyObservations[0].valueNumber === 42;
    out.corrWritten = DB.corrections.length === 1 && DB.corrections[0].patch.valueNumber === null;
    out.histShows = (corrHistory('psyObservations', DB.psyObservations[0])[0] || {}).original === 42;
    // Повторная очистка уже пустого значения — не новая коррекция.
    recOpen('psyObservations', 'TEST-CORR-NULL'); recCorrOpen();
    $('rec-c-null-valueNumber').checked = true;
    recCorrSave();
    out.repeatNoop = DB.corrections.length === 1;
    // Отметка «очистить» + введённое значение — противоречие, отклоняется.
    recOpen('psyObservations', 'TEST-CORR-NULL'); recCorrOpen();
    $('rec-c-null-valueNumber').checked = true; $('rec-c-valueNumber').value = '7';
    recCorrSave();
    out.contradictionRejected = DB.corrections.length === 1;
    // Не-nullable поле такой отметки не получает.
    DB.checkins = [{ id: 'TEST-CORR-NN', date: '2026-04-05', sl: 5, sq: 5, cl: 5, st: 5, mv: 5, note: '', sv: SCHEMA_VERSION }];
    recOpen('checkins', 'TEST-CORR-NN'); recCorrOpen();
    out.noClearOnNonNullable = !$('rec-c-null-sl');
    closeOv('ov-rec-det');
    return out;
  });
  ok(nl.hasClearAction, 'у nullable-поля есть явное действие «нет числового значения (очистить)»');
  ok(nl.blankIsNoop, 'пустой ввод по-прежнему означает «оставить как есть», а не null');
  ok(nl.effNull && nl.corrWritten, 'явная очистка даёт эффективное значение null');
  ok(nl.originalKept && nl.histShows, 'оригинал (42) сохранён и виден в истории');
  ok(nl.repeatNoop && nl.contradictionRejected, 'повторная очистка и противоречивый ввод не создают исправлений');
  ok(nl.noClearOnNonNullable, 'у не-nullable поля действия очистки нет');
}

// ── 21. МОСТ × CORRECTION_CONFLICT: две активные головы ──────────────
// Пробел, найденный аудитом: production был fail-closed, но ни один тест не
// проводил запись с конфликтом (или поломкой) цепочки ЧЕРЕЗ мост. Мутация,
// снимавшая только `!corrConflicted && !corrBroken`, выживала. Эти секции
// закрывают ровно этот пробел end-to-end: конфликт/поломка БЕЗ пересечения
// с corrFieldsTouched (у конфликтного поля _corrFields пуст — прежний
// сценарий с одной головой этот путь не сторожит).
{
  await reset();
  const seed = await page.evaluate(async (p) => {
    const c = extConnCreate('TEST-CORR мост-конфликт', 'manual_file');
    await extBridgeRefresh(c.rec.id, p);
    const a = extBridgeApply(c.rec.id);
    const rec = DB.moments[0];
    DB.corrections.push(
      { id: 'TEST-CORR-H1', kType: 'correction', coll: 'moments', targetId: rec.id, patch: { valence: 90 }, reason: 'устройство A', supersedesCorrectionId: null, origin: 'user', createdAt: '2026-04-02T10:00:00.000Z', day: '2026-04-02', sv: SCHEMA_VERSION, _u: 2 },
      { id: 'TEST-CORR-H2', kType: 'correction', coll: 'moments', targetId: rec.id, patch: { valence: 70 }, reason: 'устройство B', supersedesCorrectionId: null, origin: 'user', createdAt: '2026-04-03T10:00:00.000Z', day: '2026-04-03', sv: SCHEMA_VERSION, _u: 3 });
    persist();
    const eff = projOne('moments', rec.id);
    return { ok: a.ok, connId: c.rec.id, id: rec.id, eff: eff.valence, conflicts: eff._corrConflicts || [] };
  }, JSON.stringify(v1Pkg(31, 'исходная заметка источника')));
  ok(seed.ok && seed.eff === 40 && seed.conflicts.includes('valence'),
    'проекция при двух головах не выбирает «кто новее»: действует базовое значение', JSON.stringify(seed));

  // Подача из ДВУХ пакетов: обновление конфликтной записи + честная новая
  // запись. Атомарный контракт: блокируется ВСЁ, включая new.
  const r = await page.evaluate(async ({ connId, updPkg, newPkg }) => {
    const feed = JSON.stringify({ format: EXT_FEED_FORMAT,
      container: { kind: 'zip_archive', id: null, label: 'TEST-CORR контейнер' },
      packages: [JSON.parse(updPkg), JSON.parse(newPkg)] });
    const pr = await extBridgeRefresh(connId, feed);
    const it = pr.batches[0].plan.items[0];
    const before = {
      moments: JSON.stringify(DB.moments), corrections: JSON.stringify(DB.corrections),
      ledger: DB.externalWorkSessions.length,
      checkpoint: (extConnFind(connId).checkpoint.committedPackageHashes || []).length,
    };
    const ap = extBridgeApply(connId);
    const rec = DB.moments[0];
    const eff = projOne('moments', rec.id);
    return {
      totals: pr.totals, status: it.status,
      corrConflicted: !!(it.update && it.update.corrConflicted),
      corrFieldsTouched: it.update ? it.update.corrFieldsTouched.length : -1,
      applyOk: ap.ok, blocked: !!ap.blocked,
      rawSame: JSON.stringify(DB.moments) === before.moments,
      corrSame: JSON.stringify(DB.corrections) === before.corrections,
      ledgerSame: DB.externalWorkSessions.length === before.ledger,
      checkpointSame: (extConnFind(connId).checkpoint.committedPackageHashes || []).length === before.checkpoint,
      newNotCreated: DB.moments.length === 1,
      raw: rec.valence, eff: eff.valence,
      prov: { sourceId: rec.ext.sourceId, textOrigin: rec.ext.textOrigin },
    };
  }, { connId: seed.connId, updPkg: (() => { const p = JSON.parse(JSON.stringify(v1Pkg(32, 'исходная заметка источника'))); p.entities[0].data.valence = 15; return JSON.stringify(p); })(),
       newPkg: (() => { const p = JSON.parse(JSON.stringify(v1Pkg(33, 'вторая запись'))); p.entities[0].sourceId = 'TEST-CORR-SRC-ATOMIC'; p.entities[0].clientRef = 'atomic1'; p.session.clientRef = 'TEST-CORR-S-ATOMIC'; return JSON.stringify(p); })() });
  ok(r.status === 'changed-conflict' && r.corrConflicted && r.corrFieldsTouched === 0,
    'КОНФЛИКТ исправлений (две активные головы) сам по себе даёт changed-conflict на пути моста', JSON.stringify({ status: r.status, corrConflicted: r.corrConflicted, touched: r.corrFieldsTouched }));
  ok(!r.applyOk && r.blocked && r.newNotCreated,
    'мост при конфликте исправлений блокирует ВСЮ подачу атомарно (new из того же feed не применён)', JSON.stringify({ applyOk: r.applyOk, blocked: r.blocked, newNotCreated: r.newNotCreated }));
  ok(r.rawSame && r.corrSame && r.ledgerSame && r.checkpointSame,
    'блокировка конфликта: canonical, исправления, журнал и чекпойнт не изменились ни на запись', JSON.stringify(r));
  ok(r.raw === 40 && r.eff === 40, 'после блокировки действует базовое значение, головы не «разрешены» временем', JSON.stringify({ raw: r.raw, eff: r.eff }));
  ok(r.prov.sourceId === 'TEST-CORR-SRC-1' && r.prov.textOrigin === 'user_words',
    'provenance записи не повреждён блокированной подачей', JSON.stringify(r.prov));

  // Ручной путь: без явного выбора пакет отклоняется целиком.
  const manual = await page.evaluate(async (p) => {
    const before = JSON.stringify(DB);
    const plan = await extBuildPlan(p);
    const res = extCommitPlan(plan, null);
    return { ok: res.ok, unresolved: res.unresolvedConflicts, same: JSON.stringify(DB) === before };
  }, (() => { const p = JSON.parse(JSON.stringify(v1Pkg(34, 'исходная заметка источника'))); p.entities[0].data.valence = 15; return JSON.stringify(p); })());
  ok(!manual.ok && manual.unresolved === 1 && manual.same,
    'ручной extCommitPlan без явного выбора отклоняет пакет целиком (конфликт голов)', JSON.stringify(manual));
}

// ── 22. МОСТ × INVALID_CORRECTION_CHAIN: висячая ссылка ──────────────
{
  await reset();
  const r = await page.evaluate(async ({ seedPkg, updPkg }) => {
    const c = extConnCreate('TEST-CORR мост-поломка', 'manual_file');
    await extBridgeRefresh(c.rec.id, seedPkg);
    extBridgeApply(c.rec.id);
    const rec = DB.moments[0];
    DB.corrections.push({ id: 'TEST-CORR-DNG', kType: 'correction', coll: 'moments', targetId: rec.id, patch: { valence: 90 }, reason: 'висячая ссылка', supersedesCorrectionId: 'TEST-CORR-NOPE', origin: 'user', createdAt: '2026-04-02T10:00:00.000Z', day: '2026-04-02', sv: SCHEMA_VERSION, _u: 2 });
    persist();
    const pr = await extBridgeRefresh(c.rec.id, updPkg);
    const it = pr.batches[0].plan.items[0];
    const before = { moments: JSON.stringify(DB.moments), corrections: JSON.stringify(DB.corrections), ledger: DB.externalWorkSessions.length };
    const ap = extBridgeApply(c.rec.id);
    const eff = projOne('moments', rec.id);
    const manual = await (async () => {
      const plan = await extBuildPlan(updPkg);
      const res = extCommitPlan(plan, null);
      return { ok: res.ok, unresolved: res.unresolvedConflicts };
    })();
    return {
      status: it.status, corrBroken: !!(it.update && it.update.corrBroken),
      corrConflicted: !!(it.update && it.update.corrConflicted),
      applyOk: ap.ok, blocked: !!ap.blocked,
      rawSame: JSON.stringify(DB.moments) === before.moments,
      corrSame: JSON.stringify(DB.corrections) === before.corrections,
      ledgerSame: DB.externalWorkSessions.length === before.ledger,
      raw: DB.moments[0].valence, eff: eff.valence, invalid: eff._corrInvalid || [],
      prov: { sourceId: DB.moments[0].ext.sourceId }, manual,
    };
  }, { seedPkg: JSON.stringify(v1Pkg(35, 'исходная заметка источника')),
       updPkg: (() => { const p = JSON.parse(JSON.stringify(v1Pkg(36, 'исходная заметка источника'))); p.entities[0].data.valence = 15; return JSON.stringify(p); })() });
  ok(r.status === 'changed-conflict' && r.corrBroken && !r.corrConflicted,
    'ПОВРЕЖДЁННАЯ цепочка исправлений сама по себе даёт changed-conflict на пути моста', JSON.stringify({ status: r.status, corrBroken: r.corrBroken }));
  ok(!r.applyOk && r.blocked && r.rawSame && r.corrSame && r.ledgerSame,
    'блокировка повреждённой цепочки: raw не изменён, исправления не удалены, журнал не продвинут', JSON.stringify(r));
  ok(r.raw === 40 && r.eff === 40 && r.invalid.includes('valence') && r.prov.sourceId === 'TEST-CORR-SRC-1',
    'поле остаётся базовым и помеченным _corrInvalid, provenance цел', JSON.stringify({ raw: r.raw, eff: r.eff, invalid: r.invalid }));
  ok(!r.manual.ok && r.manual.unresolved === 1,
    'ручной extCommitPlan без явного выбора отклоняет пакет и при повреждённой цепочке', JSON.stringify(r.manual));
}

// ── 23. D-DATE-01: строгий календарь во всех write-path валидаторах ──
// Date.parse нормализует «2026-02-31» в 3 марта; ни один writer не имеет
// права сохранить (или молча подменить) несуществующий день.
{
  const d = await page.evaluate(() => {
    const daySpec = REC_CORR.moments.find(f => f.k === 'day');
    const isoSpec = REC_CORR.psyObservations.find(f => f.k === 'timestamp');
    const day = s => recCorrValidate(daySpec, s).ok;
    const iso = s => recCorrValidate(isoSpec, s);
    return {
      badDays: ['2026-02-31', '2026-02-30', '2025-02-29', '2026-04-31', '2026-06-31', '2026-09-31', '2026-11-31', '2026-13-01', '2026-00-10', '2026-01-00', '2026-01-32'].filter(day),
      goodDays: ['2024-02-29', '2026-02-28', '2026-04-30', '2026-12-31', '2000-02-29'].filter(s => !day(s)),
      century: day('1900-02-29'),                              // 1900 — не високосный
      isoBad: iso('2026-02-31T10:00:00Z'), isoBadLoose: iso('2026-2-31 10:00'),
      isoGood: iso('2026-02-28T10:00:00Z'), isoLocal: iso('2026-04-01T10:30'), isoOffset: iso('2026-04-01T10:30:00+03:00'),
      importDay: extIsIsoDay('2026-02-31'), importDayOk: extIsIsoDay('2024-02-29'),
      psyBad: psyIsIso('2026-02-31T10:00:00Z'), psyOk: psyIsIso(nowISO()),
    };
  });
  ok(d.badDays.length === 0,
    'несуществующий день (2026-02-31 и семья) отклонён строгим календарём', JSON.stringify(d.badDays));
  ok(d.goodDays.length === 0 && !d.century,
    'високосный год: 2024-02-29 и 2000-02-29 приняты, 1900-02-29 и 2025-02-29 отклонены', JSON.stringify({ good: d.goodDays, century: d.century }));
  ok(!d.isoBad.ok && !d.isoBadLoose.ok,
    'дата-время с несуществующим днём не нормализуется молча (2026-02-31T10:00 ≠ 3 марта)', JSON.stringify({ isoBad: d.isoBad, loose: d.isoBadLoose }));
  ok(d.isoGood.ok && d.isoLocal.ok && d.isoOffset.ok,
    'корректные ISO-варианты (Z, локальный, offset) принимаются как раньше', JSON.stringify({ g: d.isoGood.ok, l: d.isoLocal.ok, o: d.isoOffset.ok }));
  ok(d.importDay === false && d.importDayOk === true && d.psyBad === false && d.psyOk === true,
    'extIsIsoDay и psyIsIso держат ту же календарную семантику, что и коррекции', JSON.stringify({ importDay: d.importDay, psyBad: d.psyBad }));

  // Настоящий writer-путь: невозможная дата не доходит до DB.corrections.
  const wr = await page.evaluate(() => {
    DB.corrections = [];
    DB.moments = [{ id: 'TEST-CORR-DT', valence: 50, activation: 50, day: '2026-04-01', createdAt: '2026-04-01T10:00:00.000Z', sv: SCHEMA_VERSION, _u: 1 }];
    recOpen('moments', 'TEST-CORR-DT'); recCorrOpen();
    $('rec-c-day').value = '2026-02-31'; recCorrSave();
    const rejected = DB.corrections.length === 0;
    $('rec-c-day').value = '2024-02-29'; recCorrSave();
    const accepted = DB.corrections.length === 1 && projOne('moments', 'TEST-CORR-DT').day === '2024-02-29';
    closeOv('ov-rec-det');
    // ISO-writer: невозможный день не сохраняется и не подменяется.
    DB.labObservations = [{ id: 'TEST-CORR-LAB', testName: 'тест', valueText: '1', collectedAt: '2026-04-01T10:00:00.000Z', sv: SCHEMA_VERSION, _u: 1 }];
    recOpen('labObservations', 'TEST-CORR-LAB'); recCorrOpen();
    $('rec-c-collectedAt').value = '2026-02-31T10:00:00Z'; recCorrSave();
    const isoRejected = DB.corrections.length === 1 &&
      !JSON.stringify(DB.corrections).includes('2026-03-03');
    closeOv('ov-rec-det');
    return { rejected, accepted, isoRejected };
  });
  ok(wr.rejected && wr.accepted, 'writer коррекций: 2026-02-31 отклонён, 2024-02-29 сохранён', JSON.stringify(wr));
  ok(wr.isoRejected, 'writer коррекций: ISO с несуществующим днём не записан и не подменён на 3 марта', JSON.stringify(wr));

  // Импорт: те же дни невозможны и в пакете.
  const imp = await page.evaluate((base) => {
    const mk = (mut) => { const p = JSON.parse(base); mut(p); return extValidatePackage(JSON.stringify(p)); };
    const badSourceDate = mk(p => { p.entities[0].sourceDate = '2026-02-31'; });
    const badModified = mk(p => { p.entities[0].sourceVersion = { modifiedAt: '2026-02-31T10:00:00Z' }; });
    const goodModified = mk(p => { p.entities[0].sourceVersion = { modifiedAt: '2026-02-28T10:00:00Z' }; });
    const cmp = extCompareSourceVersions({ modifiedAt: '2026-02-31T10:00:00Z' }, { modifiedAt: '2026-03-01T00:00:00Z' });
    return { badSourceDate: badSourceDate.ok, badModified: badModified.ok, goodModified: goodModified.ok, cmp };
  }, JSON.stringify(v1Pkg(37, 'проверка дат')));
  ok(imp.badSourceDate === false && imp.badModified === false && imp.goodModified === true,
    'импорт держит ту же календарную семантику: sourceDate/modifiedAt с несуществующим днём отклонены', JSON.stringify(imp));
  ok(imp.cmp === 'unknown',
    'несуществующий modifiedAt не является доказательством порядка версий (unknown, fail closed)', JSON.stringify(imp.cmp));
}

// ── 24. Инспектор после обновления из источника: «база», не «оригинал» ─
// corrHistory берёт базовое значение из ЖИВОЙ записи; после override сырое
// поле уже переписано источником, и прежняя подпись «Оригинал» лгала.
{
  await reset();
  const r = await page.evaluate(async ({ seedPkg, updPkg }) => {
    const c = extConnCreate('TEST-CORR инспектор', 'manual_file');
    await extBridgeRefresh(c.rec.id, seedPkg);
    extBridgeApply(c.rec.id);
    const id = DB.moments[0].id;
    addCorrection('moments', id, { valence: 90 }, 'исправление владельца');
    const plan = await extBuildPlan(updPkg);
    const res = extCommitPlan(plan, { conflicts: { 0: 'override' } });
    recOpen('moments', id);
    const all = $('rec-det-body').textContent.replace(/\s+/g, ' ');
    closeOv('ov-rec-det');
    const eff = projOne('moments', id);
    return {
      overrideOk: res.ok, raw: DB.moments[0].valence, eff: eff.valence,
      firstHistoricalGone: DB.moments[0].valence !== 40,
      noOriginalClaim: !/Оригинал/.test(all),
      baseLabel: /Базовое значение текущей версии: 15/.test(all),
      techA: /A · Базовая запись текущей версии/.test(all),
      techC: /C · Эффективная запись/.test(all),
      chainVisible: /заменено версией источника/.test(all),
    };
  }, { seedPkg: JSON.stringify(v1Pkg(38, 'исходная заметка источника')),
       updPkg: (() => { const p = JSON.parse(JSON.stringify(v1Pkg(39, 'исходная заметка источника'))); p.entities[0].data.valence = 15; return JSON.stringify(p); })() });
  ok(r.overrideOk && r.raw === 15 && r.eff === 15 && r.firstHistoricalGone,
    'подготовка: после override базовое значение уже НЕ первое историческое', JSON.stringify(r));
  ok(r.noOriginalClaim && r.baseLabel,
    'после обновления из источника инспектор не называет базу «Оригиналом»', JSON.stringify({ no: r.noOriginalClaim, base: r.baseLabel }));
  ok(r.techA && r.techC && r.chainVisible,
    'инспектор: различие «базовая запись vs эффективная» сохранено, происхождение замены видно', JSON.stringify(r));
}

ok(errors.length === 0, `JS-ошибок нет за весь прогон (${errors.length})`, errors.slice(0, 3).join('\n'));

// ── Privacy canary ──────────────────────────────────────────────────
{
  const src = readFileSync(join(DIR, 'corrections.spec.mjs'), 'utf8');
  const bundle = readFileSync(join(ROOT, 'dist', 'app.html'), 'utf8');
  const marks = [['GDRI', 'VE:'], ['LIFE-2', '02'], ['DREAM-2', '02'], ['PARA-2', '02'], ['INT-2', '02']]
    .map(p => new RegExp(p.join('')));
  const inSpec = marks.filter(r => r.test(src)).length;
  const inBundle = marks.filter(r => r.test(bundle)).length;
  ok(inSpec === 0 && inBundle === 0,
    `privacy canary: приватных маркеров нет ни в тесте, ни в бандле (${inSpec}/${inBundle})`);
  ok(/TEST-CORR-/.test(src), 'все фикстуры несут синтетический префикс TEST-CORR-*');
}

await browser.close();
console.log(`\nИСПРАВЛЕНИЯ: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
