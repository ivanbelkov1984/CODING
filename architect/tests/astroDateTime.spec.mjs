// D-DATE-02 — НЕВОЗМОЖНЫЕ ДАТА И ВРЕМЯ В АСТРОЛОГИИ.
//
// Дефект был двухголовым, и опаснее оказалась НЕ та голова, которую видно.
//
//   1. Тихая подмена дня. JavaScript нормализует «2026-02-31» в 3 марта, и
//      движок честно считал ДРУГОЙ день. На живом движке долготы Солнца для
//      2026-02-31 и 2026-03-03 совпадали до последнего знака: карта была
//      неправильной, но выглядела совершенно нормальной. Ошибки не было
//      нигде — ни в интерфейсе, ни в данных.
//   2. NaN. «2026-13-01», «25:99», «24:60» дают Date.parse → NaN, и расчёт
//      уходил в никуда.
//
// Форма строки («ГГГГ-ММ-ДД», «ЧЧ:ММ») не доказывает ни того, ни другого:
// обеим невозможным величинам она соответствует. Поэтому здесь проверяется
// не формат, а СУЩЕСТВОВАНИЕ дня в календаре и времени на часах — и то, что
// невозможный ввод не доходит до расчёта, не сохраняется и не превращается
// в другую дату.
//
// Астрологический метод не меняется: у существующих даты и времени результат
// обязан остаться прежним (§ 7 ниже сверяет это с эталоном).
//
// Все фикстуры синтетические (TEST-AST-*), реальных данных владельца нет
// (privacy canary в § 9). Гоняет РЕАЛЬНЫЙ собранный бандл в Chromium.

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..');
const FILE = 'file://' + (process.env.ASTRO_BUNDLE || join(ROOT, 'dist', 'app.html'));

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

// Движок нужен по-настоящему: без него «отказ» был бы неотличим от «не
// загрузилось», и вся сюита доказывала бы не то.
const engineReady = await page.evaluate(async () => {
  try { await loadAstroEngine(); return !!window.Astronomy; } catch (_) { return false; }
});
ok(engineReady, 'астрономический движок загружен (иначе отказ неотличим от «нет движка»)');

const reset = () => page.evaluate(() => {
  DB.astroBirth = null; DB.astroPartners = []; DB.astroCharts = [];
  DB.astroRectify = null;
  const t = $('toasts'); if (t) t.innerHTML = '';
});

// Ввод данных рождения ровно тем путём, которым пользуется человек: поля
// формы + производственная saveAstroBirth. Никаких обходных путей.
const typeBirth = (date, time, opts = {}) => page.evaluate(({ date, time, opts }) => {
  const set = (id, v) => { const el = $(id); if (el) el.value = v; };
  set('ab-date', date); set('ab-time', time);
  set('ab-utc', String(opts.utc == null ? 0 : opts.utc));
  set('ab-lat', String(opts.lat == null ? 55.75 : opts.lat));
  set('ab-lon', String(opts.lon == null ? 37.62 : opts.lon));
  set('ab-place', 'TEST-AST-PLACE');
  const tk = $('ab-time-known');
  if (tk) tk.classList[opts.timeKnown === false ? 'remove' : 'add']('on');
  const t = $('toasts'); if (t) t.innerHTML = '';
  saveAstroBirth();
  return { saved: DB.astroBirth, toast: ($('toasts') || {}).textContent || '' };
}, { date, time, opts });

console.log('\n── § 1. Невозможный ДЕНЬ не сохраняется ──');
await reset();
for (const [d, why] of [
  ['2026-02-31', '31 февраля'],
  ['2026-04-31', '31 апреля'],
  ['2026-13-01', '13-й месяц'],
  ['2026-00-10', 'нулевой месяц'],
  ['2026-06-00', 'нулевой день'],
  ['2025-02-29', '29 февраля невисокосного года'],
  ['1900-02-29', '1900 — не високосный (правило 100)'],
]) {
  const r = await typeBirth(d, '12:00');
  ok(r.saved === null && /существовать в календаре/.test(r.toast),
    `${why} (${d}) отклонён и НЕ сохранён`, `saved=${JSON.stringify(r.saved)} toast=${r.toast}`);
}

