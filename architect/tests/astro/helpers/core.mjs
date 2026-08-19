// Wave 3 (issue #154) — Formula Verification Standard: общие утилиты трёх слоёв.
//
// ВАЖНО: этот файл НЕ импортирует и НЕ воспроизводит production-код. Всё, что
// здесь есть, — независимая арифметика и инфраструктура отчётов. Любая формула,
// используемая как эталон, живёт в helpers/oracle.mjs и написана по
// опубликованному источнику, а не списана с app.js.

// ── Углы ─────────────────────────────────────────────────────────────
export const norm360 = x => ((x % 360) + 360) % 360;

// Круговая разница: кратчайшая дуга между двумя долготами, 0..180.
// Обычное |a-b| неверно на границе 0°/360° (359° и 1° различаются на 2°, не 358°).
export const angularDiff = (a, b) => {
  const d = Math.abs(norm360(a) - norm360(b));
  return Math.min(d, 360 - d);
};

// Знаковая разница a-b в диапазоне (-180, 180].
export const signedDiff = (a, b) => {
  const d = norm360(a - b);
  return d > 180 ? d - 360 : d;
};

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

// ── Детерминированный ГПСЧ (mulberry32) ──────────────────────────────
// Тот же алгоритм, что уже используется в Волне 4 — воспроизводимость по seed.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Генератор произвольного «случая рождения» по seed. Диапазоны намеренно
// широкие: полярные широты, обе долготы, дробные offset'ы, unknown time.
export function randomBirth(rnd, opts = {}) {
  const year = 1900 + Math.floor(rnd() * 150);          // 1900..2049
  const month = 1 + Math.floor(rnd() * 12);
  const day = 1 + Math.floor(rnd() * 28);               // 28 — без календарных краёв
  const hour = Math.floor(rnd() * 24);
  const minute = Math.floor(rnd() * 60);
  const latRange = opts.latRange || 89.5;
  return {
    date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    timeKnown: opts.timeKnown !== undefined ? opts.timeKnown : rnd() > 0.2,
    // Ширина ровно 26: rnd() ∈ [0,1) → (rnd()*26−12)*2 ∈ [−24, 28) → после
    // округления [−24, 28] → /2 даёт [−12, +14] включительно, шаг 0.5. С
    // прежней шириной 28 верхняя граница уезжала до +16 — зон, которых нет.
    utcOffset: Math.round((rnd() * 26 - 12) * 2) / 2,   // -12..+14 с шагом 0.5
    lat: +(rnd() * 2 * latRange - latRange).toFixed(4),
    lon: +(rnd() * 360 - 180).toFixed(4),
    houseSystem: opts.houseSystem || ['whole', 'equal', 'placidus', 'koch', 'campanus', 'regiomontanus'][Math.floor(rnd() * 6)],
    place: 'synthetic',
  };
}

// ── Отчётность ───────────────────────────────────────────────────────
export function createReporter(suiteName) {
  let pass = 0, fail = 0;
  const failures = [];
  const ok = (cond, message, detail) => {
    if (cond) { pass++; console.log('  ✓ ' + message); }
    else {
      fail++; failures.push({ message, detail });
      console.log('  ✗ ' + message);
      if (detail) console.log(indent(detail));
    }
    return !!cond;
  };
  const summary = () => {
    console.log(`\n${suiteName}: ${pass} passed, ${fail} failed`);
    return { pass, fail, failures };
  };
  return { ok, summary, get pass() { return pass; }, get fail() { return fail; } };
}

const indent = s => String(s).split('\n').map(l => '      ' + l).join('\n');

// Человекочитаемый diff для golden-теста. Требование контракта: при падении
// видно fixture id, метод, expected, actual, абсолютную и относительную
// разницу, tolerance и версии — чтобы отличить «дрейф формулы» от «эталон
// изменился законно».
export function goldenDiff({ fixtureId, method, key, expected, actual, tolerance, unit, engineVersion, methodologyVersion, angular }) {
  const abs = angular ? angularDiff(expected, actual) : Math.abs(expected - actual);
  const rel = expected !== 0 ? abs / Math.abs(expected) : (abs === 0 ? 0 : Infinity);
  return [
    `fixture   : ${fixtureId}`,
    `method    : ${method}${key ? ' → ' + key : ''}`,
    `expected  : ${fmt(expected)}${unit ? ' ' + unit : ''}`,
    `actual    : ${fmt(actual)}${unit ? ' ' + unit : ''}`,
    `abs diff  : ${fmt(abs)}${unit ? ' ' + unit : ''}${angular ? ' (круговая)' : ''}`,
    `rel diff  : ${isFinite(rel) ? (rel * 100).toFixed(6) + ' %' : 'n/a'}`,
    `tolerance : ${fmt(tolerance)}${unit ? ' ' + unit : ''}`,
    `engine    : ${engineVersion || 'n/a'}`,
    `methodolgy: ${methodologyVersion || 'n/a'}`,
  ].join('\n');
}

const fmt = v => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(8)) : JSON.stringify(v));

// Отчёт о падении property-теста: обязателен seed и минимальный
// воспроизводимый случай (контракт §18).
export function propertyFailure({ seed, iteration, input, message, shrunk }) {
  return [
    `seed          : ${seed}`,
    `iteration     : ${iteration}`,
    `counterexample: ${JSON.stringify(shrunk || input)}`,
    shrunk ? `original      : ${JSON.stringify(input)}` : null,
    message ? `detail        : ${message}` : null,
    `воспроизвести : PROP_SEED=${seed} node tests/astro/properties/run.mjs`,
  ].filter(Boolean).join('\n');
}

// Простое «сжатие» контрпримера: пробуем упростить поля до нейтральных
// значений, пока свойство продолжает падать. Не полноценный shrinking
// fast-check, но даёт минимальный читаемый случай без новой зависимости.
export async function shrinkBirth(birth, stillFails) {
  let best = { ...birth };
  const simplifications = [
    b => ({ ...b, utcOffset: 0 }),
    b => ({ ...b, lon: 0 }),
    b => ({ ...b, lat: 0 }),
    b => ({ ...b, time: '12:00' }),
    b => ({ ...b, date: '2000-01-01' }),
    b => ({ ...b, houseSystem: 'whole' }),
  ];
  for (const simplify of simplifications) {
    const candidate = simplify(best);
    if (JSON.stringify(candidate) === JSON.stringify(best)) continue;
    if (await stillFails(candidate)) best = candidate;
  }
  return best;
}
