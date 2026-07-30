// Wave 3 (issue #154) — СЛОЙ 3: metamorphic tests.
//
// Проверяют не конкретное число, а ОЖИДАЕМУЮ СВЯЗЬ между двумя контролируемо
// преобразованными входами. Такой тест ловит дефекты там, где эталона нет
// вовсе (например, произвольная широта в 1893 году).
//
// Правило контракта: для КАЖДОГО отношения ниже указано, почему преобразование
// математически допустимо именно для этого метода. Отношение «кажется
// логичным» — недостаточное основание.

import { bootAstro } from '../helpers/harness.mjs';
import { createReporter, mulberry32, randomBirth, angularDiff } from '../helpers/core.mjs';

const SEED = Number(process.env.PROP_SEED || 20260730);
const N = Number(process.env.META_N || 40);
const R = createReporter('Astro metamorphic');
const h = await bootAstro();

console.log(`\n── Слой 3: metamorphic (seed=${SEED}, ${N} случаев на отношение) ──`);

// Прогон отношения по N сгенерированным входам.
async function relation(name, justification, transform) {
  const rnd = mulberry32(SEED);
  for (let i = 0; i < N; i++) {
    const birth = randomBirth(rnd, { timeKnown: true });
    let violation;
    try { violation = await transform(birth); }
    catch (e) { violation = 'исключение: ' + e.message; }
    if (violation) {
      R.ok(false, name, [
        `обоснование  : ${justification}`,
        `итерация     : ${i}`,
        `вход         : ${JSON.stringify(birth)}`,
        `нарушение    : ${violation}`,
        `воспроизвести: PROP_SEED=${SEED} node tests/astro/metamorphic/run.mjs`,
      ].join('\n'));
      return;
    }
  }
  R.ok(true, `${name} (${N} случаев)`);
}

// Сравнение карт выполняется ЧИСЛЕННО с допуском, а не строковым равенством
// JSON. Причина: вертекс (и только он) находится численным поиском корня
// пересечения эклиптики с первой вертикалью, поэтому последний бит входного
// LST меняет результат на ~6e-14° (2e-10 угловой секунды). Это шум метода
// решения, а не расхождение расчёта; строгое равенство строк ловило бы его
// как «нарушение отношения». Допуск 1e-9° на десять порядков строже любой
// астрологически значимой величины.
const CALC_TOL = 1e-9;
const INSTALL_CMP = `(() => {
  window.__astroKey = c => ({ p: c.planets, ang: c.angles, h: c.housesMeta, pts: c.points, asp: c.aspects, ast: c.asteroids });
  window.__astroEq = (u, v, tol) => {
    if (u === v) return true;
    if (typeof u === 'number' && typeof v === 'number') return Math.abs(u - v) <= tol;
    if (u === null || v === null || typeof u !== 'object' || typeof v !== 'object') return u === v;
    const ku = Object.keys(u), kv = Object.keys(v);
    if (ku.length !== kv.length) return false;
    for (const k of ku) if (!window.__astroEq(u[k], v[k], tol)) return false;
    return true;
  };
  window.__chartsEq = (a, b, tol) => window.__astroEq(window.__astroKey(a), window.__astroKey(b), tol);
  return true;
})()`;
await h.evalIn(src => eval(src), INSTALL_CMP);

// ── M1. Географическая долгота ±360° ─────────────────────────────────
// ОБОСНОВАНИЕ: долгота места входит в расчёт единственным способом — через
// местное звёздное время LST = GAST·15 + lon, которое затем нормализуется по
// модулю 360. Сдвиг аргумента на целый оборот тождественно не меняет LST,
// следовательно обязан не менять НИ ОДНО значение карты.
await relation(
  'долгота места lon и lon±360° дают идентичную карту',
  'lon входит только в LST = GAST·15 + lon (mod 360); сдвиг на полный оборот — тождество',
  async birth => {
    const bad = await h.evalIn(({ b, tol }) => {
      const base = computeNatalChart(b);
      for (const d of [+360, -360]) {
        if (!window.__chartsEq(base, computeNatalChart({ ...b, lon: b.lon + d }), tol)) return d;
      }
      return null;
    }, { b: birth, tol: CALC_TOL });
    return bad ? `карта изменилась при сдвиге долготы на ${bad > 0 ? '+' : ''}${bad}°` : null;
  });

