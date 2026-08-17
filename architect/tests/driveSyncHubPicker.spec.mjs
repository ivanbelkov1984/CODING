// GOOGLE PICKER — ПРОВЕРКА НАСТОЯЩЕЙ PRODUCTION-СБОРКИ.
//
// Зачем отдельная сюита. Прежний UI-тест подменял саму `drivePickFeeds`, то
// есть доказывал маршрут интерфейса, но НЕ то, каким Picker собирается в
// production. Именно поэтому отсутствие `.setDeveloperKey(...)` прожило до
// внешнего аудита: по коду его никто не проверял, а поиск строки в бандле
// доказывает только наличие текста, а не факт вызова с правильным значением.
//
// Здесь вызывается НАСТОЯЩАЯ production-функция `drivePickFeeds`, а
// подменяется только внешний мир Google: `gapi` и `google.picker`. Каждый
// вызов builder'а записывается, поэтому утверждения касаются фактической
// цепочки, а не текста файла.
//
// Официальный контракт (developers.google.com/workspace/drive/picker):
//   .setDeveloperKey(API_KEY)  — Browser API key из Google Cloud Console;
//   .setAppId(APP_ID)          — номер Cloud-проекта;
//   .setOAuthToken(TOKEN)      — токен владельца (только память сессии).
//
// Ключи здесь СИНТЕТИЧЕСКИЕ (TEST-DRV-*): настоящих учётных данных Google в
// репозитории, тестах и evidence нет и быть не должно.

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..');
const FILE = 'file://' + (process.env.DRIVE_BUNDLE || join(ROOT, 'dist', 'app.html'));

// Синтетические значения. Форма соответствует документации Google (буквы,
// цифры, «_», «-»), но это заведомо не настоящие учётные данные.
const KEY = 'TEST-DRV-PICKER-KEY-0000000000000000';
const CID = '424242424242-testdrvclient.apps.googleusercontent.com';
const PROJECT = '424242424242';
const TOKEN = 'TEST-DRV-TOKEN-secret';

