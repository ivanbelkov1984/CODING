// ИНСПЕКТОР ЗАПИСИ («Мои записи» → тап по строке) + безопасная правка.
//
// Проблема с устройства владельца: «Мои записи» показывали только короткую
// строку-сводку и кнопку удаления. Полный текст импортированной записи было
// негде прочитать, а единственное доступное действие было разрушительным.
//
// Что здесь защищено:
//   1. Любая каноническая запись открывается и читается целиком.
//   2. Матрица редактируемости (решения владельца):
//      A — правка на месте; B — только доменным путём (версия/коррекция),
//      причина названа честно; C — системная/производная, правка недоступна.
//   3. ИНВАРИАНТ ИМПОРТА: пользовательская правка НЕ трогает sourceId,
//      sourceRefs, sourceVersion, claimClasses, textOrigin, ext.entityHash,
//      ext.importHash, ext.importedFields, revisions, localResolutions.
//      Следствие: replay той же версии источника сохраняет правку; более
//      новая ревизия источника даёт changed-conflict; keep-local/override —
//      единственный путь разрешения; тихой перезаписи работы владельца нет.
//   4. Правка в «Архитекторе» НЕ пишет обратно во внешний источник.
//   5. Синхронизация и резервная копия переносят правку и провенанс.
//   6. Удаление из инспектора = ровно то же удаление, что и из списка.
//
// ВСЕ фикстуры синтетические (TEST-RI-*). Реальные данные владельца в
// репозиторий не попадают ни в каком виде (privacy canary внизу).
//
// Гоняет РЕАЛЬНЫЙ собранный бандл (dist/app.html) в Chromium.

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import { encryptPayload, decryptEnvelope, serializeEnvelope } from '../backup/backup-core.mjs';
import { createBackupAdapter, KEYS } from '../backup/backup-adapter.mjs';
import { restoreBackup } from '../backup/backup-restore.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..');
const FILE = 'file://' + (process.env.RECINSPECTOR_BUNDLE || join(ROOT, 'dist', 'app.html'));
let pass = 0, fail = 0;
const errors = [];
const netHits = [];
const ok = (cond, msg, detail) => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); if (detail) console.log('      ' + String(detail).split('\n').join('\n      ')); }
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', e => errors.push(e.message));
await page.route('**/*', r => {
  const u = r.request().url();
  if (u.startsWith('file://')) return r.continue();
  netHits.push(u);
  return r.abort();
});
await page.goto(FILE);
await page.waitForSelector('#nsh-tabbar', { state: 'attached' });
await page.evaluate(() => {
  const s = document.getElementById('splash'); if (s) s.style.display = 'none';
  document.querySelectorAll('.ov.on').forEach(e => e.classList.remove('on'));
});

const COLLS = await page.evaluate(() => Object.keys(REC_COLLS));
const todayKeyRef = await page.evaluate(() => todayKey());
const SCHEMA_REF = await page.evaluate(() => SCHEMA_VERSION);
const reset = () => page.evaluate((cs) => {
  cs.forEach(c => { DB[c] = []; });
  DB._del = {};
  try { resolveRecovery('discarded'); } catch (_) { }
  if (typeof extBridgeCancel === 'function') extBridgeCancel();
  _extConnActive = null;
  persist();
}, COLLS);

// ── Синтетические пакеты внешнего моста ──────────────────────────────
const v1Pkg = (n, body) => ({
  format: 'architect-external-work-v1',
  source: { kind: 'google_drive', label: 'TEST-RI источник', module: 'TEST-RI-MODULE' },
  session: { clientRef: 'TEST-RI-SESSION-' + n, summary: 'синтетическая сессия ' + n, date: '2026-04-0' + ((n % 9) + 1) },
  entities: [
    { clientRef: 'i' + n, type: 'insight', sourceId: 'TEST-RI-SRC-INS-1',
      claimClass: 'user_experience', textOrigin: 'user_words', sourceVersion: { sequence: n },
      data: { title: 'TEST-RI инсайт', body, tag: 'personal' } },
  ],
  links: [],
});
const V2_BASE = {
  format: 'architect-external-work-v2',
  source: { kind: 'chatgpt', label: 'TEST-RI психосессия', module: 'TEST-RI-PSY', chatId: 'TEST-RI-CHAT-1' },
  session: { clientRef: 'TEST-RI-PSY-SESSION-1', summary: 'синтетическое резюме сессии', date: '2026-04-01' },
  links: [],
};
const connCreate = (label, kind) => page.evaluate(({ l, k }) => {
  const r = extConnCreate(l, k);
  return { ok: r.ok, id: r.rec && r.rec.id, errors: r.errors };
}, { l: label || 'TEST-RI источник', k: kind || 'manual_file' });
const refresh = (id, obj) => page.evaluate(async ({ i, t }) => JSON.parse(JSON.stringify(await extBridgeRefresh(i, t))), { i: id, t: JSON.stringify(obj) });
const apply = (id) => page.evaluate((i) => JSON.parse(JSON.stringify(extBridgeApply(i))), id);
const commit = (obj, sel) => page.evaluate(async ({ t, s }) => {
  const p = await extBuildPlan(t);
  return JSON.parse(JSON.stringify({ ok: p.ok, errors: p.errors, res: extCommitPlan(p, s || null) }));
}, { t: JSON.stringify(obj), s: sel || null });

// Открыть запись ровно тем путём, которым её открывает человек, и снять экран.
// `text` — ТОЛЬКО человеческие поля: технический JSON-дамп исключён, иначе
// «полный текст виден» проходил бы за счёт сырого дампа, а не за счёт
// нормальной отрисовки (эту дыру нашла мутация body-truncated-to-summary).
const openRec = (coll, id) => page.evaluate(({ c, i }) => {
  try { recOpen(c, i); } catch (e) { return { crashed: e.message }; }
  const body = $('rec-det-body'), act = $('rec-det-actions'), ttl = $('rec-det-title');
  const human = body ? [...body.children].filter(el => !el.matches('details.psy-det'))
    .map(el => el.textContent).join(' ') : '';
  return {
    crashed: null,
    title: (ttl && ttl.textContent) || '',
    text: human.replace(/\s+/g, ' ').trim(),
    raw: (body && body.textContent || '').replace(/\s+/g, ' ').trim(),
    actions: [...(act ? act.querySelectorAll('button') : [])].map(b => b.textContent.trim()),
    open: !!(document.getElementById('ov-rec-det') || {}).classList &&
      document.getElementById('ov-rec-det').classList.contains('on'),
  };
}, { c: coll, i: id });
const closeRec = () => page.evaluate(() => { try { closeOv('ov-rec-det'); } catch (_) { } });

console.log('\nИНСПЕКТОР ЗАПИСИ · ЧТЕНИЕ И БЕЗОПАСНАЯ ПРАВКА\n');

// ── 1. Каждая коллекция открывается, ни одна не падает ───────────────
{
  await reset();
  const res = await page.evaluate((cs) => cs.map(coll => {
    DB[coll] = [{ id: 'TEST-RI-MIN-' + coll, sv: SCHEMA_VERSION, _u: Date.now() }];
    try {
      recOpen(coll, 'TEST-RI-MIN-' + coll);
      const b = $('rec-det-body'), t = $('rec-det-title');
      const r = { coll, ok: true, cls: recEditCls(coll).cls,
        title: (t && t.textContent) || '', body: ((b && b.textContent) || '').trim().length };
      closeOv('ov-rec-det');
      return r;
    } catch (e) { return { coll, ok: false, err: e.message }; }
  }), COLLS);
  const broken = res.filter(r => !r.ok);
  ok(broken.length === 0, `все ${COLLS.length} коллекций открываются в инспекторе без исключения`,
    broken.map(b => `${b.coll}: ${b.err}`).join('\n'));
  const noTitle = res.filter(r => r.ok && (!r.title || r.title === r.coll));
  ok(noTitle.length === 0, 'у каждой коллекции человеческое название в заголовке',
    noTitle.map(r => r.coll).join(', '));
  const empty = res.filter(r => r.ok && !r.body);
  ok(empty.length === 0, 'экран записи никогда не пустой (даже у почти пустой записи)',
    empty.map(r => r.coll).join(', '));
  // Матрица покрывает ВСЕ коллекции явно — молчаливого фолбэка быть не должно.
  const undeclared = await page.evaluate((cs) => cs.filter(c => !REC_EDIT[c]), COLLS);
  ok(undeclared.length === 0, 'матрица редактируемости объявлена для каждой коллекции явно',
    undeclared.join(', '));
}

