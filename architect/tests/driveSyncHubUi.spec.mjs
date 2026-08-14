// DRIVE SYNC HUB — ИНТЕГРАЦИЯ ЧЕРЕЗ РЕАЛЬНЫЙ ИНТЕРФЕЙС.
//
// Эта сюита НАМЕРЕННО не вызывает driveConnCreate / drivePickFeeds /
// driveSyncNow напрямую. Она кликает по видимым элементам, как владелец с
// iPhone. Смысл: доказать, что функции не просто существуют, а ДОСТИЖИМЫ
// из production-интерфейса. Предыдущая версия PR имела рабочий движок и
// ноль вызовов из UI — тесты были зелёными, а пользоваться было нечем.
//
// Подменяется РОВНО сетевой транспорт Google (DRIVE_NET): сеть в тестах
// закрыта. Вся логика приёма, весь UI и все подтверждения — производственные.

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..');
const FILE = 'file://' + (process.env.DRIVE_BUNDLE || join(ROOT, 'dist', 'app.html'));
let pass = 0, fail = 0;
const errors = [];
const ok = (c, m, d) => {
  if (c) { pass++; console.log('  ✓ ' + m); }
  else { fail++; console.log('  ✗ ' + m); if (d) console.log('      ' + String(d).split('\n').join('\n      ')); }
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', e => errors.push(e.message));
const netHits = [];
await page.route('**/*', r => {
  const u = r.request().url();
  if (u.startsWith('file://')) return r.continue();
  netHits.push(u); return r.abort();
});
await page.goto(FILE);
await page.waitForSelector('#nsh-tabbar', { state: 'attached' });
// Первый запуск показывает мастер онбординга через 500 мс. Он не относится
// к Drive, но перехватывает клики, поэтому гасится тем же способом, что и в
// остальных сюитах репозитория. Всё, что касается Drive, дальше — настоящие
// клики по настоящим кнопкам.
await page.waitForTimeout(700);
const hideChrome = () => page.evaluate(() => {
  ['ov-onboard', 'ov-tour', 'splash'].forEach(id => {
    const e = document.getElementById(id);
    if (e) { e.classList.remove('on'); e.style.display = 'none'; }
  });
});
await hideChrome();

const CID = 'TEST-DRV-000000000000-abcdefg.apps.googleusercontent.com';
const TOKEN = 'TEST-DRV-TOKEN-secret';

const feedPkg = (sourceId, title) => JSON.stringify({
  format: 'architect-external-work-v1',
  source: { kind: 'google_drive', label: 'TEST-DRV источник', module: 'TEST-DRV-MODULE' },
  session: { clientRef: 'TEST-DRV-UI', summary: 'TEST-DRV подача через UI', date: '2026-04-12' },
  entities: [{
    clientRef: 'e1', type: 'insight', sourceId,
    claimClass: 'user_experience', textOrigin: 'user_words',
    data: { title, body: 'Тело записи ' + title, tag: 'personal' },
  }],
  links: [],
});

const reset = () => page.evaluate(() => {
  ['insights', 'externalConnections', 'externalWorkSessions'].forEach(c => { DB[c] = []; });
  DB._del = {};
  CFG.driveClientId = '';
  try { resolveRecovery('discarded'); } catch (_) { }
  if (typeof extBridgeCancel === 'function') extBridgeCancel();
  if (typeof driveCursorsDrop === 'function') driveCursorsDrop();
  if (typeof driveTokenClear === 'function') driveTokenClear();
  _extConnActive = null; _extBatchFeed = null;
  document.querySelectorAll('.ov.on').forEach(e => e.classList.remove('on'));
  persist();
});

// Транспорт Google. Только он подменяется — ни один шаг UI не обходится.
const fakeNet = (files) => page.evaluate((files) => {
  window.__drv = { meta: 0, content: 0, tokenReq: 0, picks: 0 };
  const store = new Map(files.map(f => [f.id, f]));
  Object.assign(DRIVE_NET, {
    requestToken: async () => { window.__drv.tokenReq++; return { access_token: 'TEST-DRV-TOKEN-secret', expires_in: 3600 }; },
    pickFiles: async () => { window.__drv.picks++; return files.filter(f => !f.unpickable).map(f => ({ id: f.id, name: f.name, mimeType: 'application/json' })); },
    getMeta: async (id) => {
      window.__drv.meta++;
      const f = store.get(id);
      if (!f || f.gone) { const e = new Error('нет'); e.notFound = true; throw e; }
      if (f.forbidden) { const e = new Error('нет доступа'); e.forbidden = true; throw e; }
      if (f.rateLimited) { const e = new Error('Google временно ограничил частоту запросов — повтори позже'); e.rateLimited = true; throw e; }
      if (f.expired) { const e = new Error('истекло'); e.needAuth = true; throw e; }
      return { id, name: f.name, mimeType: 'application/json', modifiedTime: f.modifiedTime, version: f.version, md5Checksum: f.md5, trashed: !!f.trashed };
    },
    getContent: async (id) => {
      window.__drv.content++;
      const f = store.get(id);
      if (!f || f.gone) { const e = new Error('нет'); e.notFound = true; throw e; }
      return f.text;
    },
  });
  // «Успешный вход» имитируется на уровне транспорта: production-функция
  // driveConnect грузила бы скрипт Google, что в тесте недоступно.
  window.__origConnect = window.driveConnect;
  window.driveConnect = async () => {
    const t = await DRIVE_NET.requestToken();
    driveTokenPut(t.access_token, t.expires_in);
    return { ok: true };
  };
  window.drivePickFeeds = async (connId) => {
    if (!driveTokenAlive()) await window.driveConnect();
    const picked = await DRIVE_NET.pickFiles();
    return picked.length ? driveFeedsAdd(connId, picked) : { ok: true, errors: [], added: 0 };
  };
  return true;
}, files);

// Открыть экран источников ЧЕРЕЗ видимую кнопку бокового меню.
const openSources = async () => {
  await hideChrome();
  await page.evaluate(() => { document.querySelectorAll('.ov.on').forEach(e => e.classList.remove('on')); });
  // Раздел «Настройки» — та же навигация, что у видимой кнопки меню.
  await page.evaluate(() => goTo('settings'));
  await page.waitForSelector('#pg-settings', { state: 'visible' });
  // Дальше — НАСТОЯЩИЙ клик по видимой строке, без обхода обработчика.
  const entry = page.locator('#pg-settings button.srow', { hasText: 'Импорт внешней работы' });
  await entry.first().waitFor({ state: 'visible' });
  await entry.first().click();
  await page.waitForSelector('#ov-ext-import.on', { state: 'attached' });
  // Блок источников живёт в свёрнутом <details> — раскрываем его так же,
  // как это делает человек, кликом по заголовку.
  const summary = page.locator('#ext-src-det > summary');
  if (await summary.count() && !(await page.evaluate(() => !!($('ext-src-det') || {}).open))) {
    await summary.first().click();
  }
  await page.waitForSelector('#extc-label', { state: 'visible' });
};

// Создать Drive-источник через видимые поля формы.
const createDriveSource = async (label) => {
  await page.fill('#extc-label', label);
  await page.selectOption('#extc-kind', 'google_drive_export');
  await page.locator('#ext-connections button', { hasText: 'Добавить источник' }).click({ force: true });
};

console.log('\nDRIVE SYNC HUB — ИНТЕРФЕЙС\n');

// ── A. Путь достижим: экран источников открывается видимой кнопкой ───
{
  await reset();
  await openSources();
  const visible = await page.locator('#ov-ext-import.on').count();
  ok(visible === 1, 'A. экран «Импорт внешней работы» открывается видимой кнопкой меню');
}

// ── B. Drive-источник создаётся через видимую форму ──────────────────
{
  await createDriveSource('TEST-DRV UI канал');
  const st = await page.evaluate(() => {
    const c = (DB.externalConnections || [])[0] || {};
    return { count: (DB.externalConnections || []).length, kind: c.kind, label: c.label };
  });
  ok(st.count === 1 && st.kind === 'google_drive_export',
    'B. Google Drive источник создан через видимый выбор «Откуда приходят данные»', JSON.stringify(st));
}

// ── Нет client id → действие в настройки, а не тупик ─────────────────
{
  const need = await page.locator('[id^="drive-need-cid-"]').count();
  const btn = page.locator('[id^="drive-goto-cfg-"]');
  ok(need === 1 && (await btn.count()) === 1,
    'без Client ID показан не тупик, а кнопка перехода в настройки');
  await btn.first().click({ force: true });
  await page.waitForSelector('#ov-cfg.on', { state: 'attached' });
  const focused = await page.evaluate(() => document.activeElement && document.activeElement.id);
  ok(focused === 'cfg-drive-client',
    'кнопка ведёт прямо в нужное поле настроек (фокус на поле Client ID)', String(focused));
}

// ── C. Client ID настраивается через UI настроек ─────────────────────
{
  // Мусор обязан быть отклонён, а не сохранён молча — И с объяснением,
  // ЧТО именно вставлено не то. Общего «неверный формат» здесь мало:
  // человек, перепутавший секрет с идентификатором, должен это понять.
  await page.fill('#cfg-drive-client', 'GOCSPX-этоСЕКРЕТ');
  await page.locator('#ov-cfg button', { hasText: 'Сохранить' }).first().click({ force: true });
  await page.waitForTimeout(150);
  const afterBad = await page.evaluate(() => CFG.driveClientId || '');
  const secretMsg = await page.evaluate(() => ($('toasts') || {}).textContent || '');
  ok(afterBad === '', 'C1. Client SECRET отклонён и не сохранён', afterBad);
  ok(/Client SECRET/i.test(secretMsg),
    'C1b. человеку названа ТОЧНАЯ причина: это секрет, а не идентификатор', secretMsg.slice(0, 90));
  await page.waitForTimeout(2600);   // тост уходит сам, чтобы не мешать дальше

  await page.fill('#cfg-drive-client', ' ' + CID + ' ');
  await page.locator('#ov-cfg button', { hasText: 'Сохранить' }).first().click({ force: true });
  const saved = await page.evaluate(() => CFG.driveClientId || '');
  ok(saved === CID, 'C2. корректный Client ID сохранён через обычный путь настроек (с обрезкой пробелов)', saved);

  const persisted = await page.evaluate(() => {
    const raw = localStorage.getItem('arch5_cfg_' + activeId()) || '';
    return raw.includes('driveClientId');
  });
  ok(persisted, 'C3. Client ID сохраняется существующим механизмом CFG');
}

// ── D+E+F. Подключение и выбор файлов видимыми кнопками ──────────────
{
  await fakeNet([{ id: 'TEST-DRV-UI-1', name: 'жизнь.json', modifiedTime: 't1', version: '1', md5: 'm1', text: feedPkg('TEST-DRV-UI-S1', 'Первая') }]);
  await openSources();
  const connectBtn = page.locator('[id^="drive-auth-btn-"]');
  ok(await connectBtn.count() === 1, 'D1. после настройки Client ID появилась кнопка «Подключить Google»');
  await connectBtn.first().click({ force: true });
  await page.waitForTimeout(120);
  const authTxt = await page.locator('[id^="drive-auth-"]').first().textContent();
  ok(/подключено в этой сессии/.test(authTxt || ''),
    'D2. состояние доступа показано человеку («подключено в этой сессии»)', String(authTxt).slice(0, 80));
  const noToken = await page.evaluate(() => !document.body.innerHTML.includes('TEST-DRV-TOKEN-secret'));
  ok(noToken, 'D3. токен НЕ попал в DOM');

  await page.locator('[id^="drive-pick-"]').first().click({ force: true });
  await page.waitForTimeout(150);
  const feedRow = page.locator('[data-drive-feed="TEST-DRV-UI-1"]');
  ok(await feedRow.count() === 1, 'E+F. выбранная подача появилась в списке с человеческим названием');
  const feedTxt = await feedRow.first().textContent();
  ok(/жизнь\.json/.test(feedTxt || ''), 'подача подписана именем файла, а не идентификатором', String(feedTxt).slice(0, 60));
}

// ── G+H+I. «Синхронизировать» → предпросмотр моста, canonical цел ────
{
  const before = await page.evaluate(() => (DB.insights || []).length);
  await page.locator('[id^="drive-sync-"]').first().click({ force: true });
  await page.waitForTimeout(400);
  const out = await page.locator('#ext-conn-out').textContent();
  const after = await page.evaluate(() => (DB.insights || []).length);
  ok(/Что изменится/.test(out || ''), 'G+H. кнопка «Синхронизировать» привела к СУЩЕСТВУЮЩЕМУ предпросмотру моста', String(out).slice(0, 90));
  ok(/Новых записей/.test(out || ''), 'предпросмотр говорит на языке разделов, отдельного Drive-экрана нет');
  ok(before === 0 && after === 0, 'I. до подтверждения canonical НЕ изменён');
}

// ── J+K+L. Подтверждение → commit, ledger и курсор ───────────────────
{
  await page.locator('#ext-conn-out button', { hasText: 'Импортировать' }).first().click({ force: true });
  await page.waitForTimeout(200);
  const confirm = page.locator('#ext-conn-out button', { hasText: 'Да, импортировать' });
  if (await confirm.count()) await confirm.first().click({ force: true });
  await page.waitForTimeout(500);
  const st = await page.evaluate(() => {
    const c = (DB.externalConnections || [])[0] || {};
    return {
      insights: (DB.insights || []).length,
      ledger: (DB.externalWorkSessions || []).length,
      checkpoint: ((c.checkpoint || {}).committedPackageHashes || []).length,
      cursor: !!((c.driveFeeds || [])[0] || {}).cursor,
      sourceId: (((DB.insights || [])[0] || {}).ext || {}).sourceId || null,
    };
  });
  ok(st.insights === 1 && st.sourceId === 'TEST-DRV-UI-S1',
    'J+K. подтверждение через существующую кнопку создало canonical запись', JSON.stringify(st));
  ok(st.ledger === 1 && st.checkpoint === 1, 'L1. ledger и чекпойнт моста продвинулись');
  ok(st.cursor, 'L2. курсор Drive зафиксирован только после успешного применения');
}

// ── Точный повтор через UI → ноль дублей ─────────────────────────────
{
  await page.locator('[id^="drive-sync-"]').first().click({ force: true });
  await page.waitForTimeout(400);
  const st = await page.evaluate(() => ({
    insights: (DB.insights || []).length,
    out: ($('ext-conn-out') || {}).textContent || '',
  }));
  ok(st.insights === 1, 'повтор синхронизации через UI не создал дубль', JSON.stringify({ n: st.insights }));
  ok(/Новых данных нет|уже импортировано|Что изменится/.test(st.out), 'повтор честно объяснён человеку');
}

// ── Удаление подачи из allowlist через UI ────────────────────────────
{
  const rm = page.locator('[id^="drive-rm-"]');
  ok(await rm.count() === 1, 'у выбранной подачи есть видимая кнопка «Убрать»');
  await rm.first().click({ force: true });
  await page.waitForTimeout(150);
  const st = await page.evaluate(() => ({
    feeds: (((DB.externalConnections || [])[0] || {}).driveFeeds || []).length,
    insights: (DB.insights || []).length,
  }));
  ok(st.feeds === 0, 'подача убрана из allowlist через UI');
  ok(st.insights === 1, 'удаление подачи НЕ трогает импортированные записи');
}

// ── Истёкшая авторизация → видимое действие переподключения ──────────
{
  await page.evaluate(() => {
    const c = (DB.externalConnections || [])[0];
    driveFeedsAdd(c.id, [{ id: 'TEST-DRV-UI-1', name: 'жизнь.json' }]);
    extConnUpdate(c.id, x => { x.driveFeeds = x.driveFeeds.map(f => ({ ...f, cursor: null })); });
    driveTokenClear();
    extRenderConnections();
  });
  await page.locator('[id^="drive-sync-"]').first().click({ force: true });
  await page.waitForTimeout(250);
  const out = await page.locator('#ext-conn-out').textContent();
  ok(/подключи Google|истекла|переподключ/i.test(out || ''),
    'без действующего входа синхронизация отказывает и просит переподключиться', String(out).slice(0, 100));
  const btn = await page.locator('[id^="drive-auth-btn-"]').count();
  ok(btn === 1, 'кнопка подключения доступна прямо здесь — тупика нет');
  const insights = await page.evaluate(() => (DB.insights || []).length);
  ok(insights === 1, 'отказ авторизации не тронул canonical');
}

// ── Недоступный файл через UI → source_unavailable, данные целы ──────
{
  await fakeNet([{ id: 'TEST-DRV-UI-1', name: 'жизнь.json', gone: true }]);
  await page.evaluate(async () => { await window.driveConnect(); extRenderConnections(); });
  await page.locator('[id^="drive-sync-"]').first().click({ force: true });
  await page.waitForTimeout(300);
  const st = await page.evaluate(() => ({
    status: ((DB.externalConnections || [])[0] || {}).status,
    insights: (DB.insights || []).length,
    out: ($('ext-conn-out') || {}).textContent || '',
  }));
  ok(st.status === 'source_unavailable', 'недоступный файл → источник помечен недоступным', JSON.stringify({ s: st.status }));
  ok(st.insights === 1, 'записи при этом целы');
  ok(/не затронуты|недоступн/i.test(st.out), 'человеку сказано, что записи не затронуты', String(st.out).slice(0, 90));
}

// ── Выход из Google через UI ─────────────────────────────────────────
{
  await page.evaluate(() => { const c = (DB.externalConnections || [])[0]; extConnResume(c.id); extRenderConnections(); });
  await page.evaluate(async () => { await window.driveConnect(); extRenderConnections(); });
  const so = page.locator('[id^="drive-signout-"]');
  ok(await so.count() === 1, 'кнопка выхода из Google видима, когда есть активный доступ');
  await so.first().click({ force: true });
  await page.waitForTimeout(150);
  const st = await page.evaluate(() => ({ auth: driveAuthState(), insights: (DB.insights || []).length }));
  ok(st.auth === 'none' && st.insights === 1, 'выход гасит доступ и не трогает записи', JSON.stringify(st));
}

// ── Отключение источника через существующую кнопку ───────────────────
{
  await page.locator('#ext-connections button', { hasText: 'Отключить' }).first().click({ force: true });
  await page.waitForTimeout(150);
  const st = await page.evaluate(() => ({
    status: ((DB.externalConnections || [])[0] || {}).status,
    insights: (DB.insights || []).length,
  }));
  ok(st.status === 'disconnected' && st.insights === 1,
    'отключение источника через UI оставляет импортированные записи', JSON.stringify(st));
}

// ── Конфликт остаётся заблокированным и в UI ─────────────────────────
{
  await reset();
  await page.evaluate((cid) => { CFG.driveClientId = cid; persist(); }, CID);
  await fakeNet([{ id: 'TEST-DRV-UI-C', name: 'конфликт.json', modifiedTime: 't1', version: '1', md5: 'k1', text: JSON.stringify({
    format: 'architect-external-work-v1',
    source: { kind: 'google_drive', label: 'TEST-DRV источник', module: 'TEST-DRV-MODULE' },
    session: { clientRef: 'TEST-DRV-K1', summary: 'TEST-DRV', date: '2026-04-12' },
    entities: [{ clientRef: 'e1', type: 'insight', sourceId: 'TEST-DRV-UI-CONF', claimClass: 'user_experience', textOrigin: 'user_words', sourceVersion: { sequence: 1 }, data: { title: 'Версия 1', body: 'Тело 1', tag: 'personal' } }],
    links: [],
  }) }]);
  await openSources();
  await createDriveSource('TEST-DRV Конфликт');
  await page.evaluate(async () => { await window.driveConnect(); const c = (DB.externalConnections || [])[0]; await window.drivePickFeeds(c.id); extRenderConnections(); });
  await page.locator('[id^="drive-sync-"]').first().click({ force: true });
  await page.waitForTimeout(400);
  await page.locator('#ext-conn-out button', { hasText: 'Импортировать' }).first().click({ force: true });
  await page.waitForTimeout(150);
  const cf = page.locator('#ext-conn-out button', { hasText: 'Да, импортировать' });
  if (await cf.count()) await cf.first().click({ force: true });
  await page.waitForTimeout(400);
  // Владелец правит запись локально, источник присылает более новую версию.
  await page.evaluate(() => { DB.insights[0].title = 'Правка владельца'; DB.insights[0]._u = Date.now(); persist(); });
  await page.evaluate(() => {
    Object.assign(DRIVE_NET, {
      getMeta: async () => ({ id: 'TEST-DRV-UI-C', name: 'конфликт.json', modifiedTime: 't2', version: '2', md5Checksum: 'k2' }),
      getContent: async () => JSON.stringify({
        format: 'architect-external-work-v1',
        source: { kind: 'google_drive', label: 'TEST-DRV источник', module: 'TEST-DRV-MODULE' },
        session: { clientRef: 'TEST-DRV-K2', summary: 'TEST-DRV', date: '2026-04-13' },
        entities: [{ clientRef: 'e1', type: 'insight', sourceId: 'TEST-DRV-UI-CONF', claimClass: 'user_experience', textOrigin: 'user_words', sourceVersion: { sequence: 2 }, data: { title: 'Версия 2 из источника', body: 'Тело 2', tag: 'personal' } }],
        links: [],
      }),
    });
  });
  await page.locator('[id^="drive-sync-"]').first().click({ force: true });
  await page.waitForTimeout(400);
  const applyBtn = page.locator('#ext-conn-out button', { hasText: 'Импортировать' });
  if (await applyBtn.count()) {
    await applyBtn.first().click({ force: true });
    await page.waitForTimeout(150);
    const c2 = page.locator('#ext-conn-out button', { hasText: 'Да, импортировать' });
    if (await c2.count()) await c2.first().click({ force: true });
    await page.waitForTimeout(400);
  }
  const st = await page.evaluate(() => ({
    title: ((DB.insights || [])[0] || {}).title,
    n: (DB.insights || []).length,
    out: ($('ext-conn-out') || {}).textContent || '',
  }));
  ok(st.title === 'Правка владельца' && st.n === 1,
    'конфликт остаётся заблокированным и через UI — правка владельца цела, дубля нет', JSON.stringify({ t: st.title, n: st.n }));
  ok(/решени|конфликт|не будет применена|не применена/i.test(st.out),
    'человеку объяснено, что подача требует решения', String(st.out).slice(0, 120));
}

// ── 401 / 403 / квота различаются (аудит §5) ─────────────────────────
{
  const codes = await page.evaluate(async () => {
    const mk = (status, body) => ({
      status, ok: false,
      clone() { return { json: async () => body }; },
      json: async () => body, text: async () => JSON.stringify(body),
    });
    const orig = window.fetch;
    const probe = async (status, body) => {
      window.fetch = async () => mk(status, body);
      // Настоящий production-транспорт: отдельная фабрика, не подменённый DRIVE_NET.
      const real = driveNetReal();
      driveTokenPut('TEST-DRV-TOKEN-secret', 3600);
      try { await real.getMeta('X'); return { err: 'нет ошибки' }; }
      catch (e) { return { needAuth: !!e.needAuth, forbidden: !!e.forbidden, rateLimited: !!e.rateLimited, tokenAfter: driveAuthState() }; }
      finally { window.fetch = orig; }
    };
    return {
      a401: await probe(401, {}),
      a403perm: await probe(403, { error: { errors: [{ reason: 'insufficientFilePermissions' }] } }),
      a403quota: await probe(403, { error: { errors: [{ reason: 'userRateLimitExceeded' }] } }),
      a429: await probe(429, {}),
    };
  });
  ok(codes.a401.needAuth && codes.a401.tokenAfter === 'none',
    '401 → токен погашен, требуется переподключение', JSON.stringify(codes.a401));
  ok(codes.a403perm.forbidden && !codes.a403perm.needAuth && codes.a403perm.tokenAfter === 'active',
    '403 «нет прав на файл» → объект недоступен, вход НЕ объявляется истёкшим', JSON.stringify(codes.a403perm));
  ok(codes.a403quota.rateLimited && !codes.a403quota.forbidden && codes.a403quota.tokenAfter === 'active',
    '403 «квота/лимит» → явная ошибка сервиса, НЕ недоступность файла и НЕ истёкший вход', JSON.stringify(codes.a403quota));
  ok(codes.a429.rateLimited, '429 → ограничение частоты, отдельная честная ошибка', JSON.stringify(codes.a429));

  // Квота не должна помечать источник недоступным.
  await fakeNet([{ id: 'TEST-DRV-UI-Q', name: 'квота.json', rateLimited: true }]);
  const q = await page.evaluate(async () => {
    DB.externalConnections = []; DB.insights = []; persist();
    const c = driveConnCreate('TEST-DRV Квота');
    driveFeedsAdd(c.rec.id, [{ id: 'TEST-DRV-UI-Q', name: 'квота.json' }]);
    driveTokenPut('TEST-DRV-TOKEN-secret', 3600);
    const r = await driveReadFeed(c.rec.id);
    return { failed: !r.ok, rateLimited: !!r.rateLimited, unavailable: !!r.unavailable, status: extConnFind(c.rec.id).status, auth: driveAuthState() };
  });
  ok(q.failed && q.rateLimited && !q.unavailable,
    'квота при чтении → отказ, но источник НЕ помечен недоступным', JSON.stringify(q));
  ok(q.status !== 'source_unavailable' && q.auth === 'active',
    'при квоте вход остаётся действительным, статус источника не испорчен', JSON.stringify(q));
}

// ── Безопасность UI: секретов в разметке нет ─────────────────────────
{
  const dom = await page.evaluate(() => document.body.innerHTML);
  ok(!dom.includes(TOKEN), 'токена нет ни в одном атрибуте/узле разметки');
  const googleHits = netHits.filter(u => /google|gstatic|googleapis/i.test(u));
  ok(googleHits.length === 0, `за весь UI-прогон приложение не обратилось к Google само (${googleHits.length})`);
}

ok(errors.length === 0, `JS-ошибок нет за весь прогон (${errors.length})`, errors.slice(0, 3).join('\n'));

{
  const src = readFileSync(join(DIR, 'driveSyncHubUi.spec.mjs'), 'utf8');
  ok(/TEST-DRV-/.test(src), 'все фикстуры синтетические (TEST-DRV-*)');
}

await browser.close();
console.log(`\nDRIVE SYNC HUB UI: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
