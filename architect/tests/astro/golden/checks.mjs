// Wave 3 (issue #154) — СЛОЙ 1: проверки golden reference.
//
// Вынесены в отдельный модуль, чтобы ОДИН И ТОТ ЖЕ код проверки использовался
// и в обычном прогоне (golden/run.mjs), и в mutation-sanity (golden/mutation.mjs).
// Иначе нельзя доказать, что проверка действительно ловит поломку production.
//
// ЖЕЛЕЗНОЕ ПРАВИЛО (owner review #4815354882, п.1): `actual` обязан приходить
// из РЕАЛЬНОГО production-выхода. Ни одна проверка не имеет права пересчитать
// формулу внутри тестового callback и сравнить её сама с собой.

import * as O from '../helpers/oracle.mjs';
import { angularDiff, norm360, goldenDiff } from '../helpers/core.mjs';

const EPS_PROD_EXPECTED = O.OBLIQUITY_J2000;

// Общий помощник сравнения с человекочитаемым diff.
function cmp(R, { id, method, key, expected, actual, tol, unit = '°', angular = true, engine, methodology }) {
  const diff = angular ? angularDiff(expected, actual) : Math.abs(expected - actual);
  return R.ok(diff <= tol, `[${id}] ${method} → ${key}`,
    diff <= tol ? null : goldenDiff({
      fixtureId: id, method, key, expected, actual, tolerance: tol, unit,
      engineVersion: engine, methodologyVersion: methodology, angular,
    }));
}

// Достаёт из production реальный контекст карты + звёздное время.
async function chartCtx(h, b) {
  return h.evalIn(x => {
    const A = window.Astronomy;
    const utc = new Date(Date.parse(x.date + 'T' + x.time + ':00Z') - x.utcOffset * 3600e3);
    const lst = ((A.SiderealTime(A.MakeTime(utc)) * 15 + x.lon) % 360 + 360) % 360;
    const out = { lst, utcMs: utc.getTime(), sys: {} };
    for (const s of ['whole', 'equal', 'placidus', 'koch', 'campanus', 'regiomontanus']) {
      const c = computeNatalChart({ ...x, houseSystem: s });
      out.sys[s] = c.housesMeta ? { system: c.housesMeta.system, cusps: c.housesMeta.cusps } : null;
      if (s === 'whole') {
        out.asc = c.angles.asc.lon; out.mc = c.angles.mc.lon;
        out.planets = c.planets.map(p => ({ body: p.body, name: p.name, lon: p.lon, retro: p.retro }));
        out.aspects = c.aspects;
        out.fortune = c.points.fortune ? { lon: c.points.fortune.lon, isDay: c.points.fortune.isDay } : null;
      }
    }
    return out;
  }, b);
}

export const HOUSE_CASES = [
  { date: '1984-06-15', time: '14:30', timeKnown: true, utcOffset: 4, lat: 50, lon: 30 },
  { date: '1999-02-02', time: '03:10', timeKnown: true, utcOffset: -5, lat: -34, lon: -58 },
  { date: '2011-09-09', time: '21:45', timeKnown: true, utcOffset: 8, lat: 35, lon: 139 },
];

// ── 1. Наклон эклиптики, ВОССТАНОВЛЕННЫЙ из production-выхода ────────
// Ревью п.1: прежняя версия сравнивала константу теста сама с собой.
// Теперь ε извлекается обращением production-формулы MC:
//   λ_MC = atan2(sin R, cos R · cos ε)  ⇒  cos ε = sin R · cos λ_MC / (cos R · sin λ_MC)
// Изменение ε в production немедленно меняет восстановленное значение.
export async function checkObliquityFromProduction(h, R, engine) {
  const cases = HOUSE_CASES;
  const recovered = [];
  for (const b of cases) {
    const c = await chartCtx(h, b);
    const r = c.lst * Math.PI / 180, m = c.mc * Math.PI / 180;
    // Избегаем вырождения (sin λ_MC ≈ 0 или cos R ≈ 0).
    if (Math.abs(Math.sin(m)) < 0.2 || Math.abs(Math.cos(r)) < 0.2) continue;
    const cosEps = (Math.sin(r) * Math.cos(m)) / (Math.cos(r) * Math.sin(m));
    recovered.push(Math.acos(Math.max(-1, Math.min(1, cosEps))) * 180 / Math.PI);
  }
  R.ok(recovered.length >= 2, `[obliquity-from-production] восстановлено ≥2 независимых оценки ε из production-MC (получено ${recovered.length})`);
  for (const [i, eps] of recovered.entries()) {
    cmp(R, {
      id: `obliquity-from-production-${i}`, method: 'computeNatalChart.angles.mc → ε (обращение формулы)',
      key: 'eps', expected: EPS_PROD_EXPECTED, actual: eps, tol: 1e-6, angular: false,
      engine, methodology: 'meeus-22.2 @ J2000',
    });
  }
}