// ── M2. Один и тот же абсолютный момент UTC ──────────────────────────
// ОБОСНОВАНИЕ: локальное время и utcOffset входят в расчёт ИСКЛЮЧИТЕЛЬНО в
// комбинации Date.parse(date+time) − offset·3600e3, то есть только через
// абсолютный момент UTC. Разные корректные представления одного и того же
// момента обязаны давать одну карту. Это же отношение — главный тест на
// отсутствие «тихого» довыбора смещения: приложение хранит явный числовой
// offset и не выводит его из IANA-базы, поэтому DST-неоднозначность
// физически не может возникнуть внутри расчёта.
await relation(
  'разные (локальное время, utcOffset) для одного момента UTC дают идентичную карту',
  'время и offset входят только в комбинации «абсолютный момент UTC»; представление не участвует в формулах',
  async birth => {
    const bad = await h.evalIn(({ b, tol }) => {
      const base = computeNatalChart(b);
      // Абсолютный момент UTC исходного случая.
      const utcMs = Date.parse(b.date + 'T' + b.time + ':00Z') - b.utcOffset * 3600e3;
      for (const delta of [-13, -3, -1, 1, 2.5, 5, 11]) {
        // Тот же момент UTC, записанный в другой зоне: локальные дата и время
        // пересчитываются ИЗ момента, а не сдвигаются вручную.
        const off2 = b.utcOffset + delta;
        const local = new Date(utcMs + off2 * 3600e3).toISOString();
        const cand = { ...b, date: local.slice(0, 10), time: local.slice(11, 16), utcOffset: off2 };
        // Секунды в локальном представлении обязаны быть нулевыми, иначе
        // сравнение некорректно (форма хранит только ЧЧ:ММ).
        if (local.slice(17, 19) !== '00') continue;
        if (!window.__chartsEq(base, computeNatalChart(cand), tol)) return { delta, cand };
      }
      return null;
    }, { b: birth, tol: CALC_TOL });
    return bad ? `сдвиг Δ=${bad.delta}ч дал другую карту при том же моменте UTC: ${JSON.stringify(bad.cand)}` : null;
  });

// ── M3. Смена системы домов не двигает планеты ───────────────────────
// ОБОСНОВАНИЕ: долготы планет вычисляются из эфемерид ДО и НЕЗАВИСИМО от
// куспидов; система домов — способ разбиения того же круга. Любое влияние
// выбора системы на долготы означало бы протечку между слоями.
await relation(
  'смена системы домов не меняет долготы планет, углы и аспекты',
  'долготы планет и Asc/MC считаются до куспидов и не зависят от способа деления круга',
  async birth => {
    const bad = await h.evalIn(b => {
      const key = c => JSON.stringify({ p: c.planets, a: c.angles, asp: c.aspects, pts: c.points });
      const base = key(computeNatalChart({ ...b, houseSystem: 'whole' }));
      for (const s of ['equal', 'placidus', 'koch', 'campanus', 'regiomontanus']) {
        if (key(computeNatalChart({ ...b, houseSystem: s })) !== base) return s;
      }
      return null;
    }, birth);
    return bad ? `система «${bad}» изменила планеты/углы/аспекты` : null;
  });

// ── M4 переведён в ФИКСИРОВАННЫЙ non-degeneracy smoke case ───────────
// Owner review #4815354882, п.4: «разные системы обязаны дать разный куспид
// XI» — НЕ универсальный математический закон. Разные функции законно могут
// совпасть на отдельных входах (например, на экваторе или при вырожденном
// звёздном времени), поэтому как metamorphic relation для ПРОИЗВОЛЬНЫХ входов
// это утверждение неверно. Оставлено как фиксированный smoke-кейс на заведомо
// невырожденных данных: он ловит ровно то, ради чего вводился, — фиктивный
// селектор системы домов, который молча возвращает одно и то же.
{
  const FIXED = { date: '1984-06-15', time: '14:30', timeKnown: true, utcOffset: 4, lat: 50, lon: 30, houseSystem: 'whole' };
  const r = await h.evalIn(x => {
    const out = {};
    for (const s of ['whole', 'equal', 'placidus', 'koch', 'campanus', 'regiomontanus']) {
      const c = computeNatalChart({ ...x, houseSystem: s });
      out[s] = c.housesMeta ? { sys: c.housesMeta.system, c11: c.housesMeta.cusps[11], c12: c.housesMeta.cusps[12] } : null;
    }
    return out;
  }, FIXED);
  const systems = ['whole', 'equal', 'placidus', 'koch', 'campanus', 'regiomontanus'];
  const allResolved = systems.every(s => r[s] && r[s].sys === s);
  R.ok(allResolved, `smoke (фиксированный кейс lat=50, 1984-06-15 14:30): все 6 систем домов посчитались без полярного отката`,
    allResolved ? null : JSON.stringify(r));
  const c11 = systems.map(s => r[s] && r[s].c11);
  const distinct = new Set(c11.map(x => x != null && x.toFixed(6))).size;
  R.ok(distinct >= 5,
    `smoke non-degeneracy: куспид XI различается минимум у 5 из 6 систем (различных значений: ${distinct}) — селектор системы реально влияет на расчёт`,
    distinct >= 5 ? null : `куспиды XI: ${JSON.stringify(systems.map((s, i) => `${s}=${c11[i]}`))}`);
}

