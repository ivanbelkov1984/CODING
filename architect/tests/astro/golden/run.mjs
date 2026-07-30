// Wave 3 (issue #154) — СЛОЙ 1: golden reference tests.
//
// Сверяет РЕАЛЬНЫЙ production-выход с эталонами независимого происхождения.
// Логика проверок вынесена в checks.mjs и переиспользуется mutation-прогоном
// (golden/mutation.mjs), который доказывает, что эти проверки действительно
// ловят поломку production, а не зелены сами по себе.

import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { bootAstro } from '../helpers/harness.mjs';
import { createReporter, goldenDiff, angularDiff } from '../helpers/core.mjs';
import * as C from './checks.mjs';
import * as O from '../helpers/oracle.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(await readFile(join(DIR, '..', 'fixtures', 'golden.json'), 'utf8'));
const F = id => data.fixtures.find(f => f.id === id);

const R = createReporter('Astro golden reference');
const h = await bootAstro();
const ENG = h.meta.engine;

const check = (fx, key, actual, { angular = false } = {}) => {
  const expected = fx.expected[key];
  const tol = fx.tolerance[key] ?? 0;
  const diff = angular ? angularDiff(expected, actual) : Math.abs(expected - actual);
  R.ok(diff <= tol, `[${fx.id}] ${fx.method} → ${key}`,
    diff <= tol ? null : goldenDiff({
      fixtureId: fx.id, method: fx.method, key, expected, actual,
      tolerance: tol, unit: (fx.unit || {})[key], engineVersion: ENG,
      methodologyVersion: fx.methodologyVersion, angular,
    }));
};

console.log(`\n── Слой 1: golden (${data.count} фикстур, oracle: ${data.oracleModule}) ──`);

// ── Время: путь birth → UTC → шкала движка ───────────────────────────
for (const fx of data.fixtures.filter(f => f.category === 'time')) {
  const { date, hourUTC } = fx.input;
  const jd = await h.evalIn(({ d, hh }) => {
    const utc = new Date(Date.parse(d + 'T00:00:00Z') + hh * 3600e3);
    return window.Astronomy.MakeTime(utc).ut + 2451545.0;
  }, { d: date, hh: hourUTC });
  check(fx, 'jd', jd);
}

// ── ε, восстановленный из production (ревью п.1) ─────────────────────
await C.checkObliquityFromProduction(h, R, ENG);
// Дрейф ε на краях диапазона — зафиксированное ограничение L-OBLIQUITY.
for (const y of [1900, 2050]) {
  const drift = Math.abs(F(`obliquity-mean-${y}`).expected.eps - O.OBLIQUITY_J2000);
  R.ok(drift < 0.02, `[obliquity-mean-${y}] дрейф ε(${y}) относительно константы J2000 = ${drift.toFixed(5)}° — в пределах L-OBLIQUITY (<0.02°)`);
}

// ── Дома whole/equal против независимого определения ─────────────────
for (const fx of data.fixtures.filter(f => f.category === 'houses')) {
  const sys = fx.method.includes('whole') ? 'whole' : 'equal';
  const cusps = await h.evalIn(({ s, asc }) => houseCusps(s, { asc, mc: 0, ramc: 0, eps: 23.4392911, phi: 0 }).slice(1), { s: sys, asc: fx.input.asc });
  let worst = 0, worstIdx = -1;
  fx.expected.cusps.forEach((exp, i) => { const d = angularDiff(exp, cusps[i]); if (d > worst) { worst = d; worstIdx = i; } });
  R.ok(worst <= fx.tolerance.cusps, `[${fx.id}] ${fx.method} — 12 куспидов совпали с определением`,
    worst <= fx.tolerance.cusps ? null : goldenDiff({
      fixtureId: fx.id, method: fx.method, key: `cusp[${worstIdx + 1}]`,
      expected: fx.expected.cusps[worstIdx], actual: cusps[worstIdx],
      tolerance: fx.tolerance.cusps, unit: '°', engineVersion: ENG,
      methodologyVersion: fx.methodologyVersion, angular: true,
    }));
}

// ── Квадрантные системы домов (ревью п.3) ────────────────────────────
await C.checkQuadrantHouses(h, R, ENG);

// ── Жребий Фортуны из реального production-выхода (ревью п.1) ────────
await C.checkFortuneFromProduction(h, R, ENG);

// ── Гармоники (production computeHarmonic) ───────────────────────────
for (const fx of data.fixtures.filter(f => f.category === 'natal' && f.method === 'computeHarmonic')) {
  const actual = await h.evalIn(({ lon, n }) => computeHarmonic({ planets: [{ name: 'X', lon }] }, n).planets[0].lon, fx.input);
  check(fx, 'lon', actual, { angular: true });
}

// ── Аянамша (production ayanamsha) ───────────────────────────────────
for (const fx of data.fixtures.filter(f => f.category === 'vedic' && f.method === 'ayanamsha')) {
  const actual = await h.evalIn(({ key, daysFromJ2000 }) => {
    const utc = new Date(Date.UTC(2000, 0, 1, 12, 0, 0) + daysFromJ2000 * 864e5);
    return ayanamsha(key, window.Astronomy.MakeTime(utc));
  }, fx.input);
  check(fx, 'ayanamsha', actual);
}

