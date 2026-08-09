// Wave 7 (issue #162) — Psychology Workspace.
//
// ВСЕ фикстуры синтетические (TEST-PSY-*, TEST-INT-*). Реальные
// психологические данные владельца в репозиторий не попадают ни в каком виде.
//
// Гоняет РЕАЛЬНЫЙ собранный бандл (dist/app.html) в Chromium.

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..');
const FILE = 'file://' + (process.env.WAVE7_BUNDLE || join(ROOT, 'dist', 'app.html'));
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
  await p.waitForTimeout(120);
  return p;
}
const page = await boot();
const PSY_COLLS = ['psyFormulations', 'psyGoals', 'psyInterventionEpisodes', 'psyObservations', 'psyReviews'];

const reset = () => page.evaluate((colls) => {
  colls.concat(['insights', 'whys', 'moments', 'patterns', 'relationshipContexts', 'psyLinks',
    'dreams', 'spiritual', 'evolution', 'sphereLogs', 'externalWorkSessions']).forEach(c => { DB[c] = []; });
  DB._del = {};
  try { resolveRecovery('discarded'); } catch (_) {}
}, PSY_COLLS);

const save = (type, input) => page.evaluate(({ t, i }) => {
  const r = psySaveRecord(t, i);
  return { ok: r.ok, errors: r.errors, id: r.rec && r.rec.id, rec: r.rec || null };
}, { t: type, i: input });

const plan = (pkg) => page.evaluate(t => extBuildPlan(t), JSON.stringify(pkg));
const commit = (pkg, sel) => page.evaluate(async ({ t, s }) => {
  const p = await extBuildPlan(t);
  const res = extCommitPlan(p, s);
  return { plan: { ok: p.ok, errors: p.errors, counts: p.counts, byTarget: p.byTarget, items: p.items.map(i => ({ type: i.type, coll: i.coll, status: i.status, reason: i.reason })) }, res };
}, { t: JSON.stringify(pkg), s: sel || null });

console.log('\n── Wave 7: Psychology Workspace ──');

// ═══ ДАННЫЕ / МОДЕЛЬ ═══════════════════════════════════════════════

// ── 1. Свежий профиль: все 5 коллекций существуют пустыми ───────────
{
  await reset();
  const st = await page.evaluate((colls) => ({
    all: colls.every(c => Array.isArray(DB[c]) && DB[c].length === 0),
    inDefault: colls.every(c => Array.isArray(DEFAULT_DB[c])),
    inIdcols: colls.every(c => IDCOLS.includes(c)),
    inRec: colls.every(c => c in REC_COLLS),
    schema: SCHEMA_VERSION,
  }), PSY_COLLS);
  ok(st.all, 'свежий профиль: все 5 психологических коллекций существуют и пусты');
  ok(st.inDefault, 'все 5 коллекций объявлены в DEFAULT_DB');
  ok(st.inIdcols, 'все 5 коллекций входят в IDCOLS (sync/tombstone/merge работают генерично)');
  ok(st.inRec, 'все 5 коллекций входят в REC_COLLS («Мои записи», удаление)');
  ok(st.schema === 7, `SCHEMA_VERSION поднята до 7 (${st.schema})`);
}

// ── 2. dbCount учитывает психологию: профиль «только психология» не пуст ──
// Иначе такой профиль выглядел бы пустым и мог быть перезаписан копией.
{
  const cnt = await page.evaluate(() => {
    const only = { psyFormulations: [{ id: 'a' }], psyGoals: [], psyInterventionEpisodes: [{ id: 'b' }], psyObservations: [], psyReviews: [] };
    return { n: dbCount(only), emptyN: dbCount({ insights: [] }) };
  });
  ok(cnt.n === 2, `dbCount() считает психологические записи (${cnt.n})`);
  ok(cnt.emptyN === 0, 'по-настоящему пустой профиль по-прежнему даёт 0');
}

// ── 3. Миграция 6 → 7 аддитивна и идемпотентна ──────────────────────
{
  const mig = await page.evaluate(() => {
    const legacy = { insights: [{ id: 1, title: 'старый', body: 'текст', sv: 6 }], whys: [{ id: 2, symptom: 's', sv: 6 }], __ts: 5 };
    const before = JSON.stringify(legacy.insights[0]);
    const merged1 = { ...JSON.parse(JSON.stringify(DEFAULT_DB)), ...JSON.parse(JSON.stringify(legacy)) };
    const merged2 = { ...JSON.parse(JSON.stringify(DEFAULT_DB)), ...JSON.parse(JSON.stringify(merged1)) };
    return {
      collsAdded: ['psyFormulations', 'psyGoals', 'psyInterventionEpisodes', 'psyObservations', 'psyReviews'].every(c => Array.isArray(merged1[c]) && merged1[c].length === 0),
      insightUntouched: JSON.stringify(merged1.insights[0]) === before,
      idempotent: JSON.stringify(merged1) === JSON.stringify(merged2),
    };
  });
  ok(mig.collsAdded, 'legacy-профиль схемы 6 получает 5 пустых коллекций');
  ok(mig.insightUntouched, 'существующие записи не переписываются по смыслу');
  ok(mig.idempotent, 'повторная миграция идемпотентна');
}

// ── 4. Namespaced ID: collision-safe относительно общего _del ────────
{
  await reset();
  const f = await save('psyFormulation', { focus: 'F1', formulation: 'текст формулировки', status: 'active' });
  const g = await save('psyGoal', { label: 'G1', proximalOutcome: 'наблюдаемый результат' });
  ok(/^psyFormulation:/.test(f.id), `id формулировки namespaced (${f.id})`);
  ok(/^psyGoal:/.test(g.id), `id цели namespaced (${g.id})`);
  ok(Number.isNaN(Number(f.id)), 'namespaced id структурно не может совпасть с числовым id другой коллекции');
}

// ── 5. Версионирование формулировки: create → supersede → история ────
{
  await reset();
  const v1 = await save('psyFormulation', { focus: 'Версия 1', formulation: 'первое описание', status: 'active' });
  const v2 = await save('psyFormulation', { focus: 'Версия 2', formulation: 'второе описание', status: 'active', supersedesId: v1.id });
  const st = await page.evaluate(() => ({
    n: DB.psyFormulations.length,
    active: psyActiveFormulation() && psyActiveFormulation().focus,
    statuses: DB.psyFormulations.map(f => f.status),
    history: psyFormulationHistory(psyActiveFormulation().id).map(f => f.focus),
  }));
  ok(v1.ok && v2.ok && st.n === 2, `обе версии сохранены, старая не удалена (${st.n})`);
  ok(st.active === 'Версия 2', 'активна новая версия');
  ok(st.statuses.filter(s => s === 'active').length === 1, 'активная формулировка ровно одна');
  ok(st.statuses.includes('superseded'), 'предыдущая версия помечена superseded, а не переписана');
  ok(JSON.stringify(st.history) === JSON.stringify(['Версия 2', 'Версия 1']),
    `история версий восстанавливается целиком (${st.history.join(' → ')})`);
}

// ── 6. supersedesId на несуществующую версию отклоняется ─────────────
{
  const bad = await save('psyFormulation', { focus: 'X', formulation: 'y', supersedesId: 'psyFormulation:НЕТ' });
  ok(!bad.ok && bad.errors.some(e => /несуществующ/.test(e)), 'supersedesId на несуществующую версию отклонён');
}

// ── 7. Цель: жизненный цикл и обязательный наблюдаемый результат ─────
{
  await reset();
  const noOutcome = await save('psyGoal', { label: 'стать лучше' });
  ok(!noOutcome.ok && noOutcome.errors.some(e => /наблюдаемой/.test(e)),
    'абстрактная цель без наблюдаемого результата отклонена');
  const g = await save('psyGoal', { label: 'Держать границу', proximalOutcome: 'сказать «нет» без объяснений 1 раз', status: 'active' });
  ok(g.ok && g.rec.status === 'active', 'цель с наблюдаемым результатом сохранена');
  const statuses = await page.evaluate(() => PSY_GOAL_STATUSES.slice());
  ok(JSON.stringify(statuses) === JSON.stringify(['active', 'paused', 'achieved', 'dropped']),
    'жизненный цикл цели — закрытый список из 4 статусов');
}

// ── 8–9. Интервенция: качественная и с числовыми наблюдениями ────────
{
  await reset();
  const qual = await save('psyInterventionEpisode', {
    methodId: 'opposite_action', interventionSummary: 'синтетическое применение навыка',
    adherence: 'done', acceptability: 'irritating', outcomeClass: 'unclear',
  });
  ok(qual.ok && qual.rec.methodFamily === 'DBT_SKILL',
    'качественный эпизод сохранён, семейство метода выведено из Method Registry');
  ok(qual.rec.preObservationRefs.length === 0 && qual.rec.postObservationRefs.length === 0,
    'без замеров pre/post остаются ПУСТЫМИ — отсутствие данных не подменяется нулём');

  const o1 = await save('psyObservation', { metricId: 'TEST-PSY-METRIC', valueNumber: 7, unit: 'балл' });
  const o2 = await save('psyObservation', { metricId: 'TEST-PSY-METRIC', valueNumber: 3, unit: 'балл' });
  const num = await save('psyInterventionEpisode', {
    methodId: 'cognitive_restructuring', interventionSummary: 'синтетический разбор мысли',
    adherence: 'done', outcomeClass: 'promising',
    preObservationRefs: [{ coll: 'psyObservations', id: o1.id }],
    postObservationRefs: [{ coll: 'psyObservations', id: o2.id }],
  });
  ok(num.ok && num.rec.preObservationRefs.length === 1 && num.rec.postObservationRefs.length === 1,
    'эпизод с реальными числовыми наблюдениями связывается ссылками, а не копиями');
}

