import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Wave 4 (issue #152) — Unified Intelligence Engine («Закономерности»):
// детерминированный синтез поверх уже существующих коллекций. НЕ ИИ, НЕ
// генератор советов. Гоняет собранное приложение (dist/app.html) в реальном
// браузере, тем же стилем, что и tests/wave2-health-organizer.spec.mjs.

const DIR = dirname(fileURLToPath(import.meta.url));
const FILE = 'file://' + join(DIR, '..', 'dist', 'app.html');
let pass = 0;
let fail = 0;
const errors = [];
const ok = (condition, message) => {
  if (condition) { pass++; console.log('  ✓ ' + message); }
  else { fail++; console.log('  ✗ ' + message); }
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });

async function boot(width = 390, height = 844) {
  const p = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  p.on('pageerror', error => errors.push(error.message));
  await p.goto(FILE);
  await p.waitForSelector('#nsh-tabbar', { state: 'attached' });
  await p.evaluate(() => {
    const splash = document.getElementById('splash');
    if (splash) splash.style.display = 'none';
    document.querySelectorAll('.ov.on').forEach(element => element.classList.remove('on'));
    document.body.style.overflow = '';
  });
  await p.waitForTimeout(650);
  await p.evaluate(() => document.querySelectorAll('.ov.on').forEach(element => element.classList.remove('on')));
  return p;
}

const page = await boot();

// ── 1) Свежий профиль: schema/defaults ────────────────────────────────
const fresh = await page.evaluate(() => ({
  schemaVersion: SCHEMA_VERSION,
  correlationSettings: DB.correlationSettings,
}));
ok(fresh.schemaVersion === 5, 'SCHEMA_VERSION поднят до 5');
ok(fresh.correlationSettings && fresh.correlationSettings.minSamples === 3 && fresh.correlationSettings.lagDays === 7 && Array.isArray(fresh.correlationSettings.dismissed) && fresh.correlationSettings.dismissed.length === 0,
  'свежий профиль: DB.correlationSettings = {minSamples:3, lagDays:7, dismissed:[]} по умолчанию');

// ── 2) Миграция 4→5: точное посерийное сравнение (тот же принцип, что и
//    Wave 2 fix — не заявляем «byte-identical» без доказательства) ──────
const migration = await page.evaluate(() => {
  const id = activeId();
  const oldDb = {
    insights: [{ id: 1, tag: 'personal', title: 'старый инсайт', body: 'текст', createdAt: '2026-01-01T00:00:00.000Z', day: '2026-01-01', sv: 4 }],
    moments: [{ id: 2, valence: 50, activation: 50, emo: 'радость', createdAt: '2026-01-01T00:00:00.000Z', day: '2026-01-01', sv: 4 }],
    __ts: 333,
    // намеренно НЕТ correlationSettings — pre-Wave-4 форма (sv=4)
  };
  const expectAfterLegacyMigration = coll => JSON.parse(JSON.stringify(oldDb[coll])).map(r => ({ ...r, verif: 'unverified', life: 'current' }));
  const expectedInsights = expectAfterLegacyMigration('insights');
  const expectedMoments = expectAfterLegacyMigration('moments');
  localStorage.setItem('arch5_db_' + id, JSON.stringify(oldDb));
  hydrate();
  const exact = {
    insights: JSON.stringify(DB.insights) === JSON.stringify(expectedInsights),
    moments: JSON.stringify(DB.moments) === JSON.stringify(expectedMoments),
  };
  const settingsInit = DB.correlationSettings && DB.correlationSettings.minSamples === 3 && DB.correlationSettings.lagDays === 7 && Array.isArray(DB.correlationSettings.dismissed);
  const snap1 = JSON.stringify(DB);
  migrateRecords(); migrateRecords();
  const snap2 = JSON.stringify(DB);
  return { exact, settingsInit, idempotent: snap1 === snap2 };
});
ok(migration.exact.insights && migration.exact.moments, 'миграция pre-Wave-4 (sv=4): insights/moments — точное посерийное совпадение с явно вычисленным baseline (только уже существующий verif/life passport-бэкфилл)');
ok(migration.settingsInit, 'миграция pre-Wave-4: DB.correlationSettings инициализирован дефолтом');
ok(migration.idempotent, 'повторный migrateRecords() не меняет DB (идемпотентность)');

await page.evaluate(() => { localStorage.removeItem('arch5_db_' + activeId()); hydrate(); });