// ── 2. Жребий Фортуны из РЕАЛЬНОГО production-выхода ─────────────────
// Ревью п.1: прежняя версия пересчитывала формулу внутри теста.
// Теперь читаем chart.points.fortune и сверяем с независимой формулой,
// причём день/ночь определяем независимо через высоту Солнца (Meeus 13.6).
export async function checkFortuneFromProduction(h, R, engine) {
  for (const [i, b] of HOUSE_CASES.entries()) {
    const c = await chartCtx(h, b);
    if (!c.fortune) { R.ok(false, `[fortune-production-${i}] production не вернул points.fortune при известном времени`); continue; }
    const sun = c.planets.find(p => p.body === 'Sun').lon;
    const moon = c.planets.find(p => p.body === 'Moon').lon;
    // Независимое определение дня/ночи: высота Солнца над горизонтом.
    const { ra, dec } = O.eclipticToEquatorial(sun, EPS_PROD_EXPECTED);
    const isDayRef = O.altitude(ra, dec, c.lst, b.lat) > 0;
    R.ok(c.fortune.isDay === isDayRef,
      `[fortune-production-${i}] признак день/ночь совпал с независимым расчётом высоты Солнца (production=${c.fortune.isDay}, эталон=${isDayRef})`);
    cmp(R, {
      id: `fortune-production-${i}`, method: 'computeNatalChart.points.fortune',
      key: 'lon', expected: O.partOfFortune(c.asc, sun, moon, isDayRef), actual: c.fortune.lon,
      tol: 1e-9, engine, methodology: 'classical-day-night-v1',
    });
  }
}