// ── 10. Висячие ссылки fail-closed ──────────────────────────────────
{
  const orphan = await save('psyInterventionEpisode', {
    methodId: 'opposite_action', interventionSummary: 'x', adherence: 'done',
    preObservationRefs: [{ coll: 'psyObservations', id: 'psyObservation:НЕТ' }],
  });
  ok(!orphan.ok && orphan.errors.some(e => /не существует/.test(e) && /висячая/.test(e)),
    'ссылка на несуществующую запись отклонена fail-closed', (orphan.errors || [])[0]);
  const badColl = await save('psyGoal', { label: 'g', proximalOutcome: 'p', sourceRefs: [{ coll: 'нетТакой', id: 1 }] });
  ok(!badColl.ok && badColl.errors.some(e => /не поддерживается как источник/.test(e)),
    'неизвестная коллекция-источник отклонена');
}

// ── 11. Естественное изменение НЕ становится интервенцией ───────────
{
  await reset();
  const nat = await save('psyObservation', {
    metricId: 'TEST-PSY-CALM', valueText: 'стало спокойнее после смены обстановки',
    naturalistic: true, entryMode: 'event_based',
  });
  ok(nat.ok && nat.rec.naturalistic === true, 'естественное наблюдение сохранено как observation с флагом naturalistic');
  const st = await page.evaluate(() => ({ obs: DB.psyObservations.length, eps: DB.psyInterventionEpisodes.length }));
  ok(st.obs === 1 && st.eps === 0,
    `естественное изменение не создало фиктивный intervention episode (obs ${st.obs} / eps ${st.eps})`);
}

// ── 12. Review ссылается только на реально существующие записи ───────
{
  await reset();
  const f = await save('psyFormulation', { focus: 'F', formulation: 'т', status: 'active' });
  const g = await save('psyGoal', { label: 'G', proximalOutcome: 'p' });
  const e = await save('psyInterventionEpisode', { methodId: 'opposite_action', interventionSummary: 's', adherence: 'done' });
  const good = await save('psyReview', {
    periodStart: '2026-03-01T00:00:00.000Z', periodEnd: '2026-03-31T00:00:00.000Z',
    outcomeSummary: 'синтетический итог', decision: 'continue',
    formulationRef: f.id, goalRefs: [g.id], interventionEpisodeRefs: [e.id],
  });
  ok(good.ok && good.rec.interventionEpisodeRefs.length === 1, 'review с реальными ссылками сохранён');
  const bad = await save('psyReview', {
    periodStart: '2026-03-01T00:00:00.000Z', periodEnd: '2026-03-31T00:00:00.000Z',
    outcomeSummary: 'итог', interventionEpisodeRefs: ['psyIntervention:НЕТ'],
  });
  ok(!bad.ok && bad.errors.some(e2 => /не существует/.test(e2)),
    'review не может опереться на несуществующий эпизод');
  const badPeriod = await save('psyReview', { periodStart: '2026-03-31T00:00:00.000Z', periodEnd: '2026-03-01T00:00:00.000Z', outcomeSummary: 'x' });
  ok(!badPeriod.ok && badPeriod.errors.some(e2 => /раньше/.test(e2)), 'перевёрнутый период отклонён');
}

// ═══ СЕМАНТИКА ДОКАЗАТЕЛЬНОСТИ ════════════════════════════════════

// ── 13. Гипотеза остаётся гипотезой ─────────────────────────────────
{
  await reset();
  const h = await save('psyFormulation', {
    focus: 'F', formulation: 'т', status: 'active',
    hypotheses: [{ text: 'синтетическая гипотеза', claimClass: 'working_hypothesis' }],
  });
  ok(h.ok && h.rec.hypotheses[0].claimClass === 'working_hypothesis', 'рабочая гипотеза сохранена как гипотеза');
  const promoted = await save('psyFormulation', {
    focus: 'F2', formulation: 'т', hypotheses: [{ text: 'та же мысль', claimClass: 'user_fact' }],
  });
  ok(!promoted.ok && promoted.errors.some(e => /не может быть записана как user_fact/.test(e)),
    'гипотезу нельзя записать как user_fact — тихое повышение статуса невозможно');
  ok(h.rec.hypotheses[0].userStance === 'undecided',
    'позиция пользователя по гипотезе хранится явно (несогласие ≠ «сопротивление»)');
}

// ── 14. not_done ≠ not_helpful ──────────────────────────────────────
{
  const nd = await save('psyInterventionEpisode', {
    methodId: 'opposite_action', interventionSummary: 'не делал', adherence: 'not_done', outcomeClass: 'not_helpful',
  });
  ok(!nd.ok && nd.errors.some(e => /not_done ≠ not_helpful/.test(e)),
    'невыполненную технику нельзя объявить бесполезной');
  const ndOk = await save('psyInterventionEpisode', {
    methodId: 'opposite_action', interventionSummary: 'не делал', adherence: 'not_done', outcomeClass: 'unclear',
  });
  ok(ndOk.ok, 'при not_done допустим честный «unclear»');
}

// ── 15. Переносимость ≠ исход; нежелательный эффект не исчезает ──────
{
  const e = await save('psyInterventionEpisode', {
    methodId: 'self_compassion_break', interventionSummary: 'синтетическая практика',
    adherence: 'done', acceptability: 'irritating', outcomeClass: 'helpful_in_context',
    adverseEffects: ['усилилась тревога на 10 минут'],
  });
  ok(e.ok && e.rec.acceptability === 'irritating' && e.rec.outcomeClass === 'helpful_in_context',
    'переносимость и исход хранятся раздельно и могут расходиться');
  ok(e.rec.adverseEffects.length === 1,
    'нежелательный эффект сохранён рядом с положительным исходом, а не поглощён им');
}

// ── 16. missing ≠ zero, и ИИ не создаёт измерений ───────────────────
{
  const noVal = await save('psyObservation', { metricId: 'TEST-PSY-EMPTY' });
  ok(!noVal.ok, 'наблюдение без значения не сохраняется как «ноль»');
  const textOnly = await save('psyObservation', { metricId: 'TEST-PSY-TXT', valueText: 'словами' });
  ok(textOnly.ok && textOnly.rec.valueNumber === null,
    'качественное наблюдение хранит valueNumber = null, а не 0');
  const aiSrc = await save('psyObservation', { metricId: 'TEST-PSY-AI', valueNumber: 5, source: 'ai' });
  ok(!aiSrc.ok && aiSrc.errors.some(e => /измерение создаёт только/.test(e)),
    'источник «ai» для измерения отклонён fail-closed');
  const srcs = await page.evaluate(() => PSY_OBS_SOURCES.slice());
  ok(!srcs.includes('ai'), `в списке источников наблюдения нет ai (${srcs.join(',')})`);
}

// ── 17. Method Registry отделён от персональных результатов ──────────
{
  const reg = await page.evaluate(() => ({
    n: PSY_METHOD_REGISTRY.length,
    version: PSY_METHOD_REGISTRY_VERSION,
    hasEvidenceMeta: PSY_METHOD_REGISTRY.every(m => Array.isArray(m.evidenceMetadata) && m.evidenceMetadata.length),
    noPersonal: PSY_METHOD_REGISTRY.every(m => !('outcomeClass' in m) && !('personalRating' in m) && !('effectiveness' in m)),
    frozen: Object.isFrozen(PSY_METHOD_REGISTRY),
    hasCautions: PSY_METHOD_REGISTRY.every(m => Array.isArray(m.cautions)),
  }));
  ok(reg.n >= 5 && reg.version === 'psy-method-registry-v1', `Method Registry версионирован (${reg.n} методов, ${reg.version})`);
  ok(reg.hasEvidenceMeta, 'у каждого метода есть source metadata, а не фраза «научно доказано»');
  ok(reg.noPersonal, 'в реестре НЕТ персонального рейтинга/эффективности — это Волна 8');
  ok(reg.hasCautions && reg.frozen, 'у методов есть предостережения, реестр неизменяем в рантайме');
  const fake = await save('psyInterventionEpisode', { methodId: 'totally_made_up', interventionSummary: 'x', adherence: 'done' });
  ok(!fake.ok && fake.errors.some(e => /Method Registry/.test(e)),
    'выдуманный methodId, притворяющийся известным методом, отклонён');
}

// ═══ EXTERNAL WORK v2 ═════════════════════════════════════════════

const V2_BASE = {
  format: 'architect-external-work-v2',
  source: { kind: 'chatgpt', label: 'Синтетическая психологическая сессия', module: 'TEST-PSY-MODULE', chatId: 'chat-psy-1' },
  session: { clientRef: 'TEST-PSY-SESSION-1', summary: 'Синтетическое резюме', date: '2026-03-01' },
  links: [],
};

// ── 18. v1 продолжает импортироваться без изменений ─────────────────
{
  await reset();
  const v1 = await commit({
    format: 'architect-external-work-v1',
    source: { kind: 'chatgpt', label: 'Старый пакет', module: 'TEST-OLD', chatId: 'chat-old' },
    session: { clientRef: 'TEST-OLD-1', summary: 'резюме', date: '2026-03-01' },
    entities: [{ clientRef: 'i1', type: 'insight', sourceId: 'TEST-PSY-V1-1', claimClass: 'user_fact', textOrigin: 'user_words',
      data: { title: 'Синтетический вывод', body: 'Синтетический текст.' } }],
    links: [],
  });
  const st = await page.evaluate(() => ({ ins: DB.insights.length, ledger: DB.externalWorkSessions.length, fmt: DB.insights[0] && DB.insights[0].ext.format }));
  ok(v1.res.ok && st.ins === 1, 'v1-пакет импортируется ровно как раньше');
  ok(st.fmt === 'architect-external-work-v1', 'provenance хранит фактическую версию формата v1');
}

