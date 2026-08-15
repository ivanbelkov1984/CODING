// DRIVE SYNC HUB — MUTATION SANITY.
//
// Ломается РОВНО ОДНА защита в собранном бандле — обязан упасть именно тот
// сценарий driveSyncHub.spec.mjs, который её сторожит. Смысл: доказать, что
// сюита ловит возврат к небезопасному поведению, а не просто «зелёная».

import { readFile, writeFile, rm } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';
import { makeRun, redLines, selfTestRetryPolicy } from './mutation-run.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(DIR, '..', 'dist');
const DIST = join(DIST_DIR, 'app.html');
const SPEC = join(DIR, 'driveSyncHub.spec.mjs');

const src = await readFile(DIST, 'utf8');

const MUTANTS = [
  {
    // D-4: тихая эскалация до restricted-скоупа — ровно то, что запрещено.
    id: 'scope-escalated',
    what: 'scope тихо расширен до drive.readonly (restricted)',
    find: "const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';",
    replace: "const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';",
    expectFail: 'запрашивается non-sensitive per-file scope drive.file',
  },
  {
    // D-2: токен начинает переживать сессию — секрет уезжает в хранилище,
    // а с ним в резервную копию и на backend.
    id: 'token-persisted',
    what: 'токен начинает сохраняться в CFG (переживает сессию)',
    find: '  _driveTok = { token: t, expMs: Date.now() + ttl };',
    replace: '  _driveTok = { token: t, expMs: Date.now() + ttl };\n  try { CFG.driveToken = t; persist(); } catch (_) {}',
    expectFail: 'токена нет в DB и CFG',
  },
  {
    // D-2: токен утекает в запись подключения, то есть в синк и копию.
    id: 'token-in-connection',
    what: 'токен записывается в подключение (уезжает в синк и копию)',
    find: '      // Курсор — ТОЛЬКО оптимизация (см. аудит §5). Его потеря обязана\n      // приводить максимум к лишнему чтению, никогда — к пропуску работы.\n      cursor: null,',
    replace: '      cursor: null,\n      _tok: driveTokenPeek(),',
    expectFail: 'токена нет в записи подключения',
  },
  {
    // D-5: исчезновение файла начинает удалять canonical — прямой запрет.
    id: 'missing-file-deletes-canonical',
    what: 'пропавший объект начинает удалять импортированные записи',
    find: "    if (!meta || meta.trashed) { missing.push(f.name); continue; }",
    replace: "    if (!meta || meta.trashed) { missing.push(f.name); (DB.insights || []).splice(0, DB.insights.length); persist(); continue; }",
    // Эта строка — путь «корзина / пустые метаданные»; его сторожит именно
    // сценарий про корзину (файл, удалённый в Drive, метаданные ОТДАЁТ).
    expectFail: 'файл в корзине НЕ удаляет импортированные записи',
  },
  {
    // Второй путь исчезновения: 404/403 приходят ИСКЛЮЧЕНИЕМ, а не метаданными.
    id: 'notfound-deletes-canonical',
    what: 'недоступный объект (404/403) начинает удалять импортированные записи',
    find: "      if (e && (e.notFound || e.forbidden)) { missing.push(f.name); continue; }\n      if (e && e.needAuth) return { ok: false, errors: ['авторизация Google истекла — подключись заново'], needAuth: true };\n      return { ok: false, errors: [`«${f.name}»: ${String((e && e.message) || e).slice(0, 120)}`] };\n    }\n    if (!meta || meta.trashed)",
    replace: "      if (e && (e.notFound || e.forbidden)) { missing.push(f.name); (DB.insights || []).splice(0, DB.insights.length); persist(); continue; }\n      if (e && e.needAuth) return { ok: false, errors: ['авторизация Google истекла — подключись заново'], needAuth: true };\n      return { ok: false, errors: [`«${f.name}»: ${String((e && e.message) || e).slice(0, 120)}`] };\n    }\n    if (!meta || meta.trashed)",
    expectFail: 'исчезновение источника НИКОГДА не удаляет canonical записи',
  },
  {
    // D-1: появляется прямой путь Drive → DB мимо моста.
    id: 'direct-write-bypass',
    what: 'чтение начинает писать в canonical мимо моста',
    find: '    parsed.packages.forEach(p => packages.push(p));',
    replace: `    parsed.packages.forEach(p => {
      packages.push(p);
      (p.entities || []).forEach(e => {
        if (e && e.type === 'insight') { (DB.insights = DB.insights || []).push({ id: 'drv-' + Math.random(), title: (e.data || {}).title || '', body: (e.data || {}).body || '', sv: SCHEMA_VERSION }); }
      });
      persist();
    });`,
    expectFail: 'чтение и предпросмотр НЕ меняют canonical (прямого пути Drive → DB нет)',
  },
  {
    // D-6: произвольный документ начинает «как-нибудь» приниматься.
    id: 'arbitrary-document-accepted',
    what: 'произвольный текст перестаёт отклоняться',
    find: "    const parsed = extBridgeParseFeed(text);\n    if (!parsed.ok) return { ok: false, errors: [`«${f.name}»: ${parsed.errors[0]}`] };",
    replace: "    const parsed = extBridgeParseFeed(text);\n    if (!parsed.ok) { continue; }",
    expectFail: 'произвольный документ отклонён — разбирается только детерминированная подача',
  },
  {
    // Курсор перестаёт быть только оптимизацией: он двигается до успешного
    // применения, и неудачный импорт «съедает» изменение файла навсегда.
    id: 'cursor-moves-before-commit',
    what: 'курсор двигается сразу при чтении, а не после успешного применения',
    find: '  _drivePending = { connId, cursors };\n  return { ok: true, errors: [], feedText, packages: packages.length, read, skipped, missing };',
    replace: `  _drivePending = { connId, cursors };
  extConnUpdate(connId, c => { c.driveFeeds = driveFeedsOf(c).map(f => { const cu = cursors.get(String(f.fileId)); return cu ? { ...f, cursor: cu } : f; }); });
  return { ok: true, errors: [], feedText, packages: packages.length, read, skipped, missing };`,
    expectFail: 'курсор не сдвинулся после неудачного применения',
  },
  {
    // Истёкшая авторизация перестаёт быть fail-closed.
    id: 'expired-auth-swallowed',
    what: 'истёкшая авторизация проглатывается вместо честного отказа',
    find: "      if (e && e.needAuth) return { ok: false, errors: ['авторизация Google истекла — подключись заново'], needAuth: true };\n      return { ok: false, errors: [`«${f.name}»: ${String((e && e.message) || e).slice(0, 120)}`] };\n    }\n    if (!meta || meta.trashed)",
    replace: "      if (e && e.needAuth) { missing.push(f.name); continue; }\n      return { ok: false, errors: [`«${f.name}»: ${String((e && e.message) || e).slice(0, 120)}`] };\n    }\n    if (!meta || meta.trashed)",
    expectFail: 'истёкшая авторизация → отказ с просьбой переподключиться (fail closed)',
  },
  {
    // Allowlist перестаёт быть ограниченным и начинает писать частично.
    id: 'allowlist-partial-write',
    what: 'превышение лимита allowlist сохраняет частичный результат',
    find: "    if (cur.length >= DRIVE_MAX_FEEDS) return { ok: false, errors: [`в одном источнике не больше ${DRIVE_MAX_FEEDS} подач`] };",
    replace: "    if (cur.length >= DRIVE_MAX_FEEDS) { extConnUpdate(connId, c => { c.driveFeeds = cur; }); return { ok: false, errors: ['лимит'] }; }",
    expectFail: 'превышение лимита (25) отклоняется ЦЕЛИКОМ',
  },
  {
    // Service worker снова кэширует ответы Google — приватное содержимое
    // подач переживало бы сессию вопреки решению D-2.
    id: 'sw-caches-google',
    what: 'service worker снова кэширует ответы Google',
    find: "  if (/(^|\\.)googleapis\\.com$|(^|\\.)google\\.com$|(^|\\.)gstatic\\.com$/.test(url.host)) return;",
    replace: '  if (false) return;',
    expectFail: 'service worker исключает googleapis/google-хосты из кэша',
    swFile: true,
  },
];

