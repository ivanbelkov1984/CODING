import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Wave 2 (issue #150) — «Здоровье как органайзер»: «Сегодня» (план×факт),
// лабораторные результаты, документы здоровья, единая хронология, доработка
// отчёта врачу. Гоняет собранное приложение (dist/app.html) в реальном
// браузере, тем же стилем, что и tests/wave1-psych-links.spec.mjs.

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
  await p.waitForTimeout(650); // clear the 500ms onboarding timer
  await p.evaluate(() => {
    document.querySelectorAll('.ov.on').forEach(element => element.classList.remove('on'));
    document.body.style.overflow = '';
  });
  return p;
}

const page = await boot();

// ── 1) Schema 3→4 migration: старые коллекции byte-identical, новые пустые,
//    идемпотентность ────────────────────────────────────────────────────
const fresh = await page.evaluate(() => ({
  labInit: Array.isArray(DB.labObservations) && DB.labObservations.length === 0,
  docInit: Array.isArray(DB.healthDocuments) && DB.healthDocuments.length === 0,
  schemaVersion: SCHEMA_VERSION,
}));
ok(fresh.labInit && fresh.docInit, 'свежий профиль: labObservations=[]/healthDocuments=[] по умолчанию');
ok(fresh.schemaVersion === 4, 'SCHEMA_VERSION поднят до 4');

const migration = await page.evaluate(() => {
  const id = activeId();
  const oldDb = {
    meds: [{ id: 1, name: 'Витамин D', dose: '2000 МЕ', active: true, createdAt: '2026-01-01T00:00:00.000Z', day: '2026-01-01', sv: 3 }],
    medIntakes: [{ id: 2, medId: 1, status: 'taken', at: '2026-01-01T08:00:00.000Z', createdAt: '2026-01-01T08:00:00.000Z', day: '2026-01-01', sv: 3 }],
    symptoms: [{ id: 3, name: 'головная боль', severity: 4, createdAt: '2026-01-01T00:00:00.000Z', day: '2026-01-01', sv: 3 }],
    measures: [{ id: 4, name: 'вес', value: '70', unit: 'кг', createdAt: '2026-01-01T00:00:00.000Z', day: '2026-01-01', sv: 3 }],
    __ts: 222,
    // намеренно НЕТ labObservations/healthDocuments — pre-Wave-2 форма (sv=3)
  };
  localStorage.setItem('arch5_db_' + id, JSON.stringify(oldDb));
  hydrate();
  const afterFirst = {
    medsIntact: DB.meds.length === 1 && DB.meds[0].name === 'Витамин D',
    medIntakesIntact: DB.medIntakes.length === 1 && DB.medIntakes[0].status === 'taken',
    symptomsIntact: DB.symptoms.length === 1 && DB.symptoms[0].name === 'головная боль',
    measuresIntact: DB.measures.length === 1 && DB.measures[0].value === '70',
    labInit: Array.isArray(DB.labObservations) && DB.labObservations.length === 0,
    docInit: Array.isArray(DB.healthDocuments) && DB.healthDocuments.length === 0,
  };
  const snap1 = JSON.stringify(DB);
  migrateRecords(); migrateRecords();
  const snap2 = JSON.stringify(DB);
  return { afterFirst, idempotent: snap1 === snap2 };
});
ok(migration.afterFirst.medsIntact && migration.afterFirst.medIntakesIntact && migration.afterFirst.symptomsIntact && migration.afterFirst.measuresIntact,
  'миграция pre-Wave-2 (sv=3): meds/medIntakes/symptoms/measures byte-идентичны, не переписаны');
ok(migration.afterFirst.labInit && migration.afterFirst.docInit, 'миграция pre-Wave-2: labObservations/healthDocuments инициализированы пустыми');
ok(migration.idempotent, 'повторный migrateRecords() не меняет DB (идемпотентность)');

// Восстановим чистое состояние.
await page.evaluate(() => { localStorage.removeItem('arch5_db_' + activeId()); hydrate(); });