let pass = 0, fail = 0;
const errors = [];
const ok = (c, m, d) => {
  if (c) { pass++; console.log('  ✓ ' + m); }
  else { fail++; console.log('  ✗ ' + m); if (d) console.log('      ' + String(d).split('\n').join('\n      ')); }
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', e => errors.push(e.message));
await page.route('**/*', r => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
await page.goto(FILE);
await page.waitForSelector('#nsh-tabbar', { state: 'attached' });
await page.evaluate(() => { const s = document.getElementById('splash'); if (s) s.style.display = 'none'; });

console.log('\nGOOGLE PICKER — production-сборка\n');

// Внешний мир Google целиком подставной: настоящая сеть не нужна и
// запрещена (route выше рвёт всё, кроме file://). Записываем каждый вызов.
const installStubs = () => page.evaluate(() => {
  window.__picker = { calls: [], built: 0, visible: 0, viewCalls: [] };
  const rec = (name, args) => { window.__picker.calls.push({ name, args: args.map(a => (typeof a === 'function' ? '[fn]' : a)) }); };
  class StubView {
    constructor(id) { window.__picker.viewCalls.push({ name: 'DocsView', args: [id] }); }
    setMimeTypes(v) { window.__picker.viewCalls.push({ name: 'setMimeTypes', args: [v] }); return this; }
    setMode(v) { window.__picker.viewCalls.push({ name: 'setMode', args: [v] }); return this; }
  }
  class StubBuilder {
    setAppId(v) { rec('setAppId', [v]); return this; }
    setOAuthToken(v) { rec('setOAuthToken', [v]); return this; }
    setDeveloperKey(v) { rec('setDeveloperKey', [v]); return this; }
    addView(v) { rec('addView', [v && v.constructor && v.constructor.name]); return this; }
    enableFeature(v) { rec('enableFeature', [v]); return this; }
    setCallback(cb) { rec('setCallback', [cb]); window.__picker.cb = cb; return this; }
    build() { window.__picker.built++; return { setVisible: () => { window.__picker.visible++; } }; }
  }
  window.gapi = { load: (what, cb) => { window.__picker.gapiLoad = what; cb(); } };
  window.google = window.google || {};
  window.google.picker = {
    PickerBuilder: StubBuilder,
    DocsView: StubView,
    ViewId: { DOCS: 'DOCS' },
    DocsViewMode: { LIST: 'LIST', GRID: 'GRID' },
    Feature: { MULTISELECT_ENABLED: 'MULTISELECT_ENABLED' },
    Action: { PICKED: 'picked', CANCEL: 'cancel' },
  };
  // Скрипт Google не грузим: в production это делает driveLoadScript, а сеть
  // в тесте оборвана. Подменяем ровно загрузчик, не логику Picker.
  window.driveLoadScript = async () => true;
  return true;
});

const reset = (cfg) => page.evaluate((c) => {
  ['externalConnections', 'externalWorkSessions'].forEach(k => { DB[k] = []; });
  CFG.driveClientId = c.cid;
  CFG.driveDeveloperKey = c.key;
  persist();
  try { driveTokenClear(); } catch (_) { }
  if (c.token) driveTokenPut(c.token, 3600);
  const conn = driveConnCreate('TEST-DRV Picker');
  return conn.rec.id;
}, cfg);

// ── 1. Настоящая production-сборка Picker ────────────────────────────
{
  await installStubs();
  const connId = await reset({ cid: CID, key: KEY, token: TOKEN });
  const r = await page.evaluate(async (id) => {
    // ВЫЗЫВАЕТСЯ НАСТОЯЩАЯ drivePickFeeds — не подмена.
    const p = drivePickFeeds(id);
    await new Promise(res => setTimeout(res, 30));
    const st = window.__picker;
    // Завершаем выбор через callback, который передала production-функция.
    if (st.cb) st.cb({ action: window.google.picker.Action.PICKED, docs: [{ id: 'TEST-DRV-F1', name: 'подача.json', mimeType: 'application/json' }] });
    const res = await p;
    const call = n => (st.calls.find(c => c.name === n) || {}).args;
    return {
      native: String(window.drivePickFeeds).includes('PickerBuilder'),
      built: st.built, visible: st.visible, gapiLoad: st.gapiLoad,
      appId: call('setAppId'), oauth: call('setOAuthToken'), devKey: call('setDeveloperKey'),
      order: st.calls.map(c => c.name),
      viewMode: (st.viewCalls.find(c => c.name === 'setMode') || {}).args,
      mimeTypes: (st.viewCalls.find(c => c.name === 'setMimeTypes') || {}).args,
      added: res.added, feeds: (extConnFind(id).driveFeeds || []).map(f => f.name),
    };
  }, connId);

  ok(r.native, 'вызвана НАСТОЯЩАЯ production-функция (в ней есть PickerBuilder), а не подмена', JSON.stringify(r.native));
  ok(r.built === 1 && r.visible === 1 && r.gapiLoad === 'picker', 'Picker собран и показан ровно один раз', JSON.stringify(r));
  ok(Array.isArray(r.devKey) && r.devKey[0] === KEY,
    'setDeveloperKey получил ИМЕННО настроенный Browser API key', JSON.stringify(r.devKey));
  ok(Array.isArray(r.appId) && r.appId[0] === PROJECT,
    'setAppId получил номер Cloud-проекта (префикс Client ID)', JSON.stringify(r.appId));
  ok(Array.isArray(r.oauth) && r.oauth[0] === TOKEN,
    'setOAuthToken получил токен владельца из памяти сессии', JSON.stringify(r.oauth));
  ok(r.devKey[0] !== r.oauth[0] && r.devKey[0] !== CID,
    'три сущности не перепутаны: ключ Picker ≠ токен доступа и ≠ Client ID');
  ok(r.viewMode && r.viewMode[0] === 'LIST',
    'DocsViewMode.LIST — рекомендация Google для scope вне drive/drive.readonly', JSON.stringify(r.viewMode));
  ok(r.mimeTypes && /application\/json/.test(r.mimeTypes[0]),
    'состав выбора не изменился: те же mime-типы подач', JSON.stringify(r.mimeTypes));
  ok(r.added === 1 && r.feeds.includes('подача.json'),
    'выбранная подача добавлена в allowlist источника', JSON.stringify(r.feeds));
}

// ── 2. Restricted-скоупы не появляются ───────────────────────────────
{
  const sc = await page.evaluate(() => ({
    scope: DRIVE_SCOPE,
    restrictedInBundle: [...document.scripts].map(s => s.textContent).join('\n')
      .match(/auth\/drive\.readonly|auth\/drive\.metadata/g) || [],
  }));
  ok(sc.scope === 'https://www.googleapis.com/auth/drive.file',
    'запрашивается ровно non-sensitive per-file scope drive.file', sc.scope);
  ok(sc.restrictedInBundle.length === 0,
    'restricted-скоупов в сборке нет вовсе', JSON.stringify(sc.restrictedInBundle));
}

// ── 3. Fail-closed: без ключа Picker вообще не строится ──────────────
{
  await installStubs();
  const connId = await reset({ cid: CID, key: '', token: TOKEN });
  const r = await page.evaluate(async (id) => {
    window.__picker.calls = []; window.__picker.built = 0;
    let err = null;
    try { await drivePickFeeds(id); } catch (e) { err = { msg: String(e.message || e), flag: !!e.noPickerKey }; }
    return {
      err, built: window.__picker.built, calls: window.__picker.calls.length,
      feeds: (extConnFind(id).driveFeeds || []).length,
      missing: driveConfigMissing(), ready: driveConfigMissing().length === 0,
    };
  }, connId);
  ok(r.err && r.err.flag, 'без Browser API key вызов отклонён с явной причиной', JSON.stringify(r.err));
  ok(r.built === 0 && r.calls === 0, 'Picker НЕ строился: fail closed ДО сборки', JSON.stringify(r));
  ok(r.feeds === 0, 'ни одна подача не добавлена при неполной настройке');
  ok(!r.ready && r.missing.some(m => /Browser API key/.test(m)),
    'источник не считается готовым, и названо ровно недостающее', JSON.stringify(r.missing));
}

// ── 4. Ключ не утекает в DOM / canonical / журнал ────────────────────
{
  await installStubs();
  const connId = await reset({ cid: CID, key: KEY, token: TOKEN });
  const leak = await page.evaluate(async (args) => {
    const [id, key, token] = args;
    const logs = [];
    const origLog = console.log, origWarn = console.warn, origErr = console.error;
    console.log = (...a) => { logs.push(a.join(' ')); };
    console.warn = (...a) => { logs.push(a.join(' ')); };
    console.error = (...a) => { logs.push(a.join(' ')); };
    try {
      const p = drivePickFeeds(id);
      await new Promise(res => setTimeout(res, 30));
      if (window.__picker.cb) window.__picker.cb({ action: window.google.picker.Action.PICKED, docs: [{ id: 'TEST-DRV-F2', name: 'вторая.json', mimeType: 'application/json' }] });
      await p;
    } finally { console.log = origLog; console.warn = origWarn; console.error = origErr; }
    try { extRenderConnections(); } catch (_) { }
    const html = document.body.innerHTML;
    const packed = await packPayload();
    return {
      inDom: html.includes(key),
      inConn: JSON.stringify(extConnFind(id)).includes(key),
      inCanonical: JSON.stringify(DB).includes(key),
      inLogs: logs.some(l => l.includes(key)),
      tokenInDom: html.includes(token),
      tokenInSync: JSON.stringify(packed).includes(token),
      keyInCfg: JSON.stringify(CFG).includes(key),   // ожидаемо: это настройка
    };
  }, [connId, KEY, TOKEN]);

  ok(!leak.inDom, 'Browser API key НЕ попал в разметку страницы');
  ok(!leak.inConn && !leak.inCanonical, 'ключ не попал ни в запись подключения, ни в canonical', JSON.stringify(leak));
  ok(!leak.inLogs, 'ключ не пишется в журнал/консоль');
  ok(!leak.tokenInDom && !leak.tokenInSync, 'токен доступа по-прежнему не в DOM и не в пакете синхронизации');
  ok(leak.keyInCfg, 'ключ живёт именно в CFG (обычная настройка) — проверка не ложноположительная');
}

// ── 5. Валидатор ключа — отдельный тип, отдельные правила ────────────
{
  const v = await page.evaluate(() => {
    const n = s => driveDeveloperKeyNormalize(s);
    return {
      empty: n('').ok && n('').value === '',
      good: n('TEST-DRV-PICKER-KEY-0000000000000000').ok,
      trimmed: n('  TEST-DRV-PICKER-KEY-0000000000000000  ').value,
      clientId: n('424242424242-x.apps.googleusercontent.com'),
      secret: n('GOCSPX-TESTsecretVALUE0000000000'),
      token: n('ya29.TESTtokenVALUE0000000000000'),
      spaces: n('TEST DRV KEY 000000000000000000').ok,
      tooLong: n('A'.repeat(240)).ok,
      short: n('TEST-DRV').ok,
      separateFn: driveDeveloperKeyNormalize !== driveClientIdNormalize,
    };
  });
  ok(v.empty && v.good, 'пустое значение = «не настроено», корректный ключ принят');
  ok(v.trimmed === 'TEST-DRV-PICKER-KEY-0000000000000000', 'значение обрезается по краям', v.trimmed);
  ok(!v.clientId.ok && /Client ID/.test(v.clientId.error), 'Client ID отклонён как неправильный тип', JSON.stringify(v.clientId));
  ok(!v.secret.ok && /SECRET/i.test(v.secret.error), 'Client SECRET отклонён', JSON.stringify(v.secret));
  ok(!v.token.ok && /токен/i.test(v.token.error), 'OAuth-токен отклонён', JSON.stringify(v.token));
  ok(!v.spaces && !v.tooLong && !v.short, 'пробелы, чрезмерная длина и слишком короткая строка отклонены', JSON.stringify(v));
  ok(v.separateFn, 'проверка ключа — отдельная функция, а не переиспользованная проверка Client ID');
}

// ── 6. Настоящий путь настроек: ключ сохраняется именно своим валидатором ─
// Проверять «функции разные» недостаточно: saveCfg могла бы звать не ту.
// Здесь ключ проходит ОБЫЧНЫЙ путь сохранения настроек.
{
  const sv = await page.evaluate((args) => {
    const [key, cid] = args;
    CFG.driveClientId = ''; CFG.driveDeveloperKey = ''; persist();
    const set = (id, val) => { const el = $(id); if (el) el.value = val; return !!el; };
    const haveFields = set('cfg-drive-client', cid) && set('cfg-drive-key', key);
    saveCfg();
    const savedKey = CFG.driveDeveloperKey;
    const savedCid = CFG.driveClientId;
    // Обратная сторона: Client ID, введённый в поле ключа, обязан быть отвергнут.
    set('cfg-drive-key', cid);
    saveCfg();
    const afterWrong = CFG.driveDeveloperKey;
    // Возврат к корректному состоянию.
    set('cfg-drive-key', key); saveCfg();
    return { haveFields, savedKey, savedCid, afterWrong };
  }, [KEY, CID]);

  ok(sv.haveFields, 'в настройках есть отдельное поле для Browser API key');
  ok(sv.savedKey === KEY && sv.savedCid === CID,
    'Browser API key сохранён через ОБЫЧНЫЙ путь настроек (saveCfg)', JSON.stringify(sv));
  ok(sv.afterWrong === KEY,
    'Client ID, введённый в поле ключа, отклонён — прежний ключ не перезаписан', JSON.stringify(sv.afterWrong));
}

// ── 7. Где именно живёт ключ: явно зафиксированный режим хранения ────
// Ключ Picker — НАСТРОЙКА, а не секрет сессии: он обязан переживать
// перезапуск, иначе Picker не открыть. Поэтому он лежит там же, где вся
// CFG. Токен доступа остаётся в памяти и не появляется нигде.
// Отдельно фиксируется поведение синхронизации: с парольной фразой CFG
// уходит на сервер ТОЛЬКО шифроблоком; без фразы синк вообще не идёт без
// отдельного явного согласия владельца (существующий гейт приложения).
{
  const st = await page.evaluate(async (args) => {
    const [key, token] = args;
    CFG.driveDeveloperKey = key; persist();
    try { driveTokenClear(); } catch (_) { }
    driveTokenPut(token, 3600);
    const lsDump = Object.keys(localStorage).map(k => localStorage.getItem(k) || '').join('');
    const keepPass = getPass(), keepConsent = CFG.plainSyncConsent;

    setPass('TEST-DRV-фраза');
    const enc = await packPayload();

    setPass(''); CFG.plainSyncConsent = false;
    const gateBlocks = ensureSyncPrivacy(false) === false;   // без фразы и без согласия синк не идёт

    setPass(keepPass); CFG.plainSyncConsent = keepConsent;
    return {
      keyInCfg: JSON.stringify(CFG).includes(key),
      keyInLs: lsDump.includes(key),
      keyInDb: JSON.stringify(DB).includes(key),
      keyInEncryptedSync: JSON.stringify(enc).includes(key),
      encMarker: !!(enc.cfg && enc.cfg._enc),
      gateBlocks,
      tokenInLs: lsDump.includes(token),
      tokenInCfg: JSON.stringify(CFG).includes(token),
      tokenInEncSync: JSON.stringify(enc).includes(token),
    };
  }, [KEY, TOKEN]);

  ok(st.keyInCfg && st.keyInLs && !st.keyInDb,
    'ключ живёт в CFG/localStorage как обычная настройка и не попадает в canonical', JSON.stringify(st));
  ok(!st.keyInEncryptedSync && st.encMarker,
    'при заданной парольной фразе ключ уходит на сервер ТОЛЬКО внутри шифроблока (E2EE)', JSON.stringify({ enc: st.encMarker, leak: st.keyInEncryptedSync }));
  ok(st.gateBlocks,
    'без парольной фразы и без явного согласия синхронизация вообще не выполняется', String(st.gateBlocks));
  ok(!st.tokenInLs && !st.tokenInCfg && !st.tokenInEncSync,
    'токен доступа по-прежнему НИГДЕ не сохраняется — только память сессии', JSON.stringify(st));
}

ok(errors.length === 0, `JS-ошибок нет за весь прогон (${errors.length})`, errors.slice(0, 3).join('\n'));

// ── Privacy canary ──────────────────────────────────────────────────
{
  const src = readFileSync(join(DIR, 'driveSyncHubPicker.spec.mjs'), 'utf8');
  const bundle = readFileSync(process.env.DRIVE_BUNDLE || join(ROOT, 'dist', 'app.html'), 'utf8');
  // Настоящий Google API key начинается с AIza и имеет длину 39; настоящий
  // OAuth-токен — с ya29. Синтетические значения этих форм в тесте есть
  // намеренно (их обязан отвергать валидатор), поэтому канарейка требует не
  // отсутствия формы, а того, чтобы КАЖДОЕ совпадение было явно тестовым.
  const synthetic = m => /TEST/.test(m);
  const hits = t => [...String(t).matchAll(/AIza[0-9A-Za-z_-]{35}|ya29\.[0-9A-Za-z._-]{20,}/g)].map(m => m[0]);
  const srcHits = hits(src), bundleHits = hits(bundle);
  ok(srcHits.every(synthetic), 'в тесте нет настоящих учётных данных Google — только синтетические TEST-*',
    JSON.stringify(srcHits.filter(m => !synthetic(m))));
  ok(bundleHits.every(synthetic), 'в собранном бандле нет настоящих учётных данных Google',
    JSON.stringify(bundleHits.filter(m => !synthetic(m))));
  ok(/TEST-DRV-/.test(src), 'все фикстуры несут синтетический префикс TEST-DRV-*');
}

await browser.close();
console.log(`\nGOOGLE PICKER (production-сборка): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
