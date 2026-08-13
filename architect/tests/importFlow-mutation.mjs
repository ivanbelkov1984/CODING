// ИМПОРТ ДАННЫХ — MUTATION SANITY для экрана из трёх шагов.
//
// Ломается РОВНО ОДНА защита в собранном бандле — обязан упасть именно тот
// сценарий importFlow.spec.mjs, который её сторожит. Смысл: доказать, что
// сюита ловит возврат к прежнему поведению, а не просто «зелёная».

import { readFile, writeFile, rm } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

const DIR = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(DIR, '..', 'dist');
const DIST = join(DIST_DIR, 'app.html');
const SPEC = join(DIR, 'importFlow.spec.mjs');

const src = await readFile(DIST, 'utf8');

const MUTANTS = [
  {
    // Тот самый дефект первого запуска: результат разбора снова уезжает
    // в свёрнутый блок и человек не видит ответа на своё действие.
    id: 'result-hidden-in-details',
    what: 'зона результата снова прячется в свёрнутый блок',
    find: '      <div id="ext-out" aria-live="polite"></div>\n      <div id="ext-actions"></div>',
    replace: '      <details><summary>Разовая проверка пакета без источника (для продвинутых)</summary>\n      <div id="ext-out" aria-live="polite"></div>\n      <div id="ext-actions"></div></details>',
    expectFail: 'кнопка применения видна пользователю',
  },
  {
    // Возврат к «сначала настрой источник»: главная кнопка исчезает,
    // пока источник не создан и не выбран.
    id: 'primary-requires-source',
    what: 'главная кнопка снова требует предварительно выбранного источника',
    find: '  if ((!typedRaw && _extBatchFeed) || (_extConnActive && extConnFind(_extConnActive))) return extConnUiRefresh();\n  return extPreview();',
    replace: "  if ((!typedRaw && _extBatchFeed) || (_extConnActive && extConnFind(_extConnActive))) return extConnUiRefresh();\n  toast('Сначала выбери источник', 'warn');\n  return;",
    expectFail: 'вставка текста + главная кнопка дают предпросмотр без всякого источника',
  },
  {
    // Решение по конфликту снова прячется: блок не раскрывается сам,
    // и выбор «оставить мою / заменить» становится недостижим взглядом.
    id: 'decision-collapsed',
    what: 'список записей не раскрывается, когда требуется явное решение',
    find: '<details class="psy-det"${needsDecision ? \' open\' : \'\'}>',
    replace: '<details class="psy-det">',
    expectFail: 'варианты решения реально видимы пользователю',
  },
  {
    // Предпросмотр моста снова рисуется внутри списка источников,
    // то есть внутри свёрнутого блока «Источники и история импорта».
    id: 'bridge-output-back-inside-sources',
    what: 'вывод моста возвращается внутрь свёрнутого блока источников',
    find: '      <div id="ext-conn-out" aria-live="polite"></div>\n      <div id="ext-out" aria-live="polite"></div>',
    replace: '      <div id="ext-out" aria-live="polite"></div>',
    // единственный оставшийся контейнер вывода моста рисуется списком
    // источников — то есть внутри свёрнутого <details>.
    extra: {
      find: '    <button type="button" class="btn btn-s" onclick="extConnUiCreate()">Добавить источник</button>`;',
      replace: '    <button type="button" class="btn btn-s" onclick="extConnUiCreate()">Добавить источник</button>\n    <div id="ext-conn-out" aria-live="polite"></div>`;',
    },
    expectFail: 'вывод предпросмотра моста живёт СНАРУЖИ свёрнутого блока',
  },
  {
    // Язык сводки откатывается на внутренние имена коллекций.
    id: 'summary-raw-collection-names',
    what: 'сводка снова называет внутренние имена коллекций',
    find: 'const extCollRu = c => EXT_COLL_RU[c] || c;',
    replace: 'const extCollRu = c => c;',
    expectFail: 'сводка названа разделами приложения',
  },
  {
    // Индикатор шага перестаёт двигаться — человек не понимает, где он.
    id: 'step-indicator-frozen',
    what: 'индикатор шага перестаёт отражать реальное состояние',
    find: 'function extSetStep(n) {\n  const box = $(\'ext-steps\'); if (!box) return;',
    replace: 'function extSetStep(n) {\n  const box = $(\'ext-steps\'); if (box) return;',
    expectFail: 'индикатор перешёл на шаг 2',
  },
  {
    // «Импортировать ещё файл» начинает чистить импортированные записи.
    id: 'reset-wipes-imported',
    what: '«импортировать ещё файл» стирает уже импортированные записи',
    find: "  ['ext-out', 'ext-actions', 'ext-conn-out'].forEach(id => { const el = $(id); if (el) el.innerHTML = ''; });\n  extRenderTargetNote();\n  extSetStep(1);",
    replace: "  ['ext-out', 'ext-actions', 'ext-conn-out'].forEach(id => { const el = $(id); if (el) el.innerHTML = ''; });\n  DB.dreams = []; DB.insights = [];\n  extRenderTargetNote();\n  extSetStep(1);",
    expectFail: 'уже импортированные записи не тронуты',
  },
  {
    // Обещание безопасности снимается из точки решения.
    id: 'safety-note-removed',
    what: 'обещание «ничего не удаляется» исчезает из точки принятия решения',
    find: '<div class="ext-safe">Ничего не удаляется и не перезаписывается.',
    replace: '<div class="ext-safe" hidden>Ничего не удаляется и не перезаписывается.',
    expectFail: 'обещание безопасности стоит рядом с решением',
  },
];