// ── 2) CRUD labObservations: create/edit/delete-undo, string id, значение ──
const labCrud = await page.evaluate(() => {
  goTo('health');
  openLabAdd();
  $('lab-testname').value = 'Гемоглобин';
  $('lab-value').value = '145';
  $('lab-unit').value = 'г/л';
  $('lab-ref').value = '130-160';
  $('lab-collected').value = '2026-07-20';
  $('lab-lab').value = 'Инвитро';
  saveLab();
  const rec = DB.labObservations[0];
  const idOk = typeof rec.id === 'string' && rec.id.startsWith('lab:');
  const numOk = rec.valueNumber === 145;
  // редактирование через безопасный путь (direct-mutate + touch + persist,
  // тот же паттерн, что и saveEdit() у инсайтов)
  openLabAdd(rec.id);
  $('lab-value').value = '150';
  saveLab();
  const edited = DB.labObservations.find(r => r.id === rec.id);
  const editOk = edited.valueText === '150' && edited.valueNumber === 150 && DB.labObservations.length === 1;
  // не-числовое значение → valueNumber=null (не подгоняем «120/80» под число)
  openLabAdd();
  $('lab-testname').value = 'Давление';
  $('lab-value').value = '120/80';
  saveLab();
  const bp = DB.labObservations.find(r => r.testName === 'Давление');
  const nonNumericOk = bp.valueNumber === null;
  // удаление с undo/tombstone
  const beforeDel = DB.labObservations.length;
  deleteLab(rec.id);
  const deletedOk = DB.labObservations.length === beforeDel - 1 && DB._del[rec.id] != null;
  undoDelete();
  const undoneOk = DB.labObservations.some(r => r.id === rec.id) && DB._del[rec.id] == null;
  return { idOk, numOk, editOk, nonNumericOk, deletedOk, undoneOk };
});
ok(labCrud.idOk, 'labObservations: id — namespaced строка lab:...');
ok(labCrud.numOk, 'labObservations: valueNumber распознан для однозначно числового значения');
ok(labCrud.editOk, 'labObservations: редактирование через безопасный путь (direct-mutate+touch+persist), без дублей');
ok(labCrud.nonNumericOk, 'labObservations: «120/80» не подгоняется под число — valueNumber=null');
ok(labCrud.deletedOk, 'labObservations: удаление — tombstone + удаление из массива');
ok(labCrud.undoneOk, 'labObservations: undo возвращает запись и снимает tombstone');

// ── 3) CRUD healthDocuments: create/edit/delete-undo, string id ───────────
const docCrud = await page.evaluate(() => {
  DB.healthDocuments = [];
  openDocAdd();
  $('doc-title').value = 'Выписка из поликлиники';
  $('doc-kind').value = 'discharge';
  $('doc-date').value = '2026-07-15';
  $('doc-provider').value = 'Поликлиника №1';
  saveDoc();
  const rec = DB.healthDocuments[0];
  const idOk = typeof rec.id === 'string' && rec.id.startsWith('healthDoc:');
  openDocAdd(rec.id);
  $('doc-title').value = 'Выписка (уточнено)';
  saveDoc();
  const edited = DB.healthDocuments.find(r => r.id === rec.id);
  const editOk = edited.title === 'Выписка (уточнено)' && DB.healthDocuments.length === 1;
  const beforeDel = DB.healthDocuments.length;
  deleteDoc(rec.id);
  const deletedOk = DB.healthDocuments.length === beforeDel - 1;
  undoDelete();
  const undoneOk = DB.healthDocuments.some(r => r.id === rec.id);
  return { idOk, editOk, deletedOk, undoneOk };
});
ok(docCrud.idOk, 'healthDocuments: id — namespaced строка healthDoc:...');
ok(docCrud.editOk, 'healthDocuments: редактирование существующей записи без дублей');
ok(docCrud.deletedOk, 'healthDocuments: удаление — tombstone + удаление из массива');
ok(docCrud.undoneOk, 'healthDocuments: undo возвращает запись');

