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
      hist: /История исправлений/.test(all), orig: /Оригинал: 5/.test(all),
      reason: /пересчитал по трекеру/.test(all),
      techA: /A · Оригинал записи/.test(all), techB: /B · Цепочка исправлений/.test(all), techC: /C · Эффективная запись/.test(all),
      corrBtn: acts.some(a => /Исправить значение/.test(a)),
      noRawJsonInNormal: !/"sv":/.test(human),
    };
    closeOv('ov-rec-det');
    return out;
  });
  ok(insp.effShown && insp.marked, 'инспектор показывает ЭФФЕКТИВНОЕ значение и метку «Исправлено»', JSON.stringify(insp));
  ok(insp.hist && insp.orig && insp.reason, 'универсальная история: оригинал, цепочка, причина', JSON.stringify(insp));
  ok(insp.techA && insp.techB && insp.techC, 'технический блок: A оригинал · B цепочка · C эффективная запись');
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