const run = (bundle) => new Promise(res => {
  const p = spawn(process.execPath, [SPEC], {
    cwd: join(DIR, '..'),
    env: { ...process.env, IMPORTFLOW_BUNDLE: bundle },
  });
  let out = '';
  p.stdout.on('data', d => { out += d; });
  p.stderr.on('data', d => { out += d; });
  p.on('close', code => res({ code, out }));
});

let pass = 0, fail = 0;
const ok = (cond, msg, detail) => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); if (detail) console.log('      ' + String(detail).split('\n').join('\n      ')); }
};

console.log('\n── ИМПОРТ mutation sanity: каждая снятая защита обязана уронить свой сценарий ──');

for (const m of MUTANTS) {
  if (!src.includes(m.find)) {
    ok(false, `[${m.id}] якорь мутации найден в собранном бандле`,
      `не найдено:\n${m.find}\nProduction изменился — мутацию нужно обновить.`);
    continue;
  }
  const file = join(DIST_DIR, `_import-mutant-${m.id}.html`);
  let mutated = src.replace(m.find, m.replace);
  // Некоторым мутациям нужны две согласованные правки: например «убрать
  // внешний контейнер» + «вернуть его внутрь свёрнутого блока».
  if (m.extra) {
    if (!mutated.includes(m.extra.find)) {
      ok(false, `[${m.id}] второй якорь мутации найден в бандле`, `не найдено:\n${m.extra.find}`);
      await rm(file, { force: true });
      continue;
    }
    mutated = mutated.replace(m.extra.find, m.extra.replace);
  }
  await writeFile(file, mutated);
  const { code, out } = await run(file);
  await rm(file, { force: true });
  const reds = out.split('\n').filter(l => l.trimStart().startsWith('✗')).map(l => l.trim());
  const hitExpected = reds.some(l => l.includes(m.expectFail));
  ok(code !== 0 && hitExpected,
    `[${m.id}] ${m.what} → сценарий «${m.expectFail}» покраснел (${reds.length} провалов)`,
    code === 0 ? 'ПРОВЕРКА ЛОЖНОЗЕЛЁНАЯ: защита снята, но вся сюита прошла.'
      : hitExpected ? null
        : `Сюита упала, но НЕ на ожидаемом сценарии. Красные:\n${reds.slice(0, 6).join('\n') || '(нет)'}`);
}

console.log(`\nИМПОРТ mutation sanity: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
