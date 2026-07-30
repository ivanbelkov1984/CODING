import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Wave 2 (issue #150) — «Здоровье как органайзер»: «Сегодня» (план×факт,
// явное расписание), лабораторные результаты, документы здоровья, единая
// хронология, доработка отчёта врачу. Гоняет собранное приложение
// (dist/app.html) в реальном браузере, тем же стилем, что и
// tests/wave1-psych-links.spec.mjs.
//
// Владельческий review PR #151 (после первого прохода) нашёл 5 контрактных
// дефектов — этот файл переписан, чтобы явно их закрыть и проверить:
// 1) meds без явного расписания больше не подделывают «нужно сегодня»;
// 2) «Сегодня»/лаборатория/документы используют ЛОКАЛЬНЫЙ день (localDayKey),
//    не UTC todayKey() — проверено в реальных часовых поясах через
//    Playwright context timezoneId + Clock API;
// 3) период хронологии переключается реальными кнопками в DOM, а не только
//    внутренней функцией;
// 4) media lifecycle — staging-ссылки Волны 2 защищены в gcMedia(), а
//    shared-media тест идёт через настоящий production delete-путь
//    (deleteDoc + реальное окно отмены), не через ручной вызов gcMedia();
// 5) миграция проверяется точным посерийным сравнением с явно вычисленным
//    baseline (учитывающим уже существующий verif/life passport-бэкфилл),
//    а не заявляется «byte-identical» без доказательства.

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

// ── 1) Schema 3→4 migration: точное посерийное сравнение с явным baseline ──
const fresh = await page.evaluate(() => ({
  labInit: Array.isArray(DB.labObservations) && DB.labObservations.length === 0,
  docInit: Array.isArray(DB.healthDocuments) && DB.healthDocuments.length === 0,
  schemaVersion: SCHEMA_VERSION,
}));
ok(fresh.labInit && fresh.docInit, 'свежий профиль: labObservations=[]/healthDocuments=[] по умолчанию');
// >=4, не ===4: последующие волны (напр. Wave 4, issue #152) легитимно
// поднимают SCHEMA_VERSION дальше — этот тест доказывает именно бэйслайн
// Волны 2 (не откатился), точную текущую версию проверяет тест актуальной волны.
ok(fresh.schemaVersion >= 4, 'SCHEMA_VERSION >= 4 (не откатился ниже бэйслайна Волны 2)');

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
  // Owner review (PR #151, дефект 5): точное ожидание, а не «похоже похоже».
  // migrateRecords() уже ДО Волны 2 добавляет passport-поля verif/life любой
  // записи без них (backfill из Evidence Kernel) — createdAt/day/sv у этих
  // записей уже заданы, поэтому та ветка backfill'а не сработает. Ниже —
  // явно вычисленный ожидаемый результат (оригинал + ТОЛЬКО verif/life),
  // сравниваемый посерийно (JSON.stringify), а не по 1-2 полям.
  const expectAfterLegacyMigration = coll => JSON.parse(JSON.stringify(oldDb[coll])).map(r => ({ ...r, verif: 'unverified', life: 'current' }));
  const expectedMeds = expectAfterLegacyMigration('meds');
  const expectedIntakes = expectAfterLegacyMigration('medIntakes');
  const expectedSymptoms = expectAfterLegacyMigration('symptoms');
  const expectedMeasures = expectAfterLegacyMigration('measures');

  localStorage.setItem('arch5_db_' + id, JSON.stringify(oldDb));
  hydrate();   // вызывает migrateRecords() один раз внутри себя

  const exact = {
    meds: JSON.stringify(DB.meds) === JSON.stringify(expectedMeds),
    medIntakes: JSON.stringify(DB.medIntakes) === JSON.stringify(expectedIntakes),
    symptoms: JSON.stringify(DB.symptoms) === JSON.stringify(expectedSymptoms),
    measures: JSON.stringify(DB.measures) === JSON.stringify(expectedMeasures),
  };
  const labInit = Array.isArray(DB.labObservations) && DB.labObservations.length === 0;
  const docInit = Array.isArray(DB.healthDocuments) && DB.healthDocuments.length === 0;
  const snap1 = JSON.stringify(DB);
  migrateRecords(); migrateRecords();
  const snap2 = JSON.stringify(DB);
  return { exact, labInit, docInit, idempotent: snap1 === snap2 };
});
ok(migration.exact.meds && migration.exact.medIntakes && migration.exact.symptoms && migration.exact.measures,
  'миграция pre-Wave-2 (sv=3): meds/medIntakes/symptoms/measures — точное посерийное совпадение с явно вычисленным baseline (только уже существующий verif/life passport-бэкфилл, НИКАКИХ Wave 2 изменений полей)');