// ── M5. Слой интерпретации не влияет на слой расчёта ─────────────────
// ОБОСНОВАНИЕ: тексты (ASTRO_RULES/astro_texts_*) — символическая надстройка.
// Расчёт обязан давать те же числа независимо от того, загружены тексты или
// нет, иначе интерпретация «протекает» в астрономию.
await relation(
  'загруженность текстов интерпретации не меняет расчётные числа',
  'тексты — отдельный слой; расчёт не обязан и не должен от них зависеть',
  async birth => {
    const eq = await h.evalIn(({ b, tol }) => {
      const saved = window.ASTRO_RULES;
      window.ASTRO_RULES = undefined;
      const without = computeNatalChart(b);
      window.ASTRO_RULES = saved || { transitGift: {}, natal: {} };
      const withRules = computeNatalChart(b);
      window.ASTRO_RULES = saved;
      return window.__chartsEq(without, withRules, tol);
    }, { b: birth, tol: CALC_TOL });
    return eq ? null : 'наличие ASTRO_RULES изменило расчётные поля карты';
  });

// ── M6. Сохранение → восстановление → пересчёт ───────────────────────
// ОБОСНОВАНИЕ: birth-данные — единственный вход расчёта. Полный цикл
// сериализации хранилища не должен терять или искажать ни один параметр,
// влияющий на числа (это же покрывает backup/restore-путь на уровне данных).
await relation(
  'DB-roundtrip (сохранение → сериализация → восстановление) сохраняет карту',
  'birth — единственный вход; сериализация хранилища не участвует в формулах и обязана быть прозрачной',
  async birth => {
    const eq = await h.evalIn(({ b, tol }) => {
      const saved = DB.astroBirth;
      DB.astroBirth = { ...b, kType: 'birth_evidence', privacyClass: 'sensitive', sv: SCHEMA_VERSION, _u: Date.now() };
      const before = computeNatalChart(DB.astroBirth);
      const wire = JSON.stringify(DB);
      DB.astroBirth = null;
      const restored = JSON.parse(wire);
      DB.astroBirth = restored.astroBirth;
      const after = computeNatalChart(DB.astroBirth);
      DB.astroBirth = saved;
      return window.__chartsEq(before, after, tol);
    }, { b: birth, tol: CALC_TOL });
    return eq ? null : 'карта изменилась после roundtrip через сериализацию DB';
  });

// ── M7 УДАЛЁН как ложное покрытие ────────────────────────────────────
// Owner review #4815354882, п.4: прежний M7 брал одну production-карту, а
// затем ЛОКАЛЬНАЯ тестовая функция сама пересчитывала аспекты на прямом и
// развёрнутом массивах. Это проверяло собственный цикл теста, а не aspect
// engine приложения. Production не предоставляет входа, принимающего
// переставленный список тел (ASTRO_BODIES — константа модуля), поэтому
// честного metamorphic-варианта здесь нет.
//
// Реальное покрытие аспектов обеспечивает слой golden:
// checks.mjs → checkAspectsFromProduction() сверяет ФАКТИЧЕСКИЙ chart.aspects
// с независимым пересчётом (тела, тип аспекта, орбис), а mutation-sanity
// доказывает, что эта сверка ловит подмену орбиса в production.

// ── M8. Неизвестное время: карта не зависит от «поля времени» ────────
// ОБОСНОВАНИЕ: при timeKnown=false поле time не должно участвовать вообще
// (production подставляет полдень). Если оставшееся в поле значение влияет
// на результат — это скрытая ложная точность.
await relation(
  'при timeKnown=false остаточное значение поля time не влияет на карту',
  'время объявлено неизвестным ⇒ оно не может быть входом расчёта; иначе появляется скрытая ложная точность',
  async birth => {
    const eq = await h.evalIn(({ b, tol }) => {
      const a = computeNatalChart({ ...b, timeKnown: false, time: '' });
      const c = computeNatalChart({ ...b, timeKnown: false, time: '23:59' });
      const d = computeNatalChart({ ...b, timeKnown: false, time: '00:01' });
      return window.__chartsEq(a, c, tol) && window.__chartsEq(a, d, tol);
    }, { b: birth, tol: CALC_TOL });
    return eq ? null : 'остаточное значение поля time изменило карту при timeKnown=false';
  });

await h.close();
const s = R.summary();
if (h.pageErrors.length) { console.log('JS-ошибки страницы:', h.pageErrors.slice(0, 5)); process.exit(1); }
process.exit(s.fail ? 1 : 0);