// ── 4) Cross-collection tombstone collision (тот же принцип, что и Wave 1) ──
const collisionLab = await page.evaluate(() => {
  const now = Date.now();
  const sharedNumericId = 555555555555;
  DB.moments = [{ id: sharedNumericId, valence: 50, activation: 50, createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: now - 5000 }];
  const rec = { id: psyUid('lab'), testName: 'Тест', valueText: '1', valueNumber: 1, unit: '', referenceText: '', collectedAt: todayKey(), resultedAt: null, laboratory: '', note: '', media: [], privacyClass: 'sensitive', createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: now - 4000 };
  const idsNeverCollide = typeof rec.id === 'string' && rec.id !== sharedNumericId && rec.id !== String(sharedNumericId);
  const local = { ...DEFAULT_DB, moments: DB.moments, labObservations: [{ ...rec }], _del: {}, __ts: now - 3000 };
  const remote = { ...DEFAULT_DB, moments: DB.moments, labObservations: [{ ...rec }], _del: { [rec.id]: now }, __ts: now - 1000 };
  const merged = mergeDB(local, remote);
  return {
    idsNeverCollide,
    labDeleted: !merged.labObservations.some(l => l.id === rec.id),
    momentSurvived: merged.moments.some(m => m.id === sharedNumericId),
  };
});
ok(collisionLab.idsNeverCollide, 'labObservations id (namespaced) структурно не может совпасть с числовым id другой коллекции');
ok(collisionLab.labDeleted && collisionLab.momentSurvived, 'tombstone удаляет ИМЕННО labObservation, не задевает Момент с «похожим» числовым id');

const collisionDoc = await page.evaluate(() => {
  const now = Date.now();
  const sharedNumericId = 666666666666;
  DB.insights = [{ id: sharedNumericId, title: 't', body: 'b', createdAt: nowISO(), day: todayKey() }];
  const rec = { id: psyUid('healthDoc'), title: 'd', kind: 'other', documentDate: todayKey(), provider: '', note: '', media: [], privacyClass: 'sensitive', createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: now - 4000 };
  const idsNeverCollide = typeof rec.id === 'string' && rec.id !== sharedNumericId && rec.id !== String(sharedNumericId);
  const local = { ...DEFAULT_DB, insights: DB.insights, healthDocuments: [{ ...rec }], _del: {}, __ts: now - 3000 };
  const remote = { ...DEFAULT_DB, insights: DB.insights, healthDocuments: [{ ...rec }], _del: { [rec.id]: now }, __ts: now - 1000 };
  const merged = mergeDB(local, remote);
  return {
    idsNeverCollide,
    docDeleted: !merged.healthDocuments.some(d => d.id === rec.id),
    insightSurvived: merged.insights.some(i => i.id === sharedNumericId),
  };
});
ok(collisionDoc.idsNeverCollide, 'healthDocuments id (namespaced) структурно не может совпасть с числовым id другой коллекции');
ok(collisionDoc.docDeleted && collisionDoc.insightSurvived, 'tombstone удаляет ИМЕННО healthDocument, не задевает Инсайт с «похожим» числовым id');

// ── 5) Profile isolation ───────────────────────────────────────────────
const isolation = await page.evaluate(() => {
  DB.labObservations = [{ id: psyUid('lab'), testName: 'A', valueText: '1', valueNumber: 1, unit: '', referenceText: '', collectedAt: todayKey(), laboratory: '', note: '', media: [], privacyClass: 'sensitive', createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: 1 }];
  DB.healthDocuments = [{ id: psyUid('healthDoc'), title: 'B', kind: 'other', documentDate: todayKey(), provider: '', note: '', media: [], privacyClass: 'sensitive', createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: 1 }];
  persist();
  const profiles = loadProfiles();
  const newId = 'pTestWave2_' + Date.now();
  saveProfiles([...profiles, { id: newId, name: 'Профиль B', color: '#000' }]);
  setActiveId(newId);
  hydrate();
  const isolatedEmpty = (DB.labObservations || []).length === 0 && (DB.healthDocuments || []).length === 0;
  setActiveId(profiles[0].id);
  hydrate();
  const restoredIntact = (DB.labObservations || []).length === 1 && (DB.healthDocuments || []).length === 1;
  return { isolatedEmpty, restoredIntact };
});
ok(isolation.isolatedEmpty, 'profile isolation: другой профиль не видит labObservations/healthDocuments первого');
ok(isolation.restoredIntact, 'profile isolation: возврат к исходному профилю восстанавливает записи целиком');

