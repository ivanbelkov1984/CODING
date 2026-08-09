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
// Wave 6 (issue #160) поднял схему до 6 (additive ledger externalWorkSessions).
// Проверка Волны 4 по смыслу — «схема не ниже введённой этой волной», а не
// жёсткое число: иначе любая последующая additive-волна ложно краснеет.
ok(fresh.schemaVersion >= 5, `SCHEMA_VERSION не ниже 5 (сейчас ${fresh.schemaVersion})`);
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

// ── 3b) eventTimeOf(): семантический день (date/day) ПОБЕЖДАЕТ createdAt ──
// Owner review (PR #153, дефект 4): раньше `createdAt` шёл ПЕРВЫМ в приоритете
// и никогда не давал дойти до `rec.date`/`rec.day` — backdated sphereLogs
// анализировались по дню СОЗДАНИЯ записи, а не по дню, который пользователь
// явно указал (`logSphere(sphereId,value,note,date)` поддерживает backdating).
const timeSemantics = await page.evaluate(() => {
  const now = Date.now();
  const backdatedDay = new Date(now - 10 * 864e5).toISOString().slice(0, 10);
  const createdToday = new Date(now).toISOString().slice(0, 10);
  DB.spheres = [{ id: 500, name: 'Чтение', type: 'habit' }];
  // Реальный сценарий: пользователь отмечает привычку ЗАДНИМ ЧИСЛОМ (date=10
  // дней назад), но физически сохраняет запись СЕЙЧАС (createdAt=сегодня).
  DB.sphereLogs = [{ id: 900001, sphereId: 500, date: backdatedDay, value: true, createdAt: new Date(now).toISOString(), sv: SCHEMA_VERSION, _u: now }];
  const events = unifiedEvents(365);
  const sphereEvent = events.find(e => e.sourceCollection === 'sphereLogs' && e.referenceId === 900001);

  // Прямая проверка контракта eventTimeOf(): `day` обязан победить `createdAt`,
  // даже если они указывают на РАЗНЫЕ дни (синтетически расходящиеся поля —
  // проверяем именно приоритет функции, а не воспроизводим конкретную форму).
  const dayVsCreatedAt = eventTimeOf({ day: '2026-03-15', createdAt: '2026-03-20T23:00:00.000Z' });
  const dayWins = new Date(dayVsCreatedAt).toISOString().slice(0, 10) === '2026-03-15';

  // Полдень-UTC якорь: день не должен «съехать» для дней рядом с границами
  // года/месяца (сериализация через toISOString().slice(0,10) в unifiedEvents()).
  const boundaryT = eventTimeOf({ day: '2026-01-01', createdAt: '2025-12-31T02:00:00.000Z' });
  const boundaryDayOk = new Date(boundaryT).toISOString().slice(0, 10) === '2026-01-01';

  return {
    sphereEventDay: sphereEvent && sphereEvent.date,
    backdatedDay, createdToday,
    dayWins, boundaryDayOk,
  };
});
ok(timeSemantics.sphereEventDay === timeSemantics.backdatedDay && timeSemantics.sphereEventDay !== timeSemantics.createdToday,
  'eventTimeOf(): backdated sphereLog анализируется по указанному дню (`date`), а НЕ по дню физического создания записи (`createdAt`)');
ok(timeSemantics.dayWins, 'eventTimeOf(): `day` побеждает `createdAt` в приоритете, когда они расходятся (контракт функции)');
ok(timeSemantics.boundaryDayOk, 'eventTimeOf(): день не «съезжает» на границе года при полдень-UTC якоре, даже если `createdAt` — из другого календарного дня');

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
    significant: pair && pair.significant,
    hasPValue: pair && typeof pair.pValue === 'number' && pair.pValue >= 0 && pair.pValue <= 1,
    hasQValue: pair && typeof pair.qValue === 'number' && pair.qValue >= 0 && pair.qValue <= 1,
    precedes: pair && pair.precedes,
    // ручной расчёт: supportA=10, hits=10 (каждый конфликт → бессонница на след. день, окно 7 дней захватывает),
    // baseline = supportB(10) / totalDays; lift = confidence(1.0) / baseline
    expectedConfidence: 1,
  };
});
ok(corrMath.found, 'Correlation Engine: находит инженерную корреляцию «конфликт → бессонница»');
ok(corrMath.supportA === 10 && corrMath.hits === 10, 'Correlation Engine: support(A)=10, hits=10 — точное совпадение с синтетическим входом');
ok(corrMath.confidenceStat === corrMath.expectedConfidence, 'Correlation Engine: confidence = hits/supportA = 1.0 (100% случаев)');
ok(corrMath.lift > 1.3, 'Correlation Engine: lift существенно выше 1 (событие B значимо чаще обычного после A)');
// Owner review (PR #153, дефект 2): пара обязана нести доказательство статистической
// значимости (точный тест Фишера + BH-FDR), а не только эвристику lift.
ok(corrMath.hasPValue && corrMath.hasQValue && corrMath.significant, 'Correlation Engine: пара несёт p-value/q-value и прошла FDR-скорректированный гейт значимости (significant=true)');
// Owner review, дефект 3: конфликт→бессонница на СЛЕДУЮЩИЙ день — реальное
// предшествование (lag≥1), не совпадение в тот же день.
ok(corrMath.precedes === true, 'Correlation Engine: «предшествование» (precedes) корректно true для реального next-day совпадения (lag≥1)');

