// P1-01 — MUTATION SANITY.
//
// «34 из 34 зелёные» сами по себе ничего не значат: сюита может быть зелена и
// на снятой защите. Здесь ломается РОВНО ОДНА гарантия видимого отказа, и
// обязан покраснеть именно тот сценарий persistFailure.spec.mjs, который её
// сторожит.

import { readFile, writeFile, rm } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';
import { makeRun, redLines, selfTestRetryPolicy } from './mutation-run.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(DIR, '..', 'dist');
const DIST = join(DIST_DIR, 'app.html');
const SPEC = join(DIR, 'persistFailure.spec.mjs');

const src = await readFile(DIST, 'utf8');

const MUTANTS = [
  {
    // ГЛАВНЫЙ: отказ записи снова становится молчаливым — ровно тот дефект,
    // ради которого всё делалось.
    id: 'persist-warning-removed',
    what: 'не-квотный отказ записи снова ничего не говорит человеку',
    find: `  _lastPersistError = { quota: false, name: (r.error && r.error.name) || 'Error', at: Date.now() };
  notifyPersistFailed();
  return false;
}`,
    replace: `  _lastPersistError = { quota: false, name: (r.error && r.error.name) || 'Error', at: Date.now() };
  return false;
}`,
    expectFail: 'человек предупреждён явным текстом',
  },
  {
    // Предупреждение остаётся только у квоты — возвращается исходная
    // асимметрия: переполнение видно, всё остальное нет.
    id: 'persist-warning-quota-only',
    what: 'предупреждение срабатывает только на квоте',
    find: '  if (_persistFailEpisode) return;\n  _persistFailEpisode = true;',
    replace: '  if (true) return;\n  _persistFailEpisode = true;',
    expectFail: 'человек предупреждён явным текстом',
  },
  {
    // Уведомитель начинает писать в хранилище — на закрытом хранилище это
    // рекурсия и повторный отказ внутри обработки отказа.
    id: 'persist-warning-recursive-storage',
    what: 'уведомитель сам пишет в хранилище',
    find: `  markPersistFailedNow();          // до подавления: молчит сообщение, не факт
  if (_persistFailEpisode) return;
  _persistFailEpisode = true;`,
    replace: `  markPersistFailedNow();
  if (_persistFailEpisode) return;
  _persistFailEpisode = true;
  try { localStorage.setItem('arch5_persist_warned', String(Date.now())); } catch (_) {}`,
    expectFail: 'уведомитель не порождает новых записей в хранилище',
  },
  {
    // Эпизод никогда не закрывается: после восстановления следующая настоящая
    // ошибка промолчит, и человек её не увидит.
    id: 'persist-warning-never-rearms-after-recovery',
    what: 'успешная запись перестаёт закрывать эпизод',
    find: 'function persistEpisodeRecovered() { _persistFailEpisode = false; }',
    replace: 'function persistEpisodeRecovered() { }',
    expectFail: 'ошибка ПОСЛЕ восстановления предупредила снова',
  },
  {
    // Подавление снято: серия отказов заваливает человека сообщениями.
    id: 'persist-warning-spam-suppression-removed',
    what: 'подавление шквала снято',
    find: '  if (_persistFailEpisode) return;\n  _persistFailEpisode = true;\n  if (typeof toast === ',
    replace: '  _persistFailEpisode = true;\n  if (typeof toast === ',
    expectFail: 'показано ровно одно предупреждение на весь эпизод',
  },
  {
    // P1-02, ГЛАВНЫЙ: гейт снят — возвращается ложный зелёный успех поверх
    // записи, которой в хранилище нет.
    id: 'false-success-gate-removed',
    what: 'зелёный успех снова показывается поверх неудавшейся записи',
    find: "  if (tp === 'ok' && _persistFailedNow) return;",
    replace: '',
    expectFail: 'отказ: зелёного «сохранено» НЕТ — ложный успех устранён',
  },
  {
    // Гейт никогда не отпускает: после успешной записи настоящий успех
    // перестаёт показываться — правда ценой немоты, это тоже дефект.
    id: 'false-success-gate-never-recovers',
    what: 'гейт не снимается после успешной записи',
    find: '  _persistFailedNow = false;       // новая операция — прежний отказ не в счёт',
    replace: '',
    expectFail: 'один такт: успех ВТОРОЙ записи показан — прежний отказ его не глушит',
  },
  {
    // Одноразовый сброс по границе макрозадачи снят: независимый успех
    // спустя время оказывается заблокирован навсегда.
    id: 'false-success-gate-reset-removed',
    what: 'сброс флага по границе макрозадачи снят',
    find: '  setTimeout(() => { _persistFailedNow = false; _persistFailedResetPending = false; }, 0);',
    replace: '',
    expectFail: 'независимый успех после отказа НЕ заблокирован навсегда',
  },
]

const runOnce = (bundle) => new Promise(res => {
  const p = spawn(process.execPath, [SPEC], {
    cwd: join(DIR, '..'),
    env: { ...process.env, PERSIST_BUNDLE: bundle },
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

console.log('\n── P1-01 mutation sanity: снятая гарантия обязана уронить свой сценарий ──');

await selfTestRetryPolicy(ok);

for (const m of MUTANTS) {
  if (!src.includes(m.find)) {
    ok(false, `[${m.id}] якорь мутации найден в собранном бандле`,
      `не найдено:\n${m.find}\nProduction изменился — мутацию нужно обновить.`);
    continue;
  }
  const file = join(DIST_DIR, `_persist-mutant-${m.id}.html`);
  await writeFile(file, src.replace(m.find, m.replace));
  const { code, out } = await run(file);
  await rm(file, { force: true });
  const reds = redLines(out);
  const hit = reds.some(l => l.includes(m.expectFail));
  ok(code !== 0 && hit,
    `[${m.id}] ${m.what} → сценарий «${m.expectFail}» покраснел (${reds.length} провалов)`,
    code === 0 ? 'ПРОВЕРКА ЛОЖНОЗЕЛЁНАЯ: гарантия снята, но сюита прошла.'
      : hit ? null
        : `Упало не на ожидаемом сценарии. Красные:\n${reds.slice(0, 6).join('\n') || '(нет)'}\nХвост:\n${out.split('\n').slice(-12).join('\n')}`);
}

console.log(`\nP1-01 mutation sanity: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
