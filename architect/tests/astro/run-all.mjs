// Wave 3 (issue #154) — запуск всех трёх слоёв Formula Verification Standard.
// Слои намеренно разделены и запускаются последовательно, каждый в своём
// процессе: падение одного слоя не маскирует результаты остальных, и в CI
// видно, КАКОЙ именно слой сломался.
//
// Все три слоя блокирующие: golden ловит дрейф формул, property — нарушение
// инвариантов, metamorphic — разъезд связанных преобразований. Ни один из
// них не вынесен в nightly.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const DIR = dirname(fileURLToPath(import.meta.url));
const LAYERS = [
  ['Провенанс движка (SHA-256)', 'engine-provenance.test.mjs'],
  ['Диапазон генератора фикстур', 'generator-range.test.mjs'],
  ['Слой 1 — golden reference', 'golden/run.mjs'],
  ['Слой 1b — mutation sanity', 'golden/mutation.mjs'],
  ['Слой 2 — property-based', 'properties/run.mjs'],
  ['Слой 3 — metamorphic', 'metamorphic/run.mjs'],
];

const run = file => new Promise(res => {
  const p = spawn(process.execPath, [join(DIR, file)], { stdio: 'inherit', env: process.env });
  p.on('close', code => res(code));
});

let failed = 0;
for (const [name, file] of LAYERS) {
  console.log(`\n════ ${name} ════`);
  const code = await run(file);
  if (code !== 0) { failed++; console.log(`  ▸ ${name}: ПРОВАЛЕН (exit ${code})`); }
}

console.log('\n════════════════════════════════════════════');
console.log(failed === 0
  ? '  Astro Formula Verification: все этапы зелёные (провенанс + генератор + 3 слоя + mutation)'
  : `  Astro Formula Verification: провалено этапов — ${failed}/${LAYERS.length}`);
console.log('════════════════════════════════════════════');
process.exit(failed ? 1 : 0);