// Политика повтора — общая и доказанная (см. mutation-run.mjs). Ключевое:
// прогон с code 0 и нулём красных строк — это ВЫЖИВШИЙ мутант, а не сорванный
// прогон, и повтора он не получает: иначе флейковый второй прогон зачёл бы
// снятую защиту как пойманную.
const runOnce = (bundle) => new Promise(res => {
  const p = spawn(process.execPath, [SPEC], {
    cwd: join(DIR, '..'),
    env: { ...process.env, DRIVE_BUNDLE: bundle },
  });
  let out = '';
  p.stdout.on('data', d => { out += d; });
  p.stderr.on('data', d => { out += d; });
  p.on('close', code => res({ code, out }));
});
const run = makeRun(runOnce);

let pass = 0, fail = 0;
const ok = (cond, msg, detail) => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); if (detail) console.log('      ' + String(detail).split('\n').join('\n      ')); }
};

console.log('\n── DRIVE SYNC HUB mutation sanity: каждая снятая защита обязана уронить свой сценарий ──');

// Сначала доказываем сам критерий убийства: без этого «11 из 11» ничего не
// стоит, потому что повтор мог бы превращать выжившего мутанта в убитого.
await selfTestRetryPolicy(ok);

const SW = join(DIR, '..', 'sw.js');
const swSrc = await readFile(SW, 'utf8');

