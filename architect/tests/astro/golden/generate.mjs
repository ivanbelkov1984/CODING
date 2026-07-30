// Wave 3 (issue #154) — генератор golden-фикстур.
//
// КЛЮЧЕВОЕ ПРАВИЛО КОНТРАКТА: этот скрипт НЕ запускает production-код и НЕ
// импортирует app.js. Ожидаемые значения берутся ИСКЛЮЧИТЕЛЬНО из
// helpers/oracle.mjs — независимой реализации по опубликованным формулам
// (Meeus, «Astronomical Algorithms», 2nd ed.) — либо являются опубликованными
// астрономическими константами/фактами.
//
// Запускается ТОЛЬКО вручную: `npm run astro:update-golden`.
// CI его никогда не вызывает и не принимает новые значения молча.

import { writeFile, mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as O from '../helpers/oracle.mjs';
import { norm360 } from '../helpers/core.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const OUT = join(DIR, '..', 'fixtures');

const MEEUS = { source: 'Meeus, Astronomical Algorithms, 2nd ed. (1998)', version: '2nd-ed-1998' };
const fixtures = [];
const add = f => fixtures.push(f);

// ── 1. Юлианская дата (Meeus, гл. 7) ─────────────────────────────────
// Контрольные значения главы 7 общеизвестны и проверяемы вручную:
// 2000-01-01.5 → 2451545.0 (определение эпохи J2000.0);
// 1999-01-01.0 → 2451179.5; 1987-01-27.0 → 2446822.5.
for (const [date, hh, expected, note] of [
  ['2000-01-01', 12, 2451545.0, 'определение эпохи J2000.0 — общеизвестная реперная точка'],
  ['1999-01-01', 0, 2451179.5, 'контрольный пример Meeus, гл. 7'],
  ['1987-01-27', 0, 2446822.5, 'контрольный пример Meeus, гл. 7'],
  ['1900-01-01', 0, 2415020.5, 'начало XX века, григорианский календарь'],
]) {
  add({
    id: `jd-${date}-${hh}h`, category: 'time', method: 'julianDayFromUTC',
    methodologyVersion: 'meeus-ch7',
    oracle: { ...MEEUS, verification: 'независимая реализация формулы гл. 7 + сверка с общеизвестной реперной точкой' },
    input: { date, hourUTC: hh },
    expected: { jd: expected },
    tolerance: { jd: 1e-9 },
    unit: { jd: 'сутки' },
    notes: note,
  });
}

// ── 2. Средний наклон эклиптики (Meeus, формула 22.2) ────────────────
for (const year of [1900, 2000, 2050]) {
  const jd = O.julianDayFromUTC(`${year}-01-01`, 12);
  const T = O.julianCenturies(jd);
  add({
    id: `obliquity-mean-${year}`, category: 'frame', method: 'meanObliquity',
    methodologyVersion: 'meeus-22.2',
    oracle: { ...MEEUS, verification: 'независимая реализация формулы 22.2 (ε0 в угловых секундах)' },
    input: { year, jd, T },
    expected: { eps: O.meanObliquity(T) },
    tolerance: { eps: 1e-9 },
    unit: { eps: '°' },
    notes: 'Production «зашивает» ε константой J2000. Эта фикстура фиксирует истинный дрейф — см. limitation L-OBLIQUITY в контракте.',
  });
}

// ── 3. Whole-sign и Equal дома (тривиальные определения) ─────────────
for (const asc of [0, 29.9999, 30, 185.9958, 359.5]) {
  add({
    id: `houses-whole-asc-${asc}`, category: 'houses', method: 'houseCusps(whole)',
    methodologyVersion: 'whole-sign-v1',
    oracle: { source: 'Определение системы Whole-sign (куспид I = 0° знака Асцендента)', version: 'classical', verification: 'независимая реализация определения' },
    input: { asc },
    expected: { cusps: O.wholeSignCusps(asc) },
    tolerance: { cusps: 1e-9 },
    unit: { cusps: '°' },
    notes: 'Границы знака (0°, 29.9999°, 30°) проверяют корректность floor-деления.',
  });
  add({
    id: `houses-equal-asc-${asc}`, category: 'houses', method: 'houseCusps(equal)',
    methodologyVersion: 'equal-v1',
    oracle: { source: 'Определение системы Equal (куспид I = Асцендент, далее +30°)', version: 'classical', verification: 'независимая реализация определения' },
    input: { asc },
    expected: { cusps: O.equalCusps(asc) },
    tolerance: { cusps: 1e-9 },
    unit: { cusps: '°' },
    notes: '',
  });
}

// ── 4. Жребий Фортуны (классическая формула) ─────────────────────────
for (const [asc, sun, moon, isDay] of [[100, 50, 200, true], [100, 50, 200, false], [10, 350, 20, true], [0, 0, 0, true]]) {
  add({
    id: `fortune-${asc}-${sun}-${moon}-${isDay ? 'day' : 'night'}`,
    category: 'points', method: 'partOfFortune',
    methodologyVersion: 'classical-day-night-v1',
    oracle: { source: 'Классическое определение: день Asc+Луна−Солнце, ночь Asc+Солнце−Луна', version: 'classical', verification: 'независимая реализация определения' },
    input: { asc, sun, moon, isDay },
    expected: { lon: O.partOfFortune(asc, sun, moon, isDay) },
    tolerance: { lon: 1e-9 },
    unit: { lon: '°' },
    notes: 'Включён случай с переходом через 0° (Солнце 350°, Луна 20°).',
  });
}

// ── 5. Гармоники ─────────────────────────────────────────────────────
for (const [lon, n] of [[100, 5], [359, 7], [0, 9], [180, 2]]) {
  add({
    id: `harmonic-${lon}-h${n}`, category: 'natal', method: 'computeHarmonic',
    methodologyVersion: 'harmonic-v1',
    oracle: { source: 'Определение гармонической карты: H_n(λ) = (n·λ) mod 360', version: 'classical', verification: 'независимая реализация определения' },
    input: { lon, n },
    expected: { lon: O.harmonic(lon, n) },
    tolerance: { lon: 1e-9 },
    unit: { lon: '°' },
    notes: '',
  });
}

// ── 6. Линейная аянамша ──────────────────────────────────────────────
// Проверяет и коэффициент прецессии, и значение на J2000 для каждой школы.
for (const [key, j2000] of [['lahiri', 23.85306], ['raman', 22.49703], ['kp', 23.75210], ['fagan', 24.73631], ['yukteshwar', 22.74660]]) {
  for (const days of [0, 365.25 * 25]) {
    add({
      id: `ayanamsha-${key}-d${Math.round(days)}`, category: 'vedic', method: 'ayanamsha',
      methodologyVersion: `linear-precession-v1(${O.PRECESSION_ARCSEC_PER_YEAR}"/год)`,
      oracle: { source: 'Линейная модель: значение на J2000 + постоянная прецессия 50.2888″/год', version: 'linear-v1', verification: 'независимый пересчёт модели (ловит дрейф коэффициента и опорного значения)' },
      input: { key, daysFromJ2000: days },
      expected: { ayanamsha: O.ayanamshaLinear(j2000, days) },
      // Допуск 1e-6° обоснован физически, а НЕ подогнан под падение.
      // Production берёт аргумент из `t.tt` (динамическое время TT), эталон —
      // из UT. Разница ΔT ≈ 64–70 с в этом диапазоне дат = 7.4e-4 сут; при
      // скорости 50.2888″/год = 3.82e-5 °/сут это даёт 2.8e-8°. Допуск 1e-6°
      // (= 0.0036″) покрывает её с 36-кратным запасом и всё равно на порядки
      // строже любой астрологически значимой точности. Для прецессии TT —
      // корректная шкала, то есть здесь production строже эталона.
      tolerance: { ayanamsha: 1e-6 },
      unit: { ayanamsha: '°' },
      notes: 'ЛИНЕЙНАЯ модель, не эфемеридная Лахири. Ограничение зафиксировано как L-AYANAMSHA-LINEAR. Допуск учитывает шкалу TT против UT.',
    });
  }
}

// ── 7. Опубликованные астрономические факты ──────────────────────────
// Не формулы, а наблюдаемые факты — независимы от любой реализации.
add({
  id: 'fact-march-equinox-window', category: 'ephemeris', method: 'SunPosition→elon=0',
  methodologyVersion: 'astronomical-fact',
  oracle: { source: 'Астрономический факт: мартовское равноденствие приходится на 19–21 марта UTC', version: 'n/a', verification: 'общеизвестный календарный факт, не зависящий от реализации' },
  input: { years: [1950, 1984, 2000, 2024] },
  expected: { dayOfMarchMin: 19, dayOfMarchMax: 21 },
  tolerance: { days: 0 },
  unit: { days: 'сутки' },
  notes: 'Ловит грубый сдвиг шкалы времени или системы отсчёта долгот.',
});
add({
  id: 'fact-mean-synodic-month', category: 'ephemeris', method: 'newMoonSpacing',
  methodologyVersion: 'astronomical-constant',
  oracle: { source: 'Meeus, гл. 49: средний синодический месяц 29.530588861 сут', version: '2nd-ed-1998', verification: 'опубликованная константа' },
  input: { spanDays: 3000, startISO: '2000-01-06T00:00:00Z' },
  expected: { meanSynodicMonth: O.MEAN_SYNODIC_MONTH },
  tolerance: { meanSynodicMonth: 0.02 },
  unit: { meanSynodicMonth: 'сутки' },
  notes: 'Усреднение по ~100 лунациям гасит реальную вариацию отдельных месяцев (±0.3 сут).',
});
add({
  id: 'fact-luminaries-never-retrograde', category: 'ephemeris', method: 'computeNatalChart.retro',
  methodologyVersion: 'astronomical-fact',
  oracle: { source: 'Астрономический факт: геоцентрические Солнце и Луна не бывают ретроградными', version: 'n/a', verification: 'определение видимого геоцентрического движения' },
  input: { samples: 60 },
  expected: { sunRetro: false, moonRetro: false },
  tolerance: {},
  unit: {},
  notes: '',
});

// ── 8. Геометрия углов (определительная проверка) ────────────────────
// Не переписывает формулу production, а проверяет ОПРЕДЕЛЕНИЕ:
//   MC — точка эклиптики, кульминирующая сейчас ⇒ её прямое восхождение = RAMC;
//   Asc — точка эклиптики на восточном горизонте ⇒ высота ≈ 0 и часовой угол < 0.
add({
  id: 'angles-definition-geometry', category: 'natal', method: 'computeNatalChart.angles',
  methodologyVersion: 'spherical-astronomy-definition',
  oracle: { source: 'Определения MC и Asc в сферической астрономии (Meeus, гл. 13)', version: '2nd-ed-1998', verification: 'обратное преобразование эклиптика→экватор и проверка определения, а не повтор формулы production' },
  input: { note: 'набор широт/времён задаётся в runner' },
  expected: { mcRaEqualsRamcDeg: 0, ascAltitudeDeg: 0 },
  tolerance: { mcRaEqualsRamcDeg: 0.02, ascAltitudeDeg: 0.02 },
  unit: { mcRaEqualsRamcDeg: '°', ascAltitudeDeg: '°' },
  notes: 'Допуск 0.02° покрывает расхождение ε(J2000) в production и ε(date) в эталоне.',
});

await mkdir(OUT, { recursive: true });
const payload = {
  $schema: 'wave3-astro-golden-fixtures/v1',
  generatedBy: 'tests/astro/golden/generate.mjs (независимый oracle, НЕ production-код)',
  generatedAt: new Date().toISOString().slice(0, 10),
  oracleModule: 'tests/astro/helpers/oracle.mjs',
  warning: 'НЕ редактировать вручную и НЕ обновлять из production-вывода. Только `npm run astro:update-golden` после независимого доказательства нового значения.',
  count: fixtures.length,
  fixtures,
};
await writeFile(join(OUT, 'golden.json'), JSON.stringify(payload, null, 2) + '\n');
console.log(`golden fixtures: ${fixtures.length} → tests/astro/fixtures/golden.json`);
for (const c of [...new Set(fixtures.map(f => f.category))]) {
  console.log(`  ${c}: ${fixtures.filter(f => f.category === c).length}`);
}