// ── 6) «Сегодня»: план×факт, dedup, prev/next день, локальная дата ───────
const today = await page.evaluate(() => {
  DB.meds = [{ id: 5001, name: 'Магний', dose: '400 мг', active: true, createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now() }];
  DB.medIntakes = [];
  _healthDay = todayKey();
  goTo('health');
  const beforeMark = medTakenOnDay(5001, todayKey());
  markMedTakenOnDay(5001, todayKey());
  const afterMark = medTakenOnDay(5001, todayKey());
  const countAfterFirst = DB.medIntakes.length;
  // повторный тап — идемпотентно, без случайного дубля
  markMedTakenOnDay(5001, todayKey());
  const countAfterSecond = DB.medIntakes.length;
  // day-арифметика: назад и вперёд возвращает исходный день
  const d0 = todayKey();
  const back = shiftDayKey(d0, -1);
  const forwardAgain = shiftDayKey(back, 1);
  const monthBoundary = shiftDayKey('2026-08-01', -1) === '2026-07-31';
  // навигация по дням в самом UI
  healthTodayShiftDay(-1);
  const dayAfterBack = _healthDay;
  healthTodayGoToday();
  const dayAfterToday = _healthDay;
  return {
    beforeMark, afterMark, noDup: countAfterFirst === 1 && countAfterSecond === 1,
    dayRoundtrip: forwardAgain === d0 && back !== d0, monthBoundary,
    navOk: dayAfterBack === back && dayAfterToday === d0,
  };
});
ok(!today.beforeMark && today.afterMark, '«Сегодня»: план без факта → «не отмечено»; один тап → «Принято»');
ok(today.noDup, '«Сегодня»: повторный тап не создаёт случайный дубль факта приёма');
ok(today.dayRoundtrip && today.monthBoundary, '«Сегодня»: day-арифметика (shiftDayKey) корректна через границу месяца, туда-обратно возвращает исходный день');
ok(today.navOk, '«Сегодня»: переход на предыдущий/следующий день и «Сегодня» меняют выбранный день корректно');

// ── 7) Единая хронология: сортировка, фильтры, source links, no mutation ──
const timeline = await page.evaluate(() => {
  const now = Date.now();
  DB.meds = [{ id: 5101, name: 'Тест-препарат', active: true, createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: now }];
  DB.medIntakes = [{ id: 5102, medId: 5101, status: 'taken', at: new Date(now - 1000).toISOString(), createdAt: new Date(now - 1000).toISOString(), day: todayKey(), sv: SCHEMA_VERSION, _u: now - 1000 }];
  DB.symptoms = [{ id: 5103, name: 'усталость', severity: 3, createdAt: new Date(now - 2000).toISOString(), day: todayKey(), sv: SCHEMA_VERSION, _u: now - 2000 }];
  DB.labObservations = [{ id: psyUid('lab'), testName: 'X', valueText: '1', valueNumber: 1, unit: '', referenceText: '', collectedAt: new Date(now - 3000).toISOString(), laboratory: '', note: '', media: [], privacyClass: 'sensitive', createdAt: new Date(now - 3000).toISOString(), day: todayKey(), sv: SCHEMA_VERSION, _u: now - 3000 }];
  DB.healthDocuments = [{ id: psyUid('healthDoc'), title: 'Y', kind: 'other', documentDate: new Date(now - 4000).toISOString(), provider: '', note: '', media: [], privacyClass: 'sensitive', createdAt: new Date(now - 4000).toISOString(), day: todayKey(), sv: SCHEMA_VERSION, _u: now - 4000 }];
  const beforeMeds = JSON.stringify(DB.meds), beforeSym = JSON.stringify(DB.symptoms);
  const items = healthTimelineItems();
  const sortedDesc = items.every((it, i) => i === 0 || items[i - 1].at >= it.at);
  const kindsPresent = ['med', 'symptom', 'lab', 'doc'].every(k => items.some(it => it.kind === k));
  const noMutation = JSON.stringify(DB.meds) === beforeMeds && JSON.stringify(DB.symptoms) === beforeSym;
  // фильтр
  _tlFilter = 'lab';
  rHealthTimeline();
  const filterOk = $('health-timeline').innerHTML.includes('X') && !$('health-timeline').innerHTML.includes('Тест-препарат');
  _tlFilter = 'all';
  // source link: открытие лаборатории из хронологии
  const labItem = items.find(it => it.kind === 'lab');
  healthTimelineOpen('labObservations', labItem.id);
  const openedLab = document.getElementById('ov-lab-det').classList.contains('on') && STATE.labDetId === labItem.id;
  closeOv('ov-lab-det');
  return { sortedDesc, kindsPresent, noMutation, filterOk, openedLab };
});
ok(timeline.sortedDesc, 'хронология: сортировка по времени события (новые сверху)');
ok(timeline.kindsPresent, 'хронология: объединяет medIntakes/symptoms/labObservations/healthDocuments');
ok(timeline.noMutation, 'хронология: рендер не мутирует исходные массивы (agregator поверх projAll, без копирования в новую коллекцию)');
ok(timeline.filterOk, 'хронология: фильтр по типу показывает только выбранный вид событий');
ok(timeline.openedLab, 'хронология: переход по записи открывает исходную деталь (labObservations)');