// ── 2. Импортированная запись читается ЦЕЛИКОМ (v1 + v2) ─────────────
{
  await reset();
  const long = 'Синтетический длинный текст записи, который в списке был бы обрезан до сводки, ' +
    'а в инспекторе обязан быть виден целиком до последнего слова — ХВОСТ-TEST-RI-1.';
  const full = await commit({
    ...V2_BASE,
    entities: [
      { clientRef: 'd1', type: 'dream', sourceId: 'TEST-RI-DREAM-1', claimClass: 'user_experience', textOrigin: 'user_words',
        data: { body: long, arch: 'синтетическая трактовка TEST-RI-ARCH', tone: 'тревожный' } },
      { clientRef: 's1', type: 'spiritual', sourceId: 'TEST-RI-SPI-1', claimClass: 'user_experience', textOrigin: 'user_words',
        data: { type: 'практика', text: long } },
      { clientRef: 'e1', type: 'evolution', sourceId: 'TEST-RI-EVO-1', claimClass: 'user_experience', textOrigin: 'user_words',
        data: { text: long, lv: 'смысловой этап источника' } },
      { clientRef: 'i1', type: 'insight', sourceId: 'TEST-RI-INS-1', claimClass: 'user_experience', textOrigin: 'user_words',
        data: { title: 'TEST-RI заголовок', body: long, tag: 'personal' } },
      { clientRef: 'f1', type: 'psyFormulation', sourceId: 'TEST-RI-FORM-1', sourceDate: '2026-04-01',
        claimClass: 'assistant_summary', claimClasses: ['assistant_summary', 'working_hypothesis'], textOrigin: 'structured_summary',
        data: { focus: 'Синтетический фокус', formulation: long, status: 'active',
          hypotheses: [{ text: 'синтетическая гипотеза TEST-RI-HYP', claimClass: 'working_hypothesis' }] } },
      { clientRef: 'g1', type: 'psyGoal', sourceId: 'TEST-RI-GOAL-1', claimClass: 'user_experience', textOrigin: 'user_words',
        data: { label: 'Синтетическая цель', proximalOutcome: long } },
      { clientRef: 'x1', type: 'psyInterventionEpisode', sourceId: 'TEST-RI-INT-1', sourceDate: '2026-04-02',
        claimClass: 'practice_action', claimClasses: ['practice_action', 'user_experience'], textOrigin: 'user_words',
        data: { methodId: 'behavioral_activation', interventionSummary: long,
          adherence: 'done', acceptability: 'helpful', outcomeClass: 'helpful_in_context',
          adverseEffects: ['синтетический нежелательный эффект TEST-RI-AE'] } },
      { clientRef: 'o1', type: 'psyObservation', sourceId: 'TEST-RI-OBS-1', claimClass: 'user_experience', textOrigin: 'user_words',
        data: { metricId: 'TEST-RI-METRIC', valueNumber: 4, unit: 'балл', entryMode: 'imported', source: 'user',
          valueText: long } },
      { clientRef: 'r1', type: 'psyReview', sourceId: 'TEST-RI-REV-1', claimClass: 'assistant_summary', textOrigin: 'structured_summary',
        data: { periodStart: '2026-04-01T00:00:00.000Z', periodEnd: '2026-04-07T00:00:00.000Z',
          outcomeSummary: long, decision: 'continue',
          limitations: ['синтетическое ограничение TEST-RI-LIM'] } },
    ],
  });
  const createdN = Array.isArray(full.res.created) ? full.res.created.length : full.res.created;
  ok(full.res.ok && createdN === 9, `импортировано 9 записей девяти типов (${createdN})`,
    (full.errors || []).concat(full.res.error || []).join('; '));

  const checks = [
    ['dreams', 'ХВОСТ-TEST-RI-1'], ['dreams', 'TEST-RI-ARCH'],
    ['spiritual', 'ХВОСТ-TEST-RI-1'],
    ['evolution', 'смысловой этап источника'], ['evolution', 'ХВОСТ-TEST-RI-1'],
    ['insights', 'ХВОСТ-TEST-RI-1'],
    ['psyFormulations', 'ХВОСТ-TEST-RI-1'], ['psyFormulations', 'TEST-RI-HYP'],
    ['psyGoals', 'ХВОСТ-TEST-RI-1'],
    ['psyInterventionEpisodes', 'ХВОСТ-TEST-RI-1'], ['psyInterventionEpisodes', 'TEST-RI-AE'],
    ['psyObservations', 'ХВОСТ-TEST-RI-1'],
    ['psyReviews', 'ХВОСТ-TEST-RI-1'], ['psyReviews', 'TEST-RI-LIM'],
  ];
  const seen = [];
  for (const [coll, needle] of checks) {
    const id = await page.evaluate(c => DB[c][0].id, coll);
    const v = await openRec(coll, id);
    await closeRec();
    seen.push({ coll, needle, hit: !v.crashed && v.text.includes(needle), text: v.text });
  }
  const missed = seen.filter(s => !s.hit);
  ok(missed.length === 0, 'полный текст импортированных записей всех девяти типов виден в инспекторе',
    missed.map(m => `${m.coll}: нет «${m.needle}» в «${(m.text || '').slice(0, 100)}…»`).join('\n'));

  // Провенанс показан человеку, а не спрятан.
  const prov = await openRec('psyFormulations', await page.evaluate(() => DB.psyFormulations[0].id));
  await closeRec();
  ok(/Импортировано из внешнего источника/.test(prov.text) && /TEST-RI психосессия/.test(prov.text),
    'у импортированной записи видно происхождение и подпись источника', prov.text.slice(0, 200));
  ok(/working_hypothesis/.test(prov.text),
    'класс утверждения назван — гипотеза не выглядит фактом', prov.text.slice(0, 200));
  // Массив-поле не превращается в «[object Object]».
  ok(!/object Object/.test(prov.text), 'структурные поля отрисованы человеку, а не как [object Object]');
}

// ── 3. Класс C: системная запись — правки нет, причина названа ───────
{
  const cColls = await page.evaluate((cs) => cs.filter(c => REC_EDIT[c] && REC_EDIT[c].cls === 'C'), COLLS);
  ok(cColls.length >= 5, `системных коллекций класса C объявлено ${cColls.length}`);
  const bad = [];
  for (const coll of cColls) {
    const id = await page.evaluate(c => {
      if (!(DB[c] || []).length) DB[c] = [{ id: 'TEST-RI-C-' + c, sv: SCHEMA_VERSION, _u: Date.now() }];
      return DB[c][0].id;
    }, coll);
    const v = await openRec(coll, id);
    await closeRec();
    const hasEdit = v.actions.some(a => /Редактировать/.test(a));
    const hasDel = v.actions.some(a => /Удалить/.test(a));
    const hasWhy = /Системная запись — редактирование недоступно/.test(v.text);
    if (hasEdit || hasDel || !hasWhy) bad.push(`${coll}: edit=${hasEdit} del=${hasDel} why=${hasWhy}`);
  }
  ok(bad.length === 0, 'класс C: нет ни правки, ни удаления, причина показана человеку', bad.join('\n'));

  // Прямой вызов писателя тоже закрыт — не только кнопка.
  const forced = await page.evaluate(() => {
    const rec = DB.externalWorkSessions[0] || (DB.externalWorkSessions = [{ id: 'TEST-RI-C-FORCE', sv: SCHEMA_VERSION }])[0];
    const before = JSON.stringify(rec);
    const r = recApplyLocalEdit(rec, 'externalWorkSessions', { summary: 'подмена журнала' });
    return { ok: r.ok, error: r.error, unchanged: before === JSON.stringify(rec) };
  });
  ok(!forced.ok && forced.unchanged, 'прямой вызов правки для класса C отклонён, запись не изменена', forced.error);

  // И на разрешённой коллекции писатель обязан игнорировать неразрешённые
  // поля: список полей — это граница, а не подсказка для формы.
  const narrow = await page.evaluate(() => {
    const rec = { id: 'TEST-RI-NARROW-1', tag: 'personal', w: 1, title: 'заголовок',
      body: 'текст', date: '01.04.2026', createdAt: nowISO(), day: todayKey(),
      sv: SCHEMA_VERSION, src: 'вручную', links: [], media: [], _u: 1 };
    const r = recApplyLocalEdit(rec, 'insights', {
      title: 'новый заголовок',      // разрешено
      day: '2020-01-01',             // НЕ разрешено: день записи
      createdAt: '2020-01-01T00:00:00.000Z', // НЕ разрешено: время создания
      src: 'подменённый источник',   // НЕ разрешено: происхождение
      w: 99,                         // НЕ разрешено: вес
      sv: 1,                         // НЕ разрешено: версия схемы
      newField: 'выдуманное поле',   // НЕ разрешено: поля нет в контракте
    });
    return { ok: r.ok, title: rec.title, day: rec.day, createdAt: rec.createdAt,
      src: rec.src, w: rec.w, sv: rec.sv, newField: rec.newField };
  });
  ok(narrow.ok && narrow.title === 'новый заголовок',
    'разрешённое поле правится');
  ok(narrow.day === todayKeyRef && narrow.src === 'вручную' && narrow.w === 1 &&
    narrow.sv === SCHEMA_REF && !/^2020/.test(narrow.createdAt) && narrow.newField === undefined,
    'поля вне списка разрешённых НЕ записаны: день, время создания, источник, вес, версия схемы, выдуманное поле',
    JSON.stringify(narrow));
}

