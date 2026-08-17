// GOOGLE PICKER — MUTATION SANITY.
//
// Проверка текста в бандле («строка setDeveloperKey присутствует») ничего не
// доказывает: она зелена и тогда, когда вызов сделан с неправильным
// значением. Эти мутанты ломают ровно ФАКТИЧЕСКУЮ сборку Picker и обязаны
// уронить именно тот сценарий driveSyncHubPicker.spec.mjs, который её
// сторожит по записанной цепочке вызовов.

import { readFile, writeFile, rm } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';
import { makeRun, redLines, selfTestRetryPolicy } from './mutation-run.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(DIR, '..', 'dist');
const DIST = join(DIST_DIR, 'app.html');
const SPEC = join(DIR, 'driveSyncHubPicker.spec.mjs');

const src = await readFile(DIST, 'utf8');

const MUTANTS = [
  {
    // P0, найденный внешним аудитом: Picker строится без Browser API key.
    id: 'picker-developer-key-removed',
    what: 'из сборки Picker убран .setDeveloperKey(...)',
    find: '      .setDeveloperKey(dkey)\n',
    replace: '',
    expectFail: 'setDeveloperKey получил ИМЕННО настроенный Browser API key',
  },
  {
    // Ключ подан «не из того кармана»: в Picker уезжает Client ID.
    // Текстовая проверка бандла такое пропустила бы полностью.
    id: 'picker-wrong-key-source',
    what: 'Picker получает Client ID вместо Browser API key',
    find: '      .setDeveloperKey(dkey)',
    replace: '      .setDeveloperKey(cid)',
    expectFail: 'setDeveloperKey получил ИМЕННО настроенный Browser API key',
  },
  {
    // Третья подмена: в ключ Picker уезжает токен доступа владельца.
    id: 'picker-key-is-access-token',
    what: 'в setDeveloperKey уходит токен доступа',
    find: '      .setDeveloperKey(dkey)',
    replace: '      .setDeveloperKey(driveTokenPeek())',
    expectFail: 'три сущности не перепутаны: ключ Picker ≠ токен доступа и ≠ Client ID',
  },
  {
    // Снят fail-closed: Picker строится при пустом ключе.
    id: 'picker-opens-without-key',
    what: 'без ключа Picker всё равно строится',
    find: "  if (!dkey) {\n    const e = new Error('не указан Browser API key для Picker — заполни его в настройках');\n    e.noPickerKey = true; throw e;\n  }",
    replace: '  if (false) { throw new Error("x"); }',
    expectFail: 'Picker НЕ строился: fail closed ДО сборки',
  },
  {
    // Источник снова объявляется готовым только по Client ID.
    id: 'ready-ignores-picker-key',
    what: 'готовность источника перестаёт учитывать ключ Picker',
    find: "  ...(driveDeveloperKeySet() ? [] : ['Browser API key для Picker']),",
    replace: '',
    expectFail: 'источник не считается готовым, и названо ровно недостающее',
  },
  {
    // Проверка ключа подменена проверкой Client ID: тип перестаёт различаться.
    id: 'key-validator-reused-from-client-id',
    what: 'ключ Picker проверяется валидатором Client ID',
    find: '  const dk = driveDeveloperKeyNormalize(dkRaw);',
    replace: '  const dk = driveClientIdNormalize(dkRaw);',
    expectFail: 'Browser API key сохранён через ОБЫЧНЫЙ путь настроек (saveCfg)',
  },
  {
    // Ключ начинает утекать в разметку панели источника.
    id: 'picker-key-rendered-in-dom',
    what: 'ключ Picker попадает в разметку панели',
    find: '    <div class="si-text" style="font-size:.75rem;color:var(--t3)" id="drive-auth-${i}">Доступ к Google:',
    replace: '    <div class="si-text" data-k="${esc(String((CFG && CFG.driveDeveloperKey) || \'\'))}" style="font-size:.75rem;color:var(--t3)" id="drive-auth-${i}">Доступ к Google:',
    expectFail: 'Browser API key НЕ попал в разметку страницы',
  },
];

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

console.log('\n── PICKER mutation sanity: сломанная сборка Picker обязана уронить свой сценарий ──');

await selfTestRetryPolicy(ok);

for (const m of MUTANTS) {
  if (!src.includes(m.find)) {
    ok(false, `[${m.id}] якорь мутации найден в собранном бандле`,
      `не найдено:\n${m.find}\nProduction изменился — мутацию нужно обновить.`);
    continue;
  }
  const file = join(DIST_DIR, `_pick-mutant-${m.id}.html`);
  await writeFile(file, src.replace(m.find, m.replace));
  const { code, out } = await run(file);
  await rm(file, { force: true });
  const reds = redLines(out);
  const hit = reds.some(l => l.includes(m.expectFail));
  ok(code !== 0 && hit,
    `[${m.id}] ${m.what} → сценарий «${m.expectFail}» покраснел (${reds.length} провалов)`,
    code === 0 ? 'ПРОВЕРКА ЛОЖНОЗЕЛЁНАЯ: сборка Picker сломана, но сюита прошла.'
      : hit ? null
        : `Упало не на ожидаемом сценарии. Красные:\n${reds.slice(0, 6).join('\n') || '(нет)'}\nХвост вывода:\n${out.split('\n').slice(-12).join('\n')}`);
}

console.log(`\nPICKER mutation sanity: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