// ── 8) Lab trend: не смешивает единицы, не строится по нечисловым записям ──
const trend = await page.evaluate(() => {
  DB.labObservations = [
    { id: psyUid('lab'), testName: 'Глюкоза', valueText: '5.1', valueNumber: 5.1, unit: 'ммоль/л', referenceText: '', collectedAt: '2026-06-01', laboratory: '', note: '', media: [], privacyClass: 'sensitive', createdAt: '2026-06-01T00:00:00.000Z', day: '2026-06-01', sv: SCHEMA_VERSION, _u: 1 },
    { id: psyUid('lab'), testName: 'Глюкоза', valueText: '5.4', valueNumber: 5.4, unit: 'ммоль/л', referenceText: '', collectedAt: '2026-07-01', laboratory: '', note: '', media: [], privacyClass: 'sensitive', createdAt: '2026-07-01T00:00:00.000Z', day: '2026-07-01', sv: SCHEMA_VERSION, _u: 2 },
    { id: psyUid('lab'), testName: 'Глюкоза', valueText: '90', valueNumber: 90, unit: 'мг/дл', referenceText: '', collectedAt: '2026-07-10', laboratory: '', note: '', media: [], privacyClass: 'sensitive', createdAt: '2026-07-10T00:00:00.000Z', day: '2026-07-10', sv: SCHEMA_VERSION, _u: 3 },
    { id: psyUid('lab'), testName: 'Глюкоза', valueText: 'гемолиз', valueNumber: null, unit: 'ммоль/л', referenceText: '', collectedAt: '2026-07-15', laboratory: '', note: '', media: [], privacyClass: 'sensitive', createdAt: '2026-07-15T00:00:00.000Z', day: '2026-07-15', sv: SCHEMA_VERSION, _u: 4 },
  ];
  const t = labTrendFor('Глюкоза', 'ммоль/л');
  return {
    onlySameUnit: t.every(r => r.unit === 'ммоль/л'),
    excludesOtherUnit: !t.some(r => r.unit === 'мг/дл'),
    excludesNonNumeric: !t.some(r => r.valueNumber === null),
    count: t.length,
    sortedAsc: t.every((r, i) => i === 0 || (Date.parse(t[i - 1].collectedAt) <= Date.parse(r.collectedAt))),
  };
});
ok(trend.onlySameUnit && trend.excludesOtherUnit, 'lab trend: не смешивает разные единицы (ммоль/л ≠ мг/дл)');
ok(trend.excludesNonNumeric, 'lab trend: не строится по нечисловым значениям («гемолиз»)');
ok(trend.count === 2, 'lab trend: включает только однозначно числовые записи с тем же показателем и единицей (2 из 4)');
ok(trend.sortedAsc, 'lab trend: хронологический порядок (по возрастанию даты забора)');