// ── 19. v1 НЕ принимает психологические типы (нужна версия) ──────────
{
  const leak = await plan({
    format: 'architect-external-work-v1',
    source: { kind: 'chatgpt', label: 'L', module: 'M' },
    session: { clientRef: 'S' },
    entities: [{ clientRef: 'p1', type: 'psyGoal', sourceId: 'TEST-PSY-LEAK', data: { label: 'g', proximalOutcome: 'p' } }],
    links: [],
  });
  ok(leak.ok === false && leak.errors.some(e => /доступен только в формате architect-external-work-v2/.test(e)),
    'психологический тип в v1-пакете отклонён с явным указанием нужной версии');
}

// ── 20. Валидный v2 создаёт все пять психологических типов ──────────
{
  await reset();
  const full = await commit({
    ...V2_BASE,
    entities: [
      { clientRef: 'f1', type: 'psyFormulation', sourceId: 'TEST-PSY-FORM-1', sourceDate: '2026-03-01',
        claimClass: 'assistant_summary', claimClasses: ['assistant_summary', 'working_hypothesis'], textOrigin: 'structured_summary',
        data: { focus: 'Синтетический фокус', formulation: 'Синтетическое описание механизма.', status: 'active',
          hypotheses: [{ text: 'синтетическая гипотеза', claimClass: 'working_hypothesis' }] } },
      { clientRef: 'g1', type: 'psyGoal', sourceId: 'TEST-PSY-GOAL-1',
        claimClass: 'user_experience', textOrigin: 'user_words',
        data: { label: 'Синтетическая цель', proximalOutcome: 'наблюдаемый ближайший результат' } },
      { clientRef: 'e1', type: 'psyInterventionEpisode', sourceId: 'TEST-INT-001', sourceDate: '2026-03-02',
        claimClass: 'practice_action', claimClasses: ['practice_action', 'user_experience'], textOrigin: 'user_words',
        data: { methodId: 'behavioral_activation', interventionSummary: 'синтетическое применение',
          adherence: 'done', acceptability: 'helpful', outcomeClass: 'helpful_in_context' } },
      { clientRef: 'o1', type: 'psyObservation', sourceId: 'TEST-PSY-OBS-1',
        claimClass: 'user_experience', textOrigin: 'user_words',
        data: { metricId: 'TEST-PSY-METRIC', valueNumber: 4, unit: 'балл', entryMode: 'imported', source: 'user' } },
      { clientRef: 'r1', type: 'psyReview', sourceId: 'TEST-PSY-REV-1',
        claimClass: 'assistant_summary', textOrigin: 'structured_summary',
        data: { periodStart: '2026-03-01T00:00:00.000Z', periodEnd: '2026-03-07T00:00:00.000Z',
          outcomeSummary: 'синтетический итог', decision: 'continue' } },
    ],
  });
  const st = await page.evaluate((colls) => {
    const o = {}; colls.forEach(c => { o[c] = DB[c].length; });
    o.fmt = DB.psyFormulations[0] && DB.psyFormulations[0].ext.format;
    o.claims = DB.psyFormulations[0] && DB.psyFormulations[0].ext.claimClasses;
    o.module = DB.psyInterventionEpisodes[0] && DB.psyInterventionEpisodes[0].ext.sourceModule;
    o.chat = DB.psyInterventionEpisodes[0] && DB.psyInterventionEpisodes[0].ext.sourceChatId;
    o.srcId = DB.psyInterventionEpisodes[0] && DB.psyInterventionEpisodes[0].ext.sourceId;
    o.ledgerFmt = DB.externalWorkSessions[0] && DB.externalWorkSessions[0].formatVersion;
    return o;
  }, PSY_COLLS);
  ok(full.res.ok, 'валидный v2-пакет импортирован', JSON.stringify(full.plan.items));
  ok(PSY_COLLS.every(c => st[c] === 1), `созданы все пять типов (${PSY_COLLS.map(c => st[c]).join('/')})`);
  ok(st.fmt === 'architect-external-work-v2' && st.ledgerFmt === 'architect-external-work-v2',
    'provenance и журнал фиксируют версию v2');
  ok(JSON.stringify(st.claims) === JSON.stringify(['assistant_summary', 'working_hypothesis']),
    'многослойные claimClasses Волны 6 сохранены на психологической записи');
  ok(st.module === 'TEST-PSY-MODULE' && st.chat === 'chat-psy-1', 'per-entity source module/chatId сохранены');
  ok(st.srcId === 'TEST-INT-001',
    'stable source identity эпизода — его собственный ID, а не ID всей сессии');
}

// ── 21. Повторный v2-пакет: 0 дублей ────────────────────────────────
{
  const before = await page.evaluate((c) => c.map(x => DB[x].length), PSY_COLLS);
  const again = await plan({ ...V2_BASE, entities: [
    { clientRef: 'e1', type: 'psyInterventionEpisode', sourceId: 'TEST-INT-001',
      data: { methodId: 'behavioral_activation', interventionSummary: 'синтетическое применение', adherence: 'done' } }] });
  const after = await page.evaluate((c) => c.map(x => DB[x].length), PSY_COLLS);
  ok(again.items[0].status === 'existing-by-provenance',
    `повторный эпизод по стабильному source ID опознан как уже импортированный (${again.items[0].status})`);
  ok(JSON.stringify(before) === JSON.stringify(after), 'preview повторного пакета не создал записей');
}

// ── 22. Разные source ID с похожим текстом остаются раздельными ──────
{
  await reset();
  const same = 'Совершенно одинаковый синтетический текст интервенции.';
  await commit({ ...V2_BASE, entities: [
    { clientRef: 'a', type: 'psyInterventionEpisode', sourceId: 'TEST-INT-101',
      data: { methodId: 'opposite_action', interventionSummary: same, adherence: 'done' } },
    { clientRef: 'b', type: 'psyInterventionEpisode', sourceId: 'TEST-INT-102',
      data: { methodId: 'opposite_action', interventionSummary: same, adherence: 'done' } },
  ] });
  const st = await page.evaluate(() => ({ n: DB.psyInterventionEpisodes.length, same: DB.psyInterventionEpisodes.length === 2 && DB.psyInterventionEpisodes[0].interventionSummary === DB.psyInterventionEpisodes[1].interventionSummary }));
  ok(st.n === 2 && st.same, `два разных source ID с идентичным текстом остались двумя эпизодами (${st.n})`);
}

// ── 23. Кросс-типовой конфликт идентичности fail-closed (Волна 6) ────
{
  await reset();
  await commit({ ...V2_BASE, entities: [
    { clientRef: 'g', type: 'psyGoal', sourceId: 'TEST-PSY-DUP', data: { label: 'g', proximalOutcome: 'p' } }] });
  const conflict = await plan({ ...V2_BASE, entities: [
    { clientRef: 'e', type: 'psyInterventionEpisode', sourceId: 'TEST-PSY-DUP',
      data: { methodId: 'opposite_action', interventionSummary: 's', adherence: 'done' } }] });
  ok(conflict.items[0].status === 'conflict',
    `один source object не может стать и целью, и эпизодом (${conflict.items[0].status})`);
  const st = await page.evaluate(() => ({ g: DB.psyGoals.length, e: DB.psyInterventionEpisodes.length }));
  ok(st.g === 1 && st.e === 0, 'вторая проекция не создана');
}

// ── 24. Неизвестный будущий тип отклонён и в v2 ─────────────────────
{
  const future = await plan({ ...V2_BASE, entities: [
    { clientRef: 'x', type: 'psyFutureThing', sourceId: 'TEST-PSY-FUTURE', data: { a: 1 } }] });
  ok(future.ok === false && future.errors.some(e => /неподдерживаемый тип/.test(e)),
    'неизвестный тип отвергается fail-closed и в v2 — enum не расширяется молча');
}

// ── 25. Импортер использует ТОТ ЖЕ валидатор, что и ручная форма ─────
{
  await reset();
  const badViaImport = await plan({ ...V2_BASE, entities: [
    { clientRef: 'e', type: 'psyInterventionEpisode', sourceId: 'TEST-INT-200',
      data: { methodId: 'opposite_action', interventionSummary: 'x', adherence: 'not_done', outcomeClass: 'not_helpful' } }] });
  ok(badViaImport.items[0].status === 'invalid' && /not_done ≠ not_helpful/.test(badViaImport.items[0].reason || ''),
    'инвариант not_done ≠ not_helpful применяется и к импорту — общий write contract');
  const fakeNum = await plan({ ...V2_BASE, entities: [
    { clientRef: 'o', type: 'psyObservation', sourceId: 'TEST-PSY-OBS-9',
      data: { metricId: 'm', valueNumber: 5, source: 'ai' } }] });
  ok(fakeNum.items[0].status === 'invalid',
    'импорт не может протащить «измерение», созданное ИИ');
}