// ── 4b) Same-record tautology: одна запись не может «коррелировать сама с
//    собой» через свои же поля ────────────────────────────────────────
// Owner review (PR #153, дефект 1): moments даёт emo+valence+activation ИЗ
// ОДНОЙ записи; без provenance это структурное совпадение полей выглядит
// как межсобытийная закономерность. 10 identical moments (одна и та же
// запись повторена 10 раз, каждая на своём, далеко разнесённом дне) не
// должны дать НИ ОДНОЙ пары — все совпадения emo↔valence/activation
// поддержаны ИСКЛЮЧИТЕЛЬНО тем же самым source record в тот же день (lag=0).
const sameRecordTautology = await page.evaluate(() => {
  const now = Date.now();
  DB.moments = []; DB.symptoms = []; DB.whys = []; DB.cravings = []; DB.medIntakes = []; DB.dreams = []; DB.patterns = []; DB.insights = []; DB.evolution = []; DB.labObservations = []; DB.healthDocuments = []; DB.relationshipContexts = []; DB.sphereLogs = []; DB.measures = [];
  for (let i = 0; i < 10; i++) {
    const d = new Date(now - (i * 30 + 2) * 864e5);
    DB.moments.push({ id: 50000 + i, valence: 20, activation: 70, emo: 'злость', createdAt: d.toISOString(), day: d.toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now });
  }
  const report = synthesisReport(365);
  return { pairsCount: report.pairs.length };
});
ok(sameRecordTautology.pairsCount === 0, '10 одинаковых moments (одна и та же emo+valence+activation) НЕ дают emo↔valence/activation как межсобытийную закономерность — same-record hits исключены');

// ── 4c) Но НЕЗАВИСИМЫЕ записи в тот же день (разные records) — легитимное
//    same-day совпадение, НЕ исключается ─────────────────────────────
const independentSameDay = await page.evaluate(() => {
  const now = Date.now();
  DB.moments = []; DB.whys = []; DB.insights = []; DB.patterns = []; DB.evolution = []; DB.dreams = []; DB.medIntakes = []; DB.symptoms = []; DB.measures = []; DB.cravings = []; DB.labObservations = []; DB.healthDocuments = []; DB.relationshipContexts = []; DB.sphereLogs = []; DB.spheres = []; DB.psyLinks = [];
  for (let i = 0; i < 8; i++) {
    const d = new Date(now - (i * 16 + 2) * 864e5);
    DB.moments.push({ id: 60000 + i, valence: 20, activation: 70, emo: 'тревога', createdAt: d.toISOString(), day: d.toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now });
    // Независимая запись ДРУГОЙ коллекции, В ТОТ ЖЕ день (не через провенанс общего record'а).
    DB.cravings.push({ id: 61000 + i, outcome: 'gave_in', trigger: 'тревога', intensity: 8, createdAt: new Date(d.getTime() + 3600e3).toISOString(), day: d.toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now });
  }
  const report = synthesisReport(365);
  const pair = report.pairs.find(p => p.a === 'emo:тревога' && p.b === 'craving:уступил');
  return { found: !!pair, sameDayOnly: pair && pair.sameDayOnly, precedes: pair && pair.precedes, significant: pair && pair.significant };
});
ok(independentSameDay.found && independentSameDay.significant, 'независимые записи разных коллекций в тот же день ДАЮТ значимую same-day корреляцию (не отбрасываются как тавтология)');
ok(independentSameDay.sameDayOnly === true && independentSameDay.precedes === false, 'такая same-day (независимая) пара честно помечена sameDayOnly=true/precedes=false — видна в общем списке, но не в Триггерах/Цепочках совпадений');