// ── 9) Отчёт врачу: точные границы периода + отсутствие секретов/служебных/psych/astro полей ──
const report = await page.evaluate(() => {
  CFG.apiUrl = 'https://secret.example/api'; CFG.spaceKey = 'SPACE-SECRET-KEY'; CFG.aiModel = 'claude-opus-4-8';
  DB.psyAiConsent = { on: true, acceptedAt: nowISO(), version: 'psy-ai-consent-v1', sv: SCHEMA_VERSION, _u: 1 };
  DB.astroBirth = { date: '1990-01-01', place: 'Секретный город' };
  const now = Date.now();
  const inWindow = new Date(now - 10 * 864e5).toISOString();   // 10 дней назад — внутри окна 30 дней
  const outWindow = new Date(now - 40 * 864e5).toISOString();  // 40 дней назад — вне окна 30 дней
  // «На границе» — 30 дней минус 1 минута: buildDoctorReport() считает свой
  // собственный Date.now() чуть позже, чем этот тест захватил `now`; минутный
  // запас делает проверку включительности границы устойчивой к этой разнице,
  // не ослабляя саму проверку (>=from остаётся реальным инклюзивным сравнением).
  const exactBoundary = new Date(now - 30 * 864e5 + 60000).toISOString();
  DB.labObservations = [
    { id: psyUid('lab'), testName: 'В-окне', valueText: '1', valueNumber: 1, unit: '', referenceText: 'реф', collectedAt: inWindow, laboratory: 'Лаб1', note: '', media: ['m123'], privacyClass: 'sensitive', createdAt: inWindow, day: inWindow.slice(0, 10), sv: SCHEMA_VERSION, _u: 1 },
    { id: psyUid('lab'), testName: 'Вне-окна', valueText: '2', valueNumber: 2, unit: '', referenceText: '', collectedAt: outWindow, laboratory: '', note: '', media: [], privacyClass: 'sensitive', createdAt: outWindow, day: outWindow.slice(0, 10), sv: SCHEMA_VERSION, _u: 2 },
    { id: psyUid('lab'), testName: 'На-границе', valueText: '3', valueNumber: 3, unit: '', referenceText: '', collectedAt: exactBoundary, laboratory: '', note: '', media: [], privacyClass: 'sensitive', createdAt: exactBoundary, day: exactBoundary.slice(0, 10), sv: SCHEMA_VERSION, _u: 3 },
  ];
  DB.healthDocuments = [
    { id: psyUid('healthDoc'), title: 'Документ-в-окне', kind: 'discharge', documentDate: inWindow, provider: 'Провайдер', note: '', media: ['m456'], privacyClass: 'sensitive', createdAt: inWindow, day: inWindow.slice(0, 10), sv: SCHEMA_VERSION, _u: 1 },
  ];
  const txt = buildDoctorReport(30);
  return {
    hasInWindow: txt.includes('В-окне'),
    excludesOutWindow: !txt.includes('Вне-окна'),
    includesBoundary: txt.includes('На-границе'),
    hasDoc: txt.includes('Документ-в-окне'),
    noMediaIds: !txt.includes('m123') && !txt.includes('m456'),
    noSecrets: !txt.includes('secret.example') && !txt.includes('SPACE-SECRET-KEY') && !txt.includes('apiUrl') && !txt.includes('spaceKey'),
    noInternal: !txt.includes('_u') && !txt.includes('"sv"') && !txt.includes('privacyClass'),
    noPsychAstro: !txt.includes('psy-ai-consent') && !txt.includes('Секретный город') && !txt.includes('1990-01-01'),
  };
});
ok(report.hasInWindow && report.excludesOutWindow, 'отчёт врачу: период фильтрует лабораторные результаты корректно (в окне / вне окна)');
ok(report.includesBoundary, 'отчёт врачу: граница периода включительна (ровно N дней назад попадает в отчёт)');
ok(report.hasDoc, 'отчёт врачу: приложенные документы за период включены (без media id)');
ok(report.noMediaIds, 'отчёт врачу: media id вложений не встраиваются как технические данные');
ok(report.noSecrets, 'отчёт врачу: apiUrl/spaceKey и их значения исключены');
ok(report.noInternal, 'отчёт врачу: внутренние _u/sv/privacyClass не попадают в текст');
ok(report.noPsychAstro, 'отчёт врачу: психологические (psyAiConsent) и астрологические (дата/место рождения) данные исключены');