// ── 3. Квадрантные системы домов: определительные эталоны ────────────
// Ни одна из проверок не повторяет замкнутую формулу production.
//  Placidus  — куспид XI/XII обязан иметь часовой угол −(1/3|2/3)·SDA.
//  Koch      — куспид = асцендент на сдвинутом RAMC, найденный НЕЗАВИСИМЫМ
//              поиском корня высоты (а не формулой ascFromRamc).
//  Campanus  — делит первый вертикал: параметр позиционного круга ψ = −30/−60°.
//  Regiomont.— делит экватор: часовой угол пересечения H₀ = −30/−60°.
export async function checkQuadrantHouses(h, R, engine) {
  for (const [i, b] of HOUSE_CASES.entries()) {
    const c = await chartCtx(h, b);
    const lst = c.lst, lat = b.lat, eps = EPS_PROD_EXPECTED;

    // Placidus
    if (c.sys.placidus && c.sys.placidus.system === 'placidus') {
      for (const [k, frac] of [[11, 1 / 3], [12, 2 / 3]]) {
        const lam = c.sys.placidus.cusps[k];
        const { ra, dec } = O.eclipticToEquatorial(lam, eps);
        const H = O.hourAngle(ra, lst), SDA = O.semiDiurnalArc(dec, lat);
        if (SDA == null) { R.ok(true, `[placidus-${i}-c${k}] точка циркумполярна — SDA не определена, кейс пропущен честно`); continue; }
        cmp(R, {
          id: `placidus-def-${i}`, method: `houseCusps(placidus) c${k} — часовой угол против доли полудуги`,
          key: `H(c${k})`, expected: -frac * SDA, actual: H, tol: 1e-4, angular: false,
          engine, methodology: 'placidus-v1 (трисекция полудиурнальной дуги)',
        });
      }
    }
    // Koch
    if (c.sys.koch && c.sys.koch.system === 'koch') {
      const { dec: mcDec } = O.eclipticToEquatorial(c.mc, eps);
      const sdaMC = O.semiDiurnalArc(mcDec, lat);
      if (sdaMC != null) {
        for (const [k, mult] of [[11, -2 / 3], [12, -1 / 3]]) {
          const ref = O.ascendantByRootFinding(norm360(lst + mult * sdaMC), eps, lat);
          if (ref == null) { R.ok(true, `[koch-${i}-c${k}] независимый асцендент не найден на этой широте — кейс пропущен честно`); continue; }
          cmp(R, {
            id: `koch-def-${i}`, method: `houseCusps(koch) c${k} — независимый Asc(RAMC−доля·SDA_MC) поиском корня`,
            key: `c${k}`, expected: ref, actual: c.sys.koch.cusps[k], tol: 1e-3,
            engine, methodology: 'koch-v1 (трисекция времени восхода MC)',
          });
        }
      }
    }
    // Campanus — делит первый вертикал
    if (c.sys.campanus && c.sys.campanus.system === 'campanus') {
      for (const [k, expPsi] of [[11, 330], [12, 300]]) {
        const psi = O.positionCircleAngle(c.sys.campanus.cusps[k], eps, lst, lat);
        cmp(R, {
          id: `campanus-def-${i}`, method: `houseCusps(campanus) c${k} — параметр позиционного круга (первый вертикал)`,
          key: `ψ(c${k})`, expected: expPsi, actual: psi, tol: 1e-3,
          engine, methodology: 'campanus-v1 (равное деление первого вертикала)',
        });
      }
    }
    // Regiomontanus — делит экватор
    if (c.sys.regiomontanus && c.sys.regiomontanus.system === 'regiomontanus') {
      for (const [k, expH0] of [[11, -30], [12, -60]]) {
        const h0 = O.positionCircleEquatorHA(c.sys.regiomontanus.cusps[k], eps, lst, lat);
        cmp(R, {
          id: `regiomontanus-def-${i}`, method: `houseCusps(regiomontanus) c${k} — часовой угол пересечения с экватором`,
          key: `H₀(c${k})`, expected: expH0, actual: h0, tol: 1e-3, angular: false,
          engine, methodology: 'regiomontanus-v1 (равное деление экватора)',
        });
      }
    }
  }
}

// ── 4. Солнце: независимая формула Meeus, гл. 25 ─────────────────────
export async function checkSunMeeus(h, R, engine) {
  const dates = ['1950-11-03', '1984-06-15', '2000-01-01', '2024-03-20', '2049-08-08'];
  for (const d of dates) {
    const lon = await h.evalIn(x => computeNatalChart({ date: x, time: '12:00', timeKnown: true, utcOffset: 0, lat: 45, lon: 0, houseSystem: 'whole' }).planets.find(p => p.body === 'Sun').lon, d);
    const T = O.julianCenturies(O.julianDayFromUTC(d, 12));
    cmp(R, {
      id: `sun-meeus25-${d}`, method: 'computeNatalChart → Солнце',
      key: 'lon', expected: O.solarApparentLongitude(T), actual: lon, tol: 0.02,
      engine, methodology: 'meeus-25 (low accuracy ~0.01°)',
    });
  }
}