// ── 4. Класс B: каждый тип объясняет своё состояние честно ───────────
{
  const bColls = await page.evaluate((cs) => cs.filter(c => REC_EDIT[c] && REC_EDIT[c].cls === 'B'), COLLS);
  ok(bColls.length >= 15, `коллекций класса B объявлено ${bColls.length}`);
  const bad = [];
  for (const coll of bColls) {
    const id = await page.evaluate(c => {
      if (!(DB[c] || []).length) DB[c] = [{ id: 'TEST-RI-B-' + c, sv: SCHEMA_VERSION, _u: Date.now() }];
      return DB[c][0].id;
    }, coll);
    const v = await openRec(coll, id);
    await closeRec();
    // Каждая B-запись обязана сказать ОДНО из двух: правки нет вовсе, либо
    // правится не всё. Молчаливого «серого» состояния быть не должно.
    if (!/Правка на месте недоступна|Правится не всё/.test(v.text)) bad.push(`${coll}: состояние правки не объяснено`);
  }
  ok(bad.length === 0, 'класс B: правка на месте закрыта и объяснена на каждом типе', bad.join('\n'));

  // Ключевые доменные решения владельца названы своими словами.
  const rev = await openRec('psyReviews', await page.evaluate(() => DB.psyReviews[0].id));
  await closeRec();
  ok(/нов(ый|ая) review/i.test(rev.text) && /не переписыва/.test(rev.text),
    'psyReview: сказано, что исправление — это новый review, а не переписывание истории', rev.text.slice(0, 300));
  const int = await openRec('psyInterventionEpisodes', await page.evaluate(() => DB.psyInterventionEpisodes[0].id));
  await closeRec();
  ok(/невыполненная техника не может быть объявлена бесполезной/.test(int.text) &&
     !int.actions.some(a => /Редактировать/.test(a)),
    'psyInterventionEpisode: сырой правки доказательных полей нет, not_done ≠ not_helpful названо', int.text.slice(0, 300));
  const obs = await openRec('psyObservations', await page.evaluate(() => DB.psyObservations[0].id));
  await closeRec();
  ok(/коррекц/.test(obs.text) && !obs.actions.some(a => /Редактировать/.test(a)),
    'измерение: назван путь коррекции, а не переписывание значения', obs.text.slice(0, 300));
  // contextTag наблюдения — метка условия эксперимента (по ней N-of-1 сравнивает
  // фазы), поэтому «контекст» здесь НЕ простое поле-заметка.
  ok(/метка условия эксперимента/.test(obs.text),
    'psyObservation: сказано, почему «контекст» — доказательное поле, а не заметка', obs.text.slice(0, 400));
  const cf = await page.evaluate(() => (REC_EDIT.psyObservations.fields || []).length);
  ok(cf === 0, 'psyObservation: contextTag НЕ в списке правки на месте');

  // Статусные типы: произвольной правки статуса не существует.
  const lifecycle = await page.evaluate(() => ['psyGoals', 'psyAdaptivePlans', 'psyExperiments']
    .map(c => ({ c, fields: (REC_EDIT[c].fields || []).length })));
  ok(lifecycle.every(x => x.fields === 0),
    'psyGoals/psyAdaptivePlans/psyExperiments: сырой правки статуса нет', JSON.stringify(lifecycle));
}

// ── 4b. B2 (psyReviews): правятся только тексты-сводки ───────────────
{
  await reset();
  const built = await page.evaluate(() => {
    const g = psySaveRecord('psyGoal', { label: 'TEST-RI цель', proximalOutcome: 'наблюдаемый результат' });
    const r = psySaveRecord('psyReview', {
      periodStart: '2026-04-01T00:00:00.000Z', periodEnd: '2026-04-07T00:00:00.000Z',
      goalRefs: [g.rec.id], decision: 'continue',
      outcomeSummary: 'исходная сводка итога', methodsAppliedSummary: 'исходные методы',
      limitations: ['исходное ограничение'], hypothesesStrengthened: ['гипотеза A'],
    });
    return { ok: r.ok, id: r.rec && r.rec.id, errors: r.errors };
  });
  ok(built.ok, 'синтетический review создан через production write contract', (built.errors || []).join('; '));

  const v = await openRec('psyReviews', built.id);
  ok(v.actions.some(a => /Редактировать/.test(a)), 'B2: у review есть кнопка правки текстов-сводок');
  ok(/Правится не всё/.test(v.text), 'B2: сказано, что правится не всё');

  const res = await page.evaluate((id) => {
    recOpen('psyReviews', id);
    _recDet.editing = true; recRenderDetail();
    const shown = [...document.querySelectorAll('#rec-det-body input, #rec-det-body textarea')].map(e => e.id.replace('rec-f-', ''));
    const note = ($('rec-det-body').textContent || '');
    $('rec-f-outcomeSummary').value = 'исправленная сводка итога TEST-RI';
    recSaveEdit();
    const r = DB.psyReviews.find(x => x.id === id);
    closeOv('ov-rec-det');
    return { shown, note, outcome: r.outcomeSummary, start: r.periodStart, end: r.periodEnd,
      decision: r.decision, goalRefs: r.goalRefs, hyp: r.hypothesesStrengthened, lim: r.limitations };
  }, built.id);
  ok(res.shown.every(k => /Summary$/.test(k)) && res.shown.includes('outcomeSummary'),
    `B2: в форме только тексты-сводки (${res.shown.join(', ')})`);
  ok(/Период, решение, ссылки на доказательства/.test(res.note),
    'B2: человеку сказано, что именно останется неизменным', res.note.slice(0, 160));
  ok(res.outcome === 'исправленная сводка итога TEST-RI', 'B2: сводка исправлена');
  ok(res.start === '2026-04-01T00:00:00.000Z' && res.end === '2026-04-07T00:00:00.000Z' &&
    res.decision === 'continue' && res.goalRefs.length === 1 &&
    JSON.stringify(res.hyp) === JSON.stringify(['гипотеза A']),
    'B2: период, решение, ссылки на доказательства и выводы по гипотезам не тронуты', JSON.stringify(res));

  // Прямой вызов писателя с запрещёнными полями — тоже отклоняется по полям.
  const forced = await page.evaluate((id) => {
    const r = DB.psyReviews.find(x => x.id === id);
    recApplyLocalEdit(r, 'psyReviews', {
      periodEnd: '2027-01-01T00:00:00.000Z', decision: 'stop',
      goalRefs: [], hypothesesStrengthened: ['подменённая гипотеза'],
      outcomeSummary: 'ещё одна правка сводки',
    });
    return { end: r.periodEnd, decision: r.decision, goals: r.goalRefs.length, hyp: r.hypothesesStrengthened, out: r.outcomeSummary };
  }, built.id);
  ok(forced.end === '2026-04-07T00:00:00.000Z' && forced.decision === 'continue' &&
    forced.goals === 1 && JSON.stringify(forced.hyp) === JSON.stringify(['гипотеза A']) &&
    forced.out === 'ещё одна правка сводки',
    'B2: прямой вызов не переписал период, решение, доказательства и гипотезы', JSON.stringify(forced));
}