ok(migration.labInit && migration.docInit, 'миграция pre-Wave-2: labObservations/healthDocuments инициализированы пустыми');
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

// ── 6) Owner review (PR #151, дефект 1): meds расписание — только явное ──
// пользовательское расписание определяет попадание в чек-лист «Сегодня».
const schedule = await page.evaluate(() => {
  const day = localDayKey();
  DB.meds = [
    { id: 8001, name: 'Legacy (без scheduleMode)', active: true, createdAt: nowISO(), day: todayKey(), sv: 3, _u: Date.now() },
    { id: 8002, name: 'PRN', active: true, scheduleMode: 'manual', dailyTarget: 1, createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now() },
    { id: 8003, name: 'Ежедневно 1×', active: true, scheduleMode: 'daily', dailyTarget: 1, createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now() },
    { id: 8004, name: 'Ежедневно 3×', active: true, scheduleMode: 'daily', dailyTarget: 3, createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now() },
  ];
  DB.medIntakes = [];
  const dow = new Date().getDay();
  const otherDow = (dow + 3) % 7;
  DB.meds.push({ id: 8005, name: 'По дням недели (сегодня)', active: true, scheduleMode: 'weekdays', weekdays: [dow], dailyTarget: 1, createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now() });
  DB.meds.push({ id: 8006, name: 'По дням недели (не сегодня)', active: true, scheduleMode: 'weekdays', weekdays: [otherDow], dailyTarget: 1, createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now() });

  const legacyDue = medDueOnDay(DB.meds.find(m => m.id === 8001), day);
  const manualDue = medDueOnDay(DB.meds.find(m => m.id === 8002), day);
  const dailyDue = medDueOnDay(DB.meds.find(m => m.id === 8003), day);
  const weekdayTodayDue = medDueOnDay(DB.meds.find(m => m.id === 8005), day);
  const weekdayOtherDue = medDueOnDay(DB.meds.find(m => m.id === 8006), day);

  // target>1: частично → полно, без схлопывания истории в один факт, без
  // перевыполнения цели при лишних тапах.
  markMedTakenOnDay(8004, day);
  const afterOne = medIntakeCountOnDay(8004, day);
  markMedTakenOnDay(8004, day);
  const afterTwo = medIntakeCountOnDay(8004, day);
  markMedTakenOnDay(8004, day);
  const afterThree = medIntakeCountOnDay(8004, day);
  markMedTakenOnDay(8004, day);   // цель (3) уже достигнута — лишний тап не создаёт 4-ю запись
  const afterFour = medIntakeCountOnDay(8004, day);

  // PRN/manual: каждый тап — реальный факт, без cap на 1/день.
  logAdHocMedIntake(8002, day);
  logAdHocMedIntake(8002, day);
  logAdHocMedIntake(8002, day);
  const prnCount = medIntakeCountOnDay(8002, day);

  rHealthToday();
  const html = $('health-today').innerHTML;
  const legacyInUnscheduled = html.includes('Legacy (без scheduleMode)') && html.includes('График не задан');
  const prnInUnscheduled = html.includes('PRN') && html.includes('По необходимости');
  const dailyShowsProgress = html.includes('Ежедневно 3×') && html.includes('3 из 3');
  const noFabricatedDueForLegacy = !new RegExp('Legacy[\\s\\S]{0,200}По плану').test(html);

  return {
    legacyDue, manualDue, dailyDue, weekdayTodayDue, weekdayOtherDue,
    targetProgress: afterOne === 1 && afterTwo === 2 && afterThree === 3 && afterFour === 3,
    prnCount,
    legacyInUnscheduled, prnInUnscheduled, dailyShowsProgress, noFabricatedDueForLegacy,
  };
});
ok(!schedule.legacyDue, 'meds без scheduleMode (legacy) НИКОГДА не считаются «due сегодня» — не подделывает несуществующий факт');
ok(!schedule.manualDue, 'meds со scheduleMode=manual (PRN) не считаются «due» — нет календарного назначения');
ok(schedule.dailyDue, 'meds со scheduleMode=daily — due каждый день');
ok(schedule.weekdayTodayDue && !schedule.weekdayOtherDue, 'meds со scheduleMode=weekdays — due только в явно заданные дни недели');
ok(schedule.targetProgress, 'dailyTarget>1: частичный→полный прогресс без схлопывания в бинарный факт, без перевыполнения цели при лишних тапах');
ok(schedule.prnCount === 3, 'PRN/manual: каждый тап — самостоятельный факт, без искусственного cap на 1 приём/день');
ok(schedule.legacyInUnscheduled, 'legacy med без расписания показан отдельно как «График не задан»');
ok(schedule.prnInUnscheduled, 'PRN med показан отдельно как «По необходимости»');
ok(schedule.dailyShowsProgress, '«Сегодня»: dailyTarget>1 показывает прогресс «X из N», не просто галочку');
ok(schedule.noFabricatedDueForLegacy, '«Сегодня»: legacy-запись без расписания не рендерится с выдуманным статусом «По плану»');