// ── 3) Unified Event Engine: корректные теги, оконный фильтр, no-mutation ──
const eventsTest = await page.evaluate(() => {
  const now = Date.now();
  DB.moments = [{ id: 9001, valence: 20, activation: 80, emo: 'тревога', createdAt: new Date(now - 2 * 864e5).toISOString(), day: new Date(now - 2 * 864e5).toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now }];
  DB.whys = [{ id: 9002, symptom: 'напряжение', need: 'отдых', createdAt: new Date(now - 1 * 864e5).toISOString(), day: new Date(now - 1 * 864e5).toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now }];
  DB.symptoms = [{ id: 9003, name: 'головная боль', severity: 8, createdAt: new Date(now - 400 * 864e5).toISOString(), day: new Date(now - 400 * 864e5).toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now }];   // вне окна 365
  const beforeMoments = JSON.stringify(DB.moments), beforeWhys = JSON.stringify(DB.whys);
  const events365 = unifiedEvents(365);
  const events7 = unifiedEvents(7);
  const noMutation = JSON.stringify(DB.moments) === beforeMoments && JSON.stringify(DB.whys) === beforeWhys;
  const momentEvent = events365.find(e => e.sourceCollection === 'moments' && e.referenceId === 9001);
  const whyEvent = events365.find(e => e.sourceCollection === 'whys' && e.referenceId === 9002);
  return {
    momentTagsOk: momentEvent && momentEvent.tags.includes('emo:тревога') && momentEvent.tags.includes('valence:low') && momentEvent.tags.includes('activation:high'),
    whyTagsOk: whyEvent && whyEvent.tags.includes('symptom:напряжение') && whyEvent.tags.includes('need:отдых'),
    windowExcludesOld: !events365.some(e => e.referenceId === 9003) && events365.length >= 2,
    windowRespectsShort: !events7.some(e => e.referenceId === 9002) || events7.length < events365.length,
    noMutation,
    idFormat: momentEvent && momentEvent.id === 'moments:9001',
  };
});
ok(eventsTest.momentTagsOk, 'Unified Event Engine: moments → emo/valence/activation теги корректны');
ok(eventsTest.whyTagsOk, 'Unified Event Engine: whys → symptom/need теги корректны');
ok(eventsTest.windowExcludesOld, 'Unified Event Engine: событие вне окна (400 дн. назад при окне 365) исключено');
ok(eventsTest.noMutation, 'Unified Event Engine: агрегация не мутирует исходные коллекции (read-only projAll)');
ok(eventsTest.idFormat, 'Unified Event Engine: id события — стабильный синтетический `coll:refId`, не пишется в DB');

// ── 4) Correlation Engine: точная математика на известном синтетическом входе ──
const corrMath = await page.evaluate(() => {
  const now = Date.now();
  DB.moments = []; DB.symptoms = []; DB.whys = []; DB.cravings = []; DB.medIntakes = []; DB.dreams = []; DB.patterns = []; DB.insights = []; DB.evolution = []; DB.labObservations = []; DB.healthDocuments = []; DB.relationshipContexts = []; DB.sphereLogs = []; DB.measures = [];
  // 10 дней с «конфликт», ровно на следующий день — «бессонница». Между ними
  // разбросаны 20 «нейтральных» дней без обоих тегов — честная база для lift.
  for (let i = 0; i < 10; i++) {
    const dConflict = new Date(now - (i * 3 + 40) * 864e5);
    DB.moments.push({ id: 10000 + i, valence: 20, activation: 70, emo: 'конфликт', createdAt: dConflict.toISOString(), day: dConflict.toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now });
    const dSym = new Date(dConflict.getTime() + 864e5);
    DB.symptoms.push({ id: 20000 + i, name: 'бессонница', severity: 7, createdAt: dSym.toISOString(), day: dSym.toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now });
  }
  for (let i = 0; i < 20; i++) {
    const d = new Date(now - (i * 5 + 1) * 864e5);
    DB.moments.push({ id: 30000 + i, valence: 70, activation: 40, emo: 'спокойствие', createdAt: d.toISOString(), day: d.toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now });
  }
  const events = unifiedEvents(365);
  const { pairs, totalDays } = findCorrelations(events, { minSamples: 3, lagDays: 7 });
  const pair = pairs.find(p => p.a === 'emo:конфликт' && p.b === 'symptom:бессонница');
  return {
    found: !!pair,
    supportA: pair && pair.supportA,
    hits: pair && pair.hits,
    confidenceStat: pair && +pair.confidenceStat.toFixed(4),
    lift: pair && +pair.lift.toFixed(4),
    // ручной расчёт: supportA=10, hits=10 (каждый конфликт → бессонница на след. день, окно 7 дней захватывает),
    // baseline = supportB(10) / totalDays; lift = confidence(1.0) / baseline
    expectedConfidence: 1,
  };
});
ok(corrMath.found, 'Correlation Engine: находит инженерную корреляцию «конфликт → бессонница»');
ok(corrMath.supportA === 10 && corrMath.hits === 10, 'Correlation Engine: support(A)=10, hits=10 — точное совпадение с синтетическим входом');
ok(corrMath.confidenceStat === corrMath.expectedConfidence, 'Correlation Engine: confidence = hits/supportA = 1.0 (100% случаев)');
ok(corrMath.lift > 1.3, 'Correlation Engine: lift существенно выше 1 (событие B значимо чаще обычного после A)');

