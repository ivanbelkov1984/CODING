// DRIVE SYNC HUB UI — MUTATION SANITY.
//
// Ровно та проверка, которой не хватало: если убрать или отвязать
// обработчик интерфейса, браузерный тест ОБЯЗАН упасть. Прошлая версия PR
// имела рабочий движок и ноль вызовов из UI — и все тесты были зелёными.
// Эти мутанты делают такое состояние невозможным незаметно.

import { readFile, writeFile, rm } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

const DIR = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(DIR, '..', 'dist');
const DIST = join(DIST_DIR, 'app.html');
const SPEC = join(DIR, 'driveSyncHubUi.spec.mjs');

const src = await readFile(DIST, 'utf8');

const MUTANTS = [
  {
    // Панель Drive исчезает из списка источников — ровно тот P0-разрыв,
    // с которым PR был открыт в первый раз.
    id: 'drive-panel-unmounted',
    what: 'панель Drive перестаёт отрисовываться в списке источников',
    find: '      ${driveIsDriveConn(c) ? drivePanelHtml(c, i) : \'\'}',
    replace: "      ${''}",
    // Снятие панели ломает самый первый Drive-сценарий экрана: исчезает и
    // блок настройки, и все кнопки. Сторожит его именно эта проверка.
    expectFail: 'без Client ID показан не тупик, а кнопка перехода в настройки',
  },
  {
    // Кнопка есть, но её обработчик отвязан — «кнопка-обманка».
    id: 'sync-handler-detached',
    what: 'кнопка «Синхронизировать» теряет обработчик',
    find: '      <button type="button" class="btn btn-p btn-sm" id="drive-sync-${i}" onclick="driveUiAction(${i},\'sync\')">Синхронизировать</button>',
    replace: '      <button type="button" class="btn btn-p btn-sm" id="drive-sync-${i}">Синхронизировать</button>',
    expectFail: 'кнопка «Синхронизировать» привела к СУЩЕСТВУЮЩЕМУ предпросмотру моста',
  },
  {
    // Выбор файлов больше ничего не добавляет в allowlist.
    id: 'pick-handler-noop',
    what: 'действие «Выбрать файлы» перестаёт добавлять подачи',
    find: "  if (action === 'connect' || action === 'pick') {",
    replace: "  if (action === 'pick') return;\n  if (action === 'connect' || action === 'pick') {",
    expectFail: 'выбранная подача появилась в списке с человеческим названием',
  },
  {
    // Client ID перестаёт сохраняться через настройки.
    id: 'client-id-not-saved',
    what: 'Client ID перестаёт сохраняться из настроек',
    find: '  if (dc.ok) CFG.driveClientId = dc.value;',
    replace: '  if (false) CFG.driveClientId = dc.value;',
    expectFail: 'корректный Client ID сохранён через обычный путь настроек',
  },
  {
    // Валидация поля снята: секрет Google молча попадает в настройки.
    id: 'client-id-validation-off',
    what: 'проверка Client ID снята — Client SECRET сохраняется молча',
    find: "  if (/^GOCSPX-/i.test(v)) return { ok: false, error: 'это Client SECRET, а не Client ID — секрет в приложение вставлять нельзя' };",
    replace: '  if (false) return { ok: false, error: 0 };',
    expectFail: 'человеку названа ТОЧНАЯ причина: это секрет, а не идентификатор',
  },
  {
    // Тупик вместо пути в настройки.
    id: 'no-setup-path',
    what: 'при отсутствии Client ID снова показывается тупиковое сообщение',
    find: '      <div class="psy-actions"><button type="button" class="btn btn-s btn-sm" id="drive-goto-cfg-${i}" onclick="driveOpenSettings()">Открыть настройки Google Drive</button></div></div>`;',
    replace: '      </div>`;',
    expectFail: 'без Client ID показан не тупик, а кнопка перехода в настройки',
  },
  {
    // 403 снова считается истёкшей авторизацией — то, что было до аудита §5.
    id: '403-treated-as-expired-auth',
    what: '403 снова гасит токен и выдаётся за истёкший вход',
    find: "    if (r.status === 403) {",
    replace: "    if (r.status === 403) {\n      driveTokenClear();\n      { const e = new Error('доступ закрыт'); e.needAuth = true; throw e; }",
    expectFail: '403 «нет прав на файл» → объект недоступен, вход НЕ объявляется истёкшим',
  },
  {
    // Квота снова маскируется под «файл недоступен» — источник ложно
    // помечался бы недоступным из-за временной ошибки сервиса.
    id: 'quota-masked-as-unavailable',
    what: 'ошибка квоты снова выдаётся за недоступность файла',
    find: "      if (e && (e.rateLimited || e.serviceError)) {\n        return { ok: false, errors: [`«${f.name}»: ${String((e && e.message) || e).slice(0, 160)}`], rateLimited: !!e.rateLimited, serviceError: !!e.serviceError };\n      }\n      // D-5: недоступность источника — НИКОГДА не удаление canonical.",
    replace: "      if (e && e.rateLimited) { missing.push(f.name); continue; }\n      // D-5: недоступность источника — НИКОГДА не удаление canonical.",
    expectFail: 'квота при чтении → отказ, но источник НЕ помечен недоступным',
  },
  {
    // БЛОКЕР ревью: неопознанный 403 снова становится «потерей доступа к
    // файлу». Так ошибка политики/приложения молча превращалась бы в
    // missing[] → source_unavailable.
    id: 'unknown-403-guessed-as-forbidden',
    what: 'неопознанный 403 снова выдаётся за потерю доступа к файлу',
    find: "      const e = new Error(`Google вернул ошибку доступа (403${reason ? ', причина: ' + reason : ', причина не указана'}) — это не потеря доступа к файлу и не истёкший вход`);\n      e.serviceError = true; e.reason = reason;",
    replace: "      const e = new Error('доступ к этому файлу закрыт');\n      e.forbidden = true; e.reason = reason;",
    expectFail: 'явная ошибка сервиса: НЕ потеря доступа, НЕ истёкший вход, НЕ квота',
  },
  {
    // Положительный список причин подменяется «всё подряд — это доступ»:
    // классификация снова перестаёт быть доказательной.
    id: 'access-list-matches-everything',
    what: 'список причин потери доступа начинает совпадать с чем угодно',
    find: '      if (has(DRIVE_403_ACCESS)) {',
    replace: '      if (true) {',
    expectFail: 'явная ошибка сервиса: НЕ потеря доступа, НЕ истёкший вход, НЕ квота',
  },
  {
    // Неопознанный 403 в пути чтения снова помечает источник недоступным.
    id: 'unknown-403-marks-source-unavailable',
    what: 'неопознанный 403 при чтении снова помечает источник недоступным',
    find: "      if (e && (e.rateLimited || e.serviceError)) {\n        return { ok: false, errors: [`«${f.name}»: ${String((e && e.message) || e).slice(0, 160)}`], rateLimited: !!e.rateLimited, serviceError: !!e.serviceError };\n      }\n      // D-5: недоступность источника — НИКОГДА не удаление canonical.",
    replace: "      if (e && (e.rateLimited || e.serviceError)) { missing.push(f.name); continue; }\n      // D-5: недоступность источника — НИКОГДА не удаление canonical.",
    expectFail: 'неопознанный 403 НЕ портит статус источника и НЕ гасит вход',
  },
  {
    // Токен просачивается в разметку панели.
    id: 'token-rendered-in-dom',
    what: 'токен попадает в разметку панели источника',
    find: '    <div class="si-text" style="font-size:.75rem;color:var(--t3)" id="drive-auth-${i}">Доступ к Google:',
    replace: '    <div class="si-text" data-tok="${esc(String(driveTokenPeek() || \'\'))}" style="font-size:.75rem;color:var(--t3)" id="drive-auth-${i}">Доступ к Google:',
    expectFail: 'токен НЕ попал в DOM',
  },
];