for (const m of MUTANTS) {
  // Правило кэширования живёт в sw.js, а не в бандле приложения: мутируем
  // сам файл service worker и возвращаем его на место после прогона.
  if (m.swFile) {
    if (!swSrc.includes(m.find)) {
      ok(false, `[${m.id}] якорь мутации найден в sw.js`, `не найдено:\n${m.find}`);
      continue;
    }
    await writeFile(SW, swSrc.replace(m.find, m.replace));
    const { code, out } = await run(DIST);
    await writeFile(SW, swSrc);            // возврат исходника в любом случае
    const reds = redLines(out);
    const hit = reds.some(l => l.includes(m.expectFail));
    ok(code !== 0 && hit, `[${m.id}] ${m.what} → сценарий «${m.expectFail}» покраснел (${reds.length} провалов)`,
      code === 0 ? 'ПРОВЕРКА ЛОЖНОЗЕЛЁНАЯ: правило снято, но сюита прошла.'
        : hit ? null : `Упало не на ожидаемом сценарии:\n${reds.slice(0, 4).join('\n')}`);
    continue;
  }
  if (!src.includes(m.find)) {
    ok(false, `[${m.id}] якорь мутации найден в собранном бандле`,
      `не найдено:\n${m.find}\nProduction изменился — мутацию нужно обновить.`);
    continue;
  }
  const file = join(DIST_DIR, `_drv-mutant-${m.id}.html`);
  await writeFile(file, src.replace(m.find, m.replace));
  const { code, out } = await run(file);
  await rm(file, { force: true });
  const reds = redLines(out);
  const hitExpected = reds.some(l => l.includes(m.expectFail));
  ok(code !== 0 && hitExpected,
    `[${m.id}] ${m.what} → сценарий «${m.expectFail}» покраснел (${reds.length} провалов)`,
    code === 0 ? 'ПРОВЕРКА ЛОЖНОЗЕЛЁНАЯ: защита снята, но вся сюита прошла.'
      : hitExpected ? null
        : `Сюита упала, но НЕ на ожидаемом сценарии. Красные:\n${reds.slice(0, 6).join('\n') || '(нет)'}\nХвост вывода:\n${out.split('\n').slice(-12).join('\n')}`);
}

console.log(`\nDRIVE SYNC HUB mutation sanity: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