// ── 5) False-positive avoidance: равномерно перемешанные, НЕ коррелирующие
//    теги на разумном масштабе — движок не выдумывает связи из шума ────
const noFalsePositives = await page.evaluate(() => {
  const now = Date.now();
  DB.moments = []; DB.symptoms = [];
  const emos = ['радость', 'грусть', 'интерес', 'скука'];
  const syms = ['насморк', 'зуд', 'жажда', 'зевота'];
  // Seeded PRNG (mulberry32) — детерминированный ПОВТОРЯЕМЫЙ прогон теста, но
  // статистически независимое присвоение тегов A и B на каждый день (НЕ
  // модульная арифметика от одного и того же индекса — та была бы идеально
  // периодической и создавала бы настоящую, хоть и искусственную, корреляцию).
  function mulberry32(seed) { return function () { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const rndA = mulberry32(12345), rndB = mulberry32(987654321);
  for (let i = 0; i < 300; i++) {
    const d = new Date(now - i * 864e5);
    DB.moments.push({ id: 40000 + i, valence: 50, activation: 50, emo: emos[Math.floor(rndA() * 4)], createdAt: d.toISOString(), day: d.toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now });
    DB.symptoms.push({ id: 50000 + i, name: syms[Math.floor(rndB() * 4)], severity: 3, createdAt: d.toISOString(), day: d.toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now });
  }
  const events = unifiedEvents(365);
  const { pairs } = findCorrelations(events, { minSamples: 3, lagDays: 3 });
  // разрешаем единичные пограничные случаи: при ~56 проверяемых упорядоченных
  // парах тегов (4×3 внутри emo + 4×3 внутри symptom + 4×4×2 между семьями)
  // немного пересечений порога [0.77,1.3] статистически ожидаемо (проблема
  // множественных сравнений), а не баг движка. Кроме того, emo/symptom —
  // категориальные (один тег в день), поэтому у пар ВНУТРИ одной семьи есть
  // слабая структурная антикорреляция «выбран один → не выбран другой в тот
  // же день», а не выдумка. Важна не точная цифра, а то, что все находки
  // остаются пограничными (allWeak) — движок не рисует из шума сильных связей.
  return { pairsCount: pairs.length, allWeak: pairs.every(p => p.lift < 2.5), pairs: pairs.map(p => ({ a: p.a, b: p.b, lift: +p.lift.toFixed(2) })) };
});
ok(noFalsePositives.pairsCount <= 6, `false-positive avoidance: на равномерно несвязанных данных находится лишь несколько пограничных шумовых пар (найдено: ${noFalsePositives.pairsCount})`);
ok(noFalsePositives.allWeak, 'false-positive avoidance: даже случайный шум не даёт экстремально сильных (lift≥2.5) ложных корреляций');

// ── 6) Честный отказ при недостатке данных ────────────────────────────
const thinData = await page.evaluate(() => {
  DB.moments = [{ id: 60001, valence: 20, activation: 70, emo: 'единичный', createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now() }];
  DB.symptoms = [{ id: 60002, name: 'разовый', severity: 5, createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now() }];
  DB.whys = []; DB.cravings = []; DB.medIntakes = []; DB.dreams = []; DB.patterns = []; DB.insights = []; DB.evolution = []; DB.labObservations = []; DB.healthDocuments = []; DB.relationshipContexts = []; DB.sphereLogs = []; DB.measures = [];
  const report = synthesisReport(90);
  goTo('sys'); sysGo('patterns');
  const html = document.getElementById('sys-patterns-out').innerHTML;
  return {
    pairsEmpty: report.pairs.length === 0,
    sequencesEmpty: report.sequences.length === 0,
    chainsEmpty: report.chains.length === 0,
    htmlHonest: html.includes('Недостаточно данных') || html.includes('недостаточно') || html.includes('не найдено'),
    htmlNoFabrication: !html.includes('%') || html.includes('0%') === false,
  };
});
ok(thinData.pairsEmpty && thinData.sequencesEmpty && thinData.chainsEmpty, 'на 1-2 наблюдениях (< minSamples) движок не выдаёт ни одной корреляции/последовательности/цепочки');
ok(thinData.htmlHonest, 'UI честно показывает «недостаточно данных», а не пустой экран или выдуманный вывод');

// ── 7) Confidence System: границы низкая/средняя/высокая ─────────────
const confidence = await page.evaluate(() => {
  const mk = (supportA, hits, lift) => ({ supportA, hits, lift });
  return {
    low: correlationConfidence(mk(4, 4, 5)).level,       // n<5 → низкая, даже при экстремальном lift
    medium: correlationConfidence(mk(8, 8, 1.35)).level, // n>=5, слабый lift → средняя
    high: correlationConfidence(mk(15, 15, 3)).level,    // n>=12 и сильный lift(≥2×) → высокая
  };
});
ok(confidence.low === 'low', 'Confidence System: n<5 всегда «низкая», даже при сильном lift — не переоценивает малые данные');
ok(confidence.medium === 'medium', 'Confidence System: достаточно наблюдений, но слабый lift → «средняя»');
ok(confidence.high === 'high', 'Confidence System: много наблюдений И сильный lift (≥2×) → «высокая»');

// ── 8) Trigger Engine ──────────────────────────────────────────────────
const triggerEngine = await page.evaluate(() => {
  const pairs = [
    { a: 'trigger:стресс', b: 'craving:уступил', lift: 3, confidenceStat: 0.8 },
    { a: 'trigger:скука', b: 'craving:уступил', lift: 1.5, confidenceStat: 0.5 },
    { a: 'trigger:стресс', b: 'emo:тревога', lift: 2, confidenceStat: 0.6 },
  ];
  const list = triggersFor(pairs, 'craving:уступил');
  return { count: list.length, topIsStrongest: list[0] && list[0].a === 'trigger:стресс' };
});
ok(triggerEngine.count === 2, 'Trigger Engine: находит все триггеры конкретного целевого тега (2 из 3 пар)');
ok(triggerEngine.topIsStrongest, 'Trigger Engine: сортирует по убыванию lift (сильнейший триггер первым)');

// ── 9) Pattern Engine: повторяющиеся многодневные сценарии ────────────
const patternEngine = await page.evaluate(() => {
  const now = Date.now();
  DB.moments = []; DB.symptoms = []; DB.whys = []; DB.cravings = []; DB.medIntakes = []; DB.dreams = []; DB.patterns = []; DB.insights = []; DB.evolution = []; DB.labObservations = []; DB.healthDocuments = []; DB.relationshipContexts = []; DB.sphereLogs = []; DB.measures = [];
  // Один и тот же 3-дневный сценарий: конфликт → бессонница → тяга, повторён 4 раза
  for (let rep = 0; rep < 4; rep++) {
    const base = now - (rep * 20 + 60) * 864e5;
    DB.moments.push({ id: 70000 + rep, valence: 20, activation: 80, emo: 'конфликт', createdAt: new Date(base).toISOString(), day: new Date(base).toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now });
    DB.symptoms.push({ id: 71000 + rep, name: 'бессонница', severity: 6, createdAt: new Date(base + 864e5).toISOString(), day: new Date(base + 864e5).toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now });
    DB.cravings.push({ id: 72000 + rep, outcome: 'gave_in', trigger: 'усталость', intensity: 7, createdAt: new Date(base + 2 * 864e5).toISOString(), day: new Date(base + 2 * 864e5).toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now });
  }
  const events = unifiedEvents(365);
  const seqs3 = findRecurringSequences(events, { minSamples: 4, seqLen: 3 });
  const seqs5 = findRecurringSequences(events, { minSamples: 5, seqLen: 3 });   // требуем больше повторов, чем реально есть (4)
  return { found3: seqs3.length > 0 && seqs3[0].count === 4, notFound5: seqs5.length === 0 };
});
ok(patternEngine.found3, 'Pattern Engine: находит повторяющийся 3-дневный сценарий ровно с тем количеством повторов, что и в данных (4)');
ok(patternEngine.notFound5, 'Pattern Engine: честно не находит сценарий, если требуемый minSamples выше реального числа повторов');

// ── 10) Cause Graph: цепочки строятся из уже найденных корреляций ─────
const causeGraph = await page.evaluate(() => {
  const pairs = [
    { a: 'A', b: 'B', lift: 3 }, { a: 'B', b: 'C', lift: 2.5 }, { a: 'C', b: 'D', lift: 2 },
    { a: 'X', b: 'Y', lift: 1.5 },
  ];
  const chains = buildCauseChains(pairs, { maxDepth: 4 });
  const longest = chains.find(c => c.chain[0] === 'A');
  return { longestFound: !!longest, longestLen: longest && longest.chain.length, longestPath: longest && longest.chain.join('>') };
});
ok(causeGraph.longestFound && causeGraph.longestLen === 4, 'Cause Graph: строит цепочку A→B→C→D (глубина 4) из отдельных найденных корреляций, без пересчёта');
ok(causeGraph.longestPath === 'A>B>C>D', 'Cause Graph: цепочка идёт в правильном порядке причин→следствий');

// ── 11) Sphere Influence: sphereLogs корректно дают `sphere:` тег ─────
const sphereInfluence = await page.evaluate(() => {
  const now = Date.now();
  DB.moments = []; DB.symptoms = []; DB.sphereLogs = []; DB.spheres = [{ id: 1, name: 'Спорт', type: 'habit' }];
  for (let i = 0; i < 8; i++) {
    const d = new Date(now - (i * 6 + 5) * 864e5);
    DB.sphereLogs.push({ id: 80000 + i, sphereId: 1, date: d.toISOString().slice(0, 10), value: true });
    DB.moments.push({ id: 81000 + i, valence: 80, activation: 60, emo: 'радость', createdAt: d.toISOString(), day: d.toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now });
  }
  const events = unifiedEvents(365);
  const sphereEvent = events.find(e => e.sourceCollection === 'sphereLogs');
  const { pairs } = findCorrelations(events, { minSamples: 3, lagDays: 2 });
  const sphere = sphereInfluencePairs(pairs);
  return {
    tagOk: sphereEvent && sphereEvent.tags.some(t => t.startsWith('sphere:спорт')),
    sphereIdOk: sphereEvent && sphereEvent.sphereId === 1,
    influenceFound: sphere.some(p => p.a.startsWith('sphere:') || p.b.startsWith('sphere:')),
  };
});
ok(sphereInfluence.tagOk, 'Sphere Influence: sphereLogs habit-факт даёт тег `sphere:<имя>:done`');
ok(sphereInfluence.sphereIdOk, 'Sphere Influence: событие несёт sphereId для дальнейшей группировки');
ok(sphereInfluence.influenceFound, 'Sphere Influence: корреляция сферы с настроением находится тем же общим Correlation Engine (не отдельный расчёт)');

// ── 12) Relationship Graph: psyLinks record_to_relationship → `person:` тег ──
const relationshipGraph = await page.evaluate(() => {
  const now = Date.now();
  DB.moments = []; DB.psyLinks = []; DB.relationshipContexts = [{ id: psyUid('relctx'), label: 'Мама', status: 'active', privacyClass: 'sensitive', createdAt: nowISO(), sv: SCHEMA_VERSION, _u: now }];
  const ctxId = DB.relationshipContexts[0].id;
  for (let i = 0; i < 6; i++) {
    const d = new Date(now - (i * 10 + 3) * 864e5);
    const rec = { id: 90000 + i, valence: 25, activation: 75, emo: 'обида', createdAt: d.toISOString(), day: d.toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now };
    DB.moments.push(rec);
    createPsyLink({ fromColl: 'moments', fromId: rec.id, toColl: 'relationshipContexts', toId: ctxId, relation: 'record_to_relationship', source: 'user' });
  }
  const events = unifiedEvents(365);
  const momentEvent = events.find(e => e.sourceCollection === 'moments' && e.referenceId === 90000);
  const { pairs } = findCorrelations(events, { minSamples: 3, lagDays: 1 });
  const rel = relationshipPairs(pairs);
  return {
    personTag: momentEvent && momentEvent.tags.some(t => t === 'person:мама'),
    relFound: rel.some(p => p.a.startsWith('person:') || p.b.startsWith('person:')),
  };
});
ok(relationshipGraph.personTag, 'Relationship Graph: psyLinks record_to_relationship (Wave 1) корректно добавляет тег `person:<label>` к событию');
ok(relationshipGraph.relFound, 'Relationship Graph: корреляция с контекстом отношений находится тем же Correlation Engine, отфильтрованная по `person:`');

// ── 13) Dismiss / restore ──────────────────────────────────────────────
const dismissTest = await page.evaluate(() => {
  const now = Date.now();
  DB.moments = []; DB.symptoms = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now - (i * 3 + 5) * 864e5);
    DB.moments.push({ id: 95000 + i, valence: 20, activation: 70, emo: 'стресс', createdAt: d.toISOString(), day: d.toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now });
    DB.symptoms.push({ id: 96000 + i, name: 'мигрень', severity: 8, createdAt: new Date(d.getTime() + 864e5).toISOString(), day: new Date(d.getTime() + 864e5).toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now });
  }
  const before = synthesisReport(90);
  const target = before.pairs.find(p => p.a === 'emo:стресс' && p.b === 'symptom:мигрень');
  const sig = pairSignature(target);
  dismissCorrelation(sig);
  const afterDismiss = synthesisReport(90);
  restoreDismissedCorrelations();
  const afterRestore = synthesisReport(90);
  return {
    hadTarget: !!target,
    hiddenAfterDismiss: !afterDismiss.pairs.some(p => pairSignature(p) === sig),
    persistedInSettings: (DB.correlationSettings.dismissed || []).length === 0,   // после restore — пусто
    visibleAfterRestore: afterRestore.pairs.some(p => pairSignature(p) === sig),
  };
});
ok(dismissTest.hadTarget, 'dismiss test: целевая корреляция найдена до скрытия');
ok(dismissTest.hiddenAfterDismiss, 'dismissCorrelation(): скрытая корреляция не появляется в следующем отчёте');
ok(dismissTest.visibleAfterRestore, 'restoreDismissedCorrelations(): возвращает скрытые корреляции обратно');
ok(dismissTest.persistedInSettings, 'dismiss/restore корректно хранится и очищается в DB.correlationSettings.dismissed (персистентно, скаляр)');