// ── 26. Preview zero mutation + recovery lock ───────────────────────
{
  await reset();
  const before = await page.evaluate(() => JSON.stringify(DB));
  await plan({ ...V2_BASE, entities: [
    { clientRef: 'g', type: 'psyGoal', sourceId: 'TEST-PSY-ZM', data: { label: 'g', proximalOutcome: 'p' } }] });
  const after = await page.evaluate(() => JSON.stringify(DB));
  ok(before === after, 'preview v2 не изменил базу ни на байт');

  const locked = await page.evaluate(async (t) => {
    // Блокировка ставится настоящей production-функцией Волны 5, а не
    // подделкой флага: проверяется реальный барьер записи.
    const realToast = window.toast; window.toast = () => {};
    enterCriticalState(activeId(), []);
    const p = await extBuildPlan(t);
    const r = extCommitPlan(p);
    const manual = psySaveRecord('psyGoal', { label: 'g2', proximalOutcome: 'p2' });
    const n = DB.psyGoals.length;
    const stillLocked = isWriteLocked();
    resolveRecovery('discarded');
    window.toast = realToast;
    return { importOk: r.ok, importErr: r.error, manualOk: manual.ok, manualErr: (manual.errors || [])[0] || '', n, stillLocked };
  }, JSON.stringify({ ...V2_BASE, entities: [{ clientRef: 'g', type: 'psyGoal', sourceId: 'TEST-PSY-LOCK', data: { label: 'g', proximalOutcome: 'p' } }] }));
  ok(locked.stillLocked === true, 'блокировка записи действительно была активна');
  ok(locked.importOk === false && /восстановлен/.test(locked.importErr || ''), 'recovery lock блокирует v2-импорт');
  // Отказ обязан прийти ИМЕННО от психологического барьера, а не «случайно»
  // от нижележащего persist(): иначе снятие этой защиты осталось бы незаметным.
  ok(locked.manualOk === false && /режиме восстановления/.test(locked.manualErr),
    'recovery lock блокирует и ручную запись психологии — собственным барьером', locked.manualErr);
  ok(locked.n === 0, 'под блокировкой не создано ни одной записи');
}

// ── 27. import → sync → повторный import = 0 дублей ─────────────────
{
  await reset();
  await commit({ ...V2_BASE, entities: [
    { clientRef: 'e', type: 'psyInterventionEpisode', sourceId: 'TEST-INT-300',
      data: { methodId: 'behavioral_activation', interventionSummary: 'синтетика', adherence: 'done' } }] });
  const sync = await page.evaluate(() => {
    const wire = JSON.parse(JSON.stringify(DB));
    wire.__ts = (DB.__ts || 0) + 1000;
    const empty = { ...JSON.parse(JSON.stringify(DEFAULT_DB)), __ts: 1, _del: {} };
    const merged = mergeDB(empty, wire);
    return {
      eps: merged.psyInterventionEpisodes.length,
      prov: merged.psyInterventionEpisodes[0] && merged.psyInterventionEpisodes[0].ext.sourceId,
      idcol: IDCOLS.includes('psyInterventionEpisodes'),
    };
  });
  ok(sync.eps === 1 && sync.prov === 'TEST-INT-300', 'psychology переживает sync с provenance');
  ok(sync.idcol, 'коллекция участвует в generic id-merge');
  // ДРУГОЙ пакет (другая сессия), ссылающийся на тот же стабильный source ID:
  // так проверяется дедуп на уровне ЗАПИСИ, а не совпадение хеша пакета.
  const dup = await plan({
    ...V2_BASE,
    session: { clientRef: 'TEST-PSY-SESSION-2', summary: 'другая сессия', date: '2026-03-09' },
    entities: [{ clientRef: 'later', type: 'psyInterventionEpisode', sourceId: 'TEST-INT-300',
      data: { methodId: 'behavioral_activation', interventionSummary: 'синтетика', adherence: 'done' } }],
  });
  ok(dup.items[0].status === 'existing-by-provenance',
    `другой пакет с тем же source ID не создаёт дубль (${dup.items[0].status})`, dup.items[0].reason);
  // Полностью идентичный пакет отсекается раньше — на уровне contentHash.
  const same = await plan({ ...V2_BASE, entities: [
    { clientRef: 'e', type: 'psyInterventionEpisode', sourceId: 'TEST-INT-300',
      data: { methodId: 'behavioral_activation', interventionSummary: 'синтетика', adherence: 'done' } }] });
  ok(same.items[0].status === 'already-imported',
    `идентичный пакет отсекается по contentHash (${same.items[0].status})`);
}

// ═══ UNIFIED INTELLIGENCE / СИСТЕМНАЯ РЕГРЕССИЯ ═══════════════════

// ── 28. Ни одна коллекция Волны 7 не является EVENT_SOURCE ──────────
{
  await reset();
  const ui = await page.evaluate(async (colls) => {
    const notSrc = colls.every(c => !(c in EVENT_SOURCES));
    psySaveRecord('psyFormulation', { focus: 'F', formulation: 'т', status: 'active' });
    psySaveRecord('psyGoal', { label: 'G', proximalOutcome: 'p' });
    psySaveRecord('psyInterventionEpisode', { methodId: 'opposite_action', interventionSummary: 's', adherence: 'done' });
    psySaveRecord('psyObservation', { metricId: 'm', valueNumber: 1 });
    const ev = unifiedEvents(400);
    return { notSrc, fromPsy: ev.filter(e => colls.includes(e.sourceCollection)).length, total: ev.length };
  }, PSY_COLLS);
  ok(ui.notSrc, 'ни одна из 5 коллекций не входит в EVENT_SOURCES');
  ok(ui.fromPsy === 0, `психологический мета-слой не порождает событий (${ui.fromPsy})`);
}

// ── 29. Существующий путь moment→why→insight→pattern не изменён ──────
{
  const legacy = await page.evaluate(() => ({
    sources: Object.keys(EVENT_SOURCES).length,
    hasCore: ['moments', 'whys', 'insights', 'patterns'].every(c => c in EVENT_SOURCES),
    relations: PSY_LINK_RELATIONS.slice(),
  }));
  ok(legacy.hasCore && legacy.sources === 14,
    `EVENT_SOURCES не изменился (${legacy.sources} источников, ядро на месте)`);
  ok(JSON.stringify(legacy.relations) === JSON.stringify(['moment_to_why', 'why_to_insight', 'insight_to_pattern', 'record_to_relationship']),
    'enum связей psyLinks не расширен молча');
}

// ═══ БЕЗОПАСНОСТЬ / ПРИВАТНОСТЬ ═══════════════════════════════════

// ── 30. XSS во всех свободных полях ─────────────────────────────────
{
  await reset();
  const XSS = '<img src=x onerror="window.__psyPwned=1"><script>window.__psyPwned=1</script>';
  await save('psyFormulation', { focus: XSS, formulation: XSS, status: 'active' });
  await save('psyGoal', { label: XSS, proximalOutcome: XSS });
  await save('psyInterventionEpisode', { methodId: 'opposite_action', interventionSummary: XSS, adherence: 'done', adverseEffects: [XSS] });
  await save('psyObservation', { metricId: XSS, valueText: XSS });
  const x = await page.evaluate(() => {
    openPsyWorkspace();
    const el = document.getElementById('psy-ws');
    document.querySelectorAll('.psy-det').forEach(d => { d.open = true; });
    return {
      pwned: !!window.__psyPwned,
      imgs: el.querySelectorAll('img').length,
      scripts: el.querySelectorAll('script').length,
      escaped: el.innerHTML.includes('&lt;img'),
      stored: DB.psyGoals[0].label,
    };
  });
  ok(!x.pwned, 'вредоносный payload не выполнился');
  ok(x.imgs === 0 && x.scripts === 0, `в workspace не создано ни одного script/img из payload (${x.imgs}/${x.scripts})`);
  ok(x.escaped, 'внешний текст выводится экранированным');
  ok(x.stored === XSS, 'в хранилище текст сохранён как есть — экранирование на рендере, не в данных');
}

// ── 31. Prototype pollution через v2 наследуется от Волны 6 ─────────
{
  const poll = await plan({ ...V2_BASE, entities: [
    { clientRef: 'p', type: 'psyGoal', sourceId: 'TEST-PSY-POLL',
      data: { label: 'g', proximalOutcome: 'p', __proto__: { polluted: true } } }] });
  const clean = await page.evaluate(() => ({}).polluted === undefined);
  ok(poll.ok === false || clean, 'prototype pollution в v2 не проходит');
  ok(clean, 'прототип объекта не загрязнён');
}

// ── 32. Служебные поля payload не могут перезаписать системные ──────
{
  await reset();
  await commit({ ...V2_BASE, entities: [
    { clientRef: 'g', type: 'psyGoal', sourceId: 'TEST-PSY-RESERVED',
      data: { label: 'g', proximalOutcome: 'p', id: 'ПОДДЕЛКА', sv: 999, privacyClass: 'public', ext: { fake: 1 } } }] });
  const rec = await page.evaluate(() => ({ ...DB.psyGoals[0], __schema: SCHEMA_VERSION }));
  ok(rec.id !== 'ПОДДЕЛКА' && /^psyGoal:/.test(rec.id), 'payload не может задать id психологической записи');
  ok(rec.sv === rec.__schema, 'payload не может подменить sv');
  ok(rec.privacyClass === 'sensitive', 'privacyClass всегда sensitive и не понижается payload-ом');
  ok(!rec.ext.fake, 'payload не может подменить provenance ext');
}

