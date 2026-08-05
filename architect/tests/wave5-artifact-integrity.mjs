// Wave 5 (issue #158) — CI release gate: целостность собранного артефакта.
//
// Проверяет НЕ исходники, а то, что реально уедет в production: dist/.
// Секрет, попавший в бандл, или потерянный SW-ассет — это релизный дефект,
// который обычные unit-тесты не видят, потому что смотрят на исходный код.
//
// Запуск: node build.mjs && node tests/wave5-artifact-integrity.mjs

import { readFile, stat } from 'fs/promises';
import { createHash } from 'crypto';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..');
const DIST = join(ROOT, 'dist');
let pass = 0, fail = 0;
const ok = (cond, msg, detail) => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); if (detail) console.log('      ' + String(detail).split('\n').join('\n      ')); }
};

const exists = async p => { try { await stat(p); return true; } catch { return false; } };

// ── 1. Сборка на месте ──────────────────────────────────────────────
ok(await exists(join(DIST, 'index.html')), 'артефакт: dist/index.html собран');
ok(await exists(join(DIST, 'sw.js')), 'артефакт: dist/sw.js собран');

const html = await readFile(join(DIST, 'index.html'), 'utf8');
const sw = await readFile(join(DIST, 'sw.js'), 'utf8');

// ── 2. Секреты ──────────────────────────────────────────────────────
// Реальные ключи не должны попасть в публикуемый бандл ни при каких условиях.
const SECRETS = [
  { re: /sk-ant-[A-Za-z0-9_-]{20,}/g, name: 'Anthropic ключ' },
  { re: /sk-[A-Za-z0-9]{32,}/g, name: 'OpenAI-подобный ключ' },
  { re: /AIza[A-Za-z0-9_-]{30,}/g, name: 'Google API-ключ' },
  { re: /ghp_[A-Za-z0-9]{30,}/g, name: 'GitHub token' },
  { re: /github_pat_[A-Za-z0-9_]{20,}/g, name: 'GitHub fine-grained token' },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, name: 'приватный ключ PEM' },
];
for (const f of ['index.html', 'sw.js']) {
  const body = f === 'sw.js' ? sw : html;
  for (const s of SECRETS) {
    const hits = body.match(s.re) || [];
    ok(hits.length === 0, `секреты: в ${f} нет «${s.name}» (найдено: ${hits.length})`);
  }
}
// Ключ провайдера не должен уходить в URL — регрессия дефекта Gemini.
ok(!/generativelanguage\.googleapis\.com[^"'`]*[?&]key=/.test(html),
  'секреты: в бандле нет вызова Gemini с ключом в query string');

// ── 3. Release metadata подставлена ─────────────────────────────────
ok(!html.includes('__ARCH_BUILD__') && !html.includes('__ARCH_SHA__') && !html.includes('__ARCH_BUILT_AT__'),
  'release: в бандле не осталось незаменённых плейсхолдеров');
ok(!sw.includes('__BUILD__'), 'release: версия кэша подставлена в sw.js');
const swV = (sw.match(/const V = '([^']+)'/) || [])[1];
ok(!!swV && swV.startsWith('arch-') && swV.length > 6, `release: версия SW-кэша осмысленна (${swV})`);

// ── 4. Service worker: app shell полон ──────────────────────────────
// Каждый файл из SHELL обязан реально существовать в dist — иначе offline
// сломается частично и незаметно (addAll стоит под .catch()).
const shellMatch = sw.match(/const SHELL = \[([\s\S]*?)\];/);
ok(!!shellMatch, 'SW: список app shell найден');
const shell = shellMatch ? [...shellMatch[1].matchAll(/'([^']+)'/g)].map(m => m[1]) : [];
ok(shell.length > 0, `SW: app shell не пуст (${shell.length} записей)`);
const missing = [];
for (const rel of shell) {
  if (rel === './') continue;                       // навигационный корень
  const p = join(DIST, rel.replace(/^\.\//, ''));
  if (!(await exists(p))) missing.push(rel);
}
ok(missing.length === 0, `SW: все ассеты app shell присутствуют в dist (отсутствует: ${missing.length})`, missing.join(', '));

// ── 5. Deploy recovery присутствует в выпускаемом SW ────────────────
ok(/const LKG\s*=/.test(sw), 'SW: last-known-good кэш присутствует в выпускаемом артефакте');
ok(/arch:startup-ok/.test(sw), 'SW: health marker присутствует в выпускаемом артефакте');
ok(/arch:restore-lkg/.test(sw), 'SW: путь явного восстановления присутствует в выпускаемом артефакте');
// Поведение (seed LKG до уборки, выдача из LKG, отсутствие подмены сломанной
// сборкой) проверяется сценарной сюитой tests/wave5-sw-recovery.spec.mjs на
// mock CacheStorage. Здесь — только что логика реально попала в артефакт.
ok(/activateWithRecovery/.test(sw) && /self\.__archSw/.test(sw),
  'SW: логика восстановления попала в выпускаемый артефакт и доступна сценарному тесту');

// ── 6. SHA критических ассетов ──────────────────────────────────────
// Фиксируем и печатаем контрольные суммы того, что публикуется. Это делает
// deploy проверяемым: по логам CI видно, какой именно артефакт уехал.
const CRITICAL = ['index.html', 'sw.js', 'manifest.json', 'backup/backup-core.mjs', 'backup/backup-restore.mjs'];
const sums = {};
for (const f of CRITICAL) {
  const p = join(DIST, f);
  if (!(await exists(p))) { ok(false, `SHA: критический ассет отсутствует — ${f}`); continue; }
  const buf = await readFile(p);
  sums[f] = createHash('sha256').update(buf).digest('hex').slice(0, 16);
}
ok(Object.keys(sums).length === CRITICAL.length, `SHA: посчитаны суммы всех критических ассетов (${Object.keys(sums).length}/${CRITICAL.length})`);
console.log('\n  Контрольные суммы публикуемых ассетов (sha256, первые 16):');
for (const [f, h] of Object.entries(sums)) console.log(`    ${h}  ${f}`);

// ── 7. Backup-модули действительно скопированы ──────────────────────
const BACKUP = ['backup-core.mjs', 'backup-adapter.mjs', 'backup-restore.mjs', 'backup-ui.mjs', 'backup-boot.mjs'];
const missBackup = [];
for (const f of BACKUP) if (!(await exists(join(DIST, 'backup', f)))) missBackup.push(f);
ok(missBackup.length === 0, `артефакт: все backup-модули в dist (отсутствует: ${missBackup.length})`, missBackup.join(', '));

console.log(`\nWave 5 (artifact integrity): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