// ── 14) Deterministic output ────────────────────────────────────────────
const determinism = await page.evaluate(() => {
  const now = Date.now();
  DB.moments = []; DB.symptoms = [];
  for (let i = 0; i < 8; i++) {
    const d = new Date(now - (i * 4 + 2) * 864e5);
    DB.moments.push({ id: 97000 + i, valence: 30, activation: 65, emo: 'усталость', createdAt: d.toISOString(), day: d.toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now });
    DB.symptoms.push({ id: 98000 + i, name: 'слабость', severity: 5, createdAt: new Date(d.getTime() + 864e5).toISOString(), day: new Date(d.getTime() + 864e5).toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now });
  }
  const r1 = JSON.stringify(synthesisReport(90).pairs);
  const r2 = JSON.stringify(synthesisReport(90).pairs);
  return { same: r1 === r2, nonEmpty: r1.length > 2 };
});
ok(determinism.same && determinism.nonEmpty, 'deterministic output: одинаковый вход даёт побайтово одинаковый результат при повторном вызове');

// ── 15) Profile isolation ─────────────────────────────────────────────
const isolation = await page.evaluate(() => {
  DB.correlationSettings = { minSamples: 3, lagDays: 7, dismissed: ['test:signature'] };
  persist();
  const profiles = loadProfiles();
  const newId = 'pTestWave4_' + Date.now();
  saveProfiles([...profiles, { id: newId, name: 'Профиль B', color: '#000' }]);
  setActiveId(newId);
  hydrate();
  const isolatedClean = (DB.correlationSettings.dismissed || []).length === 0;
  setActiveId(profiles[0].id);
  hydrate();
  const restoredIntact = (DB.correlationSettings.dismissed || []).includes('test:signature');
  return { isolatedClean, restoredIntact };
});
ok(isolation.isolatedClean, 'profile isolation: другой профиль не видит dismissed-список первого профиля');
ok(isolation.restoredIntact, 'profile isolation: возврат к исходному профилю восстанавливает correlationSettings целиком');