// ── 4c. B1 (psyFormulations): черновик правится, принятая — нет ──────
{
  const ids = await page.evaluate(() => {
    const d = psySaveRecord('psyFormulation', { focus: 'TEST-RI черновик', formulation: 'исходный текст черновика', status: 'draft' });
    const a = psySaveRecord('psyFormulation', { focus: 'TEST-RI принятая', formulation: 'исходный текст принятой', status: 'active' });
    return { draft: d.rec && d.rec.id, active: a.rec && a.rec.id, ok: d.ok && a.ok };
  });
  ok(ids.ok, 'созданы черновик и принятая формулировка через production write contract');

  const vd = await openRec('psyFormulations', ids.draft);
  ok(vd.actions.some(a => /Редактировать/.test(a)), 'B1: черновик правится на месте');
  const edited = await page.evaluate((id) => {
    recOpen('psyFormulations', id);
    _recDet.editing = true; recRenderDetail();
    const note = ($('rec-det-body').textContent || '');
    $('rec-f-formulation').value = 'исправленный текст черновика TEST-RI';
    recSaveEdit();
    const r = DB.psyFormulations.find(x => x.id === id);
    closeOv('ov-rec-det');
    return { note, text: r.formulation, status: r.status };
  }, ids.draft);
  ok(edited.text === 'исправленный текст черновика TEST-RI' && edited.status === 'draft',
    'B1: черновик исправлен на месте, статус не изменился');
  ok(/После принятия правка закроется/.test(edited.note),
    'B1: человеку заранее сказано, что после принятия правка закроется', edited.note.slice(0, 160));

  const va = await openRec('psyFormulations', ids.active);
  await closeRec();
  ok(!va.actions.some(a => /Редактировать/.test(a)), 'B1: принятая формулировка на месте НЕ правится');
  ok(/уже принята/.test(va.text) && /НОВОЙ версией/.test(va.text),
    'B1: назван путь — новая версия со ссылкой на прежнюю', va.text.slice(0, 300));

  const forced = await page.evaluate((id) => {
    const r = DB.psyFormulations.find(x => x.id === id);
    const before = r.formulation;
    const res = recApplyLocalEdit(r, 'psyFormulations', { formulation: 'подмена принятой версии' });
    return { ok: res.ok, error: res.error, unchanged: r.formulation === before };
  }, ids.active);
  ok(!forced.ok && forced.unchanged,
    'B1: прямой вызов на принятой версии отклонён, текст не изменён', forced.error);

  // Правка обязана пройти ту же доменную проверку, что создание и импорт.
  const invalid = await page.evaluate((id) => {
    const r = DB.psyFormulations.find(x => x.id === id);
    const before = r.formulation;
    const res = recApplyLocalEdit(r, 'psyFormulations', { formulation: '   ' });
    return { ok: res.ok, error: res.error, unchanged: r.formulation === before };
  }, ids.draft);
  ok(!invalid.ok && invalid.unchanged && /формулировк/i.test(invalid.error || ''),
    'B1: пустая формулировка отклонена доменной проверкой — запись не изменена', invalid.error);
}

// ── 4d. B3 (измерения): правится только заметка ──────────────────────
{
  const cases = [
    ['moments', { id: 'TEST-RI-B3-MO', valence: 40, activation: 60, emo: 'тревога', note: 'исходная заметка', day: '2026-04-01', createdAt: '2026-04-01T10:00:00.000Z' }, ['valence', 'activation', 'emo', 'day']],
    ['checkins', { id: 'TEST-RI-B3-CI', sl: 7, sq: 6, cl: 5, st: 4, mv: 3, note: 'исходная заметка', date: '2026-04-01' }, ['sl', 'sq', 'cl', 'st', 'mv', 'date']],
    ['symptoms', { id: 'TEST-RI-B3-SY', name: 'симптом', severity: 6, note: 'исходная заметка', day: '2026-04-01' }, ['name', 'severity', 'day']],
    ['labObservations', { id: 'TEST-RI-B3-LB', testName: 'анализ', valueText: '5.4', unit: 'ммоль/л', collectedAt: '2026-04-01T08:00:00.000Z', note: 'исходная заметка' }, ['testName', 'valueText', 'unit', 'collectedAt']],
    ['sphereLogs', { id: 'TEST-RI-B3-SL', sphereId: 1, date: '2026-04-01', value: 7, note: 'исходная заметка' }, ['sphereId', 'date', 'value']],
  ];
  const bad = [];
  for (const [coll, rec, frozen] of cases) {
    const r = await page.evaluate(({ c, base, fr }) => {
      DB[c] = [{ ...base, sv: SCHEMA_VERSION, _u: 1 }];
      persist();
      recOpen(c, base.id);
      const hasBtn = [...$('rec-det-actions').querySelectorAll('button')].some(b => /Редактировать/.test(b.textContent));
      _recDet.editing = true; recRenderDetail();
      const shown = [...document.querySelectorAll('#rec-det-body input, #rec-det-body textarea')].map(e => e.id.replace('rec-f-', ''));
      $('rec-f-note').value = 'исправленная заметка TEST-RI';
      recSaveEdit();
      // И прямой вызов с доказательными полями — тоже мимо.
      const rr = DB[c][0];
      recApplyLocalEdit(rr, c, fr.reduce((a, k) => (a[k] = 'ПОДМЕНА', a), { note: 'вторая заметка' }));
      closeOv('ov-rec-det');
      return { hasBtn, shown, note: rr.note, frozen: fr.map(k => [k, rr[k]]) };
    }, { c: coll, base: rec, fr: frozen });
    if (!r.hasBtn) bad.push(`${coll}: нет кнопки правки заметки`);
    if (r.shown.join(',') !== 'note') bad.push(`${coll}: в форме не только заметка (${r.shown.join(',')})`);
    if (r.note !== 'вторая заметка') bad.push(`${coll}: заметка не исправлена (${r.note})`);
    const drifted = r.frozen.filter(([, v]) => v === 'ПОДМЕНА');
    if (drifted.length) bad.push(`${coll}: доказательные поля переписаны: ${drifted.map(([k]) => k).join(',')}`);
  }
  ok(bad.length === 0,
    'B3: у измерений правится только заметка; значения, даты и статусы не переписываются даже прямым вызовом',
    bad.join('\n'));

  // Там, где отделимой заметки нет, правки на месте нет вовсе — и это сказано.
  const noNote = ['measures', 'medIntakes', 'cravings'];
  const nn = [];
  for (const coll of noNote) {
    const v = await page.evaluate((c) => {
      DB[c] = [{ id: 'TEST-RI-B3-NN-' + c, sv: SCHEMA_VERSION, _u: 1 }];
      recOpen(c, 'TEST-RI-B3-NN-' + c);
      const acts = [...$('rec-det-actions').querySelectorAll('button')].map(b => b.textContent.trim());
      const text = ($('rec-det-body').textContent || '');
      closeOv('ov-rec-det');
      return { acts, text };
    }, coll);
    if (v.acts.some(a => /Редактировать/.test(a))) nn.push(`${coll}: появилась кнопка правки`);
    if (!/Правка на месте недоступна/.test(v.text)) nn.push(`${coll}: причина не показана`);
  }
  ok(nn.length === 0,
    'B3 без отделимой заметки (measures/medIntakes/cravings): правки на месте нет, причина названа', nn.join('\n'));
}