const run = (bundle) => new Promise(res => {
  const p = spawn(process.execPath, [SPEC], {
    cwd: join(DIR, '..'),
    env: { ...process.env, DRIVE_BUNDLE: bundle },
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

console.log('\n── DRIVE UI mutation sanity: снятый обработчик обязан уронить браузерный тест ──');

for (const m of MUTANTS) {
  if (!src.includes(m.find)) {
    ok(false, `[${m.id}] якорь мутации найден в собранном бандле`,
      `не найдено:\n${m.find}\nProduction изменился — мутацию нужно обновить.`);
    continue;
  }
  const file = join(DIST_DIR, `_drvui-mutant-${m.id}.html`);
  await writeFile(file, src.replace(m.find, m.replace));
  const { code, out } = await run(file);
  await rm(file, { force: true });
  const reds = out.split('\n').filter(l => l.trimStart().startsWith('✗')).map(l => l.trim());
  const hit = reds.some(l => l.includes(m.expectFail));
  ok(code !== 0 && hit,
    `[${m.id}] ${m.what} → сценарий «${m.expectFail}» покраснел (${reds.length} провалов)`,
    code === 0 ? 'ПРОВЕРКА ЛОЖНОЗЕЛЁНАЯ: обработчик снят, но браузерная сюита прошла.'
      : hit ? null
        : `Упало не на ожидаемом сценарии. Красные:\n${reds.slice(0, 6).join('\n') || '(нет)'}`);
}

console.log(`\nDRIVE UI mutation sanity: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