console.log('\n── § 2. Настоящие даты по-прежнему принимаются ──');
for (const [d, why] of [
  ['2024-02-29', '29 февраля високосного года'],
  ['2000-02-29', '2000 — високосный (правило 400)'],
  ['1984-06-15', 'обычный день'],
  ['2026-12-31', 'последний день года'],
]) {
  await reset();
  const r = await typeBirth(d, '12:00');
  ok(r.saved && r.saved.date === d, `${why} (${d}) сохранён`, `toast=${r.toast}`);
}

console.log('\n── § 3. Невозможное ВРЕМЯ не сохраняется ──');
for (const [t, why] of [
  ['25:99', 'часы и минуты вне шкалы'],
  ['24:60', 'граница суток и 60-я минута'],
  ['99:99', 'заведомая опечатка'],
  ['00:60', '60-я минута'],
  ['24:00', 'ISO-маркер конца суток — он переносит ДАТУ на следующий день'],
]) {
  await reset();
  const r = await typeBirth('1984-06-15', t);
  ok(r.saved === null && /часы 00–23, минуты 00–59/.test(r.toast),
    `${why} (${t}) отклонён и НЕ сохранён`, `saved=${JSON.stringify(r.saved)} toast=${r.toast}`);
}
for (const t of ['00:00', '23:59', '12:30']) {
  await reset();
  const r = await typeBirth('1984-06-15', t);
  ok(r.saved && r.saved.time === t, `настоящее время ${t} сохранено`, `toast=${r.toast}`);
}

// Правдоподобие часового пояса проверяет именно write-path (см. § 5): раз
// расчёт его больше не сторожит, обе точки входа обязаны быть доказаны.
for (const z of [99, -30, 20]) {
  await reset();
  const r = await typeBirth('1984-06-15', '12:00', { utc: z });
  ok(r.saved === null && /от −12 до \+14/.test(r.toast),
    `нереальный UTC-офсет ${z} отклонён на входе и НЕ сохранён`, `toast=${r.toast}`);
}
for (const z of [-12, 14, 5.75, 0]) {
  await reset();
  const r = await typeBirth('1984-06-15', '12:00', { utc: z });
  ok(r.saved && r.saved.utcOffset === z, `настоящая зона ${z} сохранена`, `toast=${r.toast}`);
}

console.log('\n── § 4. Главное: невозможный день НЕ считается как другой день ──');
// Раньше карта «31 февраля» была карта 3 марта — с точностью до последнего
// знака и без единого признака ошибки. Здесь это ловится напрямую: сначала
// берём эталон настоящего дня, затем требуем, чтобы невозможный день не
// вернул ни его, ни вообще какую-либо карту.
const substitution = await page.evaluate(() => {
  const base = { timeKnown: true, time: '12:00', utcOffset: 0, lat: 55.75, lon: 37.62, houseSystem: 'whole' };
  const sunOf = c => (c.planets.find(p => p.body === 'Sun') || {}).lon;
  const attempt = date => {
    try { return { computed: true, sun: sunOf(computeNatalChart({ ...base, date })) }; }
    catch (e) { return { computed: false, badInstant: !!e.badInstant, msg: String(e && e.message || e) }; }
  };
  return {
    real: attempt('2026-03-03'),          // настоящий день-«приёмник» подмены
    impossible: attempt('2026-02-31'),    // тот, который раньше в него уезжал
    leapReal: attempt('2025-03-01'),
    leapImpossible: attempt('2025-02-29'),
    aprReal: attempt('2026-05-01'),
    aprImpossible: attempt('2026-04-31'),
  };
});
ok(substitution.real.computed && Number.isFinite(substitution.real.sun),
  'настоящий день 2026-03-03 считается (эталон получен)', JSON.stringify(substitution.real));
ok(substitution.impossible.computed === false && substitution.impossible.badInstant === true,
  '2026-02-31 отклонён расчётом с явной причиной, а не посчитан',
  JSON.stringify(substitution.impossible));
ok(substitution.impossible.sun === undefined || substitution.impossible.sun !== substitution.real.sun,
  '2026-02-31 НЕ вернул карту 3 марта (тихой подмены дня нет)',
  `impossible=${JSON.stringify(substitution.impossible)} real=${JSON.stringify(substitution.real)}`);