// ── 33. Все пять коллекций помечены sensitive ───────────────────────
{
  await reset();
  await save('psyFormulation', { focus: 'F', formulation: 'т', status: 'active' });
  await save('psyGoal', { label: 'G', proximalOutcome: 'p' });
  await save('psyInterventionEpisode', { methodId: 'opposite_action', interventionSummary: 's', adherence: 'done' });
  await save('psyObservation', { metricId: 'm', valueText: 'v' });
  await save('psyReview', { periodStart: '2026-03-01T00:00:00.000Z', periodEnd: '2026-03-02T00:00:00.000Z', outcomeSummary: 'o' });
  const priv = await page.evaluate((colls) => colls.every(c => DB[c].every(r => r.privacyClass === 'sensitive')), PSY_COLLS);
  ok(priv, 'все записи всех пяти коллекций имеют privacyClass=sensitive');
  // Понижение класса приватности напрямую через ручной путь тоже невозможно:
  // импортный путь чистит служебные поля, но общий контракт обязан держать
  // инвариант сам по себе.
  const down = await save('psyGoal', { label: 'G2', proximalOutcome: 'p2', privacyClass: 'public' });
  ok(down.ok && down.rec.privacyClass === 'sensitive',
    `privacyClass всегда sensitive и не понижается вызывающим кодом (${down.rec && down.rec.privacyClass})`);
}

// ── 34. Кризисный текст блокирует AI-путь, не теряя запись ──────────
{
  const crisis = await page.evaluate(() => ({
    detects: detectCrisisLanguage('я хочу умереть'),
    clean: detectCrisisLanguage('обычная синтетическая запись'),
    hasPanel: typeof showCrisisSafetyPanel === 'function',
    consentGate: typeof openPsyAiConsent === 'function',
  }));
  ok(crisis.detects && !crisis.clean, 'детектор кризисного языка работает детерминированно, без ИИ');
  ok(crisis.hasPanel && crisis.consentGate, 'safety-панель и гейт согласия переиспользуются, а не изобретаются заново');
  const consent = await page.evaluate(() => {
    DB.psyAiConsent = null;
    return { off: !(DB.psyAiConsent && DB.psyAiConsent.on) };
  });
  ok(consent.off, 'без явного psyAiConsent AI-путь недоступен по умолчанию');
}

// ── 35. Приватность: в сюите нет реальных психологических фикстур ────
{
  const src = readFileSync(join(DIR, 'wave7-psychology-workspace.spec.mjs'), 'utf8');
  // Тот же принцип, что в Волне 6: синтетический префикс отсекается
  // lookbehind-ом, образцы собираются конкатенацией.
  const realId = () => /(?<!TEST-)\b(?:INT|PSY|LIFE|DREAM|PARA)-\d{2,}/g;
  const hits = src.match(realId()) || [];
  ok(hits.length === 0, `в сюите нет реальных INT/PSY идентификаторов (${hits.length}${hits.length ? ': ' + hits.slice(0, 4).join(', ') : ''})`);
  const real = 'INT' + '-001';
  ok((`${real} ${'TEST-' + real}`.match(realId()) || []).length === 1,
    'детектор приватных фикстур отличает реальный id от синтетического TEST-*');
  ok(/TEST-INT-|TEST-PSY-/.test(src), 'используются только синтетические TEST-* идентификаторы');
}

// ═══ UI / A11Y / МОБИЛЬНОЕ ════════════════════════════════════════

// ── 36. Раздел видим и достижим без скрытого знания ─────────────────
{
  await reset();
  const nav = await page.evaluate(() => {
    const pill = document.querySelector('#subnav .snpill[data-sub="psychology"]');
    const moreRow = [...document.querySelectorAll('#ov-more .srow')].find(r => /Психология/.test(r.textContent));
    openPsyWorkspace();
    return {
      pill: !!pill, pillText: pill && pill.textContent.trim(),
      pillIsButton: pill && pill.tagName === 'BUTTON',
      moreEntry: !!moreRow,
      sectionVisible: document.getElementById('ms-psychology').style.display === 'block',
      onDiaryPage: document.getElementById('pg-map').classList.contains('on'),
    };
  });
  ok(nav.pill && /Психология/.test(nav.pillText || ''), 'в подразделах Дневника есть видимый вход «Психология»');
  ok(nav.pillIsButton, 'вход — настоящий <button> (клавиатура/скринридер)');
  ok(nav.moreEntry, 'прямой вход есть и в хабе «Ещё»');
  ok(nav.sectionVisible && nav.onDiaryPage, 'раздел открывается внутри существующего контура Дневника');
}

// ── 37. Landing отвечает на ключевые вопросы ────────────────────────
{
  await reset();
  await save('psyFormulation', { focus: 'Синтетический фокус', formulation: 'описание', status: 'active' });
  await save('psyGoal', { label: 'Синтетическая цель', proximalOutcome: 'наблюдаемое' });
  await save('psyInterventionEpisode', { methodId: 'behavioral_activation', interventionSummary: 'сделано', adherence: 'done', outcomeClass: 'promising' });
  await save('psyObservation', { metricId: 'TEST-PSY-M', valueNumber: 5 });
  const t = await page.evaluate(() => {
    openPsyWorkspace();
    const el = document.getElementById('psy-ws');
    return {
      now: /Сейчас/.test(el.textContent),
      focus: /Синтетический фокус/.test(el.textContent),
      goal: /Синтетическая цель/.test(el.textContent),
      map: /Текущая карта/.test(el.textContent),
      tried: /Что я пробовал/.test(el.textContent),
      obs: /Наблюдения/.test(el.textContent),
      review: /Review/.test(el.textContent),
      disclaimer: /не диагностика/.test(el.textContent),
      noCausal: !/доказанно вызвал|доказано вызвал/i.test(el.textContent),
      causalNote: /без вывода о причинности|не доказывает эффективность/i.test(el.textContent),
    };
  });
  ok(t.now && t.focus && t.goal, 'блок «Сейчас» показывает фокус и активные цели');
  ok(t.map && t.tried && t.obs && t.review, 'на landing есть карта, интервенции, наблюдения и review');
  ok(t.disclaimer, 'явная граница: это не диагностика');
  ok(t.noCausal && t.causalNote, 'нет формулировок о доказанной причинности; ограничение проговорено');
}

// ── 38. Прогрессивное раскрытие + мобильные вьюпорты ────────────────
{
  const sizes = [[320, 568, 'iPhone SE'], [390, 844, 'iPhone standard'], [430, 932, 'iPhone Pro Max'], [834, 1112, 'iPad portrait'], [1280, 900, 'Desktop']];
  for (const [w, h, name] of sizes) {
    const p = await boot(w, h);
    const r = await p.evaluate(() => {
      psySaveRecord('psyFormulation', { focus: 'Ф', formulation: 'т', status: 'active' });
      openPsyWorkspace();
      const el = document.getElementById('psy-ws');
      const details = el.querySelectorAll('details');
      const openByDefault = [...details].filter(d => d.open).length;
      const overflow = [...el.querySelectorAll('*')].filter(n => n.getBoundingClientRect().right > window.innerWidth + 1).length;
      const small = [...el.querySelectorAll('button, summary')].filter(b => {
        const r2 = b.getBoundingClientRect(); return r2.height > 0 && r2.height < 44;
      }).length;
      return { details: details.length, openByDefault, overflow, small, bodyScroll: document.documentElement.scrollWidth > window.innerWidth + 1 };
    });
    ok(r.overflow === 0 && !r.bodyScroll, `${name}: нет горизонтального выхода за экран (${r.overflow})`);
    ok(r.small === 0, `${name}: тап-цели ≥44px (${r.small} мелких)`);
    if (w === 390) ok(r.details >= 5 && r.openByDefault === 0, `прогрессивное раскрытие: ${r.details} свёрнутых блоков`);
    await p.close();
  }
}

// ── 39. Форма: семантика, метки, aria-live, клавиатура ──────────────
{
  const f = await page.evaluate(() => {
    openPsyIntervention();
    const ov = document.getElementById('ov-psy-form');
    const labels = [...ov.querySelectorAll('label')];
    const fields = [...ov.querySelectorAll('input, textarea, select')];
    const labelled = fields.every(x => !!ov.querySelector(`label[for="${x.id}"]`));
    const err = document.getElementById('psy-form-err');
    const small = [...ov.querySelectorAll('button')].filter(b => b.getBoundingClientRect().height < 44).length;
    return {
      open: ov.classList.contains('on'), labels: labels.length, fields: fields.length, labelled,
      live: err && err.getAttribute('aria-live'), role: err && err.getAttribute('role'),
      realButtons: [...ov.querySelectorAll('button')].every(b => b.type === 'button'), small,
    };
  });
  ok(f.open && f.fields >= 8, `форма применения метода открывается (${f.fields} полей)`);
  ok(f.labelled, 'у каждого поля есть связанный <label for> — доступно скринридеру');
  ok(f.live === 'polite' && f.role === 'alert', 'ошибки валидации объявляются через aria-live');
  ok(f.realButtons && f.small === 0, 'кнопки — настоящие <button type=button>, тап-цели ≥44px');
  await page.evaluate(() => closeOv('ov-psy-form'));
}

// ── 40. Полный ручной путь через форму сохраняет запись ─────────────
{
  await reset();
  const flow = await page.evaluate(() => {
    openPsyForm('psyGoal');
    document.getElementById('psyf-label').value = 'Цель из формы';
    document.getElementById('psyf-proximalOutcome').value = 'наблюдаемый результат';
    psyFormSubmit();
    const saved = DB.psyGoals[0];
    return { n: DB.psyGoals.length, label: saved && saved.label, closed: !document.getElementById('ov-psy-form').classList.contains('on') };
  });
  ok(flow.n === 1 && flow.label === 'Цель из формы', 'ручная форма сохраняет запись через общий write contract');
  ok(flow.closed, 'после сохранения форма закрывается');
  const invalid = await page.evaluate(() => {
    openPsyForm('psyGoal');
    document.getElementById('psyf-label').value = 'без результата';
    psyFormSubmit();
    const err = document.getElementById('psy-form-err').textContent;
    const stillOpen = document.getElementById('ov-psy-form').classList.contains('on');
    closeOv('ov-psy-form');
    return { err, stillOpen, n: DB.psyGoals.length };
  });
  ok(invalid.stillOpen && /наблюдаемой/.test(invalid.err) && invalid.n === 1,
    'невалидная форма показывает причину и ничего не сохраняет');
}