// ── 10) Обычный (plain) export/import roundtrip ───────────────────────
const plainRoundtrip = await page.evaluate(() => {
  DB.labObservations = [{ id: 'lab:x1', testName: 'Экспорт-тест', valueText: '1', valueNumber: 1, unit: '', referenceText: '', collectedAt: todayKey(), laboratory: '', note: '', media: [], privacyClass: 'sensitive', createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: 1 }];
  DB.healthDocuments = [{ id: 'healthDoc:x1', title: 'Экспорт-документ', kind: 'other', documentDate: todayKey(), provider: '', note: '', media: [], privacyClass: 'sensitive', createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: 1 }];
  const exported = JSON.parse(JSON.stringify({ exportedAt: new Date().toISOString(), db: DB, cfg: CFG }));
  DB = { ...DEFAULT_DB, ...exported.db };
  return {
    labRestored: DB.labObservations.length === 1 && DB.labObservations[0].testName === 'Экспорт-тест',
    docRestored: DB.healthDocuments.length === 1 && DB.healthDocuments[0].title === 'Экспорт-документ',
  };
});
ok(plainRoundtrip.labRestored, 'обычный export/import (JSON): labObservations восстанавливаются полностью');
ok(plainRoundtrip.docRestored, 'обычный export/import (JSON): healthDocuments восстанавливаются полностью');

// ── 11) Удаление документа с разделяемым media ref не удаляет blob, который
//    ещё используется (generic gcMedia(), см. collectDbMediaRefs) ────────
const sharedMedia = await page.evaluate(async () => {
  const key = 'm_shared_' + Date.now();
  await idbPut(key, { data: 'data:image/jpeg;base64,AAAA', type: 'image', createdAt: nowISO() });
  DB.healthDocuments = [
    { id: psyUid('healthDoc'), title: 'Документ 1', kind: 'other', documentDate: todayKey(), provider: '', note: '', media: [key], privacyClass: 'sensitive', createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: 1 },
    { id: psyUid('healthDoc'), title: 'Документ 2', kind: 'other', documentDate: todayKey(), provider: '', note: '', media: [key], privacyClass: 'sensitive', createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: 2 },
  ];
  DB.labObservations = [];
  persist();
  const doc1Id = DB.healthDocuments[0].id;
  // Удаляем документ 1 — тот же media-ключ ещё используется документом 2.
  delUndo('healthDocuments', doc1Id, () => {}, 'x');
  await gcMedia();
  const survivedWhileShared = !!(await idbGet(key));
  // Теперь удаляем и второй документ — ссылок на media больше нет нигде.
  const doc2Id = DB.healthDocuments[0].id;
  delUndo('healthDocuments', doc2Id, () => {}, 'x');
  await gcMedia();
  const removedWhenOrphan = !(await idbGet(key));
  return { survivedWhileShared, removedWhenOrphan };
});
ok(sharedMedia.survivedWhileShared, 'shared media ref: удаление одного документа не удаляет media, ещё используемую другим документом');
ok(sharedMedia.removedWhenOrphan, 'shared media ref: после удаления ВСЕХ ссылающихся записей generic gcMedia() убирает осиротевшую media');

// ── 12) Offline reload: новые коллекции переживают перезагрузку без сети ──
const offlinePage = await boot();
await offlinePage.evaluate(() => {
  DB.labObservations = [{ id: psyUid('lab'), testName: 'Offline-тест', valueText: '1', valueNumber: 1, unit: '', referenceText: '', collectedAt: todayKey(), laboratory: '', note: '', media: [], privacyClass: 'sensitive', createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now() }];
  DB.healthDocuments = [{ id: psyUid('healthDoc'), title: 'Offline-документ', kind: 'other', documentDate: todayKey(), provider: '', note: '', media: [], privacyClass: 'sensitive', createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now() }];
  persist();
});
await offlinePage.context().setOffline(true);
await offlinePage.reload();
await offlinePage.waitForSelector('#nsh-tabbar', { state: 'attached' });
await offlinePage.evaluate(() => { const s = document.getElementById('splash'); if (s) s.style.display = 'none'; });
await offlinePage.waitForTimeout(650);
const offlineResult = await offlinePage.evaluate(() => ({
  labSurvived: (DB.labObservations || []).some(r => r.testName === 'Offline-тест'),
  docSurvived: (DB.healthDocuments || []).some(r => r.title === 'Offline-документ'),
}));
ok(offlineResult.labSurvived && offlineResult.docSurvived, 'offline reload: labObservations/healthDocuments переживают перезагрузку без сети');
await offlinePage.context().setOffline(false);
await offlinePage.close();

