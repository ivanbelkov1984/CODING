// ГЕНЕРАТОР ФИКСТУР — ДИАПАЗОН ЧАСОВОГО ПОЯСА.
//
// Комментарий в core.mjs обещал −12..+14, а `rnd() * 28 - 12` фактически давал
// до +16 — зон, которых на Земле не существует. Дефект не влиял на production
// (генератор живёт только в тестах), но означал, что property- и
// metamorphic-слои половину времени проверяли инварианты на входах, которые
// приложение принять не может, — и один такой вход уже приводил к ложному
// выводу при разборе D-DATE-02.
//
// Здесь диапазон проверяется на большом ДЕТЕРМИНИРОВАННОМ наборе (mulberry32,
// фиксированные seed'ы), а не на Math.random: результат воспроизводим и
// пригоден для mutation-проверки. Внизу — самопроверка критерия: ширина 28
// ОБЯЗАНА уронить эту же сюиту, иначе она ничего не сторожит.

import { mulberry32, randomBirth } from './helpers/core.mjs';

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; console.log('  ✓ ' + m); }
  else { fail++; console.log('  ✗ ' + m); if (d) console.log('      ' + String(d).split('\n').join('\n      ')); }
};

console.log('\n── Генератор фикстур: часовой пояс лежит в реальном диапазоне ──');

const SEEDS = [20260730, 1, 42, 987654321, 2147483647];
const N = 20000;

const collect = seed => {
  const rnd = mulberry32(seed);
  const seen = new Set();
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < N; i++) {
    const v = randomBirth(rnd).utcOffset;
    seen.add(v); if (v < lo) lo = v; if (v > hi) hi = v;
  }
  return { lo, hi, seen };
};

const all = new Set();
for (const seed of SEEDS) {
  const { lo, hi, seen } = collect(seed);
  seen.forEach(v => all.add(v));
  ok(lo >= -12 && hi <= 14,
    `seed ${seed}: ${N} случаев — офсет в [−12, +14] (min ${lo}, max ${hi})`,
    `min=${lo} max=${hi}`);
}

// Детерминированность: тот же seed обязан дать ту же последовательность,
// иначе «зелено на одном прогоне» ничего не значит.
const a = collect(20260730), b = collect(20260730);
ok(a.lo === b.lo && a.hi === b.hi && a.seen.size === b.seen.size,
  'один seed → идентичный результат (детерминированность сохранена)');

// Шаг 0.5 и отсутствие сужения: диапазон обязан покрываться целиком.
const sorted = [...all].sort((x, y) => x - y);
const halfStep = sorted.every(v => Number.isInteger(v * 2));
ok(halfStep, `все значения кратны 0.5 (различных: ${sorted.length})`);
ok(sorted[0] === -12, `нижняя граница достигается: ${sorted[0]}`);
ok(sorted[sorted.length - 1] === 14, `верхняя граница достигается: ${sorted[sorted.length - 1]}`);
ok(sorted.length === 53,
  `диапазон не сужен: покрыты все 53 позиции от −12 до +14 с шагом 0.5 (получено ${sorted.length})`,
  `пропущены: ${Array.from({ length: 53 }, (_, i) => -12 + i * 0.5).filter(v => !all.has(v)).join(', ') || '(нет)'}`);

// Самопроверка критерия убийства: прежняя ширина 28 обязана дать значения
// вне [−12, +14]. Если бы не давала — проверка выше была бы декоративной.
const legacy = () => {
  const rnd = mulberry32(20260730);
  let hi = -Infinity;
  for (let i = 0; i < N; i++) hi = Math.max(hi, Math.round((rnd() * 28 - 12) * 2) / 2);
  return hi;
};
const legacyHi = legacy();
ok(legacyHi > 14,
  `самопроверка: прежняя ширина 28 действительно выходит за +14 (max ${legacyHi}) — мутант 26→28 будет убит`,
  `legacyHi=${legacyHi}`);

console.log(`\nГенератор фикстур: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