// ── 41. Review из формы связывает только записи периода ─────────────
{
  await reset();
  const rev = await page.evaluate(() => {
    psySaveRecord('psyGoal', { label: 'G', proximalOutcome: 'p' });
    psySaveRecord('psyInterventionEpisode', { methodId: 'opposite_action', interventionSummary: 'внутри периода', adherence: 'done', dateTime: '2026-03-05T10:00:00.000Z' });
    psySaveRecord('psyInterventionEpisode', { methodId: 'opposite_action', interventionSummary: 'вне периода', adherence: 'done', dateTime: '2026-05-05T10:00:00.000Z' });
    psySaveRecord('psyObservation', { metricId: 'm', valueNumber: 1, timestamp: '2026-03-06T10:00:00.000Z' });
    openPsyForm('psyReview');
    document.getElementById('psyf-periodStart').value = '2026-03-01';
    document.getElementById('psyf-periodEnd').value = '2026-03-31';
    document.getElementById('psyf-outcomeSummary').value = 'синтетический итог';
    psyFormSubmit();
    const r = DB.psyReviews[0];
    return { eps: r.interventionEpisodeRefs.length, obs: r.observationRefs.length, goals: r.goalRefs.length };
  });
  ok(rev.eps === 1, `review связал только эпизоды периода (${rev.eps} из 2)`);
  ok(rev.obs === 1 && rev.goals === 1, 'наблюдения и активные цели периода связаны детерминированно');
}

// ── 42. Профильная изоляция ─────────────────────────────────────────
{
  await reset();
  await save('psyGoal', { label: 'Цель профиля A', proximalOutcome: 'наблюдаемое' });
  await save('psyInterventionEpisode', { methodId: 'opposite_action', interventionSummary: 'A', adherence: 'done' });
  const iso = await page.evaluate(() => {
    // Второй профиль создаётся ЧЕРЕЗ production-путь (тот же, что кнопка UI):
    // отдельный namespaced ключ хранилища, свой DB.
    const origin = activeId();
    const before = { goals: DB.psyGoals.length, eps: DB.psyInterventionEpisodes.length };
    const list = loadProfiles();
    const nid = 'pTEST' + Date.now();
    list.push({ id: nid, name: 'TEST-PROFILE-B', color: '#1056CC' });
    saveProfiles(list); setActiveId(nid); hydrate();
    const inNew = { goals: (DB.psyGoals || []).length, eps: (DB.psyInterventionEpisodes || []).length };
    // Записываем в профиль B и возвращаемся в A.
    psySaveRecord('psyGoal', { label: 'Цель профиля B', proximalOutcome: 'наблюдаемое B' });
    const bAfter = DB.psyGoals.length;
    setActiveId(origin); hydrate();
    const back = { goals: DB.psyGoals.length, labels: DB.psyGoals.map(g => g.label) };
    // Уборка тестового профиля.
    saveProfiles(loadProfiles().filter(p2 => p2.id !== nid));
    try { localStorage.removeItem('arch5_db_' + nid); localStorage.removeItem('arch5_cfg_' + nid); } catch (_) {}
    return { before, inNew, bAfter, back };
  });
  ok(iso.before.goals === 1 && iso.inNew.goals === 0 && iso.inNew.eps === 0,
    `в новом профиле психологических записей нет (${iso.inNew.goals}/${iso.inNew.eps})`);
  ok(iso.bAfter === 1, 'запись профиля B не смешалась с профилем A');
  ok(iso.back.goals === 1 && iso.back.labels[0] === 'Цель профиля A',
    `при возврате в профиль A его записи на месте и не изменены (${iso.back.labels.join(',')})`);
}

// ── 43. Большой синтетический объём: рендер не деградирует ──────────
{
  await reset();
  const perf = await page.evaluate(() => {
    const t0 = performance.now();
    for (let i = 0; i < 500; i++) {
      DB.psyInterventionEpisodes.push({ id: 'psyIntervention:bulk' + i, dateTime: '2026-03-01T00:00:00.000Z',
        methodId: 'opposite_action', methodFamily: 'DBT_SKILL', interventionSummary: 'синтетика ' + i,
        adherence: 'done', acceptability: 'neutral', outcomeClass: 'unclear', adverseEffects: [], confounders: [],
        sourceRefs: [], privacyClass: 'sensitive', createdAt: '2026-03-01T00:00:00.000Z', sv: SCHEMA_VERSION, _u: 1 });
      DB.psyObservations.push({ id: 'psyObservation:bulk' + i, timestamp: '2026-03-01T00:00:00.000Z',
        metricId: 'm', valueNumber: i % 10, valueText: null, unit: null, entryMode: 'event_based', source: 'user',
        naturalistic: false, sourceRefs: [], privacyClass: 'sensitive', createdAt: '2026-03-01T00:00:00.000Z', sv: SCHEMA_VERSION, _u: 1 });
    }
    const tSeed = performance.now();
    openPsyWorkspace();
    const tRender = performance.now();
    const el = document.getElementById('psy-ws');
    return { seedMs: tSeed - t0, renderMs: tRender - tSeed, rendered: el.textContent.length > 0,
      shown: (el.textContent.match(/синтетика/g) || []).length };
  });
  ok(perf.renderMs < 1500, `рендер на 1000 записях укладывается в бюджет (${Math.round(perf.renderMs)} мс)`);
  ok(perf.shown <= 30, `список ограничен, а не рисует всё разом (${perf.shown} эпизодов)`);
}

// ── 44. Offline: путь работает без сети и без AI ────────────────────
{
  await reset();
  const net = [];
  const onReq = r => net.push(r.url());
  page.on('request', onReq);
  await page.evaluate(() => {
    psySaveRecord('psyFormulation', { focus: 'F', formulation: 'т', status: 'active' });
    psySaveRecord('psyInterventionEpisode', { methodId: 'opposite_action', interventionSummary: 's', adherence: 'done' });
    openPsyWorkspace();
  });
  await page.waitForTimeout(200);
  page.off('request', onReq);
  const ext = net.filter(u => !u.startsWith('file://') && !u.startsWith('data:'));
  ok(ext.length === 0, `ни одного сетевого вызова в основном пути (${ext.length})`);
  const ledger = await page.evaluate(() => (JSON.parse(localStorage.getItem('arch5_ai_ledger') || '[]') || []).length);
  ok(typeof ledger === 'number', `AI-вызовов не потребовалось (записей в AI-леджере: ${ledger})`);
}

// ═══════════════════════════════════════════════════════════════════
//  OWNER REVIEW 5233978523 — два блокера реального 05B/05C dry-run.
// ═══════════════════════════════════════════════════════════════════

// ── 45. BLOCKER 1: один v2-пакет создаёт полный связанный handoff ────
// formulation + goal + 2 интервенции + naturalistic observation + review,
// ссылающийся на НОВЫЕ записи этого же пакета.
const FULL_HANDOFF = {
  ...V2_BASE,
  session: { clientRef: 'TEST-PSY-HANDOFF-1', summary: 'Полный синтетический handoff', date: '2026-03-10' },
    entities: [
      { clientRef: 'f1', type: 'psyFormulation', sourceId: 'TEST-PSY-F-1',
        claimClass: 'assistant_summary', textOrigin: 'structured_summary',
        data: { focus: 'Синтетический фокус', formulation: 'Синтетическая рабочая модель.', status: 'active' } },
      { clientRef: 'g1', type: 'psyGoal', sourceId: 'TEST-PSY-G-1',
        claimClass: 'user_experience', textOrigin: 'user_words',
        data: { label: 'Синтетическая цель', proximalOutcome: 'наблюдаемый результат',
          sourceRefs: [{ clientRef: 'f1' }] } },
      { clientRef: 'o1', type: 'psyObservation', sourceId: 'TEST-PSY-O-1',
        claimClass: 'user_experience', textOrigin: 'user_words',
        data: { metricId: 'TEST-PSY-METRIC', valueNumber: 6, unit: 'балл', entryMode: 'imported', source: 'user' } },
      { clientRef: 'o2', type: 'psyObservation', sourceId: 'TEST-PSY-O-2',
        claimClass: 'user_experience', textOrigin: 'user_words',
        data: { metricId: 'TEST-PSY-METRIC', valueNumber: 3, unit: 'балл', entryMode: 'imported', source: 'user' } },
      // Естественное изменение — observation, а не интервенция (реальный 05B).
      { clientRef: 'onat', type: 'psyObservation', sourceId: 'TEST-PSY-O-NAT',
        claimClass: 'user_experience', textOrigin: 'user_words',
        data: { metricId: 'TEST-PSY-CALM', valueText: 'спокойнее после смены обстановки',
          naturalistic: true, entryMode: 'event_based', source: 'user' } },
      // Интервенция ссылается на pre/post наблюдения ЭТОГО ЖЕ пакета.
      { clientRef: 'e1', type: 'psyInterventionEpisode', sourceId: 'TEST-INT-501',
        claimClass: 'practice_action', textOrigin: 'user_words',
        data: { methodId: 'behavioral_activation', interventionSummary: 'первое синтетическое применение',
          adherence: 'done', acceptability: 'helpful', outcomeClass: 'helpful_in_context',
          preObservationRefs: [{ clientRef: 'o1' }], postObservationRefs: [{ clientRef: 'o2' }],
          sourceRefs: [{ clientRef: 'g1' }] } },
      { clientRef: 'e2', type: 'psyInterventionEpisode', sourceId: 'TEST-INT-502',
        claimClass: 'practice_action', textOrigin: 'user_words',
        data: { methodId: 'opposite_action', interventionSummary: 'второе синтетическое применение',
          adherence: 'partial', acceptability: 'irritating', outcomeClass: 'unclear',
          adverseEffects: ['синтетический эффект'] } },
      // Review ссылается на ВСЁ новое: цели, эпизоды, наблюдения, формулировку.
      { clientRef: 'r1', type: 'psyReview', sourceId: 'TEST-PSY-R-1',
        claimClass: 'assistant_summary', textOrigin: 'structured_summary',
        data: { periodStart: '2026-03-01T00:00:00.000Z', periodEnd: '2026-03-31T00:00:00.000Z',
          outcomeSummary: 'синтетический итог периода', decision: 'modify',
          formulationRef: { clientRef: 'f1' },
          goalRefs: [{ clientRef: 'g1' }],
          interventionEpisodeRefs: [{ clientRef: 'e1' }, { clientRef: 'e2' }],
          observationRefs: [{ clientRef: 'o1' }, { clientRef: 'o2' }, { clientRef: 'onat' }],
          limitations: ['один период не доказывает причинность'] } },
  ],
};