ok(substitution.leapImpossible.computed === false && substitution.leapImpossible.sun !== substitution.leapReal.sun,
  '2025-02-29 НЕ вернул карту 1 марта', JSON.stringify(substitution.leapImpossible));
ok(substitution.aprImpossible.computed === false && substitution.aprImpossible.sun !== substitution.aprReal.sun,
  '2026-04-31 НЕ вернул карту 1 мая', JSON.stringify(substitution.aprImpossible));

console.log('\n── § 5. Ничего не превращается в NaN ──');
const nanProbe = await page.evaluate(() => {
  const base = { timeKnown: true, utcOffset: 0, lat: 55.75, lon: 37.62, houseSystem: 'whole' };
  const probe = (date, time) => {
    try {
      const c = computeNatalChart({ ...base, date, time });
      const nums = [...c.planets.map(p => p.lon), ...(c.angles ? [c.angles.asc.lon, c.angles.mc.lon] : [])];
      return { computed: true, anyNaN: nums.some(n => !Number.isFinite(n)) };
    } catch (e) { return { computed: false, badInstant: !!e.badInstant }; }
  };
  return {
    badMonth: probe('2026-13-01', '12:00'),
    badHour: probe('1984-06-15', '25:99'),
    badMinute: probe('1984-06-15', '24:60'),
    endOfDay: probe('1984-06-15', '24:00'),
    good: probe('1984-06-15', '14:30'),
    instantNull: [
      astroInstantUTC('2026-02-31', '12:00', 0),
      astroInstantUTC('2026-13-01', '12:00', 0),
      astroInstantUTC('1984-06-15', '25:99', 0),
      astroInstantUTC('1984-06-15', '24:00', 0),
    ].map(v => v === null),
    // Правдоподобие зоны — НЕ дело сборки момента: офсет вне [−12, +14] даёт
    // существующий момент, его отклоняет write-path. Иначе computeNatalChart
    // перестал бы быть чистой функцией на всей области определения.
    instantOddZone: (() => { const v = astroInstantUTC('1984-06-15', '12:00', 20); return v ? v.toISOString() : null; })(),
    instantGood: (() => { const v = astroInstantUTC('1984-06-15', '14:30', 3); return v ? v.toISOString() : null; })(),
  };
});
for (const [k, why] of [['badMonth', '13-й месяц'], ['badHour', 'час 25'], ['badMinute', 'минута 60'],
  ['endOfDay', '24:00 (перенёс бы дату)']]) {
  ok(nanProbe[k].computed === false && nanProbe[k].badInstant === true,
    `${why} → отказ до движка, а не NaN`, JSON.stringify(nanProbe[k]));
}
ok(nanProbe.good.computed === true && nanProbe.good.anyNaN === false,
  'настоящие дата и время дают карту без единого NaN', JSON.stringify(nanProbe.good));
ok(nanProbe.instantNull.every(Boolean),
  'astroInstantUTC отдаёт null на каждом НЕСУЩЕСТВУЮЩЕМ входе',
  JSON.stringify(nanProbe.instantNull));
ok(nanProbe.instantOddZone === '1984-06-14T16:00:00.000Z',
  'нереальная зона (+20) НЕ ломает сборку момента: это дело write-path, а не расчёта',
  String(nanProbe.instantOddZone));
ok(nanProbe.instantGood === '1984-06-15T11:30:00.000Z',
  'astroInstantUTC корректно применяет UTC-офсет (14:30 при +3 → 11:30Z)', String(nanProbe.instantGood));