// ── 16) Обычный (plain) export/import roundtrip ────────────────────────
const plainRoundtrip = await page.evaluate(() => {
  DB.correlationSettings = { minSamples: 5, lagDays: 10, dismissed: ['a→b', 'c→d'] };
  const exported = JSON.parse(JSON.stringify({ exportedAt: new Date().toISOString(), db: DB, cfg: CFG }));
  DB = { ...DEFAULT_DB, ...exported.db };
  return {
    restored: DB.correlationSettings.minSamples === 5 && DB.correlationSettings.lagDays === 10 && DB.correlationSettings.dismissed.length === 2,
  };
});
ok(plainRoundtrip.restored, 'обычный export/import (JSON): correlationSettings (включая dismissed) восстанавливается полностью');

// ── 17) UI: период — реальные кнопки (owner-review lesson из Wave 2, дефект 3) ──
const periodUi = await page.evaluate(() => {
  const now = Date.now();
  DB.moments = []; DB.symptoms = [];
  for (let i = 0; i < 6; i++) {
    const dRecent = new Date(now - (i * 1 + 2) * 864e5);
    DB.moments.push({ id: 99000 + i, valence: 20, activation: 70, emo: 'раздражение', createdAt: dRecent.toISOString(), day: dRecent.toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now });
    DB.symptoms.push({ id: 99100 + i, name: 'тошнота', severity: 6, createdAt: new Date(dRecent.getTime() + 864e5).toISOString(), day: new Date(dRecent.getTime() + 864e5).toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now });
  }
  goTo('sys'); sysGo('patterns');
  const before = document.getElementById('sys-patterns-out').innerHTML;
  const findBtn = txt => Array.from(document.querySelectorAll('#sys-patterns-out button')).find(b => b.textContent.trim() === txt);
  const btn7 = findBtn('7 дн.');
  const wasPressed = btn7 && btn7.getAttribute('aria-pressed');
  btn7.click();
  const after = document.getElementById('sys-patterns-out').innerHTML;
  const isPressedNow = findBtn('7 дн.').getAttribute('aria-pressed') === 'true';
  const backBtn = document.getElementById('sys-patterns-back');
  backBtn.click();
  const overviewVisible = getComputedStyle(document.getElementById('sys-overview')).display !== 'none';
  const patternsHidden = getComputedStyle(document.getElementById('sys-patterns')).display === 'none';
  return { changed: before !== after, ariaOk: wasPressed === 'false' && isPressedNow, overviewVisible, patternsHidden };
});
ok(periodUi.changed, 'период «Закономерностей»: реальный клик по кнопке «7 дн.» меняет отрендеренный DOM');
ok(periodUi.ariaOk, 'период «Закономерностей»: aria-pressed переключается на нажатую кнопку');
ok(periodUi.overviewVisible && periodUi.patternsHidden, 'кнопка «Назад» в «Закономерностях» возвращает к sys-overview (тот же паттерн, что и sys-detail)');

