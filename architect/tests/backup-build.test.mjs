// ─────────────────────────────────────────────────────────────────────────
//  backup-build.test.mjs — Slice 5 build / module-loading / service-worker
//  integration. Гоняет реальные сборки и проверяет, что backup-модули реально
//  попадают в build output, подключаются в HTML, кэшируются SW, не тянут Node,
//  и что все import-пути резолвятся. Синтетических пользовательских данных нет.
//  Запуск: node tests/backup-build.test.mjs  (из architect/)
// ─────────────────────────────────────────────────────────────────────────

import { execFileSync } from 'child_process';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..');                 // architect/
const dist = join(ROOT, 'dist');
const MODULES = ['backup-core.mjs', 'backup-adapter.mjs', 'backup-restore.mjs', 'backup-ui.mjs', 'backup-boot.mjs'];

let pass = 0, fail = 0; const out = [];
const ok = (c, n) => { if (c) { pass++; out.push('  ✓ ' + n); } else { fail++; out.push('  ✗ ' + n); } };
const read = p => readFileSync(p, 'utf8');

function main() {
  // ── обычный build ──
  execFileSync('node', ['build.mjs'], { cwd: ROOT, stdio: 'pipe' });
  ok(existsSync(join(dist, 'index.html')), 'build: dist/index.html создан');
  ok(existsSync(join(dist, 'sw.js')), 'build: dist/sw.js создан');
  for (const m of MODULES) ok(existsSync(join(dist, 'backup', m)), 'build: dist/backup/' + m + ' присутствует');

  // backup-файлы в dist байт-в-байт равны исходным (нет инъекции/секретов)
  for (const m of MODULES) ok(read(join(dist, 'backup', m)) === read(join(ROOT, 'backup', m)), 'build: dist/backup/' + m + ' идентичен исходному (без инъекции)');

  // HTML реально подключает boot-модуль
  const html = read(join(dist, 'index.html'));
  ok(html.includes("import('./backup/backup-boot.mjs')"), 'build: index.html делает import backup-boot');
  ok(/location\.protocol/.test(html), 'build: загрузка модуля под HTTP(S) (не file://)');

  // sw.js: версия проставлена, backup-модули в SHELL
  const sw = read(join(dist, 'sw.js'));
  ok(/arch-v[a-f0-9]{10}/.test(sw) && !sw.includes('__BUILD__'), 'build: sw.js версия проставлена (нет __BUILD__)');
  for (const m of MODULES) ok(sw.includes('./backup/' + m), 'sw: SHELL включает ' + m);

  // ── combined build ──
  execFileSync('node', ['build.mjs', '--combined', join(dist, 'app.html')], { cwd: ROOT, stdio: 'pipe' });
  ok(existsSync(join(dist, 'app.html')), 'combined: dist/app.html создан');
  for (const m of MODULES) ok(existsSync(join(dist, 'backup', m)), 'combined: backup/' + m + ' рядом с артефактом');
  const app = read(join(dist, 'app.html'));
  ok(app.includes("import('./backup/backup-boot.mjs')"), 'combined: app.html реально подключает backup (не отключён guard-ом)');
  ok(!/src="app\.js"/.test(app) && app.includes('function openEncBackup'), 'combined: app.js заинлайнен, точка входа backup внутри');

  // ── нет Node-only импортов в browser-модулях ──
  const NODE_IMPORT = /from\s+['"](node:|crypto|fs|path|url|child_process|os|http|https)['"]|require\s*\(/;
  for (const m of MODULES) ok(!NODE_IMPORT.test(read(join(ROOT, 'backup', m))), 'no-node: ' + m + ' без Node-импортов');

  // ── все относительные import-пути резолвятся внутри dist/backup ──
  for (const m of MODULES) {
    const src = read(join(dist, 'backup', m));
    const imps = [...src.matchAll(/from\s+['"](\.\/[A-Za-z0-9_-]+\.mjs)['"]/g)].map(x => x[1].slice(2));
    const allOk = imps.every(f => existsSync(join(dist, 'backup', f)));
    ok(allOk, 'imports: относительные пути ' + m + ' резолвятся (' + (imps.join(',') || 'нет') + ')');
  }

  // ── backend не тронут сборкой ──
  ok(!read(join(ROOT, 'build.mjs')).includes('backend'), 'backend: build.mjs не трогает backend');

  // ── нет очевидных секретов в build output ──
  const scan = [html, app, ...MODULES.map(m => read(join(dist, 'backup', m)))].join('\n');
  ok(!/-----BEGIN|PRIVATE KEY|sk-[A-Za-z0-9]{20}|PASSPHRASE_SECRET|SPACE_SECRET/.test(scan), 'secrets: в build output нет ключей/секретов');

  console.log(out.join('\n'));
  console.log('\nBackup build/SW integration (Slice 5): ' + pass + '/' + (pass + fail) + ' passed');
  if (fail > 0) process.exit(1);
}
try { main(); } catch (e) { console.error('FATAL', e && e.message); process.exit(1); }
