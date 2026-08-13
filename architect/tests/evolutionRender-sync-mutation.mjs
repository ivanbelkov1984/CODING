// ЭВОЛЮЦИЯ · СИНК — MUTATION SANITY.
//
// Ломается РОВНО ОДНА защита в собранном бандле — обязан упасть именно тот
// сценарий evolutionRender-sync.spec.mjs, который её сторожит. Смысл:
// доказать, что регрессионная сюита действительно ловит возврат
// продакшн-бага, а не просто «зелёная».

import { readFile, writeFile, rm } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

const DIR = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(DIR, '..', 'dist');
const DIST = join(DIST_DIR, 'app.html');
const SPEC = join(DIR, 'evolutionRender-sync.spec.mjs');

const src = await readFile(DIST, 'utf8');

const MUTANTS = [
  {
    // ТОТ САМЫЙ продакшн-баг: прямой небезопасный доступ в «Эволюции».
    id: 'evo-list-unsafe-lookup',
    what: 'список «Эволюции» снова берёт EVO_LV[Math.min(lv,3)] напрямую',
    find: '    const lv = evoView(e);',
    replace: '    const lv = EVO_LV[Math.min(e.lv,3)];',
    expectFail: 'отрисовка «Эволюции» не бросает исключение',
  },
  {
    // Тот же небезопасный доступ в /ретро.
    id: 'retro-unsafe-lookup',
    what: '/ретро снова берёт EVO_LV[Math.min(lv,3)] напрямую',
    find: "${DB.evolution.slice(0,3).map(e=>{const lv=evoView(e);",
    replace: "${DB.evolution.slice(0,3).map(e=>{const lv=EVO_LV[Math.min(e.lv,3)];",
    expectFail: '/ретро не бросает исключение',
  },
  {
    // Неизвестный уровень выдаётся за «Наблюдение» — смысл, которого в
    // источнике нет.
    id: 'unknown-level-claims-observation',
    what: 'уровень вне шкалы молча объявляется «Наблюдением»',
    find: '  const i = evoLevelIndex(rec && rec.lv);\n  if (i != null) return EVO_LV[i];',
    replace: '  const i = evoLevelIndex(rec && rec.lv);\n  if (i == null) return EVO_LV[0];\n  if (i != null) return EVO_LV[i];',
    expectFail: 'формулировка источника показана человеку',
  },
  {
    // Адаптер снова теряет числовой уровень (в т.ч. валидный 0).
    id: 'adapter-drops-numeric-level',
    what: 'адаптер снова превращает числовой уровень в строку «этап»',
    find: '    const lv = lvNum != null ? lvNum : (extStr(rawLv, 40) || \'этап\');',
    replace: "    const lv = extStr(d.lv || d.level, 40) || 'этап';",
    expectFail: 'числовой уровень 0 сохранён числом',
  },
  {
    // Ошибка отрисовки снова классифицируется как провал синхронизации.
    id: 'render-error-fails-sync',
    what: 'сбой отрисовки снова считается провалом синхронизации',
    find: '      safeRenderAfterSync();\n      setSyncBadge(\'ok\');',
    replace: "      renderAfterSync();\n      setSyncBadge('ok');",
    expectFail: 'синхронизация отчитывается УСПЕХОМ, а не провалом',
  },
  {
    // Ошибка отрисовки проглатывается молча — человек не узнаёт о проблеме.
    id: 'render-error-swallowed',
    what: 'ошибка отрисовки проглатывается без журнала и сообщения',
    find: "    log('error', 'ошибка отрисовки после синхронизации', (err && err.message) || String(err));\n    toast('Данные синхронизированы, но обновить экран не удалось — открой раздел заново', 'warn');",
    replace: '    return false;',
    expectFail: 'ошибка отрисовки записана в журнал отдельно (не проглочена)',
  },
  {
    // Формулировка источника перестаёт экранироваться.
    id: 'level-label-not-escaped',
    what: 'формулировка уровня вставляется в разметку без экранирования',
    find: '<div class="elv ${lv.c}">${esc(lv.lb)}</div><div class="etx">',
    replace: '<div class="elv ${lv.c}">${lv.lb}</div><div class="etx">',
    expectFail: 'формулировка уровня экранируется',
  },
];

const run = (bundle) => new Promise(res => {
  const p = spawn(process.execPath, [SPEC], {
    cwd: join(DIR, '..'),
    env: { ...process.env, EVOSYNC_BUNDLE: bundle },
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

console.log('\n── ЭВОЛЮЦИЯ/СИНК mutation sanity: каждая снятая защита обязана уронить свой сценарий ──');

for (const m of MUTANTS) {
  if (!src.includes(m.find)) {
    ok(false, `[${m.id}] якорь мутации найден в собранном бандле`,
      `не найдено:\n${m.find}\nProduction изменился — мутацию нужно обновить.`);
    continue;
  }
  const file = join(DIST_DIR, `_evo-mutant-${m.id}.html`);
  await writeFile(file, src.replace(m.find, m.replace));
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

console.log(`\nЭВОЛЮЦИЯ/СИНК mutation sanity: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