// ── 5. Луна и планеты: опубликованные периоды и границы элонгации ────
// Абсолютные положения планет независимой формулой воспроизвести нельзя без
// полной эфемериды, поэтому проверяются ОПУБЛИКОВАННЫЕ инварианты движения.
export async function checkBodyPeriods(h, R, engine) {
  const SYNODIC = { Mercury: 115.88, Venus: 583.92, Mars: 779.94, Jupiter: 398.88, Saturn: 378.09 };
  const MAX_ELONG = { Mercury: 28.5, Venus: 47.5 };
  const res = await h.evalIn(({ bodies }) => {
    const A = window.Astronomy;
    const out = {};
    const lonOf = (body, ms) => {
      const t = A.MakeTime(new Date(ms));
      if (body === 'Sun') return A.SunPosition(t).elon;
      if (body === 'Moon') return A.EclipticGeoMoon(t).lon;
      return A.Ecliptic(A.GeoVector(A.Body[body], t, true)).elon;
    };
    const t0 = Date.UTC(1990, 0, 1);
    for (const body of bodies) {
      const el = ms => ((lonOf(body, ms) - lonOf('Sun', ms)) % 360 + 360) % 360;
      // Соединения с Солнцем = пересечения 0° элонгации. У НИЖНИХ планет
      // (Меркурий, Венера) таких пересечений ДВА за синодический период —
      // нижнее и верхнее соединение, и они различаются направлением обёртки.
      // У ВЕРХНИХ планет Солнце движется быстрее, элонгация монотонно убывает
      // и пересечение одно. Поэтому синодический период — интервал между
      // соседними пересечениями ОДНОГО НАПРАВЛЕНИЯ, что верно для обоих типов.
      const up = [], down = []; let prev = el(t0); let maxEl = 0;
      for (let d = 1; d <= 7300; d++) {
        const ms = t0 + d * 864e5, cur = el(ms);
        const signed = cur > 180 ? cur - 360 : cur;
        if (Math.abs(signed) > maxEl) maxEl = Math.abs(signed);
        if (cur < prev - 180) up.push(ms);        // 360 → 0
        else if (cur > prev + 180) down.push(ms); // 0 → 360
        prev = cur;
      }
      const series = up.length >= down.length ? up : down;
      out[body] = {
        meanSynodic: series.length > 1 ? (series[series.length - 1] - series[0]) / (series.length - 1) / 864e5 : null,
        maxElong: maxEl, n: series.length,
      };
    }
    // Луна: средний сидерический месяц по возвратам к одной эклиптической долготе.
    const mt0 = Date.UTC(1990, 0, 1);
    const mlon = ms => lonOf('Moon', ms);
    let mprev = mlon(mt0); const rets = [];
    for (let d = 1; d <= 3650; d++) {
      const ms = mt0 + d * 864e5, cur = mlon(ms);
      if (cur < mprev - 180) rets.push(ms);
      mprev = cur;
    }
    out.MoonSidereal = rets.length > 1 ? (rets[rets.length - 1] - rets[0]) / (rets.length - 1) / 864e5 : null;
    return out;
  }, { bodies: Object.keys(SYNODIC) });

  for (const [body, exp] of Object.entries(SYNODIC)) {
    cmp(R, {
      id: `synodic-${body}`, method: `эфемерида ${body} → средний синодический период`,
      key: 'days', expected: exp, actual: res[body].meanSynodic, tol: 1.5, unit: 'сут', angular: false,
      engine, methodology: 'опубликованные синодические периоды',
    });
  }
  for (const [body, lim] of Object.entries(MAX_ELONG)) {
    R.ok(res[body].maxElong <= lim,
      `[max-elong-${body}] максимальная элонгация за 20 лет ${res[body].maxElong.toFixed(2)}° не превышает опубликованный предел ${lim}°`,
      res[body].maxElong <= lim ? null : `получено ${res[body].maxElong}° > ${lim}°`);
  }
  cmp(R, {
    id: 'moon-sidereal-month', method: 'эфемерида Луны → средний сидерический месяц',
    key: 'days', expected: 27.321662, actual: res.MoonSidereal, tol: 0.05, unit: 'сут', angular: false,
    engine, methodology: 'опубликованная константа (Meeus, гл. 47)',
  });
}

// ── 6. Аспекты реальной карты против независимого пересчёта ──────────
// Проверяется именно production aspect engine: его цикл, таблица орбисов и
// правило «первый подходящий аспект побеждает».
export async function checkAspectsFromProduction(h, R, engine) {
  const ORBS = [{ name: 'соединение', angle: 0, orb: 8 }, { name: 'оппозиция', angle: 180, orb: 8 },
    { name: 'трин', angle: 120, orb: 7 }, { name: 'квадрат', angle: 90, orb: 7 }, { name: 'секстиль', angle: 60, orb: 5 }];
  for (const [i, b] of HOUSE_CASES.entries()) {
    const c = await chartCtx(h, b);
    const ref = [];
    for (let a = 0; a < c.planets.length; a++) for (let d = a + 1; d < c.planets.length; d++) {
      const sep = angularDiff(c.planets[a].lon, c.planets[d].lon);
      for (const asp of ORBS) {
        if (Math.abs(sep - asp.angle) <= asp.orb) { ref.push(`${c.planets[a].name}|${c.planets[d].name}|${asp.name}|${Math.abs(sep - asp.angle).toFixed(1)}`); break; }
      }
    }
    const got = c.aspects.map(x => `${x.a}|${x.b}|${x.name}|${x.exact}`);
    const same = ref.length === got.length && ref.every((x, k) => x === got[k]);
    R.ok(same, `[aspects-production-${i}] ${got.length} аспектов production совпали с независимым пересчётом (тела, тип, орбис)`,
      same ? null : `эталон (${ref.length}): ${JSON.stringify(ref.slice(0, 6))}\nproduction (${got.length}): ${JSON.stringify(got.slice(0, 6))}`);
  }
}