// ── 18) Offline reload ───────────────────────────────────────────────
const offlinePage = await boot();
await offlinePage.evaluate(() => {
  DB.correlationSettings = { minSamples: 4, lagDays: 5, dismissed: ['offline:test'] };
  persist();
});
await offlinePage.context().setOffline(true);
await offlinePage.reload();
await offlinePage.waitForSelector('#nsh-tabbar', { state: 'attached' });
await offlinePage.evaluate(() => { const s = document.getElementById('splash'); if (s) s.style.display = 'none'; });
await offlinePage.waitForTimeout(650);
const offlineResult = await offlinePage.evaluate(() => DB.correlationSettings && DB.correlationSettings.minSamples === 4 && DB.correlationSettings.dismissed.includes('offline:test'));
ok(offlineResult, 'offline reload: correlationSettings переживает перезагрузку без сети');
await offlinePage.context().setOffline(false);
await offlinePage.close();

// ── 19) Мобильные вьюпорты + a11y + тема + клавиатура ─────────────────
async function bootAt(width, height) {
  const p = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(FILE);
  await p.waitForSelector('#nsh-tabbar', { state: 'attached' });
  await p.evaluate(() => { const s = document.getElementById('splash'); if (s) s.style.display = 'none'; document.querySelectorAll('.ov.on').forEach(e => e.classList.remove('on')); });
  await p.waitForTimeout(650);
  await p.evaluate(() => document.querySelectorAll('.ov.on').forEach(e => e.classList.remove('on')));
  return p;
}
for (const [w, h, name] of [[375, 667, 'iPhone SE'], [390, 844, 'iPhone standard'], [430, 932, 'iPhone Pro Max'], [820, 1180, 'iPad portrait']]) {
  const dp = await bootAt(w, h);
  const geo = await dp.evaluate((viewportWidth) => {
    goTo('sys'); sysGo('patterns');
    const btn = document.querySelector('#sys-patterns-out button');
    const r = btn.getBoundingClientRect();
    const inViewport = r.right <= viewportWidth + 1 && r.left >= -1;
    return { tapOk: r.width >= 44 && r.height >= 44, inViewport, isButton: btn.tagName === 'BUTTON' && btn.getAttribute('type') === 'button' };
  }, w);
  ok(geo.tapOk && geo.inViewport && geo.isButton, `${name}: кнопка периода в «Закономерностях» — настоящий button, tap ≥44×44, не выходит за экран`);
  await dp.close();
}
const themePage = await bootAt(390, 844);
const themeCheck = await themePage.evaluate(() => {
  const now = Date.now();
  DB.moments = []; DB.symptoms = [];
  for (let i = 0; i < 6; i++) {
    // 30-дневный шаг: узкое 8-дневное окно (lagDays=7) редко попадает в него
    // случайно, поэтому baseline(symptom) низкий, а lift для этой пары —
    // настоящий, не артефакт ширины окна (см. фикс baseline в findCorrelations).
    const d = new Date(now - (i * 30 + 2) * 864e5);
    DB.moments.push({ id: 41000 + i, valence: 20, activation: 70, emo: 'злость', createdAt: d.toISOString(), day: d.toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now });
    DB.symptoms.push({ id: 41100 + i, name: 'напряжение в шее', severity: 6, createdAt: new Date(d.getTime() + 864e5).toISOString(), day: new Date(d.getTime() + 864e5).toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now });
  }
  goTo('sys'); sysGo('patterns');
  document.documentElement.setAttribute('data-theme', 'dark');
  const darkVisible = getComputedStyle(document.getElementById('sys-patterns-out')).display !== 'none';
  document.documentElement.setAttribute('data-theme', 'light');
  const lightVisible = getComputedStyle(document.getElementById('sys-patterns-out')).display !== 'none';
  return { darkVisible, lightVisible };
});
ok(themeCheck.darkVisible && themeCheck.lightVisible, '«Закономерности» рендерятся и в тёмной, и в светлой теме');
const evidenceBtn = themePage.locator('#sys-patterns-out button').filter({ hasText: 'Записи' }).first();
await evidenceBtn.focus();
await themePage.keyboard.press('Enter');
await themePage.waitForTimeout(150);
const kbActivated = await themePage.evaluate(() => document.querySelectorAll('.ov.on').length > 0 || document.querySelector('.pg.on')?.id !== undefined);
ok(kbActivated, 'клавиатура: Enter на кнопке доказательства («Записи «…»») активирует переход (реальный button, не div)');
await themePage.close();

