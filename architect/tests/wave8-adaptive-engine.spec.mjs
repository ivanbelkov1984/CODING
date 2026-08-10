// Wave 8 (issue #163) — Adaptive Psychology Engine.
//
// ВСЕ фикстуры синтетические (TEST-W8-*). Реальные психологические данные
// владельца в репозиторий не попадают ни в каком виде.
//
// Гоняет РЕАЛЬНЫЙ собранный бандл (dist/app.html) в Chromium.

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..');
const FILE = 'file://' + (process.env.WAVE8_BUNDLE || join(ROOT, 'dist', 'app.html'));
let pass = 0, fail = 0;
const errors = [];
const ok = (cond, msg, detail) => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); if (detail) console.log('      ' + String(detail).split('\n').join('\n      ')); }
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const netRequests = [];
async function boot(width = 390, height = 844) {
  const p = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
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
const W8_COLLS = ['psyAdaptivePlans', 'psyExperiments'];
const PSY_COLLS = ['psyFormulations', 'psyGoals', 'psyInterventionEpisodes', 'psyObservations', 'psyReviews'];

const reset = () => page.evaluate((colls) => {
  colls.forEach(c => { DB[c] = []; });
  DB._del = {};
  DB.psyAdaptiveSettings = JSON.parse(JSON.stringify(DEFAULT_DB.psyAdaptiveSettings));
  try { resolveRecovery('discarded'); } catch (_) {}
}, W8_COLLS.concat(PSY_COLLS, ['insights', 'whys', 'moments', 'checkins', 'externalWorkSessions']));

const save = (type, input) => page.evaluate(({ t, i }) => {
  const r = psySaveRecord(t, i);
  return { ok: r.ok, errors: r.errors, id: r.rec && r.rec.id, rec: r.rec ? JSON.parse(JSON.stringify(r.rec)) : null };
}, { t: type, i: input });

// Синтетический эпизод применения метода.
const episode = (over) => ({
  methodId: 'opposite_action', targetMechanism: 'TEST-W8-mech',
  interventionSummary: 'синтетическое применение', adherence: 'done',
  acceptability: 'neutral', outcomeClass: 'helpful_in_context', ...over,
});
const goalInput = (over) => ({ label: 'TEST-W8 цель', proximalOutcome: 'наблюдаемый шаг', ...over });
const planInput = (goalId, over) => ({
  goalId, decisionPoints: ['при появлении триггера'],
  interventionOptions: ['opposite_action', 'self_compassion_break'],
  decisionRules: [
    { id: 'r-main', if: { triggerType: 'TEST-W8-trigger', arousalMin: 4 }, then: { methodId: 'opposite_action' } },
    { id: 'r-calm', if: {}, then: { methodId: 'NO_INTERVENTION' } },
  ],
  tailoringVariables: [{ varId: 'arousal' }, { varId: 'triggerType' }],
  ...over,
});
const expInput = (over) => ({
  question: 'Помогает ли TEST-W8 практика при руминации?',
  methodId: 'self_compassion_break',
  targetOutcomeMetricIds: ['TEST-W8-METRIC'],
  designType: 'ABAB',
  conditions: ['A-обычно', 'B-практика'],
  baselinePlan: { plannedPoints: 3, rationale: 'три повторных замера отделяют фазу от шума' },
  washoutPlan: 'между фазами день без практики; перенос эффекта отмечается в ограничениях',
  stopRules: ['ухудшение два дня подряд — стоп'],
  fidelityPlan: 'после каждого применения отмечается, выполнена ли техника полностью',
  measurementSchedule: 'ежевечерний замер метрики',
  consentConfirmed: true, safetySelfReport: 'ok',
  ...over,
});
const decide = (ctx) => page.evaluate((c) => {
  const plan = (DB.psyAdaptivePlans || []).find(p => p && p.enabled) || null;
  const r = psyAdaptiveDecide(plan, c, DB);
  return JSON.parse(JSON.stringify(r));
}, ctx);
const CTX_OK = { triggerType: 'TEST-W8-trigger', mechanism: 'TEST-W8-mech', arousal: 6, selfReport: 'ok', receptivity: 'yes' };

console.log('\n── Wave 8: Adaptive Psychology Engine ──');

// ═══ 1. ДАННЫЕ / МИГРАЦИЯ ══════════════════════════════════════════
{
  const st = await page.evaluate(() => ({
    schema: SCHEMA_VERSION,
    hasPlans: Array.isArray(DB.psyAdaptivePlans), hasExps: Array.isArray(DB.psyExperiments),
    inId: ['psyAdaptivePlans', 'psyExperiments'].every(c => IDCOLS.includes(c)),
    settings: DB.psyAdaptiveSettings || DEFAULT_DB.psyAdaptiveSettings,
    scalar: SCALAR_KEYS.includes('psyAdaptiveSettings') && ('psyAdaptiveSettings' in SCALAR_REGISTRY),
  }));
  ok(st.schema === 8, `SCHEMA_VERSION = 8 (${st.schema})`);
  ok(st.hasPlans && st.hasExps && st.inId, 'psyAdaptivePlans/psyExperiments существуют и входят в IDCOLS');
  ok(st.settings.promptsEnabled === false, 'EMA prompt stream по умолчанию ВЫКЛЮЧЕН');
  ok(st.scalar, 'psyAdaptiveSettings — зарегистрированный скаляр (sync/backup генерично)');

  // Миграция аддитивна и идемпотентна: v7-профиль получает пустые коллекции.
  const mig = await page.evaluate(() => {
    const legacy = JSON.parse(JSON.stringify(DEFAULT_DB));
    delete legacy.psyAdaptivePlans; delete legacy.psyExperiments; delete legacy.psyAdaptiveSettings;
    legacy.insights = [{ id: 901, title: 'TEST-W8', body: 'x', sv: 7 }];
    const once = { ...JSON.parse(JSON.stringify(DEFAULT_DB)), ...legacy };
    migrateRecordsOn(once);
    const twice = JSON.parse(JSON.stringify(once));
    migrateRecordsOn(twice);
    return {
      plans: Array.isArray(once.psyAdaptivePlans), exps: Array.isArray(once.psyExperiments),
      kept: once.insights.length === 1 && once.insights[0].title === 'TEST-W8',
      sv: once.insights[0].sv, idempotent: JSON.stringify(once) === JSON.stringify(twice),
    };
  });
  ok(mig.plans && mig.exps && mig.kept, 'legacy-профиль получает новые коллекции, записи не тронуты');
  ok(mig.sv === 8 && mig.idempotent, `миграция проставляет sv=8 и идемпотентна (${mig.sv})`);

  const dc = await page.evaluate(() => {
    const a = dbCount({ psyAdaptivePlans: [{ id: 'x' }], psyExperiments: [] });
    const b = dbCount({ psyExperiments: [{ id: 'y' }] });
    return { a, b };
  });
  ok(dc.a === 1 && dc.b === 1, 'dbCount() считает планы и эксперименты — профиль «только Wave 8» не пуст');
}

// ═══ 2. DERIVED PROFILE (тесты 14–19) ══════════════════════════════
{
  await reset();
  // 6: плохое выполнение НЕ делает метод неэффективным.
  for (let i = 0; i < 3; i++) await save('psyInterventionEpisode', episode({ adherence: 'not_done', outcomeClass: 'unclear' }));
  let prof = await page.evaluate(() => JSON.parse(JSON.stringify(psyMethodProfiles(DB))));
  let p0 = prof.find(p => p.methodId === 'opposite_action');
  ok(p0 && p0.status === 'unclear' && p0.contexts[0].adherenceIssue,
    'невыполненная техника → unclear + «проблема выполнения», а не not_helpful');
  ok(!('confidence' in (p0 || {})) && !('score' in (p0 || {})),
    'никаких скрытых числовых confidence/score в профиле');

  // 3 позитива в одном контексте → helpful_in_context; вклад раскрыт до IDs.
  await reset();
  const ids = [];
  for (let i = 0; i < 3; i++) { const r = await save('psyInterventionEpisode', episode()); ids.push(r.id); }
  prof = await page.evaluate(() => JSON.parse(JSON.stringify(psyMethodProfiles(DB))));
  p0 = prof.find(p => p.methodId === 'opposite_action');
  ok(p0 && p0.status === 'helpful_in_context', `3 выполненных позитива в контексте → helpful_in_context (${p0 && p0.status})`);
  ok(p0 && JSON.stringify([...p0.contributingEpisodeIds].sort()) === JSON.stringify([...ids].sort()),
    'статус раскрывается до конкретных episode IDs');

  // Один позитив — максимум promising (один яркий раз ≠ доказательство).
  await reset();
  await save('psyInterventionEpisode', episode());
  prof = await page.evaluate(() => JSON.parse(JSON.stringify(psyMethodProfiles(DB))));
  p0 = prof.find(p => p.methodId === 'opposite_action');
  ok(p0 && p0.status === 'promising', `один позитивный эпизод → максимум promising (${p0 && p0.status})`);

  // 17: нежелательный эффект сохраняется и приоритетен над улучшением.
  await reset();
  await save('psyInterventionEpisode', episode({ adverseEffects: ['TEST-W8 связка: усиление тревоги'] }));
  await save('psyInterventionEpisode', episode({ adverseEffects: ['TEST-W8 связка: усиление тревоги'] }));
  prof = await page.evaluate(() => JSON.parse(JSON.stringify(psyMethodProfiles(DB))));
  p0 = prof.find(p => p.methodId === 'opposite_action');
  ok(p0 && p0.status === 'poorly_tolerated', 'adverse effects в большинстве эпизодов → poorly_tolerated несмотря на позитивный исход');
  ok(p0 && p0.contexts[0].adverseEffects.length === 1, 'сам нежелательный эффект сохранён и виден');

  // 16: immediate (outcomeClass) / proximal (post-замер) / follow-up — раздельно.
  await reset();
  const obs1 = await save('psyObservation', { metricId: 'TEST-W8-METRIC', valueNumber: 5, source: 'user' });
  const obs2 = await save('psyObservation', { metricId: 'TEST-W8-METRIC', valueNumber: 3, source: 'user' });
  await save('psyInterventionEpisode', episode({ postObservationRefs: [{ coll: 'psyObservations', id: obs1.id }], followUpRefs: [{ coll: 'psyObservations', id: obs2.id }] }));
  await save('psyInterventionEpisode', episode());
  prof = await page.evaluate(() => JSON.parse(JSON.stringify(psyMethodProfiles(DB))));
  p0 = prof.find(p => p.methodId === 'opposite_action');
  ok(p0 && p0.contexts[0].counts.withProximal === 1 && p0.contexts[0].counts.withFollowUp === 1 && p0.contexts[0].counts.evaluable === 2,
    'immediate/proximal/follow-up считаются раздельно, не сливаются в одно число');

  // 18: контексты не схлопываются; конфликт сигналов → context dependence.
  await reset();
  for (let i = 0; i < 3; i++) await save('psyInterventionEpisode', episode({ targetMechanism: 'TEST-W8-rumination' }));
  for (let i = 0; i < 2; i++) await save('psyInterventionEpisode', episode({ targetMechanism: 'TEST-W8-lowarousal', outcomeClass: 'not_helpful' }));
  prof = await page.evaluate(() => JSON.parse(JSON.stringify(psyMethodProfiles(DB))));
  p0 = prof.find(p => p.methodId === 'opposite_action');
  ok(p0 && p0.contexts.length === 2 && p0.contextDependence && p0.status === 'unclear',
    'разные контексты дают разные статусы → contextDependence, свод честно unclear');
  const ctxA = p0.contexts.find(c => c.contextKey === 'test-w8-rumination');
  const ctxB = p0.contexts.find(c => c.contextKey === 'test-w8-lowarousal');
  ok(ctxA && ctxA.status === 'helpful_in_context' && ctxB && ctxB.status === 'not_helpful',
    'по-контекстные статусы сохранены: helpful при руминации, not_helpful в другом контексте');

  // Naturalistic-наблюдение не приписывается методу.
  await reset();
  await save('psyObservation', { metricId: 'TEST-W8-NAT', valueText: 'само стало легче', naturalistic: true, source: 'user' });
  prof = await page.evaluate(() => JSON.parse(JSON.stringify(psyMethodProfiles(DB))));
  ok(prof.length === 0, 'naturalistic-наблюдение без эпизода НЕ создаёт профиль метода');

  // 15: удаление эпизода → детерминированный пересчёт + tombstone.
  await reset();
  const a = await save('psyInterventionEpisode', episode());
  const b = await save('psyInterventionEpisode', episode());
  const del = await page.evaluate((id) => {
    const r = psyDeleteRecord('psyInterventionEpisodes', id);
    return { ok: r.ok, tomb: !!DB._del[id], left: DB.psyInterventionEpisodes.length,
      prof: JSON.parse(JSON.stringify(psyMethodProfiles(DB))) };
  }, a.id);
  ok(del.ok && del.tomb && del.left === 1, 'psyDeleteRecord удаляет запись и ставит надгробие');
  const pAfter = del.prof.find(p => p.methodId === 'opposite_action');
  ok(pAfter && pAfter.nEpisodes === 1 && !pAfter.contributingEpisodeIds.includes(a.id) && pAfter.contributingEpisodeIds.includes(b.id),
    'derived-профиль пересчитан детерминированно: удалённый эпизод исчез из contributing IDs');

  // Детерминизм: один DB → байт-в-байт одинаковый профиль.
  const det = await page.evaluate(() => JSON.stringify(psyMethodProfiles(DB)) === JSON.stringify(psyMethodProfiles(DB)));
  ok(det, 'psyMethodProfiles — чистая функция: два вызова идентичны');
}

// ═══ 3. DECISION ENGINE (тесты 1–8) ════════════════════════════════
{
  await reset();
  const g = await save('psyGoal', goalInput());
  const pl = await save('psyAdaptivePlan', planInput(g.id));
  ok(pl.ok, 'адаптивный план создаётся через общий транзакционный psySaveRecord', JSON.stringify(pl.errors));
  const plr = pl.rec;
  ok(plr.safetyGateId === 'psy-safety-gate-v1' && plr.interventionOptions.includes('NO_INTERVENTION'),
    'план всегда несёт safety gate и NO_INTERVENTION среди вариантов');
  ok(plr.distalOutcome !== undefined && plr.proximalOutcome && plr.decisionPoints.length && plr.tailoringVariables.length && plr.decisionRules.length,
    'все 6 JITAI-компонентов присутствуют (distal/proximal/points/variables/options/rules)');

  // 1: детерминизм.
  const d1 = await decide(CTX_OK);
  const d2 = await decide(CTX_OK);
  ok(JSON.stringify(d1) === JSON.stringify(d2), 'одинаковые входы → байт-в-байт одинаковое решение');
  ok(d1.decision === 'offer' && d1.methodId === 'opposite_action', `правило сработало → предложен opposite_action (${d1.decision})`);

  // 8: объяснимость.
  ok(d1.explain && d1.explain.inputs.arousal === 6 && d1.explain.safety.level === 'green' &&
     d1.explain.rulesTrace.length >= 1 && d1.ruleId === 'r-main' &&
     d1.externalEvidence && d1.externalEvidence.registryVersion === 'psy-method-registry-v2',
    'объяснение содержит входы, safety, трассировку правил и метаданные метода');
  ok(d1.personalEvidence && d1.personalEvidence.insufficient === true,
    'без личных эпизодов честно указан insufficient personal evidence (7)');

  // 2: safety red → полная остановка.
  const red1 = await decide({ ...CTX_OK, selfReport: 'crisis' });
  ok(red1.decision === 'safety_stop', 'safety red (самоотчёт «кризис») → движок остановлен, обычной техники нет');
  const red2 = await decide({ ...CTX_OK, safetyText: 'не хочу жить' });
  ok(red2.decision === 'safety_stop', 'кризисная лексика → red → остановка (fail-closed)');

  // 3: receptivity.
  const nr = await decide({ ...CTX_OK, receptivity: 'no' });
  ok(nr.decision === 'no_intervention', 'нет готовности → ничего не предлагается');
  const nu = await decide({ ...CTX_OK, receptivity: null });
  ok(nu.decision === 'no_intervention', 'готовность неизвестна → ничего не предлагается (fail-closed)');

  // 4: NO_INTERVENTION — валидный вариант по правилу.
  const calm = await decide({ ...CTX_OK, triggerType: 'другое', arousal: 1 });
  ok(calm.decision === 'no_intervention' && calm.ruleId === 'r-calm', 'fallback-правило выбрало NO_INTERVENTION — это нормальный исход');

  // missing ≠ zero: правило с порогом возбуждения без замера не срабатывает.
  const noAr = await decide({ ...CTX_OK, arousal: null });
  ok(noAr.decision === 'no_intervention' && noAr.explain.rulesTrace[0].why.includes('не измерен'),
    'без замера возбуждения пороговое правило честно пропущено (missing ≠ zero)');

  // Unknown safety → amber; неамберный метод исключён, движок не падает.
  const amber = await decide({ ...CTX_OK, selfReport: null });
  ok(amber.explain.safety.level === 'amber' && amber.decision === 'no_intervention' &&
     amber.explain.exclusions.some(x => x.source === 'safety_amber'),
    'неподтверждённое состояние → amber: интенсивный метод исключён, NO_INTERVENTION');

  // 5: counterproductive в совпадающем контексте исключает метод.
  await save('psyInterventionEpisode', episode({ outcomeClass: 'counterproductive' }));
  const excl = await decide(CTX_OK);
  ok(excl.decision === 'no_intervention' &&
     excl.explain.exclusions.some(x => x.source === 'personal_profile' && x.methodId === 'opposite_action'),
    'персональный counterproductive-опыт в этом контексте исключает метод');
  // ...но в ДРУГОМ контексте метод остаётся допустимым (context dependence).
  const other = await decide({ ...CTX_OK, mechanism: 'TEST-W8-other' });
  ok(other.decision === 'offer' && other.methodId === 'opposite_action',
    'в другом контексте метод по-прежнему предлагается — исключение контекст-специфично');

  // Жёсткое «не предлагать снова».
  await page.evaluate(() => psyToggleMethodExclusion('opposite_action'));
  const hard = await decide({ ...CTX_OK, mechanism: 'TEST-W8-other' });
  ok(hard.decision === 'no_intervention' && hard.explain.exclusions.some(x => x.source === 'user_pref'),
    'жёсткое пользовательское исключение снимает метод из предложений');
  await page.evaluate(() => psyToggleMethodExclusion('opposite_action'));
  const back = await decide({ ...CTX_OK, mechanism: 'TEST-W8-other' });
  ok(back.decision === 'offer', 'исключение обратимо — метод снова предлагается');

  // amberSafe-метод допустим при amber.
  await reset();
  const g2 = await save('psyGoal', goalInput());
  await save('psyAdaptivePlan', planInput(g2.id, {
    interventionOptions: ['self_compassion_break'],
    decisionRules: [{ id: 'r-a', if: {}, then: { methodId: 'self_compassion_break' } }],
  }));
  const amberOkD = await decide({ ...CTX_OK, selfReport: 'strained' });
  ok(amberOkD.decision === 'offer' && amberOkD.methodId === 'self_compassion_break',
    'amber ограничивает интенсивность, но amber-safe метод допустим');

  // Валидация плана: висячая цель/чужой метод отклоняются.
  const badPlan = await save('psyAdaptivePlan', planInput('psyGoal:НЕСУЩЕСТВУЕТ'));
  ok(!badPlan.ok, 'план с несуществующей целью отклонён');
  const badMethod = await save('psyAdaptivePlan', planInput(g2.id, { interventionOptions: ['made_up_method'], decisionRules: [{ id: 'x', if: {}, then: { methodId: 'made_up_method' } }] }));
  ok(!badMethod.ok, 'метод вне Method Registry отклонён');
  const healthVar = await save('psyAdaptivePlan', planInput(g2.id, { tailoringVariables: [{ varId: 'symptom_signal' }] }));
  ok(!healthVar.ok && healthVar.errors.join(' ').includes('записи здоровья'),
    'health-переменная без ссылок на реальные записи здоровья отклонена');
}

// ═══ 4. EMA (тесты 9–13) ═══════════════════════════════════════════
{
  await reset();
  // 9: event-based цепочка через общий write contract.
  const ema = await save('psyObservation', {
    metricId: 'ema_episode', entryMode: 'event_based', source: 'user',
    episode: { event: 'TEST-W8 событие', emotion: 'злость', impulse: 'написать', action: 'пауза', result: 'спало' },
  });
  ok(ema.ok && ema.rec.episode && ema.rec.episode.event === 'TEST-W8 событие' && ema.rec.valueNumber === null,
    'EMA-эпизод сохраняется структурой; числа НЕ выдуманы из текста (10, 13)');
  const sch = await save('psyObservation', { metricId: 'TEST-W8-M', valueNumber: 4, entryMode: 'scheduled', source: 'user' });
  const man = await save('psyObservation', { metricId: 'TEST-W8-M', valueText: 'вручную', entryMode: 'session', source: 'user' });
  ok(sch.ok && man.ok, 'scheduled и manual capture работают тем же путём');
  const empty = await save('psyObservation', { metricId: 'TEST-W8-M', episode: {} });
  ok(!empty.ok, 'пустой эпизод не сохраняется (нет ни значения, ни содержимого)');
  const aiSrc = await save('psyObservation', { metricId: 'TEST-W8-M', valueNumber: 7, source: 'ai' });
  ok(!aiSrc.ok, 'источник «ai» для измерения по-прежнему отклонён (13)');

  // 11/12: burden и отключение.
  const burden = await page.evaluate(() => {
    DB.psyAdaptiveSettings = { ...DEFAULT_DB.psyAdaptiveSettings, promptsEnabled: true, maxPromptsPerDay: 2, promptLog: [] };
    const s1 = psyPromptState();
    psyPromptLogAction('skipped'); psyPromptLogAction('answered');
    const s2 = psyPromptState();
    DB.psyAdaptiveSettings = { ...DB.psyAdaptiveSettings, promptsEnabled: false };
    const s3 = psyPromptState();
    const skips = psyPromptBurden();
    return { s1: s1.show, s2: { show: s2.show, reason: s2.reason }, s3: { show: s3.show, reason: s3.reason }, skips };
  });
  ok(burden.s1 === true, 'включённые подсказки показываются при свободном бюджете');
  ok(burden.s2.show === false && burden.s2.reason === 'budget', 'дневной лимит подсказок соблюдается (11)');
  ok(burden.s3.show === false && burden.s3.reason === 'disabled', 'пользователь может выключить prompt stream (12)');
  ok(burden.skips.skipped === 1 && burden.skips.answered === 1, 'пропуски отслеживаются как сигнал нагрузки, но НЕ как нули');
}

// ═══ 5. N-of-1 (тесты 20–27) ═══════════════════════════════════════
{
  await reset();
  // 26: consent.
  const noCons = await save('psyExperiment', expInput({ consentConfirmed: false }));
  ok(!noCons.ok && noCons.errors.join(' ').includes('согласие'), 'без явного согласия эксперимент не создаётся (26)');
  // 20: небезопасная тема/чужой метод.
  const risky = await save('psyExperiment', expInput({ question: 'станет ли легче, если покончить с собой' }));
  ok(!risky.ok, 'кризисная тема блокирует создание эксперимента (20)');
  const notGreen = await save('psyExperiment', expInput({ safetySelfReport: 'strained' }));
  ok(!notGreen.ok && notGreen.errors.join(' ').includes('green'), 'эксперимент допустим только при safety=green');
  // 22: baseline.
  const thin = await save('psyExperiment', expInput({ baselinePlan: { plannedPoints: 2, rationale: 'мало' } }));
  ok(!thin.ok && thin.errors.join(' ').includes('≥3'), 'причинно-способный дизайн без baseline-плотности отклонён с объяснением (22)');
  // 25: washout.
  const noWash = await save('psyExperiment', expInput({ washoutPlan: '' }));
  ok(!noWash.ok && noWash.errors.join(' ').includes('washout'), 'сравнительный дизайн без washout/carryover-плана отклонён (25)');
  const noStop = await save('psyExperiment', expInput({ stopRules: [] }));
  ok(!noStop.ok, 'без stop-правила эксперимент не создаётся');

  // Валидный ABAB.
  const e1 = await save('psyExperiment', expInput());
  ok(e1.ok && e1.rec.status === 'draft' && e1.rec.consentAt, 'валидный N-of-1 создан в draft с consentAt', JSON.stringify(e1.errors));

  // 23: воспроизводимая рандомизация.
  const rnd = await page.evaluate(() => ({
    a: psyExpRandomSequence(12345, 2, 3), b: psyExpRandomSequence(12345, 2, 3), c: psyExpRandomSequence(54321, 2, 3),
  }));
  ok(JSON.stringify(rnd.a) === JSON.stringify(rnd.b), 'один seed → одна и та же последовательность условий (23)');
  ok(JSON.stringify(rnd.a) !== JSON.stringify(rnd.c) || rnd.a.length === 0, 'другой seed → другая последовательность');
  const rc = await save('psyExperiment', expInput({ designType: 'randomized_crossover', randomizationPlan: { seed: 777, cycles: 2 } }));
  ok(rc.ok && rc.rec.randomizationPlan.sequence.length === 4, 'план рандомизации хранит детерминированную последовательность');

  // 27: история immutable/versioned; переходы контролируются.
  const flow = await page.evaluate((id) => {
    const bad = psyExpTransition(id, 'completed');    // draft → completed запрещён
    const st = psyExpTransition(id, 'active', 'старт');
    const exp = DB.psyExperiments.find(e => e.id === id);
    return { badOk: bad.ok, active: exp.status, hist: exp.history.map(h => h.to) };
  }, e1.id);
  ok(!flow.badOk && flow.active === 'active' && JSON.stringify(flow.hist) === JSON.stringify(['draft', 'active']),
    'переходы только по допустимой схеме; история дописывается, не переписывается (27)');

  // 24: stop rule; завершение после стопа не даёт причинного статуса.
  const stopped = await page.evaluate((id) => {
    psyExpTransition(id, 'stopped', 'stop-правило: ухудшение');
    const done = psyExpComplete(id, 'наблюдалось ухудшение — остановлено', ['остановлен по stop-правилу']);
    const exp = DB.psyExperiments.find(e => e.id === id);
    return { doneOk: done.ok, status: exp.status, causal: exp.resultSummary && exp.resultSummary.causalStatus };
  }, e1.id);
  ok(stopped.doneOk && stopped.status === 'completed' && stopped.causal === 'not_causal',
    'stop-правило работает; после остановки итог принудительно not_causal (24)');

  // 21: observational не может дать causal.
  const obsExp = await save('psyExperiment', expInput({ designType: 'observational', conditions: [], washoutPlan: '', baselinePlan: { plannedPoints: 1, rationale: 'наблюдение' } }));
  const obsDone = await page.evaluate((id) => {
    psyExpTransition(id, 'active');
    const done = psyExpComplete(id, 'связь наблюдалась', ['наблюдательный дизайн не устанавливает причинность']);
    const exp = DB.psyExperiments.find(e => e.id === id);
    return { ok: done.ok, causal: exp.resultSummary.causalStatus };
  }, obsExp.id);
  ok(obsDone.ok && obsDone.causal === 'not_causal', 'observational-дизайн НИКОГДА не эмитит причинный статус (21)');

  // Валидный ABAB, завершённый без стопа → supported_within_design (не «доказано»).
  const e2 = await save('psyExperiment', expInput());
  const good = await page.evaluate((id) => {
    psyExpTransition(id, 'active');
    const noLims = psyExpComplete(id, 'итог', []);
    const done = psyExpComplete(id, 'по фазам B меньше руминации', ['короткие фазы', 'возможен carryover']);
    const exp = DB.psyExperiments.find(e => e.id === id);
    return { noLimsOk: noLims.ok, causal: exp.resultSummary.causalStatus, lims: exp.resultSummary.limitations.length };
  }, e2.id);
  ok(!good.noLimsOk, 'завершение без ограничений вывода отклонено — limitations рядом с результатом');
  ok(good.causal === 'supported_within_design' && good.lims === 2,
    'валидный реплицированный дизайн → максимум «поддержано в рамках дизайна», с ограничениями');

  // Детерминированный описательный разбор: missing ≠ zero.
  const viz = await page.evaluate((id) => {
    DB.psyObservations = [];
    ['A-обычно', 'A-обычно', 'B-практика'].forEach((cond, i) => {
      const r = psySaveRecord('psyObservation', { metricId: 'TEST-W8-METRIC', valueNumber: i === 2 ? 2 : 6, contextTag: cond, source: 'user' });
      if (!r.ok) throw new Error(r.errors.join());
    });
    psySaveRecord('psyObservation', { metricId: 'TEST-W8-METRIC', valueText: 'без числа', contextTag: 'B-практика', source: 'user' });
    const exp = DB.psyExperiments.find(e => e.id === id);
    return psyExpAnalysis(exp, DB);
  }, e2.id);
  const condA = viz.find(v => v.condition === 'A-обычно'), condB = viz.find(v => v.condition === 'B-практика');
  ok(condA && condA.n === 2 && condA.mean === 6 && condB && condB.n === 2 && condB.nNumeric === 1 && condB.mean === 2,
    'разбор по условиям: среднее только по введённым числам, текстовый замер не превращён в ноль');
}

// ═══ 6. СИСТЕМНОЕ КАЧЕСТВО (тесты 28–38) ═══════════════════════════
{
  // 38: Unified Intelligence не удваивает психологические мета-записи.
  const uni = await page.evaluate(async () => {
    const before = unifiedEvents(30).length;
    const g = psySaveRecord('psyGoal', { label: 'TEST-W8 uni', proximalOutcome: 'шаг' });
    psySaveRecord('psyAdaptivePlan', {
      goalId: g.rec.id, decisionPoints: ['x'], interventionOptions: ['opposite_action'],
      decisionRules: [{ if: {}, then: { methodId: 'opposite_action' } }],
    });
    psySaveRecord('psyInterventionEpisode', { methodId: 'opposite_action', interventionSummary: 'x', adherence: 'done' });
    const after = unifiedEvents(30).length;
    return { before, after,
      srcHasMeta: ['psyAdaptivePlans', 'psyExperiments', 'psyInterventionEpisodes', 'psyReviews', 'psyObservations'].some(c => c in EVENT_SOURCES) };
  });
  ok(!uni.srcHasMeta, 'ни одна психологическая мета-коллекция не входит в EVENT_SOURCES');
  ok(uni.before === uni.after, `создание плана/эпизода не добавляет unified-событий (${uni.before} → ${uni.after}) — двойного счёта нет`);

  // 29: изоляция профилей.
  await reset();
  const gg = await save('psyGoal', goalInput());
  await save('psyAdaptivePlan', planInput(gg.id));
  await save('psyExperiment', expInput());
  const iso = await page.evaluate(async () => {
    // Второй профиль — через production-путь (namespaced ключи + hydrate).
    const origin = activeId();
    const a = { plans: DB.psyAdaptivePlans.length, exps: DB.psyExperiments.length };
    const list = loadProfiles();
    const nid = 'pTESTW8' + Date.now();
    list.push({ id: nid, name: 'TEST-W8-B', color: '#1056CC' });
    saveProfiles(list); setActiveId(nid); hydrate();
    const b = { plans: (DB.psyAdaptivePlans || []).length, exps: (DB.psyExperiments || []).length,
      prof: JSON.parse(JSON.stringify(psyMethodProfiles(DB))) };
    setActiveId(origin); hydrate();
    const back = { plans: DB.psyAdaptivePlans.length, exps: DB.psyExperiments.length };
    saveProfiles(loadProfiles().filter(p2 => p2.id !== nid));
    try { localStorage.removeItem('arch5_db_' + nid); localStorage.removeItem('arch5_cfg_' + nid); } catch (_) {}
    return { a, b, back };
  });
  ok(iso.b.plans === 0 && iso.b.exps === 0 && iso.b.prof.length === 0,
    'в другом профиле планов/экспериментов/профиля методов нет (14, 29)');
  ok(iso.back.plans === iso.a.plans && iso.back.exps === iso.a.exps, 'возврат в профиль A — данные на месте');

  // Merge/sync: LWW-скаляр настроек; коллекции сливаются по id с надгробиями.
  const merged = await page.evaluate(() => {
    const local = JSON.parse(JSON.stringify(DB));
    const remote = JSON.parse(JSON.stringify(DB));
    remote.psyAdaptiveSettings = { ...remote.psyAdaptiveSettings, promptsEnabled: true, _u: Date.now() + 5000 };
    remote.__ts = Date.now() + 5000;
    const m = mergeDB(local, remote);
    const planId = local.psyAdaptivePlans[0] && local.psyAdaptivePlans[0].id;
    const del = { ...local, _del: { ...(local._del || {}), [planId]: Date.now() + 9000 }, psyAdaptivePlans: [] };
    const m2 = mergeDB(remote, del);
    return { lww: m.psyAdaptiveSettings.promptsEnabled === true,
      tombstoned: !(m2.psyAdaptivePlans || []).some(p => p && p.id === planId) };
  });
  ok(merged.lww, 'psyAdaptiveSettings сливается как LWW-документ (последний побеждает)');
  ok(merged.tombstoned, 'надгробие удалённого плана побеждает при merge — записи не воскресают (28)');

  // 33: AI consent отзываем; движок работает целиком без AI.
  const cons = await page.evaluate(() => {
    DB.psyAiConsent = { on: true, acceptedAt: nowISO(), version: 'psy-ai-consent-v1' };
    DB.psyAiConsent = { on: false, acceptedAt: null, version: 'psy-ai-consent-v1' };
    const g = (DB.psyGoals || [])[0];
    const plan = (DB.psyAdaptivePlans || [])[0];
    const d = psyAdaptiveDecide(plan, { triggerType: 'TEST-W8-trigger', mechanism: 'TEST-W8-mech', arousal: 6, selfReport: 'ok', receptivity: 'yes' }, DB);
    return { revoked: DB.psyAiConsent.on === false, decision: d.decision };
  });
  ok(cons.revoked && cons.decision === 'offer', 'AI-consent отозван, адаптивный движок полностью работает без AI (33)');

  // 35: XSS-фикстуры в EMA/professional полях не исполняются.
  await reset();
  const xss = await page.evaluate(() => {
    window.__w8xss = false;
    const r = psySaveRecord('psyObservation', {
      metricId: 'ema_episode', source: 'user',
      episode: { event: '<img src=x onerror="window.__w8xss=true">', emotion: '<scr' + 'ipt>window.__w8xss=true</scr' + 'ipt>' },
      contextTag: '"onmouseover="window.__w8xss=true',
    });
    goTo('map'); if (typeof openPsyWorkspace === 'function') openPsyWorkspace(); else rPsyWorkspace();
    const el = document.getElementById('psy-ws');
    const opened = el.querySelectorAll('details'); opened.forEach(d => { d.open = true; });
    return { saved: r.ok, fired: window.__w8xss, hasImg: !!el.querySelector('img[src="x"]'), html: el.innerHTML.includes('&lt;img') || el.innerHTML.includes('&lt;script') };
  });
  await page.waitForTimeout(150);
  const xssFired = await page.evaluate(() => window.__w8xss);
  ok(xss.saved && !xssFired && !xss.hasImg, 'инъекция в EMA-полях не исполняется — только текст (35)');

  // 34: приватный текст не утекает в console/AI-леджер.
  const leak = await page.evaluate(() => {
    const led = JSON.parse(localStorage.getItem('arch5_ai_ledger') || '[]');
    return { ai: led.length };
  });
  ok(leak.ai === 0, 'AI-леджер пуст: приватный контент не отправлялся никуда (34)');

  // 32: offline — весь adaptive-путь без сети (собирается в конце по route-перехвату).

  // 36: a11y/тап-цели/лейблы на новых экранах.
  await reset();
  const g3 = await save('psyGoal', goalInput());
  await save('psyAdaptivePlan', planInput(g3.id));
  await save('psyInterventionEpisode', episode());
  await save('psyExperiment', expInput());
  await page.evaluate(() => { goTo('map'); if (typeof openPsyWorkspace === 'function') openPsyWorkspace(); else rPsyWorkspace(); });
  await page.waitForTimeout(150);
  const a11y = await page.evaluate(() => {
    const ws = document.getElementById('psy-ws');
    ws.querySelectorAll('details').forEach(d => { d.open = true; });
    const btns = [...ws.querySelectorAll('button')];
    const small = btns.filter(b => { const r = b.getBoundingClientRect(); return r.height > 0 && r.height < 44; });
    const badType = btns.filter(b => b.getAttribute('type') !== 'button');
    const dec = document.getElementById('psy-adaptive-decision');
    const selects = [...ws.querySelectorAll('select, input[type="text"]')];
    const noLabel = selects.filter(el => el.id && !ws.querySelector(`label[for="${el.id}"]`));
    const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
    return { total: btns.length, small: small.length, badType: badType.length,
      live: dec ? dec.getAttribute('aria-live') : null, noLabel: noLabel.length, overflow };
  });
  ok(a11y.small === 0 && a11y.badType === 0, `все ${a11y.total} кнопок — настоящие button ≥44px (мелких: ${a11y.small})`);
  ok(a11y.live === 'polite', 'решение движка объявляется через aria-live');
  ok(a11y.noLabel === 0 && !a11y.overflow, 'у полей контекста есть label, горизонтального переполнения нет (390px)');

  // UI-поток: предложение → «Сделать» → форма эпизода с предзаполненным методом.
  const flowUi = await page.evaluate(() => {
    document.getElementById('psy-ctx-trigger').value = 'TEST-W8-trigger';
    psyUiCtxText('triggerType', 'TEST-W8-trigger');
    psyUiCtxSet('arousal', '6'); psyUiCtxSet('selfReport', 'ok'); psyUiCtxSet('receptivity', 'yes');
    const dec = document.getElementById('psy-adaptive-decision');
    const offered = dec.innerHTML.includes('Сделать');
    psyUiAcceptOffer();
    const form = document.getElementById('ov-psy-form').classList.contains('on');
    const method = (document.getElementById('psyf-methodId') || {}).value;
    closeOv('ov-psy-form');
    return { offered, form, method };
  });
  ok(flowUi.offered && flowUi.form && flowUi.method === 'opposite_action',
    '«Сейчас»: предложение → «Сделать» открывает форму эпизода с методом из решения');

  // «Что помогает мне» разделяет слои и раскрывает вклад.
  const helps = await page.evaluate(() => {
    const el = document.getElementById('psy-helps-me');
    return { ext: el.innerHTML.includes('Внешняя база'), mine: el.innerHTML.includes('Мои данные'),
      why: el.innerHTML.includes('вклад эпизодов'), pct: /\d+\s?%/.test(el.textContent) };
  });
  ok(helps.ext && helps.mine && helps.why && !helps.pct,
    '«Что помогает мне»: внешний слой и личный слой раздельно, вклад раскрыт, никакой «эффективности N%»');

  // 37: производительность на большой синтетической истории.
  const perf = await page.evaluate(() => {
    DB.psyInterventionEpisodes = [];
    const mech = ['m1', 'm2', 'm3'];
    for (let i = 0; i < 300; i++) {
      DB.psyInterventionEpisodes.push({
        id: 'psyIntervention:perf' + i, dateTime: nowISO(), methodId: i % 2 ? 'opposite_action' : 'values_clarification',
        methodFamily: 'DBT_SKILL', targetMechanism: mech[i % 3], interventionSummary: 's', adherence: 'done',
        acceptability: 'neutral', adverseEffects: [], confounders: [], outcomeClass: 'helpful_in_context',
        preObservationRefs: [], postObservationRefs: [], followUpRefs: [], sourceRefs: [],
        createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now(), privacyClass: 'sensitive',
      });
    }
    const t0 = performance.now();
    psyMethodProfiles(DB);
    rPsyWorkspace();
    return Math.round(performance.now() - t0);
  });
  ok(perf < 300, `профиль + рендер на 300 эпизодах за ${perf} мс (< 300)`);
}

// 32: за весь прогон adaptive-путь не сделал ни одного сетевого запроса
// (кроме известного health-probe синка при загрузке страницы — вне Wave 8).
const nonBoot = netRequests.filter(u => !u.includes('/health'));
ok(nonBoot.length === 0, `ни одного сетевого вызова в adaptive/EMA/N-of-1 пути (${nonBoot.length})`, nonBoot.slice(0, 3).join('\n'));

ok(errors.length === 0, `JS-ошибок нет за весь прогон (${errors.length})`, errors.slice(0, 3).join('\n'));

await browser.close();
console.log(`\nWave 8 (adaptive engine): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