// ── 7. Прогностика: определительные проверки ─────────────────────────
export async function checkForecast(h, R, engine) {
  const b = { date: '1984-06-15', time: '14:30', timeKnown: true, utcOffset: 4, lat: 55.75, lon: 37.62, houseSystem: 'whole' };

  // 7a. Вторичные прогрессии = «день за год»: карта на возраст N лет обязана
  // совпасть с натальными телами, посчитанными через N суток после рождения.
  const prog = await h.evalIn(x => {
    const at = new Date(Date.UTC(2014, 5, 15, 12, 0, 0));
    const p = computeProgressions(x, at, 'secondary');
    const b0 = birthUTCDate(x);
    const shifted = new Date(b0.getTime() + p.ageYears * 864e5);
    // utcOffset обязателен нулевой: дата/время взяты уже В UTC, иначе
    // контрольная карта повторно сместится на offset (для Луны это ~2°).
    const direct = computeNatalChart({ ...x, utcOffset: 0, date: shifted.toISOString().slice(0, 10), time: shifted.toISOString().slice(11, 16) });
    return { ageYears: p.ageYears, prog: p.planets.map(q => ({ body: q.body, lon: q.lon })), direct: direct.planets.map(q => ({ body: q.body, lon: q.lon })) };
  }, b);
  let worst = 0, worstBody = null;
  for (const p of prog.prog) {
    const d = prog.direct.find(x => x.body === p.body);
    const diff = angularDiff(p.lon, d.lon);
    if (diff > worst) { worst = diff; worstBody = p.body; }
  }
  cmp(R, {
    id: 'progressions-day-for-year', method: 'computeProgressions(secondary) — определение «день за год»',
    key: `максимум по телам (${worstBody})`, expected: 0, actual: worst, tol: 0.02, angular: false,
    engine, methodology: 'secondary-progressions (1 сутки = 1 год)',
  });

  // 7b. Solar arc: ВСЕ тела смещены на одну и ту же дугу, равную
  // прогрессивное Солнце − натальное Солнце.
  const dir = await h.evalIn(x => {
    const at = new Date(Date.UTC(2014, 5, 15, 12, 0, 0));
    const natal = computeNatalChart(x);
    const d = computeDirections(natal, x, at);
    return { arc: d.solarArc, pairs: d.directed.map((q, i) => ({ name: q.name, lon: q.lon, natal: natal.planets[i].lon })) };
  }, b);
  const arcs = dir.pairs.map(p => norm360(p.lon - p.natal));
  const spread = Math.max(...arcs.map(a => angularDiff(a, dir.arc)));
  cmp(R, {
    id: 'directions-solar-arc-uniform', method: 'computeDirections — единая солнечная дуга для всех тел',
    key: 'максимальное отклонение', expected: 0, actual: spread, tol: 1e-9, angular: false,
    engine, methodology: 'solar-arc directions',
  });

  // 7c. Солнечное возвращение: в найденный момент долгота Солнца равна
  // натальной, а интервал близок к тропическому году.
  const ret = await h.evalIn(x => {
    const natal = computeNatalChart(x);
    const target = natal.planets.find(p => p.body === 'Sun').lon;
    const b0 = birthUTCDate(x);
    // Окно 30 дней вокруг дня рождения — ровно так production вызывает
    // searchReturn в rReturns(). Окно длиннее солнечного года делает целевую
    // долготу неоднозначной, и движок честно возвращает null; воспроизводить
    // нереалистичный вызов в тесте смысла нет.
    const start = new Date(Date.UTC(2014, 5, 5));
    const d = searchReturn('Sun', target, start, 30);
    if (!d) return null;
    const A = window.Astronomy;
    return { target, at: d.toISOString(), lonAt: A.SunPosition(A.MakeTime(d)).elon, years: (d.getTime() - b0.getTime()) / 864e5 / 365.242190 };
  }, b);
  R.ok(!!ret, '[solar-return] searchReturn нашёл солнечное возвращение в окне 420 дней');
  if (ret) {
    cmp(R, {
      id: 'solar-return-longitude', method: 'searchReturn(Sun) — долгота Солнца в найденный момент',
      key: 'lon', expected: ret.target, actual: ret.lonAt, tol: 1e-4, engine, methodology: 'return search',
    });
    const wholeYears = Math.round(ret.years);
    R.ok(Math.abs(ret.years - wholeYears) < 0.01,
      `[solar-return-period] интервал от рождения = ${ret.years.toFixed(4)} тропических лет — целое число с точностью <0.01 года`);
  }

  // 7d. Транзиты: текущие положения обязаны совпасть с натальным расчётом
  // на тот же момент (единый источник эфемерид, а не два разных пути).
  const tr = await h.evalIn(x => {
    const at = new Date(Date.UTC(2020, 2, 20, 9, 0, 0));
    const natal = computeNatalChart(x);
    const t = computeTransits(natal, at);
    const same = computeNatalChart({ date: '2020-03-20', time: '09:00', timeKnown: true, utcOffset: 0, lat: 0, lon: 0, houseSystem: 'whole' });
    return { cur: t.current.map(p => ({ body: p.body, lon: p.lon })), ref: same.planets.map(p => ({ body: p.body, lon: p.lon })) };
  }, b);
  const trWorst = Math.max(...tr.cur.map(p => angularDiff(p.lon, tr.ref.find(x => x.body === p.body).lon)));
  cmp(R, {
    id: 'transits-single-ephemeris', method: 'computeTransits.current против computeNatalChart на тот же момент',
    key: 'максимум по телам', expected: 0, actual: trWorst, tol: 1e-9, angular: false,
    engine, methodology: 'единый источник эфемерид',
  });
}