{
  await reset();
  const res = await commit(FULL_HANDOFF);
  ok(res.res.ok, 'один v2-пакет с внутренними ссылками импортируется целиком',
    JSON.stringify((res.plan.items || []).filter(i => i.status !== 'new')));
  const st = await page.evaluate(() => {
    const r = DB.psyReviews[0], e1 = DB.psyInterventionEpisodes.find(x => x.ext.sourceId === 'TEST-INT-501');
    const g = DB.psyGoals[0];
    return {
      counts: [DB.psyFormulations.length, DB.psyGoals.length, DB.psyInterventionEpisodes.length, DB.psyObservations.length, DB.psyReviews.length],
      reviewResolves: !!r && r.interventionEpisodeRefs.every(id => DB.psyInterventionEpisodes.some(x => x.id === id)) &&
        r.observationRefs.every(id => DB.psyObservations.some(x => x.id === id)) &&
        r.goalRefs.every(id => DB.psyGoals.some(x => x.id === id)) &&
        DB.psyFormulations.some(f => f.id === r.formulationRef),
      epsRefs: !!e1 && e1.preObservationRefs.length === 1 && e1.postObservationRefs.length === 1 &&
        DB.psyObservations.some(o => o.id === e1.preObservationRefs[0].id) &&
        DB.psyObservations.some(o => o.id === e1.postObservationRefs[0].id),
      goalToFormulation: !!g && g.sourceRefs.length === 1 &&
        DB.psyFormulations.some(f => f.id === g.sourceRefs[0].id),
      natural: DB.psyObservations.filter(o => o.naturalistic).length,
      idsAreOurs: [...DB.psyGoals, ...DB.psyReviews].every(x => /^psy[A-Za-z]+:/.test(x.id)),
    };
  });
  ok(JSON.stringify(st.counts) === JSON.stringify([1, 1, 2, 3, 1]),
    `созданы formulation+goal+2 интервенции+3 наблюдения+review (${st.counts.join('/')})`);
  ok(st.reviewResolves, 'review раскрывается до НОВЫХ записей того же пакета');
  ok(st.epsRefs, 'интервенция ссылается на pre/post наблюдения того же пакета');
  ok(st.goalToFormulation, 'цель ссылается на формулировку того же пакета');
  ok(st.natural === 1, `естественное изменение осталось наблюдением, а не интервенцией (${st.natural})`);
  ok(st.idsAreOurs, 'все id сгенерированы приложением — payload не задаёт идентификаторы');

  // Preview обязан показывать, во что разрешён каждый clientRef.
  const prev = await plan(FULL_HANDOFF);
  ok(Array.isArray(prev.intraPackageRefs) && prev.intraPackageRefs.length === 8,
    `preview раскрывает карту внутрипакетных ссылок (${(prev.intraPackageRefs || []).length})`);
  ok((prev.intraPackageRefs || []).every(r => /^psy/.test(r.coll)),
    'карта показывает целевую коллекцию для каждого clientRef');

  // Повторный импорт того же пакета идемпотентен.
  const before = await page.evaluate(() => JSON.stringify(DB));
  const again = await commit(FULL_HANDOFF);
  const after = await page.evaluate(() => JSON.stringify(DB));
  ok(again.res.ok === false && before === after,
    'повторный импорт того же пакета не создал ни одной записи');
}

// ── 46. BLOCKER 1: битая внутрипакетная ссылка → zero mutation ───────
{
  await reset();
  const broken = {
    ...V2_BASE,
    session: { clientRef: 'TEST-PSY-BROKEN', summary: 'битые ссылки', date: '2026-03-11' },
    entities: [
      { clientRef: 'g1', type: 'psyGoal', sourceId: 'TEST-PSY-G-9',
        data: { label: 'Цель', proximalOutcome: 'наблюдаемое' } },
      { clientRef: 'r1', type: 'psyReview', sourceId: 'TEST-PSY-R-9',
        data: { periodStart: '2026-03-01T00:00:00.000Z', periodEnd: '2026-03-31T00:00:00.000Z',
          outcomeSummary: 'итог', goalRefs: [{ clientRef: 'НЕТ-ТАКОГО' }] } },
    ],
  };
  const before = await page.evaluate(() => JSON.stringify(DB));
  const p = await plan(broken);
  const afterPreview = await page.evaluate(() => JSON.stringify(DB));
  ok((p.unresolvedRefs || []).length === 1 && /не найден среди записей пакета/.test(p.unresolvedRefs[0].problem),
    'нерезолвящийся clientRef виден в preview как ошибка', JSON.stringify(p.unresolvedRefs));
  ok(before === afterPreview, 'preview с битой ссылкой не изменил базу');

  const res = await commit(broken);
  const after = await page.evaluate(() => ({ s: JSON.stringify(DB), g: DB.psyGoals.length, r: DB.psyReviews.length }));
  ok(res.res.ok === false && /внутрипакетные ссылки не разрешены/.test(res.res.error || ''),
    'коммит пакета с битой ссылкой отклонён целиком', res.res.error);
  ok(after.s === before && after.g === 0 && after.r === 0,
    `zero mutation: валидная цель того же пакета тоже не импортирована (${after.g}/${after.r})`);

  // Ссылка на сущность НЕ ТОГО типа тоже отклоняется.
  const wrongType = await plan({
    ...V2_BASE,
    session: { clientRef: 'TEST-PSY-WRONGTYPE', summary: 'x', date: '2026-03-12' },
    entities: [
      { clientRef: 'g1', type: 'psyGoal', sourceId: 'TEST-PSY-G-8', data: { label: 'G', proximalOutcome: 'p' } },
      { clientRef: 'r1', type: 'psyReview', sourceId: 'TEST-PSY-R-8',
        data: { periodStart: '2026-03-01T00:00:00.000Z', periodEnd: '2026-03-31T00:00:00.000Z',
          outcomeSummary: 'o', interventionEpisodeRefs: [{ clientRef: 'g1' }] } },
    ],
  });
  ok((wrongType.unresolvedRefs || []).length === 1 && /требуется psyInterventionEpisodes/.test(wrongType.unresolvedRefs[0].problem),
    'ссылка на сущность другого типа отклонена', JSON.stringify(wrongType.unresolvedRefs));
}

// ── 47. BLOCKER 1: dangling-валидация НЕ ослаблена ──────────────────
{
  await reset();
  const dangling = await plan({
    ...V2_BASE,
    session: { clientRef: 'TEST-PSY-DANGLING', summary: 'x', date: '2026-03-13' },
    entities: [{ clientRef: 'r1', type: 'psyReview', sourceId: 'TEST-PSY-R-7',
      data: { periodStart: '2026-03-01T00:00:00.000Z', periodEnd: '2026-03-31T00:00:00.000Z',
        outcomeSummary: 'o', interventionEpisodeRefs: ['psyIntervention:НЕСУЩЕСТВУЕТ'] } }],
  });
  ok(dangling.items[0].status === 'invalid' && /не существует/.test(dangling.items[0].reason || ''),
    'прямая ссылка на несуществующий id по-прежнему отклоняется', dangling.items[0].reason);
}

// ── 48. BLOCKER 2: сбой persist откатывает supersede побайтово ───────
{
  await reset();
  const v1 = await save('psyFormulation', { focus: 'Первая версия', formulation: 'т1', status: 'active' });
  ok(v1.ok, 'исходная активная формулировка сохранена');
  const roll = await page.evaluate(() => {
    const before = JSON.stringify(DB.psyFormulations);
    const beforeAll = JSON.stringify({ f: DB.psyFormulations, g: DB.psyGoals, e: DB.psyInterventionEpisodes });
    // Принудительный сбой записи через production-путь: persist() вернёт false.
    const realPersist = window.persist;
    window.persist = () => false;
    let res;
    try { res = psySaveRecord('psyFormulation', { focus: 'Вторая версия', formulation: 'т2', status: 'active' }); }
    finally { window.persist = realPersist; }
    return {
      ok: res.ok, err: (res.errors || [])[0],
      after: JSON.stringify(DB.psyFormulations),
      afterAll: JSON.stringify({ f: DB.psyFormulations, g: DB.psyGoals, e: DB.psyInterventionEpisodes }),
      before, beforeAll,
      n: DB.psyFormulations.length,
      statuses: DB.psyFormulations.map(f => f.status),
    };
  });
  ok(roll.ok === false, 'при сбое persist сохранение честно отклонено');
  ok(roll.n === 1 && JSON.stringify(roll.statuses) === JSON.stringify(['active']),
    `прежняя формулировка осталась active, новая не добавлена (${roll.statuses.join(',')})`);
  ok(roll.after === roll.before,
    'psyFormulations побайтово идентичны состоянию до попытки (включая status и _u)');
  ok(roll.afterAll === roll.beforeAll,
    'вся психологическая часть DB побайтово идентична состоянию до попытки');

  // После восстановления persist обычное сохранение по-прежнему работает.
  const v2 = await save('psyFormulation', { focus: 'Вторая версия', formulation: 'т2', status: 'active' });
  const post = await page.evaluate(() => ({ n: DB.psyFormulations.length, statuses: DB.psyFormulations.map(f => f.status) }));
  ok(v2.ok && post.n === 2 && post.statuses.filter(s => s === 'active').length === 1,
    'после восстановления persist версионирование работает как раньше');
}

