// Wave 3 (issue #154) — БЛОКИРУЮЩАЯ проверка provenance астродвижка.
//
// Owner review #4815354882, п.6: SHA-256 движка был записан только в
// документации. Файл мог измениться при неизменном ASTRO_VERSIONS.engine, а
// широкие астрономические факты (окно равноденствия и т.п.) такую подмену
// не обязаны поймать. Здесь checksum проверяется в самом CI.
//
// ПРОЦЕДУРА ОБНОВЛЕНИЯ ВЕРСИИ ДВИЖКА (осознанное действие, не автоправка):
//   1. заменить architect/astronomy.min.js целиком новой сборкой upstream
//      (правка файла запрещена — только замена версии);
//   2. обновить ASTRO_VERSIONS.engine в app.js на новую версию;
//   3. пересчитать checksum:  sha256sum architect/astronomy.min.js
//   4. вписать новое значение в EXPECTED ниже И в §2 контракта
//      WAVE3_ASTROLOGY_VERIFICATION_CONTRACT.md;
//   5. прогнать `npm run test:astro` целиком — golden-слой обязан остаться
//      зелёным; любое расхождение эталонов означает смену поведения движка и
//      требует отдельного разбора, а не подгонки фикстур.

import { readFile } from 'fs/promises';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..', '..');

const EXPECTED = {
  file: 'astronomy.min.js',
  version: 'astronomy-engine@2.1.19',
  sha256: '7dffd0e36da9dc7430f52b9c514bec8ae94056a6e12ae7b8c6b0835360800006',
  bytes: 116855,
  license: 'MIT',
};

let pass = 0, fail = 0;
const ok = (cond, msg, detail) => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); if (detail) console.log('      ' + String(detail).split('\n').join('\n      ')); }
};

console.log('\n── Engine provenance: vendored astronomy.min.js ──');

const buf = await readFile(join(ROOT, EXPECTED.file));
const sha = createHash('sha256').update(buf).digest('hex');

ok(sha === EXPECTED.sha256, `SHA-256 движка совпадает с закреплённым (${EXPECTED.sha256.slice(0, 16)}…)`,
  sha === EXPECTED.sha256 ? null
    : `ожидалось: ${EXPECTED.sha256}\nполучено : ${sha}\n\nФайл движка изменился. Это НЕ повод обновить константу —\nсначала объясните, почему изменился vendored-движок, и прогоните\nвесь golden-слой. Процедура обновления описана в шапке этого файла.`);

ok(buf.length === EXPECTED.bytes, `размер движка ${buf.length} байт совпадает с закреплённым`,
  buf.length === EXPECTED.bytes ? null : `ожидалось ${EXPECTED.bytes}, получено ${buf.length}`);

const head = buf.subarray(0, 4096).toString('utf8');
ok(head.includes('2.1.19'), 'в шапке файла присутствует заявленная версия 2.1.19');
ok(head.includes('MIT'), 'в шапке файла присутствует лицензия MIT');
ok(head.includes('cosinekitty/astronomy'), 'в шапке файла присутствует ссылка на upstream-репозиторий');

// Версия, заявленная приложением, обязана соответствовать вендоренному файлу.
const appSrc = await readFile(join(ROOT, 'app.js'), 'utf8');
const m = appSrc.match(/engine:\s*'([^']+)'/);
ok(m && m[1] === EXPECTED.version,
  `ASTRO_VERSIONS.engine в app.js = «${m && m[1]}» согласован с вендоренным файлом`,
  m && m[1] === EXPECTED.version ? null : `ожидалось ${EXPECTED.version}, получено ${m && m[1]}`);

// Тот же файл обязан попасть в сборку без изменений.
try {
  const dist = await readFile(join(ROOT, 'dist', EXPECTED.file));
  const distSha = createHash('sha256').update(dist).digest('hex');
  ok(distSha === EXPECTED.sha256, 'копия движка в dist/ побайтово совпадает с исходной (сборка не трансформирует движок)',
    distSha === EXPECTED.sha256 ? null : `dist sha256 = ${distSha}`);
} catch {
  ok(true, 'dist/ ещё не собран — проверка копии пропущена (npm test собирает dist перед прогоном)');
}

console.log(`\nEngine provenance: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
