// ИНСПЕКТОР ЗАПИСИ — MUTATION SANITY.
//
// Ломается РОВНО ОДНА защита в собранном бандле — обязан упасть именно тот
// сценарий recordInspector.spec.mjs, который её сторожит. Смысл: доказать,
// что сюита ловит возврат к небезопасному поведению (и к найденному
// продакшн-дефекту), а не просто «зелёная».

import { readFile, writeFile, rm } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

const DIR = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(DIR, '..', 'dist');
const DIST = join(DIST_DIR, 'app.html');
const SPEC = join(DIR, 'recordInspector.spec.mjs');

const src = await readFile(DIST, 'utf8');

const MUTANTS = [
  {
    // ТОТ САМЫЙ продакшн-дефект MAIN 1a859f47: строковый id обрывает
    // inline-обработчик, и строка списка перестаёт открываться.
    id: 'string-id-breaks-handler',
    what: 'идентификатор снова вставляется в обработчик без экранирования кавычек',
    find: `const recArg = v => JSON.stringify(v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');`,
    replace: 'const recArg = v => JSON.stringify(v);',
    expectFail: 'строковый id не обрывает атрибут обработчика',
  },
  {
    // Правка снова трогает снимок версии источника — детектор локальных
    // правок слепнет, более новая ревизия молча перезаписывает владельца.
    id: 'edit-rewrites-import-hash',
    what: 'пользовательская правка снова пересчитывает ext.importHash',
    find: '  touch(rec);\n  return { ok: true };\n}\nfunction recSaveEdit() {',
    replace: `  touch(rec);
  if (rec.ext && Array.isArray(rec.ext.importedFields)) {
    try { rec.ext.importHash = extFieldsHash(rec, rec.ext.importedFields); } catch (_) { }
  }
  return { ok: true };
}
function recSaveEdit() {`,
    expectFail: 'блок ext целиком byte-identical после пользовательской правки',
  },
  {
    // Матрица снимается: любая коллекция становится редактируемой на месте.
    id: 'class-b-becomes-editable',
    what: 'класс B (доказательные записи) снова правится на месте',
    find: "  if (em.cls !== 'A') return { ok: false, error: 'правка этого типа записи недоступна' };",
    replace: "  if (em.cls === 'X') return { ok: false, error: 'правка этого типа записи недоступна' };",
    expectFail: 'прямой вызов правки для класса C отклонён, запись не изменена',
  },
  {
    // Причина запрета исчезает: человек видит «нельзя» без объяснения и пути.
    id: 'class-b-reason-hidden',
    what: 'причина запрета правки перестаёт показываться',
    find: "  const noteB = em.cls === 'B' ? `<div class=\"ext-need\">Правка на месте недоступна.<br>${esc(em.why)}</div>` : '';",
    replace: "  const noteB = '';",
    expectFail: 'класс B: правка на месте закрыта и объяснена на каждом типе',
  },
  {
    // Кнопка правки возвращается на системные записи.
    id: 'class-c-gets-edit-button',
    what: 'системная запись снова получает кнопку правки и удаления',
    find: "    const canEdit = em.cls === 'A' && (em.fields || []).length;",
    replace: '    const canEdit = true;',
    expectFail: 'класс C: нет ни правки, ни удаления, причина показана человеку',
  },
  {
    // Инспектор снова показывает только сводку — полного текста не видно.
    id: 'body-truncated-to-summary',
    what: 'экран записи снова показывает лишь короткую сводку',
    find: '    return `<div class="psy-fld"><div class="f-lbl">${esc(f.l)}</div><div class="si-text" style="white-space:pre-wrap;line-height:1.55">${esc(t)}</div></div>`;',
    replace: '    return `<div class="psy-fld"><div class="f-lbl">${esc(f.l)}</div><div class="si-text">${esc(t.slice(0, 40))}</div></div>`;',
    expectFail: 'полный текст импортированных записей всех девяти типов виден в инспекторе',
  },
  {
    // Форма правки перестаёт ограничивать себя разрешёнными полями.
    id: 'edit-writes-any-field',
    what: 'правка снова пишет любое переданное поле, а не только разрешённые',
    find: '    if (!allowed.includes(k)) return;',
    replace: '    if (false) return;',
    expectFail: 'поля вне списка разрешённых НЕ записаны',
  },
  {
    // Сбой сохранения перестаёт откатывать правку — запись расходится с диском.
    id: 'failed-persist-not-rolled-back',
    what: 'сбой сохранения перестаёт откатывать запись',
    find: "  if (!persist()) {\n    Object.keys(rec).forEach(k => { delete rec[k]; });\n    Object.assign(rec, snap);",
    replace: "  if (!persist()) {\n    Object.keys(rec).forEach(k => { if (false) delete rec[k]; });",
    expectFail: 'сбой сохранения откатывает правку — запись остаётся прежней',
  },
  {
    // Значения полей перестают экранироваться при чтении.
    id: 'detail-not-escaped',
    what: 'значения полей вставляются в разметку без экранирования',
    find: 'style="white-space:pre-wrap;line-height:1.55">${esc(t)}</div>',
    replace: 'style="white-space:pre-wrap;line-height:1.55">${t}</div>',
    expectFail: 'значения полей экранируются при чтении',
  },
  {
    // Провенанс исчезает: импортированная запись выглядит как своя.
    id: 'provenance-hidden',
    what: 'происхождение импортированной записи перестаёт показываться',
    find: '  const prov = ext ? `<div class="psy-fld"><div class="f-lbl">Происхождение</div>',
    replace: '  const prov = false ? `<div class="psy-fld"><div class="f-lbl">Происхождение</div>',
    expectFail: 'у импортированной записи видно происхождение и подпись источника',
  },
  {
    // Строка списка снова перестаёт быть кнопкой открытия — остаётся только
    // разрушительное действие, как было до инспектора.
    id: 'row-not-openable',
    what: 'строка «Моих записей» снова только текст рядом с кнопкой удаления',
    find: '<button type="button" class="si-body" style="text-align:left;background:none;border:0;padding:.55rem 0;min-height:44px;width:100%;color:inherit;font:inherit;cursor:pointer" onclick="recOpen(',
    replace: '<div class="si-body" data-x="${(() => \'\')(recOpen)}" data-y="',
    expectFail: 'строка «Моих записей» — настоящая кнопка',
  },
];

const run = (bundle) => new Promise(res => {
  const p = spawn(process.execPath, [SPEC], {
    cwd: join(DIR, '..'),
    env: { ...process.env, RECINSPECTOR_BUNDLE: bundle },
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

console.log('\n── ИНСПЕКТОР mutation sanity: каждая снятая защита обязана уронить свой сценарий ──');

for (const m of MUTANTS) {
  if (!src.includes(m.find)) {
    ok(false, `[${m.id}] якорь мутации найден в собранном бандле`,
      `не найдено:\n${m.find}\nProduction изменился — мутацию нужно обновить.`);
    continue;
  }
  const file = join(DIST_DIR, `_rec-mutant-${m.id}.html`);
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

console.log(`\nИНСПЕКТОР mutation sanity: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