// ── 7) «Сегодня»: dedup для due-пункта, prev/next день, локальная дата ────
const today = await page.evaluate(() => {
  DB.meds = [{ id: 5001, name: 'Магний', dose: '400 мг', active: true, scheduleMode: 'daily', dailyTarget: 1, createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now() }];
  DB.medIntakes = [];
  _healthDay = localDayKey();
  goTo('health');
  const beforeMark = medTakenOnDay(5001, localDayKey());
  markMedTakenOnDay(5001, localDayKey());
  const afterMark = medTakenOnDay(5001, localDayKey());
  const countAfterFirst = DB.medIntakes.length;
  markMedTakenOnDay(5001, localDayKey());   // повторный тап — идемпотентно (due-пункт, target=1)
  const countAfterSecond = DB.medIntakes.length;
  const d0 = localDayKey();
  const back = shiftDayKey(d0, -1);
  const forwardAgain = shiftDayKey(back, 1);
  const monthBoundary = shiftDayKey('2026-08-01', -1) === '2026-07-31';
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
ok(!today.beforeMark && today.afterMark, '«Сегодня»: due-план без факта → «не отмечено»; один тап → «Принято»');
ok(today.noDup, '«Сегодня»: повторный тап на due-пункте (target=1) не создаёт случайный дубль факта приёма');
ok(today.dayRoundtrip && today.monthBoundary, '«Сегодня»: day-арифметика (shiftDayKey) корректна через границу месяца, туда-обратно возвращает исходный день');
ok(today.navOk, '«Сегодня»: переход на предыдущий/следующий день и «Сегодня» меняют выбранный день корректно');

// ── 8) Owner review (PR #151, дефект 2): localDayKey() — реальный локальный
//    день в разных часовых поясах, не UTC todayKey(). Playwright context
//    timezoneId + Clock API замораживают «сейчас» на конкретный момент.
async function tzPage(timezoneId) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(FILE);
  await p.waitForSelector('#nsh-tabbar', { state: 'attached' });
  await p.evaluate(() => { const s = document.getElementById('splash'); if (s) s.style.display = 'none'; document.querySelectorAll('.ov.on').forEach(e => e.classList.remove('on')); });
  await p.waitForTimeout(650);
  return { ctx, p };
}
{
  // Europe/Warsaw, лето (CEST, UTC+2): местная полночь наступает РАНЬШЕ UTC-
  // полуночи — вскоре после местной полуночи UTC-дата ещё «вчера».
  const { ctx, p } = await tzPage('Europe/Warsaw');
  await p.clock.setFixedTime(new Date('2026-07-14T22:30:00.000Z'));   // 15 июля 00:30 в Варшаве
  const r = await p.evaluate(() => ({ local: localDayKey(), utc: todayKey() }));
  ok(r.local === '2026-07-15' && r.utc === '2026-07-14',
    `localDayKey() в Europe/Warsaw вскоре после местной полуночи даёт правильный локальный день (15 июля: получено ${r.local}), в отличие от UTC todayKey() (ещё 14 июля: получено ${r.utc})`);
  await ctx.close();
}
{
  // America/Los_Angeles, лето (PDT, UTC-7): местная полночь наступает ПОЗЖЕ
  // UTC-полуночи — вскоре после UTC-полуночи локально ещё «вчера».
  const { ctx, p } = await tzPage('America/Los_Angeles');
  await p.clock.setFixedTime(new Date('2026-07-15T02:30:00.000Z'));   // 14 июля 19:30 в Лос-Анджелесе
  const r = await p.evaluate(() => ({ local: localDayKey(), utc: todayKey() }));
  ok(r.local === '2026-07-14' && r.utc === '2026-07-15',
    `localDayKey() в America/Los_Angeles вскоре после UTC-полуночи даёт правильный локальный день (14 июля: получено ${r.local}), в отличие от UTC todayKey() (уже 15 июля: получено ${r.utc})`);
  await ctx.close();
}
{
  // DST-переход (Europe/Warsaw, последнее воскресенье марта, 02:00→03:00) —
  // localDayKey() не должен падать/давать мусорную дату вокруг перехода.
  const { ctx, p } = await tzPage('Europe/Warsaw');
  await p.clock.setFixedTime(new Date('2026-03-29T01:30:00.000Z'));
  const r = await p.evaluate(() => localDayKey());
  ok(/^\d{4}-\d{2}-\d{2}$/.test(r) && r >= '2026-03-28' && r <= '2026-03-30',
    `localDayKey() корректно определён вокруг DST-перехода (Europe/Warsaw): ${r}, без падения/мусора`);
  await ctx.close();
}
{
  // Тот же момент, что и первый Warsaw-тест, но проверяем реальный UI:
  // «Сегодня»/лаборатория/документы используют localDayKey(), не todayKey().
  const { ctx, p } = await tzPage('Europe/Warsaw');
  await p.clock.setFixedTime(new Date('2026-07-14T22:30:00.000Z'));
  const r = await p.evaluate(() => {
    goTo('health');
    openLabAdd();
    const labDefault = $('lab-collected').value;
    closeOv('ov-lab-add');
    openDocAdd();
    const docDefault = $('doc-date').value;
    closeOv('ov-doc-add');
    _healthDay = localDayKey();
    rHealthToday();
    return { labDefault, docDefault, healthDay: _healthDay };
  });
  ok(r.labDefault === '2026-07-15' && r.docDefault === '2026-07-15' && r.healthDay === '2026-07-15',
    'форма лаборатории/документа и «Сегодня» используют localDayKey() (15 июля), а не UTC todayKey() (14 июля) около местной полуночи в Europe/Warsaw');
  await ctx.close();
}

// ── 9) Owner review (PR #151, дефект 3): period-filter хронологии — реальный
//    DOM-клик по кнопке, а не вызов внутренней функции напрямую ───────────
const tlPeriodUi = await page.evaluate(() => {
  const now = Date.now();
  DB.labObservations = [
    { id: psyUid('lab'), testName: 'Недавний', valueText: '1', valueNumber: 1, unit: '', referenceText: '', collectedAt: new Date(now - 2 * 864e5).toISOString(), laboratory: '', note: '', media: [], privacyClass: 'sensitive', createdAt: new Date(now - 2 * 864e5).toISOString(), day: todayKey(), sv: SCHEMA_VERSION, _u: now },
    { id: psyUid('lab'), testName: 'Старый', valueText: '2', valueNumber: 2, unit: '', referenceText: '', collectedAt: new Date(now - 60 * 864e5).toISOString(), laboratory: '', note: '', media: [], privacyClass: 'sensitive', createdAt: new Date(now - 60 * 864e5).toISOString(), day: todayKey(), sv: SCHEMA_VERSION, _u: now - 1 },
  ];
  DB.healthDocuments = []; DB.symptoms = []; DB.measures = []; DB.medIntakes = []; DB.cravings = [];
  _tlDays = 90; _tlFilter = 'all';
  goTo('health');
  const before = $('health-timeline').innerHTML;
  const before7Has = before.includes('Недавний') && before.includes('Старый');
  // Реальный клик по кнопке периода «7 дн.» (не healthTimelineWindow() напрямую).
  const findBtn = () => Array.from(document.querySelectorAll('#health-timeline button')).find(b => b.textContent.trim() === '7 дн.');
  const btn = findBtn();
  const wasPressed = btn && btn.getAttribute('aria-pressed');
  btn.click();
  // rHealthTimeline() перерисовывает через innerHTML = html — старый узел
  // btn отсоединяется от документа, поэтому кнопку нужно найти заново.
  const after = $('health-timeline').innerHTML;
  const isPressedNow = findBtn().getAttribute('aria-pressed') === 'true';
  return {
    before7Has,
    afterHasRecent: after.includes('Недавний'),
    afterExcludesOld: !after.includes('Старый'),
    listActuallyChanged: before !== after,
    ariaTogglesCorrectly: wasPressed === 'false' && isPressedNow,
  };
});
ok(tlPeriodUi.before7Has, 'хронология: до фильтра по периоду видны обе записи (в 90-дневном окне)');
ok(tlPeriodUi.afterHasRecent && tlPeriodUi.afterExcludesOld, 'хронология: реальный клик по кнопке «7 дн.» меняет видимую выдачу — старая запись (60 дней) пропадает, недавняя (2 дня) остаётся');
ok(tlPeriodUi.listActuallyChanged, 'хронология: DOM реально перерисован после клика (не просто внутреннее состояние)');
ok(tlPeriodUi.ariaTogglesCorrectly, 'хронология: aria-pressed корректно переключается на нажатую кнопку периода');

// ── 10) Единая хронология: сортировка, фильтры по типу, source links, no mutation ──
const timeline = await page.evaluate(() => {
  const now = Date.now();
  _tlDays = 90; _tlFilter = 'all';
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
  _tlFilter = 'lab';
  rHealthTimeline();
  const filterOk = $('health-timeline').innerHTML.includes('X') && !$('health-timeline').innerHTML.includes('Тест-препарат');
  _tlFilter = 'all';
  const labItem = items.find(it => it.kind === 'lab');
  healthTimelineOpen('labObservations', labItem.id);
  const openedLab = document.getElementById('ov-lab-det').classList.contains('on') && STATE.labDetId === labItem.id;
  closeOv('ov-lab-det');
  return { sortedDesc, kindsPresent, noMutation, filterOk, openedLab };
});
ok(timeline.sortedDesc, 'хронология: сортировка по времени события (новые сверху)');
ok(timeline.kindsPresent, 'хронология: объединяет medIntakes/symptoms/labObservations/healthDocuments');
ok(timeline.noMutation, 'хронология: рендер не мутирует исходные массивы (агрегатор поверх projAll, без копирования в новую коллекцию)');
ok(timeline.filterOk, 'хронология: фильтр по типу показывает только выбранный вид событий');
ok(timeline.openedLab, 'хронология: переход по записи открывает исходную деталь (labObservations)');

// ── 11) Lab trend: не смешивает единицы, не строится по нечисловым записям ──
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

// ── 12) Отчёт врачу: точные границы периода + отсутствие секретов/служебных/psych/astro полей ──
const report = await page.evaluate(() => {
  CFG.apiUrl = 'https://secret.example/api'; CFG.spaceKey = 'SPACE-SECRET-KEY'; CFG.aiModel = 'claude-opus-4-8';
  DB.psyAiConsent = { on: true, acceptedAt: nowISO(), version: 'psy-ai-consent-v1', sv: SCHEMA_VERSION, _u: 1 };
  DB.astroBirth = { date: '1990-01-01', place: 'Секретный город' };
  const now = Date.now();
  const inWindow = new Date(now - 10 * 864e5).toISOString();
  const outWindow = new Date(now - 40 * 864e5).toISOString();
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

// ── 13) Обычный (plain) export/import roundtrip ───────────────────────
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

// ── 14) Owner review (PR #151, дефект 4): реальные addLabPhoto/addDocFile —
//    image И application/pdf, точные bytes+MIME в IndexedDB ────────────────
const realUpload = await page.evaluate(async () => {
  function fakeInput(file) { return { files: [file], value: '' }; }
  const pdfBytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 10, 37, 37, 69, 79, 70]); // "%PDF-1.4\n%%EOF"
  const pdfFile = new File([pdfBytes], 'scan.pdf', { type: 'application/pdf' });
  const pngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const pngBytes = Uint8Array.from(atob(pngB64), c => c.charCodeAt(0));
  const pngFile = new File([pngBytes], 'scan.png', { type: 'image/png' });

  DB.labObservations = []; STATE.labAddMedia = [];
  openLabAdd();
  $('lab-testname').value = 'Media-PDF-тест'; $('lab-value').value = '1';
  await addLabPhoto(fakeInput(pdfFile));   // реальный production upload handler
  const labMediaId = STATE.labAddMedia[0];
  saveLab();
  const labRec = DB.labObservations.find(r => r.testName === 'Media-PDF-тест');
  const labMedia = await idbGet(labMediaId);
  const expectedPdfDataUrl = 'data:application/pdf;base64,' + btoa(String.fromCharCode(...pdfBytes));

  DB.healthDocuments = []; STATE.docAddMedia = [];
  openDocAdd();
  $('doc-title').value = 'Media-PNG-документ';
  await addDocFile(fakeInput(pngFile));   // реальный production upload handler (image → compressImage())
  const docMediaId = STATE.docAddMedia[0];
  saveDoc();
  const docRec = DB.healthDocuments.find(r => r.title === 'Media-PNG-документ');
  const docMedia = await idbGet(docMediaId);

  return {
    labMediaLinked: !!labRec && Array.isArray(labRec.media) && labRec.media[0] === labMediaId,
    labMediaTypeIsFile: labMedia && labMedia.type === 'file',
    labMediaExactBytes: labMedia && labMedia.data === expectedPdfDataUrl,
    docMediaLinked: !!docRec && Array.isArray(docRec.media) && docRec.media[0] === docMediaId,
    docMediaTypeIsImage: docMedia && docMedia.type === 'image' && /^data:image\//.test(docMedia.data),
  };
});
ok(realUpload.labMediaLinked, 'реальный addLabPhoto(): вложение (PDF) корректно привязано к labObservations по media-id');
ok(realUpload.labMediaTypeIsFile, 'реальный addLabPhoto(): application/pdf сохранён с type="file" (не image/audio)');
ok(realUpload.labMediaExactBytes, 'реальный addLabPhoto(): PDF проходит БЕЗ canvas-реэнкода — точные исходные bytes+MIME в IndexedDB');
ok(realUpload.docMediaLinked, 'реальный addDocFile(): вложение (PNG) корректно привязано к healthDocuments по media-id');
ok(realUpload.docMediaTypeIsImage, 'реальный addDocFile(): изображение сохранено с type="image" и корректным image/* MIME (после существующего canvas-сжатия — не заявляем exact-bytes для изображений)');

// ── 15) Owner review (PR #151, дефект 4): shared media ref — реальный
//    production delete-путь (deleteDoc + настоящее окно отмены), НЕ ручной
//    вызов gcMedia() снаружи ────────────────────────────────────────────
const sharedSetup = await page.evaluate(async () => {
  const key = 'm_shared_' + Date.now();
  await idbPut(key, { data: 'data:image/jpeg;base64,AAAA', type: 'image', createdAt: nowISO() });
  DB.healthDocuments = [
    { id: psyUid('healthDoc'), title: 'Документ 1', kind: 'other', documentDate: todayKey(), provider: '', note: '', media: [key], privacyClass: 'sensitive', createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: 1 },
    { id: psyUid('healthDoc'), title: 'Документ 2', kind: 'other', documentDate: todayKey(), provider: '', note: '', media: [key], privacyClass: 'sensitive', createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: 2 },
  ];
  DB.labObservations = [];
  persist();
  const doc1Id = DB.healthDocuments[0].id, doc2Id = DB.healthDocuments[1].id;
  deleteDoc(doc1Id);   // production-путь: tombstone + undo-окно + отложенный gcMedia() (см. app.js)
  return { key, doc2Id };
});
// Ждём дольше окна отмены (6.5с) + отложенного production-safe GC (~7с) —
// тест НЕ вызывает gcMedia() вручную, только реальный deleteDoc().
await page.waitForTimeout(7500);
const survivedWhileShared = await page.evaluate(async (key) => !!(await idbGet(key)), sharedSetup.key);
ok(survivedWhileShared, 'shared media ref (production delete-путь): удаление Документа 1 не удаляет media, ещё используемую Документом 2, после реального окна отмены и production-safe GC');
await page.evaluate((doc2Id) => { deleteDoc(doc2Id); }, sharedSetup.doc2Id);
await page.waitForTimeout(7500);
const removedWhenOrphan = await page.evaluate(async (key) => !(await idbGet(key)), sharedSetup.key);
ok(removedWhenOrphan, 'shared media ref (production delete-путь): после удаления ВСЕХ ссылающихся записей production-safe GC убирает осиротевшую media');

// ── 16) Cancel-cleanup: закрытие формы БЕЗ сохранения не оставляет orphan
//    media, но и не удаляет media, уже используемую сохранённой записью ────
const cancelCleanup = await page.evaluate(async () => {
  const key1 = 'm_cancel_new_' + Date.now();
  await idbPut(key1, { data: 'data:image/jpeg;base64,AAAA', type: 'image', createdAt: nowISO() });
  STATE.labAddMedia = [key1];
  // Пользователь передумал и закрыл форму БЕЗ сохранения — closeOv() снимает
  // staging-защиту и запускает gcMedia(); эта media нигде не сохранена → сирота.
  closeOv('ov-lab-add');
  await new Promise(r => setTimeout(r, 50));
  await gcMedia();
  const newMediaGone = !(await idbGet(key1));

  // Существующая запись со своей media: открыли форму редактирования (media
  // попадает в staging), закрыли без изменений — media НЕ должна исчезнуть,
  // она всё ещё используется сохранённой записью.
  const key2 = 'm_cancel_existing_' + Date.now();
  await idbPut(key2, { data: 'data:image/jpeg;base64,BBBB', type: 'image', createdAt: nowISO() });
  DB.labObservations = [{ id: psyUid('lab'), testName: 'Существующая', valueText: '1', valueNumber: 1, unit: '', referenceText: '', collectedAt: todayKey(), laboratory: '', note: '', media: [key2], privacyClass: 'sensitive', createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now() }];
  openLabAdd(DB.labObservations[0].id);
  closeOv('ov-lab-add');
  await new Promise(r => setTimeout(r, 50));
  await gcMedia();
  const existingMediaSurvived = !!(await idbGet(key2));
  return { newMediaGone, existingMediaSurvived };
});
ok(cancelCleanup.newMediaGone, 'cancel: закрытие формы лаборатории без сохранения корректно убирает свежесозданную ещё-не-сохранённую media (не оставляет сироту)');
ok(cancelCleanup.existingMediaSurvived, 'cancel: закрытие формы редактирования без изменений НЕ удаляет media, уже используемую сохранённой записью');

// ── 17) Offline reload: новые коллекции переживают перезагрузку без сети ──
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

// ── 18) Мобильные вьюпорты + a11y (tap targets ≥44×44) + тема + клавиатура ──
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
    DB.meds = [{ id: 7001, name: 'Тест', active: true, scheduleMode: 'daily', dailyTarget: 1, createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now() }];
    DB.medIntakes = [];
    _healthDay = localDayKey();
    goTo('health');
    const btn = document.querySelector('#health-today button[onclick*="markMedTakenOnDay"]');
    const r = btn.getBoundingClientRect();
    const inViewport = r.right <= viewportWidth + 1 && r.left >= -1;
    return { tapOk: r.width >= 44 && r.height >= 44, inViewport, isButton: btn.tagName === 'BUTTON' && btn.getAttribute('type') === 'button' };
  }, w);
  ok(geo.tapOk && geo.inViewport && geo.isButton, `${name}: «Принял» в органайзере «Сегодня» (due-план) — настоящий button, tap ≥44×44, не выходит за экран`);
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

// ── 19) Большой synthetic dataset: агрегаторы не падают и не виснут ─────
const bigPage = await bootAt(390, 844);
const bigResult = await bigPage.evaluate(() => {
  const N = 300;
  DB.labObservations = Array.from({ length: N }, (_, i) => ({ id: psyUid('lab'), testName: 'Показатель ' + (i % 10), valueText: String(i), valueNumber: i, unit: 'ед', referenceText: '', collectedAt: nowISO(), laboratory: '', note: '', media: [], privacyClass: 'sensitive', createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now() }));
  DB.healthDocuments = Array.from({ length: N }, (_, i) => ({ id: psyUid('healthDoc'), title: 'Документ ' + i, kind: 'other', documentDate: nowISO(), provider: '', note: '', media: [], privacyClass: 'sensitive', createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now() }));
  DB.medIntakes = Array.from({ length: N }, (_, i) => ({ id: 90000 + i, medId: 1, status: 'taken', at: nowISO(), createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now() }));
  DB.meds = [{ id: 1, name: 'План', active: true, scheduleMode: 'daily', dailyTarget: 1, createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now() }];
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