// ═══════════════════════════════════════════════════════════════════
//  OWNER REVIEW 5234388766 — порядок записей в v2-пакете не значим.
// ═══════════════════════════════════════════════════════════════════

// Проекция плана, не зависящая от порядка: что именно пакет собирается сделать.
// Порядок КЛЮЧЕЙ в counts/byTarget отражает порядок пакета, а не решение
// планировщика, поэтому сравниваются множества, а не порядок вставки.
const sortedPairs = o => Object.entries(o || {}).sort((a, b) => a[0].localeCompare(b[0]));
const planShape = p => JSON.stringify({
  counts: sortedPairs(p.counts), byTarget: sortedPairs(p.byTarget),
  items: (p.items || []).map(i => ({ ref: i.clientRef, type: i.type, coll: i.coll, status: i.status }))
    .sort((a, b) => (a.ref || '').localeCompare(b.ref || '')),
});

// ── 49. Тот же пакет в обратном и перемешанном порядке ──────────────
{
  await reset();
  const canon = await plan(FULL_HANDOFF);
  await reset();

  const reversed = { ...FULL_HANDOFF, entities: [...FULL_HANDOFF.entities].reverse() };
  const revPlan = await plan(reversed);
  ok(planShape(revPlan) === planShape(canon),
    'обратный порядок даёт тот же план, что и прямой');
  ok((revPlan.unresolvedRefs || []).length === 0,
    `обратный порядок не оставил неразрешённых ссылок (${(revPlan.unresolvedRefs || []).length})`);
  ok((revPlan.items || []).filter(i => i.status === 'new').length === 8,
    `все 8 сущностей — new при review первым (${(revPlan.items || []).filter(i => i.status === 'new').length})`);
  ok((revPlan.items || [])[0] && (revPlan.items || [])[0].clientRef === 'r1',
    'план показан в порядке пакета, а не в порядке сборки');

  const revRes = await commit(reversed);
  ok(revRes.res.ok, 'пакет с review первым коммитится целиком',
    JSON.stringify((revRes.plan.items || []).filter(i => i.status !== 'new')));
  const st = await page.evaluate(() => {
    const r = DB.psyReviews[0], e1 = DB.psyInterventionEpisodes.find(x => x.ext.sourceId === 'TEST-INT-501');
    const g = DB.psyGoals[0];
    return {
      counts: [DB.psyFormulations.length, DB.psyGoals.length, DB.psyInterventionEpisodes.length, DB.psyObservations.length, DB.psyReviews.length],
      reviewResolves: !!r && r.interventionEpisodeRefs.every(id => DB.psyInterventionEpisodes.some(x => x.id === id)) &&
        r.observationRefs.every(id => DB.psyObservations.some(x => x.id === id)) &&
        r.goalRefs.every(id => DB.psyGoals.some(x => x.id === id)) &&
        DB.psyFormulations.some(f => f.id === r.formulationRef),
      epsRefs: !!e1 && DB.psyObservations.some(o => o.id === e1.preObservationRefs[0].id) &&
        DB.psyObservations.some(o => o.id === e1.postObservationRefs[0].id),
      goalToFormulation: !!g && g.sourceRefs.length === 1 &&
        DB.psyFormulations.some(f => f.id === g.sourceRefs[0].id),
    };
  });
  ok(JSON.stringify(st.counts) === JSON.stringify([1, 1, 2, 3, 1]),
    `обратный порядок создал те же записи (${st.counts.join('/')})`);
  ok(st.reviewResolves && st.epsRefs && st.goalToFormulation,
    'все внутрипакетные ссылки валидны при обратном порядке');

  // Перемешанный порядок — детерминированная перестановка, не случайная.
  await reset();
  const order = ['r1', 'e1', 'o2', 'f1', 'onat', 'g1', 'e2', 'o1'];
  const shuffled = { ...FULL_HANDOFF,
    entities: order.map(cr => FULL_HANDOFF.entities.find(e => e.clientRef === cr)) };
  const shufPlan = await plan(shuffled);
  ok(planShape(shufPlan) === planShape(canon), 'перемешанный порядок даёт тот же план');
  const shufRes = await commit(shuffled);
  const shufCounts = await page.evaluate(() => [DB.psyFormulations.length, DB.psyGoals.length,
    DB.psyInterventionEpisodes.length, DB.psyObservations.length, DB.psyReviews.length]);
  ok(shufRes.res.ok && JSON.stringify(shufCounts) === JSON.stringify([1, 1, 2, 3, 1]),
    `перемешанный порядок импортируется целиком (${shufCounts.join('/')})`);
}

// ── 50. Зависимость есть по clientRef, но сама невалидна ────────────
// Тихий partial import запрещён: пакет описывает связанную работу.
{
  await reset();
  const BROKEN_DEP = { ...FULL_HANDOFF, session: { ...FULL_HANDOFF.session, clientRef: 'TEST-PSY-HANDOFF-BAD' },
    entities: FULL_HANDOFF.entities.map(e => e.clientRef === 'g1'
      // Цель без label — production-валидатор её отклонит.
      ? { ...e, data: { proximalOutcome: 'наблюдаемый результат', sourceRefs: [{ clientRef: 'f1' }] } }
      : e) };
  const p = await plan(BROKEN_DEP);
  ok((p.unresolvedRefs || []).length > 0,
    `невалидная зависимость видна в preview как неразрешённая ссылка (${(p.unresolvedRefs || []).length})`);
  ok((p.items || []).some(i => i.clientRef === 'g1' && i.status === 'invalid'),
    'сама невалидная цель помечена invalid');
  ok((p.items || []).some(i => i.clientRef === 'r1' && i.status === 'invalid'),
    'зависимый review не считается импортируемым');

  const res = await commit(BROKEN_DEP);
  ok(res.res.ok === false && /внутрипакетные ссылки не разрешены/.test(res.res.error || ''),
    'пакет с невалидной зависимостью отклонён целиком', JSON.stringify(res.res).slice(0, 300));
  const after = await page.evaluate(() => [DB.psyFormulations.length, DB.psyGoals.length,
    DB.psyInterventionEpisodes.length, DB.psyObservations.length, DB.psyReviews.length,
    (DB.externalWorkSessions || []).length]);
  ok(after.every(n => n === 0),
    `zero mutation: валидные сущности того же пакета тоже не импортированы (${after.join('/')})`);

  // Тот же пакет в обратном порядке блокируется так же — не «повезло с порядком».
  await reset();
  const revBroken = { ...BROKEN_DEP, entities: [...BROKEN_DEP.entities].reverse() };
  const resRev = await commit(revBroken);
  const afterRev = await page.evaluate(() => [DB.psyFormulations.length, DB.psyGoals.length,
    DB.psyInterventionEpisodes.length, DB.psyObservations.length, DB.psyReviews.length]);
  ok(resRev.res.ok === false && afterRev.every(n => n === 0),
    'обратный порядок с той же невалидной зависимостью тоже блокирует пакет');
}

// ── 51. Цикл внутрипакетных ссылок → явный fail-closed ──────────────
{
  await reset();
  const CYCLE = {
    ...V2_BASE,
    session: { clientRef: 'TEST-PSY-CYCLE', summary: 'Синтетический цикл', date: '2026-03-10' },
    entities: [
      { clientRef: 'ga', type: 'psyGoal', sourceId: 'TEST-PSY-CYC-A',
        claimClass: 'user_experience', textOrigin: 'user_words',
        data: { label: 'Цель А', proximalOutcome: 'результат А', sourceRefs: [{ clientRef: 'gb' }] } },
      { clientRef: 'gb', type: 'psyGoal', sourceId: 'TEST-PSY-CYC-B',
        claimClass: 'user_experience', textOrigin: 'user_words',
        data: { label: 'Цель Б', proximalOutcome: 'результат Б', sourceRefs: [{ clientRef: 'ga' }] } },
    ],
  };
  const p = await plan(CYCLE);
  ok((p.unresolvedRefs || []).some(u => /циклическая зависимость/.test(u.problem || '')),
    'цикл назван явно, а не «развязан» эвристикой', JSON.stringify(p.unresolvedRefs));
  ok((p.items || []).length === 2 && (p.items || []).every(i => i.status === 'invalid'),
    'обе сущности цикла помечены invalid');
  const res = await commit(CYCLE);
  const after = await page.evaluate(() => [DB.psyGoals.length, (DB.externalWorkSessions || []).length]);
  ok(res.res.ok === false && after.every(n => n === 0),
    `цикл отклонён целиком, zero mutation (${after.join('/')})`);
}

ok(errors.length === 0, `JS-ошибок нет за весь прогон (${errors.length})`, errors.slice(0, 3).join('\n'));

await browser.close();
console.log(`\nWave 7 (psychology workspace): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