console.log('\n── § 6. Партнёр, ректификация, транзиты — те же правила ──');
await reset();
const partner = await page.evaluate(async () => {
  const set = (id, v) => { const el = $(id); if (el) el.value = v; };
  const attempt = async (date, time, utc) => {
    set('sp-date', date); set('sp-time', time); set('sp-utc', String(utc));
    set('sp-lat', '55.75'); set('sp-lon', '37.62'); set('sp-label', 'TEST-AST-PARTNER');
    const tk = $('sp-time-known'); if (tk) tk.classList.add('on');
    const t = $('toasts'); if (t) t.innerHTML = '';
    saveAstroPartner();
    await new Promise(r => setTimeout(r, 60));
    return { count: (DB.astroPartners || []).length, toast: ($('toasts') || {}).textContent || '' };
  };
  const badDate = await attempt('2026-02-31', '12:00', 0);
  const badTime = await attempt('1984-06-15', '25:99', 0);
  const badZone = await attempt('1984-06-15', '12:00', 99);
  const good = await attempt('1984-06-15', '12:00', 3);
  return { badDate, badTime, badZone, good };
});
ok(partner.badDate.count === 0 && /существовать в календаре/.test(partner.badDate.toast),
  'карта партнёра: несуществующий день отклонён', JSON.stringify(partner.badDate));
ok(partner.badTime.count === 0 && /часы 00–23/.test(partner.badTime.toast),
  'карта партнёра: невозможное время отклонено', JSON.stringify(partner.badTime));
ok(partner.badZone.count === 0 && /от −12 до \+14/.test(partner.badZone.toast),
  'карта партнёра: UTC-офсет вне реального диапазона отклонён', JSON.stringify(partner.badZone));
ok(partner.good.count === 1, 'карта партнёра с настоящими данными сохраняется', JSON.stringify(partner.good));

await reset();
const rect = await page.evaluate(() => {
  const set = (id, v) => { const el = $(id); if (el) el.value = v; };
  DB.astroBirth = { date: '1984-06-15', time: '', timeKnown: false, utcOffset: 3, lat: 55.75, lon: 37.62 };
  rRectify();
  const attempt = date => {
    set('rect-ev-date', date);
    const t = $('toasts'); if (t) t.innerHTML = '';
    rectifyAddEvent();
    return { n: ((DB.astroRectify || {}).events || []).length, toast: ($('toasts') || {}).textContent || '' };
  };
  const bad = attempt('2010-02-31');
  const good = attempt('2010-06-15');
  // Отдельно: невозможная дата рождения ломала проверку «событие после
  // рождения» — NaN <= NaN даёт false, и любое событие проходило.
  DB.astroBirth = { date: '2026-02-31', time: '', timeKnown: false, utcOffset: 3, lat: 55.75, lon: 37.62 };
  const withBadBirth = attempt('1900-01-01');
  return { bad, good, withBadBirth };
});
ok(rect.bad.n === 0 && /существовать в календаре/.test(rect.bad.toast),
  'ректификация: несуществующая дата события отклонена', JSON.stringify(rect.bad));
ok(rect.good.n === 1, 'ректификация: настоящая дата события принята', JSON.stringify(rect.good));
ok(rect.withBadBirth.n === 1 && /исправь дату рождения/.test(rect.withBadBirth.toast),
  'ректификация: при невозможной дате рождения проверка «после рождения» больше не пропускает всё подряд',
  JSON.stringify(rect.withBadBirth));

await reset();
const transits = await page.evaluate(async () => {
  DB.astroBirth = { date: '1984-06-15', time: '12:00', timeKnown: true, utcOffset: 3, lat: 55.75, lon: 37.62, houseSystem: 'whole' };
  DB.astroCharts = [{ id: 1, chart: computeNatalChart(DB.astroBirth) }];
  const di = $('astro-tr-date'); if (!di) return { skipped: true };
  di.value = '2026-02-31';
  const t = $('toasts'); if (t) t.innerHTML = '';
  await runTransits();
  return { field: di.value, toast: ($('toasts') || {}).textContent || '' };
});
ok(transits.skipped || (transits.field !== '2026-02-31' && /нет в календаре/.test(transits.toast)),
  'транзиты: несуществующая дата названа человеку, а не посчитана как другой день',
  JSON.stringify(transits));