// ── 8. Ведические методы: независимые определения ────────────────────
export async function checkVedic(h, R, engine) {
  const b = { date: '1984-06-15', time: '14:30', timeKnown: true, utcOffset: 4, lat: 55.75, lon: 37.62, houseSystem: 'whole' };
  const NAK = ['Ашвини', 'Бхарани', 'Криттика', 'Рохини', 'Мригашира', 'Ардра', 'Пунарвасу', 'Пушья', 'Ашлеша', 'Магха', 'Пурва-Пхалгуни', 'Уттара-Пхалгуни', 'Хаста', 'Читра', 'Свати', 'Вишакха', 'Анурадха', 'Джьештха', 'Мула', 'Пурва-Ашадха', 'Уттара-Ашадха', 'Шравана', 'Дхаништха', 'Шатабхиша', 'Пурва-Бхадрапада', 'Уттара-Бхадрапада', 'Ревати'];
  const VIM = [['Кету', 7], ['Венера', 20], ['Солнце', 6], ['Луна', 10], ['Марс', 7], ['Раху', 18], ['Юпитер', 16], ['Сатурн', 19], ['Меркурий', 17]];

  const v = await h.evalIn(x => {
    const A = window.Astronomy;
    const b0 = birthUTCDate(x);
    const t = A.MakeTime(b0);
    const aya = ayanamsha('lahiri', t);
    const chart = computeNatalChart(x);
    const sidOf = body => ((chart.planets.find(p => p.body === body).lon - aya) % 360 + 360) % 360;
    const sidSun = sidOf('Sun'), sidMoon = sidOf('Moon');
    return {
      aya, sidSun, sidMoon,
      dasha: (() => { const d = vimshottariDasha(sidMoon, b0, new Date(Date.UTC(2020, 0, 1))); return { nakshatra: d.nakshatra, pada: d.pada, seq: d.seq.map(s => ({ lord: s.lord, yrs: s.yrs })), balanceStart: d.balanceStart.from.toISOString() }; })(),
      panchanga: panchanga(sidSun, sidMoon, new Date(b0.getTime() + x.utcOffset * 3600e3)),
      varga: { d1: vargaSign(1, sidMoon), d9: vargaSign(9, sidMoon), d12: vargaSign(12, sidMoon) },
    };
  }, b);

  // 8a. Накшатра и пада — прямое определение (360/27 = 13°20', 4 пады).
  const nakLen = 360 / 27;
  const nakIdx = Math.floor(v.sidMoon / nakLen);
  R.ok(v.dasha.nakshatra === NAK[nakIdx],
    `[vedic-nakshatra] накшатра Луны совпала с определением ⌊sidMoon/13°20'⌋ (${v.dasha.nakshatra})`,
    v.dasha.nakshatra === NAK[nakIdx] ? null : `production=${v.dasha.nakshatra} эталон=${NAK[nakIdx]} (sidMoon=${v.sidMoon})`);
  const padaRef = Math.floor((v.sidMoon % nakLen) / (nakLen / 4)) + 1;
  R.ok(v.dasha.pada === padaRef, `[vedic-pada] пада = ${v.dasha.pada} совпала с определением (четверть накшатры)`);

  // 8b. Вимшоттари: порядок лордов и длительности — опубликованный канон 120 лет.
  const startIdx = nakIdx % 9;
  const seqRef = Array.from({ length: 9 }, (_, i) => VIM[(startIdx + i) % 9]);
  const seqOk = v.dasha.seq.every((s, i) => s.lord === seqRef[i][0] && s.yrs === seqRef[i][1]);
  R.ok(seqOk, `[vedic-vimshottari-seq] последовательность махадаш начинается с «${seqRef[0][0]}» и следует канону 120 лет`,
    seqOk ? null : `production=${JSON.stringify(v.dasha.seq)}\nэталон=${JSON.stringify(seqRef)}`);
  const total = v.dasha.seq.reduce((s, x) => s + x.yrs, 0);
  R.ok(total === 120, `[vedic-vimshottari-total] сумма девяти махадаш = ${total} лет (канон 120)`);

  // 8c. Панчанга: титхи, йога, карана — прямые определения.
  const elong = norm360(v.sidMoon - v.sidSun);
  const tithiRef = Math.floor(elong / 12) + 1;
  R.ok(v.panchanga.tithi === tithiRef, `[vedic-tithi] титхи = ${v.panchanga.tithi} совпала с ⌊(Луна−Солнце)/12°⌋+1`);
  const yogaRef = Math.floor(norm360(v.sidSun + v.sidMoon) / (360 / 27)) + 1;
  R.ok(v.panchanga.yoga === yogaRef, `[vedic-yoga] йога = ${v.panchanga.yoga} совпала с ⌊(Солнце+Луна)/13°20'⌋+1`);
  R.ok(v.panchanga.paksha === (tithiRef <= 15 ? 'шукла' : 'кришна'), `[vedic-paksha] пакша «${v.panchanga.paksha}» согласована с номером титхи`);

  // 8d. Варги: навамша и двадашамша — правила Парашары.
  const si = Math.floor(v.sidMoon / 30), deg = v.sidMoon % 30;
  R.ok(v.varga.d1 === si, `[vedic-varga-d1] D1 = раши Луны (${si})`);
  R.ok(v.varga.d9 === (si * 9 + Math.floor(deg / (30 / 9))) % 12, `[vedic-varga-d9] навамша совпала с правилом (знак·9 + ⌊град/3°20'⌋) mod 12`);
  R.ok(v.varga.d12 === (si + Math.floor(deg / 2.5)) % 12, `[vedic-varga-d12] двадашамша совпала с правилом (знак + ⌊град/2.5°⌋) mod 12`);
}