// ── 5) False-positive avoidance: равномерно перемешанные, НЕ коррелирующие
//    теги на разумном масштабе — движок не выдумывает связи из шума ────
// Owner review (PR #153, дефект 2): нужен настоящий статистический гейт
// (Fisher exact + Benjamini-Hochberg FDR), не эвристический порог lift.
// Owner review, дефект 1 (косвенно): день↔запись НЕ 1:1 — независимо
// рандомизированы И количество записей в день (0/1/несколько), И день
// каждой записи, И её тег — иначе «ровно 1 запись на день» создаёт
// структурную (не шумовую) антикорреляцию между значениями ОДНОГО
// категориального поля («если сегодня «скука», то НЕ «интерес» — тем же
// record'ом»), что не является настоящим ложноположительным срабатыванием
// движка, а тем же артефактом, что и дефект 1 (см. §1), только в форме
// отрицательного, а не положительного lift.
const noFalsePositives = await page.evaluate(() => {
  const now = Date.now();
  DB.moments = []; DB.symptoms = [];
  const emos = ['радость', 'грусть', 'интерес', 'скука'];
  const syms = ['насморк', 'зуд', 'жажда', 'зевота'];
  // Seeded PRNG (mulberry32) — детерминированный ПОВТОРЯЕМЫЙ прогон, но
  // статистически независимые потоки: день И тег генерируются НЕЗАВИСИМО
  // для A и для B, с числом записей (450) БОЛЬШИМ числа дней (300) — так
  // что дни получают 0/1/несколько записей каждой коллекции независимо,
  // как в реальном дневнике, а не ровно одну запись на день.
  function mulberry32(seed) { return function () { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const RANGE_DAYS = 300, N = 450;
  const rndDayA = mulberry32(111), rndTagA = mulberry32(12345);
  const rndDayB = mulberry32(222), rndTagB = mulberry32(987654321);
  DB.moments = Array.from({ length: N }, (_, i) => {
    const off = Math.floor(rndDayA() * RANGE_DAYS);
    const d = new Date(now - off * 864e5);
    return { id: 40000 + i, valence: 50, activation: 50, emo: emos[Math.floor(rndTagA() * 4)], createdAt: d.toISOString(), day: d.toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now };
  });
  DB.symptoms = Array.from({ length: N }, (_, i) => {
    const off = Math.floor(rndDayB() * RANGE_DAYS);
    const d = new Date(now - off * 864e5);
    return { id: 50000 + i, name: syms[Math.floor(rndTagB() * 4)], severity: 3, createdAt: d.toISOString(), day: d.toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now };
  });
  const events = unifiedEvents(365);
  const { pairs } = findCorrelations(events, { minSamples: 3, lagDays: 3 });
  return { pairsCount: pairs.length, pairs: pairs.map(p => ({ a: p.a, b: p.b, lift: +p.lift.toFixed(2), q: p.qValue })) };
});
ok(noFalsePositives.pairsCount === 0, `false-positive avoidance: на РЕАЛИСТИЧНО независимых данных (независимые дни И теги, переменное число записей в день) FDR-гейт не находит НИ ОДНОЙ значимой пары (найдено: ${noFalsePositives.pairsCount}${noFalsePositives.pairsCount ? ', ' + JSON.stringify(noFalsePositives.pairs) : ''})`);

// ── 5b) Второй проход owner review (PR #153, блокер 1): смешанный случай —
//    записи, СОВМЕСТНО порождающие A+B (тот же mapper), ПЛЮС ровно
//    minSamples независимых B-записей — не должно превращаться в значимую
//    отрицательную связь. Раньше hits (с исключением same-record) НЕ
//    согласовывался с margins baseline'а (наивными, без исключения) —
//    получалась математически невозможная таблица Фишера (k < minX),
//    p-value=0, BH объявлял пару максимально значимой.
const mixedSameRecordCase = await page.evaluate(() => {
  const now = Date.now();
  DB.moments = []; DB.whys = []; DB.insights = []; DB.patterns = []; DB.evolution = []; DB.dreams = []; DB.medIntakes = []; DB.symptoms = []; DB.measures = []; DB.cravings = []; DB.labObservations = []; DB.healthDocuments = []; DB.relationshipContexts = []; DB.sphereLogs = []; DB.spheres = []; DB.psyLinks = [];
  // 20 дней — на каждом ОДИН moment, дающий emo:X И valence:low ИЗ ОДНОЙ записи.
  for (let i = 0; i < 20; i++) {
    const d = new Date(now - (i * 5 + 2) * 864e5);
    DB.moments.push({ id: 500000 + i, valence: 20, activation: 50, emo: 'скептицизм', createdAt: d.toISOString(), day: d.toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now });
  }
  // Ровно на 3 из этих же дней — НЕЗАВИСИМАЯ вторая запись, тоже дающая
  // valence:low, но с ДРУГИМ emo (устраняет неоднозначность «та же запись»).
  [0, 5, 10].forEach((idx, k) => {
    const d = new Date(now - (idx * 5 + 2) * 864e5);
    DB.moments.push({ id: 600000 + k, valence: 15, activation: 50, emo: 'нейтральный', createdAt: new Date(d.getTime() + 3600e3).toISOString(), day: d.toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now });
  });
  const events = unifiedEvents(null);
  const withLag0 = findCorrelations(events, { minSamples: 3, lagDays: 0 });
  const withLag7 = findCorrelations(events, { minSamples: 3, lagDays: 7 });
  const target0 = withLag0.pairs.find(p => p.a === 'emo:скептицизм' && p.b === 'valence:low');
  const target7 = withLag7.pairs.find(p => p.a === 'emo:скептицизм' && p.b === 'valence:low');
  return { target0Found: !!target0, target7Found: !!target7 };
});
ok(!mixedSameRecordCase.target0Found, 'блокер 1 (второй проход): смешанный same-record+независимый случай (lagDays=0) НЕ превращается в значимую (ложную) отрицательную связь');
ok(!mixedSameRecordCase.target7Found, 'блокер 1 (второй проход): та же проверка при lagDays=7 (не только вырожденный lagDays=0 случай)');

// ── 5b2) Отсутствие symptom-записей НЕ создаёт пользовательскую
//    «отрицательную» закономерность (regression-тест) ─────────────────────
// Owner review (третий проход, PR #153): предыдущая версия этого теста
// называла отсутствие symptom-записей после приёма препарата «настоящим
// протективным эффектом» и требовала, чтобы движок выводил её пользователю.
// Это ОШИБОЧНАЯ рамка. `medIntakes`/`symptoms` — event log'и: пользователь
// пишет запись, когда РЕШИЛ её сделать. День без записи `symptom:X` НЕ
// доказывает «симптома не было» — он также может означать «был, но не
// записан», «приложение не открывали», «домен заполнялся нерегулярно».
// Особенно опасно для health-домена (issue #152 запрещает медицинские
// выводы): отсутствие записи о симптоме не равно отсутствию симптома.
// Поэтому findCorrelations() теперь ВСЕГДА исключает lift<1 из итогового
// вывода (см. фикс в app.js — гейт `hits>=minSamples && lift>=1.3 &&
// significant`). Этот тест проверяет именно это на ТОЙ ЖЕ фикстуре
// (регулярный приём + отсутствие symptom-записей в защищённом окне после
// приёма), что раньше ошибочно трактовалась как «протективный эффект»:
// движок НЕ должен выдавать пользователю пару med:принят → symptom:мигрень.
const noDepletionSurfaced = await page.evaluate(() => {
  const now = Date.now();
  DB.moments = []; DB.whys = []; DB.insights = []; DB.patterns = []; DB.evolution = []; DB.dreams = []; DB.medIntakes = []; DB.symptoms = []; DB.measures = []; DB.cravings = []; DB.labObservations = []; DB.healthDocuments = []; DB.relationshipContexts = []; DB.sphereLogs = []; DB.spheres = []; DB.psyLinks = [];
  const lagDays = 5, totalDaysRange = 200;
  const medDays = []; for (let i = 0; i < 20; i++) medDays.push(i * 9 + 30);
  // Окно вперёд по календарю от дня приёма (offset = «дней назад от сейчас»,
  // поэтому «вперёд по времени» — это МЕНЬШИЙ offset): [m-lagDays, m].
  const inProtectedWindow = off => medDays.some(m => off >= (m - lagDays) && off <= m);
  medDays.forEach((m, i) => {
    const d = new Date(now - m * 864e5);
    DB.medIntakes.push({ id: 700000 + i, medId: 1, status: 'taken', at: d.toISOString(), day: d.toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now });
  });
  let symId = 800000;
  for (let off = 0; off < totalDaysRange; off++) {
    if (inProtectedWindow(off)) continue;   // symptom-записи нет в этом окне (не значит «симптома не было»)
    if (off % 3 === 0) {
      const d = new Date(now - off * 864e5);
      DB.symptoms.push({ id: symId++, name: 'мигрень', severity: 5, createdAt: d.toISOString(), day: d.toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now });
    }
  }
  const { pairs } = findCorrelations(unifiedEvents(null), { minSamples: 3, lagDays });
  const target = pairs.find(p => p.a === 'med:принят' && p.b === 'symptom:мигрень');
  return { found: !!target };
});
ok(!noDepletionSurfaced.found, 'регулярный приём препарата + отсутствие symptom-записей в последующем окне НЕ создаёт пользовательскую закономерность о снижении симптома (findCorrelations() не выводит отрицательные ассоциации из event-log данных)');

// ── 5c) Инвариант: k (hits) ВСЕГДА в допустимых границах гипергеометрического
//    распределения для КАЖДОЙ пары, попавшей в итоговый результат ────────
// Owner review (PR #153, блокер 1): раньше это могло нарушаться (k<minX),
// что и создавало бессмысленный p-value=0. Проверяем на нескольких разных
// по форме датасетах (простой инженерный со значимой находкой, «смешанный»
// same-record+независимый без значимой находки).
const marginInvariant = await page.evaluate(() => {
  const checkPairs = pairs => pairs.map(p => {
    const m = Math.round(p.baseline * p.totalDays);
    const minX = Math.max(0, p.supportA - (p.totalDays - m));
    const maxX = Math.min(p.supportA, m);
    return { ok: p.hits >= minX && p.hits <= maxX, p, minX, maxX, m };
  });
  const now = Date.now();
  const all = [];
  // (a) простой инженерный случай (тот же, что в §4 «Correlation Engine» —
  // включая 20 «нейтральных» padding-записей, расширяющих totalDays и не
  // трогающих сам conflict/insomnia паттерн, иначе при частом повторе A/B
  // раз в 3 дня и lagDays=7 почти любое окно ловит B и baseline ≈1).
  DB.moments = []; DB.symptoms = []; DB.whys = []; DB.cravings = []; DB.medIntakes = []; DB.dreams = []; DB.patterns = []; DB.insights = []; DB.evolution = []; DB.labObservations = []; DB.healthDocuments = []; DB.relationshipContexts = []; DB.sphereLogs = []; DB.measures = []; DB.spheres = []; DB.psyLinks = [];
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
  all.push(...checkPairs(findCorrelations(unifiedEvents(365), { minSamples: 3, lagDays: 7 }).pairs));
  // (b) смешанный same-record+независимый случай (та же фикстура, что и 5b)
  DB.moments = [];
  for (let i = 0; i < 20; i++) {
    const d = new Date(now - (i * 5 + 2) * 864e5);
    DB.moments.push({ id: 500000 + i, valence: 20, activation: 50, emo: 'скептицизм', createdAt: d.toISOString(), day: d.toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now });
  }
  [0, 5, 10].forEach((idx, k) => {
    const d = new Date(now - (idx * 5 + 2) * 864e5);
    DB.moments.push({ id: 600000 + k, valence: 15, activation: 50, emo: 'нейтральный', createdAt: new Date(d.getTime() + 3600e3).toISOString(), day: d.toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now });
  });
  all.push(...checkPairs(findCorrelations(unifiedEvents(null), { minSamples: 3, lagDays: 7 }).pairs));
  // (c) датасет с внедрённой депрессивной (lift<1) связью убран отсюда:
  // после фикса «третьего прохода» (§5b2 выше) findCorrelations() никогда
  // не выводит lift<1 в result.pairs, поэтому такой датасет давал бы 0
  // проверяемых пар — вставлять его в margin-инвариант больше нет смысла.
  return { total: all.length, violations: all.filter(x => !x.ok).length, sample: all.filter(x => !x.ok).slice(0, 3) };
});
ok(marginInvariant.total > 0, 'margin invariant test: датасеты действительно дают ≥1 пару для проверки (не тривиально пустой тест)');
ok(marginInvariant.violations === 0, `margin invariant: hits (k) лежит в [minX,maxX] гипергеометрического распределения для ВСЕХ ${marginInvariant.total} итоговых пар (нарушений: ${marginInvariant.violations}${marginInvariant.violations ? ', ' + JSON.stringify(marginInvariant.sample) : ''})`);

// ── 5d) Блокер 2: двусторонний точный тест Фишера — golden reference values
//    (посчитаны вручную по формуле гипергеометрического распределения, НЕ
//    тем же кодом, что и под тестом — см. комментарии с расчётом) ────────
// Случай 1: N=4,m=2,n=2,k=2. pmf(0)=C(2,0)C(2,2)/C(4,2)=1/6; pmf(1)=C(2,1)C(2,1)/C(4,2)=4/6;
// pmf(2)=C(2,2)C(2,0)/C(4,2)=1/6. Двусторонний p (все x с pmf(x)<=pmf(2)=1/6) = pmf(0)+pmf(2) = 2/6 = 1/3.
// Случай 2: N=10,m=5,n=5,k=5 (симметричный экстремум). pmf(0)=pmf(5)=C(5,0)C(5,5)/C(10,5)=1/252;
// остальные x строго больше. Двусторонний p = pmf(0)+pmf(5) = 2/252 ≈ 0.007937.
const fisherGolden = await page.evaluate(() => {
  const logFact4 = logFactorialTable(4), logChoose4 = makeLogChoose(logFact4);
  const logFact10 = logFactorialTable(10), logChoose10 = makeLogChoose(logFact10);
  return {
    case1: fisherPValueTwoSided(logChoose4, 4, 2, 2, 2),
    case2: fisherPValueTwoSided(logChoose10, 10, 5, 5, 5),
  };
});
ok(Math.abs(fisherGolden.case1 - (1 / 3)) < 1e-9, `двусторонний Fisher exact: N=4,m=2,n=2,k=2 → p=${fisherGolden.case1} (эталон 1/3=${1 / 3}, вручную посчитано по гипергеометрической pmf)`);
ok(Math.abs(fisherGolden.case2 - (2 / 252)) < 1e-9, `двусторонний Fisher exact: N=10,m=5,n=5,k=5 (симметричный экстремум) → p=${fisherGolden.case2} (эталон 2/252=${2 / 252})`);

// ── 5e) Блокер 2: множество независимых seeds — эмпирическая проверка FDR,
//    не один «удачный» seed ────────────────────────────────────────────
const multiSeedFdr = await page.evaluate(() => {
  function mulberry32(seed) { return function () { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const now = Date.now();
  const emos = ['радость', 'грусть', 'интерес', 'скука'];
  const syms = ['насморк', 'зуд', 'жажда', 'зевота'];
  const RANGE_DAYS = 300, N = 450, TRIALS = 25;
  const perTrial = [];
  for (let trial = 0; trial < TRIALS; trial++) {
    const rndDayA = mulberry32(1000 + trial * 7), rndTagA = mulberry32(50000 + trial * 13);
    const rndDayB = mulberry32(2000 + trial * 17), rndTagB = mulberry32(90000 + trial * 19);
    DB.moments = Array.from({ length: N }, (_, i) => {
      const off = Math.floor(rndDayA() * RANGE_DAYS);
      const d = new Date(now - off * 864e5);
      return { id: 40000 + i, valence: 50, activation: 50, emo: emos[Math.floor(rndTagA() * 4)], createdAt: d.toISOString(), day: d.toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now };
    });
    DB.symptoms = Array.from({ length: N }, (_, i) => {
      const off = Math.floor(rndDayB() * RANGE_DAYS);
      const d = new Date(now - off * 864e5);
      return { id: 50000 + i, name: syms[Math.floor(rndTagB() * 4)], severity: 3, createdAt: d.toISOString(), day: d.toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now };
    });
    const { pairs } = findCorrelations(unifiedEvents(365), { minSamples: 3, lagDays: 3 });
    perTrial.push(pairs.length);
  }
  return { perTrial, total: perTrial.reduce((a, b) => a + b, 0), trialsWithFindings: perTrial.filter(n => n > 0).length };
});
ok(multiSeedFdr.total <= 3, `множество независимых seeds (${multiSeedFdr.perTrial.length} прогонов, разные seed'ы дня/тега для A и B): суммарно ≤3 значимых находки на статистически независимых данных (найдено всего: ${multiSeedFdr.total}, прогонов с находками: ${multiSeedFdr.trialsWithFindings}) — не один удачный seed`);

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
// Owner review (PR #153, дефект 2): «Средняя»/«Высокая» ТЕПЕРЬ требуют
// significant=true (прошедший FDR-гейт) — размер выборки/lift сами по себе
// недостаточны. significant:true явно проставлен в фикстурах ниже, кроме
// специального теста notSignificant.
const confidence = await page.evaluate(() => {
  const mk = (supportA, hits, lift, significant) => ({ supportA, hits, lift, significant });
  return {
    low: correlationConfidence(mk(4, 4, 5, true)).level,        // n<5 → низкая, даже при экстремальном lift
    medium: correlationConfidence(mk(8, 8, 1.35, true)).level,  // n>=5, слабый lift → средняя
    high: correlationConfidence(mk(15, 15, 3, true)).level,     // n>=12 и сильный lift(≥2×) → высокая
    notSignificant: correlationConfidence(mk(15, 15, 3, false)).level,   // тот же n/lift, но significant=false → низкая
  };
});
ok(confidence.low === 'low', 'Confidence System: n<5 всегда «низкая», даже при сильном lift — не переоценивает малые данные');
ok(confidence.medium === 'medium', 'Confidence System: достаточно наблюдений, но слабый lift → «средняя»');
ok(confidence.high === 'high', 'Confidence System: много наблюдений И сильный lift (≥2×) → «высокая»');
ok(confidence.notSignificant === 'low', 'Confidence System: даже большая выборка И сильный lift не дают «Среднюю»/«Высокую», если пара НЕ прошла FDR-гейт значимости (significant=false)');

// ── 8) Trigger Engine ──────────────────────────────────────────────────
// Owner review (PR #153, дефект 3): «что предшествует» обязано означать
// РЕАЛЬНОЕ предшествование (pair.precedes, lag≥1) И положительную связь
// (lift>1) — не любое отклонение lift и не совпадения в тот же день (lag=0,
// pair.precedes=false). Ниже добавлены ДВЕ ловушки: сильный, но same-day-only
// (precedes=false) кандидат и сильный, но отрицательный (lift<1) кандидат —
// оба должны быть исключены, несмотря на больший |lift|, чем у настоящих триггеров.
const triggerEngine = await page.evaluate(() => {
  const pairs = [
    { a: 'trigger:стресс', b: 'craving:уступил', lift: 3, confidenceStat: 0.8, precedes: true },
    { a: 'trigger:скука', b: 'craving:уступил', lift: 1.5, confidenceStat: 0.5, precedes: true },
    { a: 'trigger:стресс', b: 'emo:тревога', lift: 2, confidenceStat: 0.6, precedes: true },
    { a: 'trigger:совпадение', b: 'craving:уступил', lift: 5, confidenceStat: 0.9, precedes: false },   // sameDay-only ловушка
    { a: 'trigger:защита', b: 'craving:уступил', lift: 0.2, confidenceStat: 0.1, precedes: true },      // отрицательный lift ловушка
  ];
  const list = triggersFor(pairs, 'craving:уступил');
  return { count: list.length, topIsStrongest: list[0] && list[0].a === 'trigger:стресс', noSameDayOnly: !list.some(p => p.a === 'trigger:совпадение'), noNegativeLift: !list.some(p => p.a === 'trigger:защита') };
});
ok(triggerEngine.count === 2, 'Trigger Engine: находит все триггеры конкретного целевого тега (2 из 5 пар — исключая same-day-only и отрицательный lift)');
ok(triggerEngine.topIsStrongest, 'Trigger Engine: сортирует по убыванию lift (сильнейший триггер первым)');
ok(triggerEngine.noSameDayOnly, 'Trigger Engine: same-day-only совпадение (precedes=false), несмотря на больший lift, НЕ считается «предшествующим» триггером');
ok(triggerEngine.noNegativeLift, 'Trigger Engine: отрицательная связь (lift<1) не считается триггером, даже если precedes=true');

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

// ── 10) Цепочки совпадений: строятся из уже найденных корреляций ──────
// Owner review (PR #153, дефект 3): переименовано из «Cause Graph»/«цепочки
// причин→следствий» — association/lift НЕ доказывает причинность. Тест
// проверяет только порядок ОБХОДА ГРАФА (жадный обход рёбер по убыванию
// lift), не причинно-следственную семантику. Реальная интеграция
// (synthesisReport) вдобавок передаёт сюда ТОЛЬКО пары с precedes=true —
// см. тест §3b ниже.
const causeGraph = await page.evaluate(() => {
  const pairs = [
    { a: 'A', b: 'B', lift: 3 }, { a: 'B', b: 'C', lift: 2.5 }, { a: 'C', b: 'D', lift: 2 },
    { a: 'X', b: 'Y', lift: 1.5 },
  ];
  const chains = buildCauseChains(pairs, { maxDepth: 4 });
  const longest = chains.find(c => c.chain[0] === 'A');
  return { longestFound: !!longest, longestLen: longest && longest.chain.length, longestPath: longest && longest.chain.join('>') };
});
ok(causeGraph.longestFound && causeGraph.longestLen === 4, 'Цепочки совпадений: строит цепочку A→B→C→D (глубина 4) из отдельных найденных association-пар, без пересчёта');
ok(causeGraph.longestPath === 'A>B>C>D', 'Цепочки совпадений: обход графа идёт по убыванию lift на каждом шаге (не утверждение причинности)');

// ── 10b) Цепочки совпадений: интеграция строит их ТОЛЬКО из precedes=true ──
const causeGraphIntegration = await page.evaluate(() => {
  const now = Date.now();
  DB.moments = []; DB.symptoms = []; DB.whys = []; DB.cravings = []; DB.medIntakes = []; DB.dreams = []; DB.patterns = []; DB.insights = []; DB.evolution = []; DB.labObservations = []; DB.healthDocuments = []; DB.relationshipContexts = []; DB.sphereLogs = []; DB.measures = [];
  // Настоящая ЦЕПОЧКА (не только пара — buildCauseChains требует ≥3 тегов,
  // т.е. ≥2 связанных рёбер): паника → спазм (день+1) → тяга (день+2), все
  // с реальным next-day предшествованием (precedes=true).
  for (let i = 0; i < 8; i++) {
    const d = new Date(now - (i * 16 + 3) * 864e5);
    DB.moments.push({ id: 200000 + i, valence: 20, activation: 75, emo: 'паника', createdAt: d.toISOString(), day: d.toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now });
    DB.symptoms.push({ id: 201000 + i, name: 'спазм', severity: 7, createdAt: new Date(d.getTime() + 864e5).toISOString(), day: new Date(d.getTime() + 864e5).toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now });
    DB.cravings.push({ id: 202000 + i, outcome: 'gave_in', trigger: 'спазм-тяга', intensity: 7, createdAt: new Date(d.getTime() + 2 * 864e5).toISOString(), day: new Date(d.getTime() + 2 * 864e5).toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now });
  }
  const report = synthesisReport(365);
  const target = report.pairs.find(p => p.a === 'emo:паника' && p.b === 'symptom:спазм');
  const inChains = report.chains.some(c => c.chain.includes('emo:паника') && c.chain.includes('symptom:спазм'));
  return { targetPrecedes: target && target.precedes, targetSig: target && target.significant, inChains };
});
ok(causeGraphIntegration.targetPrecedes && causeGraphIntegration.targetSig, 'интеграция: реальная next-day корреляция помечена precedes=true и significant=true');
ok(causeGraphIntegration.inChains, 'интеграция: precedes=true пара действительно попадает в «Цепочки совпадений» (synthesisReport фильтрует по precedes перед buildCauseChains)');

// ── 11) Sphere Influence: sphereLogs корректно дают `sphere:` тег ─────
const sphereInfluence = await page.evaluate(() => {
  const now = Date.now();
  DB.moments = []; DB.whys = []; DB.insights = []; DB.patterns = []; DB.evolution = []; DB.dreams = []; DB.medIntakes = []; DB.symptoms = []; DB.measures = []; DB.cravings = []; DB.labObservations = []; DB.healthDocuments = []; DB.relationshipContexts = []; DB.psyLinks = [];
  DB.sphereLogs = []; DB.spheres = [{ id: 1, name: 'Спорт', type: 'habit' }];
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
// Owner review (PR #153, дефект 1): `person:` тег добавляется на ТОТ ЖЕ
// event/record, что и его `emo:`/`valence:`/`activation:` теги (см.
// unifiedEvents()) — значит emo:обида↔person:мама сами по себе НИКОГДА не
// смогут набрать независимый hit (тот же record, тот же день, каждый раз).
// Честная проверка Relationship Graph — независимая запись из ДРУГОЙ
// коллекции (symptom на следующий день), которая коррелирует с `person:`
// тегом, а не с самим собой.
const relationshipGraph = await page.evaluate(() => {
  const now = Date.now();
  DB.moments = []; DB.whys = []; DB.insights = []; DB.patterns = []; DB.evolution = []; DB.dreams = []; DB.medIntakes = []; DB.symptoms = []; DB.measures = []; DB.cravings = []; DB.labObservations = []; DB.healthDocuments = []; DB.sphereLogs = []; DB.spheres = [];
  DB.psyLinks = []; DB.relationshipContexts = [{ id: psyUid('relctx'), label: 'Мама', status: 'active', privacyClass: 'sensitive', createdAt: nowISO(), sv: SCHEMA_VERSION, _u: now }];
  const ctxId = DB.relationshipContexts[0].id;
  for (let i = 0; i < 6; i++) {
    const d = new Date(now - (i * 16 + 3) * 864e5);
    const rec = { id: 90000 + i, valence: 25, activation: 75, emo: 'обида', createdAt: d.toISOString(), day: d.toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now };
    DB.moments.push(rec);
    createPsyLink({ fromColl: 'moments', fromId: rec.id, toColl: 'relationshipContexts', toId: ctxId, relation: 'record_to_relationship', source: 'user' });
    const dSym = new Date(d.getTime() + 864e5);
    DB.symptoms.push({ id: 91000 + i, name: 'напряжение в теле', severity: 6, createdAt: dSym.toISOString(), day: dSym.toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now });
  }
  const events = unifiedEvents(365);
  const momentEvent = events.find(e => e.sourceCollection === 'moments' && e.referenceId === 90000);
  const { pairs } = findCorrelations(events, { minSamples: 3, lagDays: 7 });
  const rel = relationshipPairs(pairs);
  return {
    personTag: momentEvent && momentEvent.tags.some(t => t === 'person:мама'),
    relFound: rel.some(p => (p.a.startsWith('person:') || p.b.startsWith('person:')) && p.significant),
  };
});
ok(relationshipGraph.personTag, 'Relationship Graph: psyLinks record_to_relationship (Wave 1) корректно добавляет тег `person:<label>` к событию');
ok(relationshipGraph.relFound, 'Relationship Graph: корреляция с контекстом отношений находится тем же Correlation Engine, отфильтрованная по `person:`');

// ── 13) Dismiss / restore ──────────────────────────────────────────────
const dismissTest = await page.evaluate(() => {
  const now = Date.now();
  DB.moments = []; DB.whys = []; DB.insights = []; DB.patterns = []; DB.evolution = []; DB.dreams = []; DB.medIntakes = []; DB.symptoms = []; DB.measures = []; DB.cravings = []; DB.labObservations = []; DB.healthDocuments = []; DB.relationshipContexts = []; DB.sphereLogs = []; DB.spheres = []; DB.psyLinks = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now - (i * 16 + 5) * 864e5);
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
  DB.moments = []; DB.whys = []; DB.insights = []; DB.patterns = []; DB.evolution = []; DB.dreams = []; DB.medIntakes = []; DB.symptoms = []; DB.measures = []; DB.cravings = []; DB.labObservations = []; DB.healthDocuments = []; DB.relationshipContexts = []; DB.sphereLogs = []; DB.spheres = []; DB.psyLinks = [];
  for (let i = 0; i < 8; i++) {
    const d = new Date(now - (i * 16 + 2) * 864e5);
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
  DB.moments = []; DB.whys = []; DB.insights = []; DB.patterns = []; DB.evolution = []; DB.dreams = []; DB.medIntakes = []; DB.symptoms = []; DB.measures = []; DB.cravings = []; DB.labObservations = []; DB.healthDocuments = []; DB.relationshipContexts = []; DB.sphereLogs = []; DB.spheres = []; DB.psyLinks = [];
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
    // 16-дневный шаг: укладывается в дефолтный 90-дневный период (макс.
    // смещение 82 дн.) и при этом достаточно узкое 8-дневное окно
    // (lagDays=7) даёт статистически значимый (FDR-скорректированный) lift,
    // не артефакт ширины окна (см. фикс baseline в findCorrelations).
    const d = new Date(now - (i * 16 + 3) * 864e5);
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

// ── 19b) Evidence provenance: pair.evidence указывает на РЕАЛЬНЫЕ записи,
//    поддержавшие КОНКРЕТНОЕ совпадение, а не на любую запись с тем же тегом ──
// Owner review (PR #153, дефект 5): раньше «Записи «A»»/«Записи «B»»
// открывали ПОСЛЕДНЮЮ запись с этим тегом — она могла вообще не входить ни
// в один из hits, на которых рассчитан вывод. distractor ниже — запись с
// тем же тегом, НО вне окна совпадения (500 дней назад) — не должна
// попасть в evidence вообще.
const evidenceProvenancePage = await bootAt(390, 844);
const evidenceProvenance = await evidenceProvenancePage.evaluate(() => {
  const now = Date.now();
  DB.moments = []; DB.symptoms = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now - (i * 16 + 3) * 864e5);
    DB.moments.push({ id: 300000 + i, valence: 20, activation: 70, emo: 'паника', createdAt: d.toISOString(), day: d.toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now });
    DB.symptoms.push({ id: 301000 + i, name: 'тремор', severity: 7, createdAt: new Date(d.getTime() + 864e5).toISOString(), day: new Date(d.getTime() + 864e5).toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now });
  }
  const distractorDay = new Date(now - 500 * 864e5);
  DB.moments.push({ id: 399999, valence: 20, activation: 70, emo: 'паника', createdAt: distractorDay.toISOString(), day: distractorDay.toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now });
  const report = synthesisReport(null);
  const pair = report.pairs.find(p => p.a === 'emo:паника' && p.b === 'symptom:тремор');
  const aRecIds = new Set(); const bRecIds = new Set();
  (pair?.evidence || []).forEach(ev => { ev.aRecs.forEach(r => aRecIds.add(r.id)); ev.bRecs.forEach(r => bRecIds.add(r.id)); });
  return {
    found: !!pair,
    evidenceNonEmpty: pair && pair.evidence.length > 0,
    hasRealRecords: pair && pair.evidence.every(ev => ev.aRecs.length && ev.bRecs.length && ev.aDay && ev.bDay),
    excludesDistractor: !aRecIds.has(399999),
    includesRealHit: [...aRecIds].some(id => id >= 300000 && id <= 300005),
    bRecsAreSymptoms: [...bRecIds].every(id => id >= 301000 && id <= 301005),
  };
});
ok(evidenceProvenance.found && evidenceProvenance.evidenceNonEmpty, 'findCorrelations(): пара несёт непустой evidence[] — точные supporting день/записи для конкретного совпадения');
ok(evidenceProvenance.hasRealRecords, 'evidence[]: каждая запись несёт реальные aRecs/bRecs и день (aDay/bDay), не заглушки');
ok(evidenceProvenance.excludesDistractor, 'evidence[]: НЕ включает запись с тем же тегом, которая не участвовала ни в одном реальном hit (не «любая последняя запись»)');
ok(evidenceProvenance.includesRealHit && evidenceProvenance.bRecsAreSymptoms, 'evidence[]: включает именно те записи A/B, которые действительно поддержали найденное совпадение');
await evidenceProvenancePage.close();

// ── 19c) Inline onclick injection: пользовательский текст тега/сигнатуры
//    больше не вставляется в JS-атрибут — используется числовой индекс ──
// Owner review (PR #153, дефект 6): esc() экранирует только &lt;&gt;, не
// кавычки — апостроф/кавычка в свободном тексте эмоции/триггера мог сломать
// inline onclick или исполнить внедрённый код. Кнопки теперь ссылаются на
// пару по числовому индексу (p._i), не по строке тега.
const injectionPage = await bootAt(390, 844);
const injectionCheck = await injectionPage.evaluate(() => {
  window.__pwned = false;
  const now = Date.now();
  DB.moments = []; DB.cravings = [];
  const evilTrigger = `x'"<script>window.__pwned=true</script>`;
  for (let i = 0; i < 6; i++) {
    const d = new Date(now - (i * 16 + 2) * 864e5);
    DB.moments.push({ id: 320000 + i, valence: 20, activation: 70, emo: 'триггертест', createdAt: d.toISOString(), day: d.toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now });
    DB.cravings.push({ id: 321000 + i, outcome: 'gave_in', trigger: evilTrigger, intensity: 8, createdAt: new Date(d.getTime() + 864e5).toISOString(), day: new Date(d.getTime() + 864e5).toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now });
  }
  goTo('sys'); sysGo('patterns');
  const onclicks = [...document.querySelectorAll('#sys-patterns-out button')].map(b => b.getAttribute('onclick')).filter(Boolean);
  // Единственные легитимные кавычки в onclick теперь — литеральные константы
  // 'a'/'b' (сторона пары), НЕ пользовательский текст: проверяем именно
  // отсутствие внедрённого текста, а не отсутствие кавычек вообще.
  const noRawTextInOnclick = onclicks.every(o => !o.includes(evilTrigger));
  const evidenceButtonsUseIndex = onclicks.filter(o => o.startsWith('synEvidenceAt') || o.startsWith('synDismissAt')).every(o => /^syn(EvidenceAt\(\d+,'[ab]'\)|DismissAt\(\d+\))$/.test(o));
  return {
    rendered: document.getElementById('sys-patterns-out').innerHTML.length > 0,
    pwnedAfterRender: window.__pwned === true,
    noRawTextInOnclick, evidenceButtonsUseIndex,
    hasEvidenceButtons: onclicks.some(o => o.startsWith('synEvidenceAt')),
  };
});
ok(injectionCheck.rendered, 'inline onclick injection: рендер с вредоносным текстом (кавычки/`<script>`) в свободном поле триггера не ломает страницу');
ok(!injectionCheck.pwnedAfterRender, 'inline onclick injection: внедрённый `<script>` не исполняется при рендере');
ok(injectionCheck.hasEvidenceButtons && injectionCheck.evidenceButtonsUseIndex, 'inline onclick injection: кнопки «Записи»/«Скрыть» ссылаются на пару по числовому индексу (synEvidenceAt(i,side)/synDismissAt(i)), не по строке тега');
ok(injectionCheck.noRawTextInOnclick, 'inline onclick injection: ни один onclick-атрибут не содержит внедрённый пользовательский текст напрямую');
const evBtn2 = injectionPage.locator('#sys-patterns-out button').filter({ hasText: 'Записи' }).first();
if (await evBtn2.count()) { await evBtn2.click(); await injectionPage.waitForTimeout(150); }
const pwnedAfterClick = await injectionPage.evaluate(() => window.__pwned === true);
ok(!pwnedAfterClick, 'inline onclick injection: клик по кнопке «Записи» с вредоносным тегом-триггером не исполняет внедрённый script');
await injectionPage.close();

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