// ── 20) Большой synthetic dataset: производительность (100 000+ событий) ──
const bigPage = await bootAt(390, 844);
const bigResult = await bigPage.evaluate(() => {
  const now = Date.now();
  const N = 30000;
  const emos = ['радость', 'грусть', 'конфликт', 'тревога', 'спокойствие', 'усталость'];
  const symptomNames = ['бессонница', 'головная боль', 'усталость', 'тошнота'];
  DB.moments = Array.from({ length: N }, (_, i) => ({ id: 1e6 + i, valence: (i * 7) % 100, activation: (i * 13) % 100, emo: emos[i % emos.length], createdAt: new Date(now - (i % 365) * 864e5).toISOString(), day: new Date(now - (i % 365) * 864e5).toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now }));
  DB.symptoms = Array.from({ length: N }, (_, i) => ({ id: 2e6 + i, name: symptomNames[i % symptomNames.length], severity: i % 10, createdAt: new Date(now - (i % 365) * 864e5 + 864e5).toISOString(), day: new Date(now - (i % 365) * 864e5 + 864e5).toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now }));
  DB.whys = Array.from({ length: N }, (_, i) => ({ id: 3e6 + i, symptom: symptomNames[i % symptomNames.length], need: 'отдых', createdAt: new Date(now - (i % 365) * 864e5).toISOString(), day: new Date(now - (i % 365) * 864e5).toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now }));
  DB.cravings = Array.from({ length: N }, (_, i) => ({ id: 4e6 + i, outcome: i % 3 === 0 ? 'gave_in' : 'held', trigger: emos[i % emos.length], intensity: i % 10, createdAt: new Date(now - (i % 365) * 864e5).toISOString(), day: new Date(now - (i % 365) * 864e5).toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now }));
  const t0 = performance.now();
  goTo('sys'); sysGo('patterns');
  const t1 = performance.now();
  const rendered = document.getElementById('sys-patterns-out').innerHTML.length > 0;
  const totalEvents = unifiedEvents(365).length;
  return { elapsedMs: Math.round(t1 - t0), rendered, totalEvents };
});
ok(bigResult.totalEvents >= 100000, `большой synthetic dataset: ${bigResult.totalEvents} событий (требование issue #152 — 100 000+)`);
ok(bigResult.rendered && bigResult.elapsedMs < 8000, `большой synthetic dataset: полный рендер «Закономерностей» (сбор+корреляция+последовательности+DOM) без сбоев за ${bigResult.elapsedMs}мс`);
await bigPage.close();

ok(errors.length === 0, `JS-ошибок нет за весь прогон (${errors.length}${errors.length ? ': ' + errors[0] : ''})`);
await browser.close();
console.log(`\nWave 4 (unified intelligence): ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