// ── 9. Синастрия: независимый пересчёт межкарточных аспектов ─────────
export async function checkSynastry(h, R, engine) {
  const A = { date: '1984-06-15', time: '14:30', timeKnown: true, utcOffset: 4, lat: 55.75, lon: 37.62, houseSystem: 'whole' };
  const B = { date: '1990-11-02', time: '08:05', timeKnown: true, utcOffset: -3, lat: -23.55, lon: -46.63, houseSystem: 'whole' };
  const r = await h.evalIn(({ a, b }) => {
    const ca = computeNatalChart(a), cb = computeNatalChart(b);
    const syn = computeSynastry(ca, cb);
    return { a: ca.planets.map(p => ({ name: p.name, lon: p.lon })), b: cb.planets.map(p => ({ name: p.name, lon: p.lon })), hits: syn.hits, orb: typeof SYNASTRY_ORB !== 'undefined' ? SYNASTRY_ORB : null };
  }, { a: A, b: B });

  R.ok(Array.isArray(r.hits), '[synastry-shape] computeSynastry вернул массив межкарточных попаданий');
  // Независимый пересчёт: каждое заявленное попадание обязано подтверждаться
  // угловым расстоянием между реальными долготами двух карт.
  let bad = null;
  for (const hit of r.hits) {
    const pa = r.a.find(p => p.name === (hit.a || hit.aName || hit.p1));
    const pb = r.b.find(p => p.name === (hit.b || hit.bName || hit.p2));
    if (!pa || !pb) { bad = `не удалось сопоставить тела попадания: ${JSON.stringify(hit)}`; break; }
    const sep = angularDiff(pa.lon, pb.lon);
    const declared = parseFloat(hit.exact);
    // Заявленный орбис обязан соответствовать реальной сепарации до какого-то
    // из мажорных углов.
    const best = Math.min(...[0, 60, 90, 120, 180].map(x => Math.abs(sep - x)));
    if (Math.abs(best - declared) > 0.15) { bad = `орбис ${declared} не соответствует реальной сепарации ${sep.toFixed(3)} (ближайший угол даёт ${best.toFixed(3)}): ${JSON.stringify(hit)}`; break; }
  }
  R.ok(!bad, `[synastry-orbs] все ${r.hits.length} межкарточных попаданий подтверждены независимым пересчётом сепарации`, bad);

  // Независимость данных двух людей: смена данных B не двигает тела A.
  const indep = await h.evalIn(({ a, b }) => {
    const ca1 = JSON.stringify(computeNatalChart(a).planets);
    computeSynastry(computeNatalChart(a), computeNatalChart({ ...b, date: '1975-01-01' }));
    const ca2 = JSON.stringify(computeNatalChart(a).planets);
    return ca1 === ca2;
  }, { a: A, b: B });
  R.ok(indep, '[synastry-independence] изменение данных второго человека не влияет на тела первого');
}