console.log('\n── § 7. Астрологический метод не изменился ──');
// Существующие данные обязаны давать РОВНО прежний результат: D-DATE-02
// только отклоняет невозможное, ничего не пересчитывая по-новому.
const unchanged = await page.evaluate(() => {
  const birth = { date: '1984-06-15', time: '14:30', timeKnown: true, utcOffset: 3, lat: 55.75, lon: 37.62, houseSystem: 'whole' };
  const c = computeNatalChart(birth);
  const sun = c.planets.find(p => p.body === 'Sun').lon;
  // Независимая сборка того же момента прежним способом (Date.parse на
  // заведомо существующих величинах) обязана дать тот же момент.
  const legacy = new Date(Date.parse(birth.date + 'T' + birth.time + ':00Z') - birth.utcOffset * 3600e3);
  const shared = astroInstantUTC(birth.date, birth.time, birth.utcOffset);
  return { sun, same: legacy.getTime() === shared.getTime(), timeKnown: c.timeKnown };
});
ok(unchanged.same, 'на существующих дате и времени новая сборка момента совпадает с прежней до миллисекунды');
ok(Number.isFinite(unchanged.sun) && unchanged.timeKnown === true,
  'карта на настоящих данных считается как раньше', JSON.stringify(unchanged));

console.log('\n── § 8. Строгие помощники — общие, а не локальные ──');
const shared = await page.evaluate(() => ({
  day: [isRealIsoDay('2026-02-31'), isRealIsoDay('2024-02-29'), isRealIsoDay('2025-02-29'),
    isRealIsoDay('1900-02-29'), isRealIsoDay('2000-02-29'), isRealIsoDay('15.06.1984')],
  clock: [isRealClockTime('25:99'), isRealClockTime('24:00'), isRealClockTime('23:59'),
    isRealClockTime('00:00'), isRealClockTime('00:60'), isRealClockTime('9:30')],
}));
ok(JSON.stringify(shared.day) === JSON.stringify([false, true, false, false, true, false]),
  'isRealIsoDay: високосность по григорианским правилам (400/100/4)', JSON.stringify(shared.day));
ok(JSON.stringify(shared.clock) === JSON.stringify([false, false, true, true, false, false]),
  'isRealClockTime: часы 00–23, минуты 00–59, «24:00» не время рождения', JSON.stringify(shared.clock));

console.log('\n── § 9. Приватность: в сюите только синтетика ──');
// Канарейка проверяет РЕАЛЬНОЕ содержимое, а не сам факт своего запуска:
// каждый текст, который в состоянии написать человек, обязан быть либо
// пустым, либо синтетическим TEST-AST-*. Личные данные владельца в сюите
// не участвуют и в артефакты CI попасть не могут.
// Состояние к этому моменту очищено предыдущими секциями, поэтому канарейка
// сначала заполняет его СВОИМИ фикстурами обычным путём — иначе она
// проверяла бы пустоту и была бы зелена всегда.
await reset();
await typeBirth('1984-06-15', '12:00');
await page.evaluate(async () => {
  const set = (id, v) => { const el = $(id); if (el) el.value = v; };
  set('sp-date', '1986-03-20'); set('sp-time', '09:15'); set('sp-utc', '3');
  set('sp-lat', '55.75'); set('sp-lon', '37.62'); set('sp-label', 'TEST-AST-PARTNER');
  const tk = $('sp-time-known'); if (tk) tk.classList.add('on');
  saveAstroPartner();
  await new Promise(r => setTimeout(r, 60));
});
const canary = await page.evaluate(() => {
  const texts = [];
  const walk = v => {
    if (typeof v === 'string') { texts.push(v); return; }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v && typeof v === 'object') { Object.values(v).forEach(walk); }
  };
  walk((DB.astroPartners || []).map(p => ({ label: p.label, place: (p.birth || {}).place })));
  walk(DB.astroBirth ? { place: DB.astroBirth.place } : {});
  return { texts, sawMarker: texts.some(t => t.includes('TEST-AST')) };
});
const foreign = canary.texts.filter(t => t.trim() !== '' && !t.includes('TEST-AST'));
ok(canary.sawMarker, 'сюита действительно писала свои фикстуры (маркер TEST-AST найден)',
  JSON.stringify(canary.texts));
ok(foreign.length === 0, 'ни одного текста без синтетического префикса TEST-AST-*',
  JSON.stringify(foreign));
ok(errors.length === 0, 'страница не выдала ни одной необработанной ошибки',
  errors.slice(0, 5).join('\n'));

await browser.close();
console.log(`\nD-DATE-02 (астрология: невозможные дата и время): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