// ── 5. Класс A: локальная запись правится и переживает перезагрузку ──
{
  await reset();
  const id = await page.evaluate(() => {
    DB.insights.push({ id: 'TEST-RI-LOCAL-1', tag: 'personal', w: 1, title: 'старый заголовок',
      body: 'старый текст', date: '01.04.2026', createdAt: nowISO(), day: todayKey(),
      sv: SCHEMA_VERSION, src: 'вручную', links: [], media: [], _u: 1 });
    persist();
    return 'TEST-RI-LOCAL-1';
  });
  const v = await openRec('insights', id);
  ok(v.actions.some(a => /Редактировать/.test(a)), 'у локальной записи класса A есть кнопка «Редактировать»');

  const edited = await page.evaluate(() => {
    _recDet.editing = true; recRenderDetail();
    const inputs = [...document.querySelectorAll('#rec-det-body input, #rec-det-body textarea')].map(e => e.id);
    $('rec-f-title').value = 'новый заголовок TEST-RI';
    $('rec-f-body').value = 'новый текст TEST-RI, написанный владельцем';
    const before = { u: DB.insights[0]._u, keys: Object.keys(DB.insights[0]).sort().join(',') };
    recSaveEdit();
    const r = DB.insights[0];
    return { inputs, before, title: r.title, body: r.body, u: r._u,
      keys: Object.keys(r).sort().join(','), editing: _recDet.editing };
  });
  ok(edited.inputs.includes('rec-f-title') && edited.inputs.includes('rec-f-body'),
    `форма правки показывает только разрешённые поля (${edited.inputs.join(', ')})`);
  ok(edited.title === 'новый заголовок TEST-RI' && edited.body.includes('написанный владельцем'),
    'правка применена к записи');
  ok(edited.keys === edited.before.keys,
    'правка не создала в записи ни одного нового поля', `${edited.before.keys}\n→\n${edited.keys}`);
  ok(edited.u > edited.before.u, 'метка изменения `_u` обновлена — правка переживёт merge/sync');
  ok(edited.editing === false, 'после сохранения экран возвращается в режим чтения');

  // Перезагрузка страницы: правка читается из хранилища, а не из памяти.
  await page.reload();
  await page.waitForSelector('#nsh-tabbar', { state: 'attached' });
  await page.evaluate(() => { const s = document.getElementById('splash'); if (s) s.style.display = 'none'; document.querySelectorAll('.ov.on').forEach(e => e.classList.remove('on')); });
  const after = await page.evaluate(() => {
    const r = (DB.insights || []).find(x => x.id === 'TEST-RI-LOCAL-1');
    return r ? { title: r.title, body: r.body } : null;
  });
  ok(after && after.title === 'новый заголовок TEST-RI' && after.body.includes('написанный владельцем'),
    'правка пережила перезагрузку приложения (записана в хранилище)', JSON.stringify(after));

  // Отказ хранилища = запись не изменена (откат к снимку).
  const rollback = await page.evaluate(() => {
    recOpen('insights', 'TEST-RI-LOCAL-1');
    _recDet.editing = true; recRenderDetail();
    $('rec-f-title').value = 'правка, которая не должна сохраниться';
    const orig = persist; persist = () => false;
    recSaveEdit();
    persist = orig;
    const r = (DB.insights || []).find(x => x.id === 'TEST-RI-LOCAL-1');
    closeOv('ov-rec-det');
    return { title: r.title };
  });
  ok(rollback.title === 'новый заголовок TEST-RI',
    'сбой сохранения откатывает правку — запись остаётся прежней', rollback.title);
}

// ── 6. ИНВАРИАНТ ИМПОРТА: правка не трогает провенанс ────────────────
// Снимок ext сразу после правки — эталон для сценариев 9 и 10.
let importSnap;
{
  await reset();
  const c = await connCreate();
  await refresh(c.id, v1Pkg(1, 'исходный текст источника TEST-RI'));
  await apply(c.id);
  const before = await page.evaluate(() => {
    const r = DB.insights[0];
    return { id: r.id, ext: JSON.parse(JSON.stringify(r.ext)), body: r.body };
  });
  ok(!!before.ext && !!before.ext.importHash, 'импортированная запись несёт снимок версии источника');

  const res = await page.evaluate((id) => {
    recOpen('insights', id);
    _recDet.editing = true; recRenderDetail();
    $('rec-f-body').value = 'локально отредактированный текст TEST-RI';
    const noticed = ($('rec-det-body').textContent || '').includes('Происхождение записи сохраняется без изменений');
    recSaveEdit();
    closeOv('ov-rec-det');
    const r = DB.insights[0];
    return { noticed, body: r.body, ext: JSON.parse(JSON.stringify(r.ext)) };
  }, before.id);
  ok(res.noticed, 'при правке импортированной записи человеку обещано сохранение происхождения');
  ok(res.body === 'локально отредактированный текст TEST-RI', 'правка применена к import-owned полю');

  const FROZEN = ['sourceId', 'sourceRefs', 'sourceVersion', 'claimClass', 'claimClasses', 'textOrigin',
    'entityHash', 'importHash', 'importedFields', 'revisions', 'localResolutions',
    'normalizerVersion', 'format', 'sourceLabel', 'importedAt'];
  const drift = FROZEN.filter(k => JSON.stringify(before.ext[k]) !== JSON.stringify(res.ext[k]));
  ok(drift.length === 0, `правка не изменила ни одно поле провенанса (${FROZEN.length} проверено)`,
    drift.map(k => `${k}: ${JSON.stringify(before.ext[k])} → ${JSON.stringify(res.ext[k])}`).join('\n'));
  ok(JSON.stringify(before.ext) === JSON.stringify(res.ext),
    'блок ext целиком byte-identical после пользовательской правки');
  importSnap = res;
}

// ── 7. Replay той же версии источника сохраняет правку ───────────────
{
  const c = await page.evaluate(() => DB.externalConnections[0].id);
  const pr = await refresh(c, v1Pkg(2, 'исходный текст источника TEST-RI'));
  ok(pr.ok && pr.totals.existing === 1 && pr.totals.changed === 0 && pr.totals.changedConflicts === 0,
    `точный replay той же версии источника → existing (existing=${pr.totals && pr.totals.existing})`);
  const ap = await apply(c);
  const st = await page.evaluate(() => DB.insights[0].body);
  ok(ap.ok && st === 'локально отредактированный текст TEST-RI',
    'локальная правка пережила повторную подачу той же версии источника', st);
}

// ── 8. Более новая ревизия источника → changed-conflict ──────────────
{
  const c = await page.evaluate(() => DB.externalConnections[0].id);
  const pr = await refresh(c, v1Pkg(3, 'НОВАЯ версия текста из источника TEST-RI'));
  ok(pr.ok && pr.totals.changedConflicts === 1 && pr.totals.changed === 0,
    'более новая ревизия + локально изменённое поле → changed-conflict, а не тихий update',
    JSON.stringify(pr.totals));
  const ap = await apply(c);
  const st = await page.evaluate(() => DB.insights[0].body);
  ok(!ap.ok && ap.blocked === true && st === 'локально отредактированный текст TEST-RI',
    'подача с неразрешённым конфликтом остановлена, работа владельца не тронута');
  await page.evaluate(() => extBridgeCancel());
}

// ── 9. keep-local: правка владельца остаётся, решение записано ───────
{
  const keep = await commit(v1Pkg(4, 'НОВАЯ версия текста из источника TEST-RI'), { conflicts: { 0: 'keep' } });
  const st = await page.evaluate(() => {
    const r = DB.insights[0];
    return { body: r.body, res: r.ext.localResolutions, ih: r.ext.importHash, eh: r.ext.entityHash };
  });
  ok(keep.res.ok && st.body === 'локально отредактированный текст TEST-RI',
    'keep-local: текст владельца сохранён');
  ok(Array.isArray(st.res) && st.res.length === 1 && /^[0-9a-f]{64}$/.test(st.res[0].entityHash),
    'keep-local: терминальное решение записано как provenance (hash отклонённой версии)');
  ok(st.ih === importSnap.ext.importHash && st.eh === importSnap.ext.entityHash,
    'keep-local не переписал снимок версии — правка остаётся видимой детектору');

  const v = await openRec('insights', await page.evaluate(() => DB.insights[0].id));
  await closeRec();
  ok(/Есть решение «оставить мою версию»/.test(v.text),
    'инспектор показывает, что по записи принято решение «оставить мою версию»', v.text.slice(0, 250));
}

// ── 10. override: версия источника побеждает, но с провенансом ───────
{
  const ov = await commit(v1Pkg(5, 'ВТОРАЯ новая версия источника TEST-RI'), { conflicts: { 0: 'override' } });
  const st = await page.evaluate(() => {
    const r = DB.insights[0];
    return { body: r.body, revs: r.ext.revisions, mode: (r.ext.revisions || []).at(-1), ih: r.ext.importHash };
  });
  ok(ov.res.ok && st.body === 'ВТОРАЯ новая версия источника TEST-RI',
    'override: победила версия источника — но только по явному решению владельца', st.body);
  ok(Array.isArray(st.revs) && st.revs.length >= 1 && st.mode.mode === 'override' &&
    (st.mode.updatedFields || []).includes('body'),
    'override записал ревизию с провенансом: что и каким пакетом заменено', JSON.stringify(st.mode));
  ok(st.ih !== importSnap.ext.importHash,
    'после override снимок версии обновлён — новая база для детектора локальных правок');

  const v = await openRec('insights', await page.evaluate(() => DB.insights[0].id));
  await closeRec();
  ok(/Версий из источника/.test(v.text), 'инспектор показывает, что у записи есть история версий источника');
}