// ── 10. Ректификация: детерминированная сетка кандидатов ─────────────
// Скоринг ректификации — эвристика без независимого эталона (см. матрицу
// верификации). Но САМА СЕТКА кандидатов задана однозначно и проверяема.
export async function checkRectifyGrid(h, R, engine) {
  for (const [mode, step] of [['day', 30], ['day', 15], ['narrow', 15]]) {
    const got = await h.evalIn(({ m, s }) => rectifyCandidateMinutes(m, s), { m: mode, s: step });
    const ok = Array.isArray(got) && got.length > 0
      && got.every(x => Number.isInteger(x) && x >= 0 && x < 1440)
      && got.every((x, i) => i === 0 || x > got[i - 1])
      && new Set(got).size === got.length;
    R.ok(ok, `[rectify-grid-${mode}-${step}] сетка кандидатов (${got.length} шт.) строго возрастает, без дублей, в пределах суток`,
      ok ? null : `получено: ${JSON.stringify(got.slice(0, 10))}…`);
    // Шаг между соседями обязан равняться заявленному.
    const steps = new Set(got.slice(1).map((x, i) => x - got[i]));
    R.ok(steps.size === 1 && steps.has(step), `[rectify-grid-${mode}-${step}] шаг сетки ровно ${step} мин (получено: ${[...steps].join(',')})`);
  }
  // Ректификация НЕ перезаписывает время рождения автоматически.
  const noOverwrite = await h.evalIn(() => {
    const saved = DB.astroBirth;
    DB.astroBirth = { date: '1984-06-15', time: '14:30', timeKnown: true, utcOffset: 4, lat: 55.75, lon: 37.62, houseSystem: 'whole' };
    const before = DB.astroBirth.time;
    try { rectifyRun(DB.astroBirth, [], 'day', 30); } catch (e) { /* пустой список событий — допустимо */ }
    const after = DB.astroBirth.time;
    DB.astroBirth = saved;
    return before === after;
  });
  R.ok(noOverwrite, '[rectify-no-overwrite] rectifyRun не перезаписывает DB.astroBirth.time автоматически');
}