// ── Новые области покрытия (ревью п.3) ───────────────────────────────
await C.checkSunMeeus(h, R, ENG);
await C.checkBodyPeriods(h, R, ENG);
await C.checkAspectsFromProduction(h, R, ENG);
await C.checkForecast(h, R, ENG);
await C.checkVedic(h, R, ENG);
await C.checkSynastry(h, R, ENG);
await C.checkRectifyGrid(h, R, ENG);

// ── Опубликованные астрономические факты ─────────────────────────────
{
  const fx = F('fact-march-equinox-window');
  const days = await h.evalIn(years => years.map(y => {
    const A = window.Astronomy;
    const lonAt = ms => A.SunPosition(A.MakeTime(new Date(ms))).elon;
    let lo = Date.UTC(y, 2, 15), hi = Date.UTC(y, 2, 25);
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; (lonAt(mid) > 180 ? lo = mid : hi = mid); }
    return new Date(lo).getUTCDate();
  }), fx.input.years);
  const bad = days.filter(d => d < fx.expected.dayOfMarchMin || d > fx.expected.dayOfMarchMax);
  R.ok(bad.length === 0, `[${fx.id}] равноденствие попадает в 19–21 марта UTC для ${fx.input.years.join(', ')} (получено: ${days.join(', ')})`,
    bad.length === 0 ? null : `дни вне окна: ${bad.join(', ')}`);
}
{
  const fx = F('fact-mean-synodic-month');
  const mean = await h.evalIn(({ startISO, spanDays }) => {
    const A = window.Astronomy;
    const elong = ms => { const t = A.MakeTime(new Date(ms)); return ((A.EclipticGeoMoon(t).lon - A.SunPosition(t).elon) % 360 + 360) % 360; };
    const t0 = Date.parse(startISO); const news = [];
    let prev = elong(t0);
    for (let d = 1; d <= spanDays; d++) {
      const ms = t0 + d * 864e5, cur = elong(ms);
      if (cur < prev) { let lo = ms - 864e5, hi = ms; for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; (elong(mid) > 180 ? lo = mid : hi = mid); } news.push(lo); }
      prev = cur;
    }
    return (news[news.length - 1] - news[0]) / (news.length - 1) / 864e5;
  }, fx.input);
  check(fx, 'meanSynodicMonth', mean);
}
{
  const fx = F('fact-luminaries-never-retrograde');
  const bad = await h.evalIn(n => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const d = new Date(Date.UTC(1960 + i, (i * 7) % 12, 1 + (i * 3) % 27, 6, 0, 0));
      const c = computeNatalChart({ date: d.toISOString().slice(0, 10), time: '06:00', timeKnown: true, utcOffset: 0, lat: 40, lon: 10, houseSystem: 'whole' });
      const s = c.planets.find(p => p.body === 'Sun'), m = c.planets.find(p => p.body === 'Moon');
      if (s.retro || m.retro) out.push({ date: d.toISOString().slice(0, 10), sun: s.retro, moon: m.retro });
    }
    return out;
  }, fx.input.samples);
  R.ok(bad.length === 0, `[${fx.id}] Солнце и Луна не помечены ретроградными ни в одной из ${fx.input.samples} выборок`,
    bad.length === 0 ? null : JSON.stringify(bad.slice(0, 5)));
}

// ── Геометрия углов: проверка определения ────────────────────────────
{
  const fx = F('angles-definition-geometry');
  let worstMc = 0, worstAlt = 0, rising = true;
  for (const c of C.HOUSE_CASES) {
    const got = await h.evalIn(b => {
      const chart = computeNatalChart({ ...b, timeKnown: true, houseSystem: 'whole' });
      const A = window.Astronomy;
      const utc = new Date(Date.parse(b.date + 'T' + b.time + ':00Z') - b.utcOffset * 3600e3);
      const lst = ((A.SiderealTime(A.MakeTime(utc)) * 15 + b.lon) % 360 + 360) % 360;
      return { asc: chart.angles.asc.lon, mc: chart.angles.mc.lon, lst };
    }, c);
    const eps = O.OBLIQUITY_J2000;
    const mcEq = O.eclipticToEquatorial(got.mc, eps);
    worstMc = Math.max(worstMc, angularDiff(mcEq.ra, got.lst));
    const ascEq = O.eclipticToEquatorial(got.asc, eps);
    worstAlt = Math.max(worstAlt, Math.abs(O.altitude(ascEq.ra, ascEq.dec, got.lst, c.lat)));
    if (O.hourAngle(ascEq.ra, got.lst) >= 0) rising = false;
  }
  check({ ...fx, expected: { mcRaEqualsRamcDeg: 0 } }, 'mcRaEqualsRamcDeg', worstMc);
  check({ ...fx, expected: { ascAltitudeDeg: 0 } }, 'ascAltitudeDeg', worstAlt);
  R.ok(rising, `[${fx.id}] Асцендент во всех кейсах в ВОСХОДЯЩЕЙ полусфере (часовой угол < 0)`);
}

await h.close();
const s = R.summary();
if (h.pageErrors.length) { console.log('JS-ошибки страницы:', h.pageErrors); process.exit(1); }
process.exit(s.fail ? 1 : 0);