// ── 11. Правка НЕ пишет обратно во внешний источник ──────────────────
{
  const netBefore = netHits.length;
  await page.evaluate(() => {
    recOpen('insights', DB.insights[0].id);
    _recDet.editing = true; recRenderDetail();
    $('rec-f-body').value = 'ещё одна локальная правка TEST-RI';
    recSaveEdit();
    closeOv('ov-rec-det');
  });
  await page.waitForTimeout(200);
  const outbound = netHits.slice(netBefore);
  ok(outbound.length === 0,
    'правка записи не порождает НИ ОДНОГО обращения наружу (Drive/ChatGPT не переписываются)',
    outbound.slice(0, 5).join('\n'));
  const conn = await page.evaluate(() => {
    const c = DB.externalConnections[0];
    return { status: c.status, ck: (c.checkpoint.committedPackageHashes || []).length };
  });
  ok(conn.ck >= 1, 'состояние источника не изменилось от правки записи', JSON.stringify(conn));
}

// ── 12. Claim promotion = 0: правка не повышает класс утверждения ────
{
  const st = await page.evaluate(() => {
    const r = DB.insights[0];
    const FACT = ['user_fact', 'external_fact', 'clinical_fact'];
    return {
      classes: r.ext.claimClasses || [r.ext.claimClass],
      factual: (r.ext.claimClasses || [r.ext.claimClass]).filter(c => FACT.includes(c)).length,
      textOrigin: r.ext.textOrigin,
    };
  });
  ok(st.factual === 0 && st.textOrigin === 'user_words',
    'после серии правок и разрешений класс утверждения не повышен до фактического',
    JSON.stringify(st));
}

// ── 13. Синхронизация переносит правку и провенанс ───────────────────
{
  const res = await page.evaluate(async () => {
    const origApi = api, origToast = toast;
    const toasts = [];
    const snap = JSON.stringify(DB.insights[0]);
    api = async (path, opt = {}) => ((opt.method || 'GET') === 'GET'
      ? { name: 'x', updated_at: '2026-04-01T00:00:00Z', data: null }
      : { updated_at: '2026-04-02T00:00:00Z' });
    toast = (m, k) => toasts.push(k + ':' + m);
    CFG.apiUrl = 'https://example.invalid'; CFG.spaceKey = 'TEST-RI-SPACE';
    setPass('test-ri-passphrase');
    _syncing = false;
    await runSync({ manual: true });
    api = origApi; toast = origToast;
    return { toasts, unchanged: snap === JSON.stringify(DB.insights[0]), body: DB.insights[0].body };
  });
  ok(res.toasts.some(t => /^ok:Синхронизировано/.test(t)),
    'синхронизация после правки зелёная', res.toasts.join(' | '));
  ok(res.unchanged && /локальная правка TEST-RI/.test(res.body),
    'синхронизация не переписала ни правку, ни провенанс', res.body);
}

// ── 14. Копия/восстановление переносят правку и провенанс ────────────
{
  const snap = await page.evaluate(() => JSON.parse(JSON.stringify(DB)));
  const mkStorage = (init = {}) => {
    const m = new Map(Object.entries(init));
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, keys: () => [...m.keys()] };
  };
  const mkMedia = () => { const m = new Map(); return { get: async i => m.get(i), put: async (i, v) => { m.set(i, v); }, del: async i => { m.delete(i); }, keys: async () => [...m.keys()] }; };
  const NOW = '2026-12-31T00:00:00.000Z';
  const st = mkStorage({
    [KEYS.PKEY]: JSON.stringify([{ id: 'pRI', name: 'RI', color: '#1056CC' }]), [KEYS.AKEY]: 'pRI',
    [KEYS.db('pRI')]: JSON.stringify(snap), [KEYS.cfg('pRI')]: JSON.stringify({ userName: 'RI' }),
  });
  const adapter = createBackupAdapter({ storage: st, media: mkMedia(), now: () => NOW });
  const { payload } = await adapter.buildBundle({ id: 'pRI', mode: 'data-only' });
  const env = await encryptPayload(payload, 'test-ri-backup');
  const ser = serializeEnvelope(env);
  await decryptEnvelope(env, 'test-ri-backup');
  const dest = { storage: mkStorage({ [KEYS.PKEY]: '[]', [KEYS.AKEY]: '' }), media: mkMedia() };
  const ad2 = createBackupAdapter({ storage: dest.storage, media: dest.media, now: () => NOW });
  const r = await restoreBackup({ adapter: ad2, file: { size: ser.length, text: async () => ser }, password: 'test-ri-backup', mode: 'new', genProfileId: () => 'pRI2', now: () => NOW });
  const rdb = JSON.parse(dest.storage.getItem(KEYS.db('pRI2')));
  const src = snap.insights[0], got = (rdb.insights || [])[0];
  ok(r.ok && got && got.body === src.body,
    'восстановление сохранило отредактированный текст записи', got && got.body);
  ok(got && JSON.stringify(got.ext) === JSON.stringify(src.ext),
    'восстановление сохранило блок происхождения byte-identical');
  // Восстановленная запись открывается инспектором.
  const view = await page.evaluate((db) => {
    const keep = JSON.stringify(DB);
    Object.keys(DB).forEach(k => { delete DB[k]; });
    Object.assign(DB, JSON.parse(db));
    let out;
    try { recOpen('insights', DB.insights[0].id); out = { ok: true, text: ($('rec-det-body').textContent || '').replace(/\s+/g, ' ') }; }
    catch (e) { out = { ok: false, err: e.message }; }
    closeOv('ov-rec-det');
    Object.keys(DB).forEach(k => { delete DB[k]; });
    Object.assign(DB, JSON.parse(keep));
    return out;
  }, JSON.stringify(rdb));
  ok(view.ok && /локальная правка TEST-RI/.test(view.text),
    'запись из восстановленной копии читается инспектором целиком', view.err || view.text.slice(0, 120));
}

// ── 15. Удаление из инспектора = прежнее удаление ────────────────────
{
  const res = await page.evaluate(() => {
    const id = DB.insights[0].id;
    const origConfirm = window.confirm; window.confirm = () => true;
    recOpen('insights', id);
    recDelFromDetail();
    window.confirm = origConfirm;
    return {
      overlayClosed: !document.getElementById('ov-rec-det').classList.contains('on'),
      left: DB.insights.length,
      tomb: !!(DB._del && DB._del[id]),
    };
  });
  ok(res.left === 0 && res.tomb, 'удаление из инспектора удаляет запись и ставит тот же tombstone');
  ok(res.overlayClosed, 'после удаления экран записи закрывается — «Мои записи» не показывают призрак');
  const gone = await openRec('insights', 'TEST-RI-SRC-INS-1');
  await closeRec();
  ok(/Запись не найдена/.test(gone.text), 'открытие удалённой записи объясняется человеку, а не падает');
}

// ── 16. Профили: правка не протекает в соседний профиль ──────────────
{
  const res = await page.evaluate(() => {
    const raw = localStorage.getItem('arch5_db_' + activeId());
    // Синтетический соседний профиль с собственной копией данных.
    localStorage.setItem('arch5_db_TEST-RI-OTHER', raw);
    const otherBefore = localStorage.getItem('arch5_db_TEST-RI-OTHER');
    DB.insights = [{ id: 'TEST-RI-PROFILE-1', tag: 'personal', w: 1, title: 'своя запись',
      body: 'до правки', date: '01.04.2026', createdAt: nowISO(), day: todayKey(),
      sv: SCHEMA_VERSION, src: 'вручную', links: [], media: [], _u: 1 }];
    persist();
    recOpen('insights', 'TEST-RI-PROFILE-1');
    _recDet.editing = true; recRenderDetail();
    $('rec-f-body').value = 'после правки TEST-RI-PROFILE';
    recSaveEdit();
    closeOv('ov-rec-det');
    const otherAfter = localStorage.getItem('arch5_db_TEST-RI-OTHER');
    const mine = JSON.parse(localStorage.getItem('arch5_db_' + activeId()));
    localStorage.removeItem('arch5_db_TEST-RI-OTHER');
    return {
      otherUntouched: otherBefore === otherAfter,
      otherHasEdit: /TEST-RI-PROFILE/.test(otherAfter || ''),
      mineHasEdit: /после правки TEST-RI-PROFILE/.test(JSON.stringify(mine)),
    };
  });
  ok(res.mineHasEdit, 'правка записана в активный профиль');
  ok(res.otherUntouched && !res.otherHasEdit,
    'соседний профиль не изменился — межпрофильного протекания нет');
}