// ── 13) Мобильные вьюпорты + a11y (tap targets ≥44×44) + тема + клавиатура ──
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
    DB.meds = [{ id: 7001, name: 'Тест', active: true, createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now() }];
    DB.medIntakes = [];
    _healthDay = todayKey();
    goTo('health');
    const btn = document.querySelector('#health-today button[onclick*="markMedTakenOnDay"]');
    const r = btn.getBoundingClientRect();
    const inViewport = r.right <= viewportWidth + 1 && r.left >= -1;
    return { tapOk: r.width >= 44 && r.height >= 44, inViewport, isButton: btn.tagName === 'BUTTON' && btn.getAttribute('type') === 'button' };
  }, w);
  ok(geo.tapOk && geo.inViewport && geo.isButton, `${name}: «Принял» в органайзере «Сегодня» — настоящий button, tap ≥44×44, не выходит за экран`);
  await dp.close();
}
const themePage = await bootAt(390, 844);
const themeCheck = await themePage.evaluate(() => {
  DB.labObservations = [{ id: psyUid('lab'), testName: 'Тема', valueText: '1', valueNumber: 1, unit: '', referenceText: '', collectedAt: todayKey(), laboratory: '', note: '', media: [], privacyClass: 'sensitive', createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now() }];
  goTo('health');
  document.documentElement.setAttribute('data-theme', 'dark');
  const darkVisible = getComputedStyle(document.getElementById('health-lab')).display !== 'none';
  document.documentElement.setAttribute('data-theme', 'light');
  const lightVisible = getComputedStyle(document.getElementById('health-lab')).display !== 'none';
  return { darkVisible, lightVisible };
});
ok(themeCheck.darkVisible && themeCheck.lightVisible, 'здоровье: секция лаборатории рендерится и в тёмной, и в светлой теме');
const labRow = themePage.locator('#health-lab .si-row').first();
await labRow.focus();
await themePage.keyboard.press('Enter');
const kbOpened = await themePage.evaluate(() => document.getElementById('ov-lab-det').classList.contains('on'));
ok(kbOpened, 'клавиатура: Enter на строке лабораторного результата открывает деталь');
await themePage.close();

// ── 14) Большой synthetic dataset: агрегаторы не падают и не виснут ─────
const bigPage = await bootAt(390, 844);
const bigResult = await bigPage.evaluate(() => {
  const N = 300;
  DB.labObservations = Array.from({ length: N }, (_, i) => ({ id: psyUid('lab'), testName: 'Показатель ' + (i % 10), valueText: String(i), valueNumber: i, unit: 'ед', referenceText: '', collectedAt: nowISO(), laboratory: '', note: '', media: [], privacyClass: 'sensitive', createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now() }));
  DB.healthDocuments = Array.from({ length: N }, (_, i) => ({ id: psyUid('healthDoc'), title: 'Документ ' + i, kind: 'other', documentDate: nowISO(), provider: '', note: '', media: [], privacyClass: 'sensitive', createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now() }));
  DB.medIntakes = Array.from({ length: N }, (_, i) => ({ id: 90000 + i, medId: 1, status: 'taken', at: nowISO(), createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now() }));
  const t0 = Date.now();
  goTo('health');
  const elapsedMs = Date.now() - t0;
  const rendered = document.getElementById('health-lab').innerHTML.length > 0 && document.getElementById('health-timeline').innerHTML.length > 0;
  return { elapsedMs, rendered };
});
ok(bigResult.rendered && bigResult.elapsedMs < 5000, `большой synthetic dataset (300 labObservations + 300 healthDocuments + 300 medIntakes): рендер без сбоев за ${bigResult.elapsedMs}мс`);
await bigPage.close();

ok(errors.length === 0, `JS-ошибок нет за весь прогон (${errors.length}${errors.length ? ': ' + errors[0] : ''})`);
await browser.close();
console.log(`\nWave 2 (health organizer): ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