// ── 17. «Мои записи»: строка — реальная кнопка открытия ──────────────
{
  await page.evaluate(() => {
    DB.insights = [{ id: 'TEST-RI-ROW-1', tag: 'personal', w: 1, title: 'строка списка',
      body: 'текст строки', date: '01.04.2026', createdAt: nowISO(), day: todayKey(),
      sv: SCHEMA_VERSION, src: 'вручную', links: [], media: [], _u: 1 }];
    persist(); openRecords();
    const sel = $('rec-coll'); sel.value = 'insights'; rRecords();
  });
  const row = await page.evaluate(() => {
    const b = document.querySelector('#records-list .si-row button.si-body');
    if (!b) return { found: false };
    const r = b.getBoundingClientRect();
    return { found: true, tag: b.tagName, h: Math.round(r.height), hint: b.textContent.includes('Открыть запись') };
  });
  ok(row.found && row.tag === 'BUTTON', 'строка «Моих записей» — настоящая кнопка, а не только иконка удаления');
  ok(row.h >= 44, `цель нажатия не меньше 44px (${row.h}px)`);
  ok(row.hint, 'человеку сказано, что строку можно открыть');
  const opened = await page.evaluate(() => {
    document.querySelector('#records-list .si-row button.si-body').click();
    return { on: document.getElementById('ov-rec-det').classList.contains('on'),
      text: ($('rec-det-body').textContent || '') };
  });
  ok(opened.on && /текст строки/.test(opened.text), 'тап по строке реально открывает запись');
  await closeRec();

  // РЕГРЕССИЯ (дефект найден на собранном MAIN 1a859f47): у психологических,
  // лабораторных и документных записей id — СТРОКА (psyUid: «psyReview-…»).
  // Идентификатор вставлялся в inline-обработчик без экранирования кавычек,
  // атрибут обрывался, и обе кнопки строки переставали работать: запись
  // невозможно было ни открыть, ни удалить. Хвост id при этом парсился как
  // посторонний HTML-атрибут.
  const strId = await page.evaluate(() => {
    DB.psyReviews = [{ id: 'psyReview-TEST-RI-STR-1', periodStart: '2026-04-01T00:00:00.000Z',
      periodEnd: '2026-04-07T00:00:00.000Z', decision: 'continue',
      outcomeSummary: 'синтетический итог со строковым id', sv: SCHEMA_VERSION, _u: Date.now() }];
    persist();
    const sel = $('rec-coll'); sel.value = 'psyReviews'; rRecords();
    const rows = document.querySelectorAll('#records-list .si-row');
    const openBtn = document.querySelector('#records-list .si-row button.si-body');
    const delB = document.querySelector('#records-list .si-row button:last-child');
    const out = { rows: rows.length, openAttr: openBtn && openBtn.getAttribute('onclick'),
      delAttr: delB && delB.getAttribute('onclick'),
      // Хвост id, утёкший в имя чужого атрибута, — прямой признак обрыва.
      strayAttrs: openBtn ? [...openBtn.attributes].map(a => a.name).filter(n => /test-ri-str/i.test(n)) : [] };
    let err = null;
    try { openBtn.click(); } catch (e) { err = e.message; }
    out.clickErr = err;
    out.opened = document.getElementById('ov-rec-det').classList.contains('on');
    out.text = ($('rec-det-body').textContent || '');
    closeOv('ov-rec-det');
    // И удаление: то же самое место, тот же обрыв.
    const origConfirm = window.confirm; window.confirm = () => true;
    let delErr = null;
    try { delB.click(); } catch (e) { delErr = e.message; }
    window.confirm = origConfirm;
    out.delErr = delErr;
    out.left = DB.psyReviews.length;
    return out;
  });
  ok(strId.strayAttrs.length === 0 && /psyReview-TEST-RI-STR-1/.test(strId.openAttr || ''),
    'строковый id не обрывает атрибут обработчика (нет посторонних атрибутов)',
    `onclick=${strId.openAttr} stray=${strId.strayAttrs.join(',')}`);
  ok(!strId.clickErr && strId.opened && /синтетический итог со строковым id/.test(strId.text),
    'запись со строковым id открывается тапом по строке', strId.clickErr || strId.text.slice(0, 120));
  ok(!strId.delErr && strId.left === 0,
    'запись со строковым id удаляется кнопкой удаления', strId.delErr || `осталось ${strId.left}`);

  // Кавычка внутри id не инъецирует разметку.
  const quoted = await page.evaluate(() => {
    DB.psyReviews = [{ id: 'psyReview-"><img src=x onerror=alert(1)>', periodStart: '2026-04-01T00:00:00.000Z',
      periodEnd: '2026-04-07T00:00:00.000Z', decision: 'continue', outcomeSummary: 'кавычка в id', sv: SCHEMA_VERSION, _u: Date.now() }];
    rRecords();
    return { imgs: document.querySelectorAll('#records-list img').length };
  });
  ok(quoted.imgs === 0, 'кавычка в идентификаторе не инъецирует разметку в список');
  // Мобильная отрисовка: ничего не уезжает за край iPhone.
  const overflow = await page.evaluate(() => [...document.querySelectorAll('#ov-rec-det *')]
    .filter(el => el.getBoundingClientRect().right > window.innerWidth + 1).length);
  ok(overflow === 0, 'экран записи не выходит за границы экрана iPhone');
  await closeRec();
}

// ── 17b. Идентичность записи СТРОГАЯ: id=1 и id="1" — разные записи ──
// recArg намеренно сохраняет разницу число/строка, потому что всё
// приложение сравнивает id через === (delUndo, tomb, ссылки между
// записями). Сравнение через String() схлопнуло бы их в одну запись:
// открылась бы чужая, правка ушла бы не туда, удалилось бы не то.
{
  const seed = () => page.evaluate(() => {
    const base = { tag: 'personal', w: 1, date: '01.04.2026', createdAt: nowISO(),
      day: todayKey(), sv: SCHEMA_VERSION, src: 'вручную', links: [], media: [], _u: 1 };
    DB.insights = [
      { ...base, id: 1, title: 'числовая запись', body: 'тело числовой' },
      { ...base, id: '1', title: 'строковая запись', body: 'тело строковой' },
    ];
    persist();
  });

  await seed();
  const num = await page.evaluate(() => {
    recOpen('insights', 1);
    const r = recDetRecord();
    const out = { id: r && r.id, t: typeof (r && r.id), title: r && r.title,
      text: ($('rec-det-body').textContent || '') };
    closeOv('ov-rec-det');
    return out;
  });
  ok(num.id === 1 && num.t === 'number' && num.title === 'числовая запись',
    'открытие id=1 (число) открывает именно числовую запись', JSON.stringify(num));
  ok(/тело числовой/.test(num.text) && !/тело строковой/.test(num.text),
    'на экране содержимое числовой записи, не строковой');

  const str = await page.evaluate(() => {
    recOpen('insights', '1');
    const r = recDetRecord();
    const out = { id: r && r.id, t: typeof (r && r.id), title: r && r.title,
      text: ($('rec-det-body').textContent || '') };
    closeOv('ov-rec-det');
    return out;
  });
  ok(str.id === '1' && str.t === 'string' && str.title === 'строковая запись',
    'открытие id="1" (строка) открывает именно строковую запись', JSON.stringify(str));
  ok(/тело строковой/.test(str.text) && !/тело числовой/.test(str.text),
    'на экране содержимое строковой записи, не числовой');

  // Правка каждой меняет ТОЛЬКО её.
  const edited = await page.evaluate(() => {
    const doEdit = (id, val) => {
      recOpen('insights', id);
      _recDet.editing = true; recRenderDetail();
      $('rec-f-body').value = val;
      recSaveEdit();
      closeOv('ov-rec-det');
    };
    doEdit(1, 'правка числовой TEST-RI');
    const afterNum = DB.insights.map(r => ({ id: r.id, t: typeof r.id, body: r.body }));
    doEdit('1', 'правка строковой TEST-RI');
    const afterStr = DB.insights.map(r => ({ id: r.id, t: typeof r.id, body: r.body }));
    return { afterNum, afterStr };
  });
  const n1 = edited.afterNum.find(r => r.t === 'number'), s1 = edited.afterNum.find(r => r.t === 'string');
  ok(n1.body === 'правка числовой TEST-RI' && s1.body === 'тело строковой',
    'правка числовой записи не тронула строковую', JSON.stringify(edited.afterNum));
  const n2 = edited.afterStr.find(r => r.t === 'number'), s2 = edited.afterStr.find(r => r.t === 'string');
  ok(s2.body === 'правка строковой TEST-RI' && n2.body === 'правка числовой TEST-RI',
    'правка строковой записи не тронула числовую', JSON.stringify(edited.afterStr));

  // Удаление тоже строгое: удаляется ровно адресованная запись.
  const del = await page.evaluate(() => {
    const origConfirm = window.confirm; window.confirm = () => true;
    recOpen('insights', 1);
    recDelFromDetail();
    window.confirm = origConfirm;
    return { left: DB.insights.map(r => ({ id: r.id, t: typeof r.id })),
      tombNum: !!(DB._del && DB._del[1]) };
  });
  ok(del.left.length === 1 && del.left[0].t === 'string' && del.left[0].id === '1',
    'удаление id=1 (число) удалило числовую и оставило строковую', JSON.stringify(del.left));

  // Оба id живут в списке и открываются каждый своей строкой.
  await seed();
  const rows = await page.evaluate(() => {
    openRecords();
    const sel = $('rec-coll'); sel.value = 'insights'; rRecords();
    const btns = [...document.querySelectorAll('#records-list .si-row button.si-body')];
    // getAttribute отдаёт УЖЕ раскодированное значение — именно это и
    // доказывает, что кавычки доехали до JS через `&quot;`, а не оборвали
    // атрибут. Сырую разметку проверяем отдельно.
    const attrs = btns.map(b => b.getAttribute('onclick'));
    const rawHtml = document.getElementById('records-list').innerHTML;
    const opened = [];
    btns.forEach(b => {
      b.click();
      const r = recDetRecord();
      opened.push({ id: r && r.id, t: typeof (r && r.id), title: r && r.title });
      closeOv('ov-rec-det');
    });
    return { attrs, rawHtml, opened };
  });
  ok(rows.attrs.some(a => a === `recOpen('insights',1)`) &&
     rows.attrs.some(a => a === `recOpen('insights',"1")`),
    'в списке два разных обработчика: число без кавычек, строка в кавычках',
    JSON.stringify(rows.attrs));
  ok(/recOpen\(&#39;insights&#39;,&quot;1&quot;\)|recOpen\('insights',&quot;1&quot;\)/.test(rows.rawHtml),
    'в сырой разметке кавычки строкового id экранированы (атрибут не рвётся)',
    rows.rawHtml.slice(0, 200));
  const kinds = rows.opened.map(o => o.t).sort().join(',');
  ok(kinds === 'number,string' && rows.opened.every(o => o.title),
    'тап по каждой строке открывает свою запись, типы не схлопнулись',
    JSON.stringify(rows.opened));
}

// ── 17c. Пустая правка ничего не пишет и не гоняет синхронизацию ─────
{
  const res = await page.evaluate(() => {
    DB.insights = [{ id: 'TEST-RI-NOOP-1', tag: 'personal', w: 1, title: 'заголовок',
      body: 'текст', date: '01.04.2026', createdAt: nowISO(), day: todayKey(),
      sv: SCHEMA_VERSION, src: 'вручную', links: [], media: [], _u: 111 }];
    persist();
    const before = JSON.stringify(DB.insights[0]);
    let persists = 0;
    const origPersist = persist; persist = (...a) => { persists++; return origPersist(...a); };
    const toasts = []; const origToast = toast; toast = (m, k) => toasts.push(k + ':' + m);
    // Открыть форму и сохранить, ничего не изменив.
    recOpen('insights', 'TEST-RI-NOOP-1');
    _recDet.editing = true; recRenderDetail();
    recSaveEdit();
    const afterNoop = JSON.stringify(DB.insights[0]);
    const noopPersists = persists;
    // Теперь реальная правка — она обязана записаться.
    _recDet.editing = true; recRenderDetail();
    $('rec-f-body').value = 'настоящая правка TEST-RI';
    recSaveEdit();
    const realPersists = persists - noopPersists;
    persist = origPersist; toast = origToast;
    closeOv('ov-rec-det');
    return { unchanged: before === afterNoop, noopPersists, realPersists,
      toasts, u: DB.insights[0]._u, body: DB.insights[0].body };
  });
  ok(res.unchanged, 'сохранение без изменений не тронуло запись (включая `_u`)');
  ok(res.noopPersists === 0, `пустая правка не пишет в хранилище (persist вызван ${res.noopPersists} раз)`);
  ok(res.toasts.some(t => /Изменений нет/.test(t)),
    'человеку честно сказано «изменений нет», а не «сохранено»', res.toasts.join(' | '));
  ok(res.realPersists === 1 && res.body === 'настоящая правка TEST-RI' && res.u > 111,
    'настоящая правка по-прежнему пишется и обновляет метку синхронизации',
    JSON.stringify({ p: res.realPersists, u: res.u }));

  // Прямой вызов писателя: пустая правка возвращает noop и не трогает `_u`.
  const direct = await page.evaluate(() => {
    const r = DB.insights[0];
    const u = r._u;
    const same = recApplyLocalEdit(r, 'insights', { body: r.body, title: r.title });
    const uSame = r._u;
    const diff = recApplyLocalEdit(r, 'insights', { body: r.body + ' (ещё)' });
    return { same, uKept: uSame === u, diff, uMoved: r._u !== u };
  });
  ok(direct.same.ok && direct.same.noop === true && direct.uKept,
    'писатель возвращает noop и не двигает `_u`, когда значения совпали', JSON.stringify(direct.same));
  ok(direct.diff.ok && !direct.diff.noop && direct.uMoved,
    'при реальном изменении писатель работает как прежде');
}

// ── 18. Разметка из данных не инъецируется ───────────────────────────
{
  const xss = await page.evaluate(() => {
    DB.insights = [{ id: 'TEST-RI-XSS-1', tag: '<img src=x onerror=alert(1)>', w: 1,
      title: '<img src=x onerror=alert(1)>', body: '<script>alert(2)</script>',
      date: '01.04.2026', createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, src: 'вручную', links: [], media: [], _u: 1 }];
    recOpen('insights', 'TEST-RI-XSS-1');
    const box = $('rec-det-body');
    const r = { imgs: box.querySelectorAll('img').length, scripts: box.querySelectorAll('script').length };
    _recDet.editing = true; recRenderDetail();
    r.editImgs = box.querySelectorAll('img').length;
    r.valueKept = $('rec-f-title').value === '<img src=x onerror=alert(1)>';
    closeOv('ov-rec-det');
    return r;
  });
  ok(xss.imgs === 0 && xss.scripts === 0, 'значения полей экранируются при чтении');
  ok(xss.editImgs === 0 && xss.valueKept, 'значения экранируются и в форме правки, но не искажаются');
}

ok(errors.length === 0, `JS-ошибок нет за весь прогон (${errors.length})`, errors.slice(0, 3).join('\n'));

// ── Privacy canary ──────────────────────────────────────────────────
{
  const src = readFileSync(join(DIR, 'recordInspector.spec.mjs'), 'utf8');
  const bundle = readFileSync(join(ROOT, 'dist', 'app.html'), 'utf8');
  const marks = [['GDRI', 'VE:'], ['LIFE-2', '02'], ['DREAM-2', '02'], ['PARA-2', '02'], ['INT-2', '02']]
    .map(p => new RegExp(p.join('')));
  const inSpec = marks.filter(r => r.test(src)).length;
  const inBundle = marks.filter(r => r.test(bundle)).length;
  ok(inSpec === 0 && inBundle === 0,
    `privacy canary: приватных маркеров нет ни в тесте, ни в бандле (${inSpec}/${inBundle})`);
  ok(/TEST-RI-/.test(src), 'все фикстуры несут синтетический префикс TEST-RI-*');
}

await browser.close();
console.log(`\nИНСПЕКТОР ЗАПИСИ: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
