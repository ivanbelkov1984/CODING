// Wave 5 (issue #158, owner review #1) — СЦЕНАРНЫЙ тест deploy recovery.
//
// Проверяет НЕ регулярки по исходнику, а поведение: реальный код sw.js
// исполняется в изолированном контексте поверх mock CacheStorage, и
// проигрываются настоящие сценарии деплоя.
//
//   A(good) → B(broken, без startup-ok)  — A обязана остаться доступной,
//                                          хотя LKG на момент активации B
//                                          ещё не существовал;
//   A → B(good) → C(broken)              — LKG обязан быть B, recovery не
//                                          должен отдавать C.
//
// Запуск: node tests/wave5-sw-recovery.spec.mjs

import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..');
let pass = 0, fail = 0;
const ok = (cond, msg, detail) => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); if (detail) console.log('      ' + String(detail).split('\n').join('\n      ')); }
};

// ── Mock CacheStorage ───────────────────────────────────────────────
// Достаточно точная модель: ключ запроса — строка URL, значение — Response.
class MockResponse {
  constructor(body, init) { this._body = String(body); this.status = (init && init.status) || 200; this.headers = (init && init.headers) || {}; this.type = 'basic'; }
  clone() { return new MockResponse(this._body, { status: this.status, headers: this.headers }); }
  async text() { return this._body; }
}
const keyOf = r => (typeof r === 'string' ? r : r.url);
class MockCache {
  constructor() { this.map = new Map(); }
  async put(req, res) { this.map.set(keyOf(req), res); }
  async match(req) { return this.map.get(keyOf(req)) || undefined; }
  async keys() { return [...this.map.keys()]; }
  async addAll(urls) { for (const u of urls) this.map.set(u, new MockResponse('asset:' + u)); }
  async delete(req) { return this.map.delete(keyOf(req)); }
}
class MockCacheStorage {
  constructor() { this.caches = new Map(); }
  async open(name) { if (!this.caches.has(name)) this.caches.set(name, new MockCache()); return this.caches.get(name); }
  async keys() { return [...this.caches.keys()]; }
  async delete(name) { return this.caches.delete(name); }
  async match(req) {
    for (const c of this.caches.values()) { const r = await c.match(req); if (r) return r; }
    return undefined;
  }
}

// ── Загрузка РЕАЛЬНОГО sw.js в изолированный контекст ───────────────
const swSource = await readFile(join(ROOT, 'sw.js'), 'utf8');
async function loadSW(build, { cacheStorage, fetchImpl } = {}) {
  const listeners = {};
  const self = {
    addEventListener: (t, fn) => { (listeners[t] || (listeners[t] = [])).push(fn); },
    skipWaiting: () => {},
    clients: { claim: async () => {}, matchAll: async () => [] },
    registration: { showNotification: async () => {} },
  };
  const sandbox = {
    self, caches: cacheStorage, Response: MockResponse,
    fetch: fetchImpl || (async () => { throw new Error('offline'); }),
    URL, console, clients: self.clients,
    setTimeout, clearTimeout,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(swSource.replaceAll('__BUILD__', build), sandbox);
  return { api: self.__archSw, listeners, self };
}

const CACHES = new MockCacheStorage();

// Заселяем «рабочую сборку A» так, как её оставил бы install+activate.
async function seedBuild(name, marker) {
  const c = await CACHES.open(name);
  await c.put('./index.html', new MockResponse(marker));
  await c.put('./', new MockResponse(marker));
  await c.put('./lucide.js', new MockResponse('lucide:' + marker));
}

// ── Сценарий 1: A(good) → B(broken), LKG ещё не существует ──────────
{
  CACHES.caches.clear();
  await seedBuild('arch-vA', 'BUILD-A-GOOD');

  const before = await CACHES.keys();
  ok(before.includes('arch-vA') && !before.includes('arch-lkg'),
    'сценарий 1: стартуем с рабочей A и БЕЗ существующего LKG — это и есть первое обновление после внедрения Wave 5');

  // Активируется новая сборка B. startup-ok она НЕ пришлёт (сломана).
  const B = await loadSW('vB', { cacheStorage: CACHES });
  await (await CACHES.open('arch-vB')).addAll(['./index.html', './']);
  await B.api.activateWithRecovery();

  const after = await CACHES.keys();
  ok(after.includes('arch-lkg'),
    'сценарий 1: LKG создан из предыдущей рабочей сборки ДО уборки старых кэшей');
  const lkgV = await B.api.lastKnownGoodVersion();
  ok(lkgV === 'arch-vA', `сценарий 1: LKG указывает на A (${lkgV})`);

  const lkg = await CACHES.open('arch-lkg');
  const idx = await lkg.match('./index.html');
  ok(idx && (await idx.text()) === 'BUILD-A-GOOD',
    'сценарий 1: содержимое A реально сохранено, а не только имя версии');

  ok(!after.includes('arch-vA'),
    'сценарий 1: старый versioned-кэш убран (место не течёт) — копия живёт в LKG');

  // startup-ok не приходил → LKG обязан остаться на A.
  const stillA = await B.api.lastKnownGoodVersion();
  ok(stillA === 'arch-vA', 'сценарий 1: без подтверждения старта LKG НЕ переписан сломанной B');

  // Явный запрос восстановления обязан реально отдавать A.
  const rec = await B.api.enterRecovery();
  ok(rec.ok && rec.version === 'arch-vA', 'сценарий 1: восстановление доступно и указывает на A');
  ok((await B.api.recoveryMode()) === true, 'сценарий 1: режим восстановления включён');

  const served = await B.api.handleNavigate({ url: './', mode: 'navigate' });
  const servedText = served ? await served.text() : null;
  ok(servedText === 'BUILD-A-GOOD',
    `сценарий 1: навигация в режиме восстановления отдаёт РАБОЧУЮ A, а не сломанную B (${servedText})`);

  // И ассеты тоже — иначе страница A подтянула бы битые скрипты B.
  const asset = await B.api.handleAsset('./lucide.js');
  ok(asset && (await asset.text()) === 'lucide:BUILD-A-GOOD',
    'сценарий 1: ассеты в режиме восстановления тоже берутся из A');
}

// ── Сценарий 2: A → B(good) → C(broken) ─────────────────────────────
{
  CACHES.caches.clear();
  await seedBuild('arch-vA', 'BUILD-A');

  // B активируется и ПОДТВЕРЖДАЕТ старт.
  const B = await loadSW('vB', { cacheStorage: CACHES });
  await seedBuild('arch-vB', 'BUILD-B-GOOD');
  await B.api.activateWithRecovery();
  await B.api.handleMessage({ type: 'arch:startup-ok', build: 'vB' });
  ok((await B.api.lastKnownGoodVersion()) === 'arch-vB',
    'сценарий 2: после подтверждённого старта LKG стал B');
  const lkgB = await (await CACHES.open('arch-lkg')).match('./index.html');
  ok((await lkgB.text()) === 'BUILD-B-GOOD', 'сценарий 2: в LKG лежит содержимое именно B');

  // C активируется и НЕ подтверждает старт.
  const C = await loadSW('vC', { cacheStorage: CACHES });
  await seedBuild('arch-vC', 'BUILD-C-BROKEN');
  await C.api.activateWithRecovery();
  ok((await C.api.lastKnownGoodVersion()) === 'arch-vB',
    'сценарий 2: активация C не трогает LKG — он по-прежнему B');

  await C.api.enterRecovery();
  const served = await C.api.handleNavigate({ url: './', mode: 'navigate' });
  const text = await served.text();
  ok(text === 'BUILD-B-GOOD', `сценарий 2: восстановление отдаёт B, а НЕ сломанную C (${text})`);
  ok(text !== 'BUILD-C-BROKEN', 'сценарий 2: сломанная C не попадает в выдачу восстановления');

  // Выход из восстановления возвращает обычное поведение.
  await C.api.exitRecovery();
  ok((await C.api.recoveryMode()) === false, 'сценарий 2: режим восстановления снимается явно');
  const normal = await C.api.handleNavigate({ url: './', mode: 'navigate' });
  ok((await normal.text()) === 'BUILD-C-BROKEN',
    'сценарий 2: вне режима восстановления работает обычная сборка (восстановление не залипает)');
}

// ── Сценарий 3: исправленная D деплоится нормально ──────────────────
{
  CACHES.caches.clear();
  await seedBuild('arch-vB', 'BUILD-B-GOOD');
  const B = await loadSW('vB', { cacheStorage: CACHES });
  await B.api.activateWithRecovery();
  await B.api.handleMessage({ type: 'arch:startup-ok', build: 'vB' });
  await B.api.enterRecovery();                       // пользователь был в восстановлении

  const D = await loadSW('vD', { cacheStorage: CACHES });
  await seedBuild('arch-vD', 'BUILD-D-FIXED');
  await D.api.activateWithRecovery();
  await D.api.handleMessage({ type: 'arch:startup-ok', build: 'vD' });

  ok((await D.api.lastKnownGoodVersion()) === 'arch-vD',
    'сценарий 3: исправленная сборка после подтверждения старта становится LKG');
  ok((await D.api.recoveryMode()) === false,
    'сценарий 3: успешный старт автоматически снимает режим восстановления');
  const served = await D.api.handleNavigate({ url: './', mode: 'navigate' });
  ok((await served.text()) === 'BUILD-D-FIXED',
    'сценарий 3: приложение обновляется нормально, восстановление не блокирует выпуск');
}

// ── Сценарий 4: восстановление недоступно, если LKG никогда не было ─
{
  CACHES.caches.clear();
  const A = await loadSW('vA', { cacheStorage: CACHES });
  await seedBuild('arch-vA', 'BUILD-A-FIRST');
  await A.api.activateWithRecovery();
  const r = await A.api.enterRecovery();
  ok(r.ok === false && r.reason === 'no-last-known-good',
    'сценарий 4: при первой в жизни установке восстановление честно сообщает, что откатываться некуда');
  ok((await A.api.recoveryMode()) === false,
    'сценарий 4: несостоявшееся восстановление не включает режим (нет петли)');
}

// ── Сценарий 5: message API и отсутствие reload-петли ───────────────
{
  CACHES.caches.clear();
  await seedBuild('arch-vB', 'BUILD-B');
  const B = await loadSW('vB', { cacheStorage: CACHES });
  await B.api.activateWithRecovery();
  await B.api.handleMessage({ type: 'arch:startup-ok', build: 'vB' });

  const replies = [];
  await B.api.handleMessage({ type: 'arch:version?' }, m => replies.push(m));
  const v = replies.find(m => m.type === 'arch:version');
  ok(!!v && v.current === 'arch-vB' && v.lastKnownGood === 'arch-vB',
    'message API: arch:version? возвращает текущую версию и last-known-good');
  ok(typeof v.recovery === 'boolean', 'message API: сообщается состояние режима восстановления');

  replies.length = 0;
  await B.api.handleMessage({ type: 'arch:restore-lkg' }, m => replies.push(m));
  ok(replies.some(m => m.type === 'arch:restore-lkg-result' && m.ok === true),
    'message API: arch:restore-lkg реализован и отвечает результатом');

  ok(!/location\s*\.\s*reload/.test(swSource) && !/clients\.\w+\(\)\s*\.then\([^)]*navigate/.test(swSource),
    'петли перезагрузок нет: service worker не инициирует reload сам');

  // Неизвестное сообщение не должно ничего ломать.
  let threw = false;
  try { await B.api.handleMessage({ type: 'arch:unknown' }, () => {}); } catch (_) { threw = true; }
  ok(!threw, 'message API: неизвестный тип сообщения игнорируется без исключения');
}

// ── Сценарий 7 (owner review, финальный проход): чужая сборка НЕ может ─
//    сертифицировать сломанную текущую. C broken → recovery B →
//    B шлёт startup-ok(build=B) контроллеру C.
{
  CACHES.caches.clear();
  await seedBuild('arch-vB', 'BUILD-B-GOOD');
  const B = await loadSW('vB', { cacheStorage: CACHES });
  await B.api.activateWithRecovery();
  await B.api.handleMessage({ type: 'arch:startup-ok', build: 'vB' });

  // Деплой сломанной C; пользователь включает восстановление.
  const C = await loadSW('vC', { cacheStorage: CACHES });
  await seedBuild('arch-vC', 'BUILD-C-BROKEN');
  await C.api.activateWithRecovery();
  await C.api.enterRecovery();
  ok((await C.api.recoveryMode()) === true, 'сценарий 7: восстановление включено, SW-контроллер — сломанная C');

  // Код РАБОЧЕЙ B (выданной из LKG) через 8 секунд шлёт свой health marker.
  const replies = [];
  await C.api.handleMessage({ type: 'arch:startup-ok', build: 'vB' }, m => replies.push(m));

  ok((await C.api.lastKnownGoodVersion()) === 'arch-vB',
    'сценарий 7: маркер сборки B НЕ продвинул C — LKG остался B');
  const lkgIdx = await (await CACHES.open('arch-lkg')).match('./index.html');
  ok((await lkgIdx.text()) === 'BUILD-B-GOOD',
    'сценарий 7: содержимое LKG не подменено сломанной C');
  ok((await C.api.recoveryMode()) === true,
    'сценарий 7: режим восстановления НЕ сброшен чужим маркером');
  const rej = replies.find(m => m.type === 'arch:startup-ok-result');
  ok(!!rej && rej.ok === false && rej.reason === 'build-mismatch',
    `сценарий 7: маркер отклонён явно как build-mismatch (${rej && rej.reason})`);

  // И маркер вообще без build отклоняется так же (старая вкладка, старый код).
  await C.api.handleMessage({ type: 'arch:startup-ok' });
  ok((await C.api.lastKnownGoodVersion()) === 'arch-vB',
    'сценарий 7: маркер без build id тоже не продвигает LKG');

  // Только маркер САМОЙ C (реально успешный старт C) продвигает C.
  await C.api.exitRecovery();
  await C.api.handleMessage({ type: 'arch:startup-ok', build: 'vC' });
  ok((await C.api.lastKnownGoodVersion()) === 'arch-vC',
    'сценарий 7: собственный маркер C после реального успешного старта продвигает C');
}

// ── Сценарий 8: recovery FAIL-CLOSED — недостающий ассет не берётся из V ─
{
  CACHES.caches.clear();
  await seedBuild('arch-vB', 'BUILD-B-GOOD');
  const B = await loadSW('vB', { cacheStorage: CACHES });
  await B.api.activateWithRecovery();
  await B.api.handleMessage({ type: 'arch:startup-ok', build: 'vB' });

  const C = await loadSW('vC', { cacheStorage: CACHES });
  // В C есть ассет, которого НЕТ в B (новый модуль появился в новой сборке).
  const cCache = await CACHES.open('arch-vC');
  await cCache.put('./index.html', new MockResponse('BUILD-C-BROKEN'));
  await cCache.put('./new-module.js', new MockResponse('script:BUILD-C-BROKEN'));
  await C.api.activateWithRecovery();
  await C.api.enterRecovery();

  // Запрос ассета, отсутствующего в LKG: НЕ выдавать C и НЕ ходить в сеть.
  let fetched = 0;
  const C2 = await loadSW('vC', { cacheStorage: CACHES, fetchImpl: async () => { fetched++; return new MockResponse('network:FRESH-C'); } });
  const missing = await C2.api.handleAsset('./new-module.js');
  const missText = missing ? await missing.text() : null;
  ok(missing && missing.status === 503,
    `сценарий 8: отсутствующий в LKG ассет приложения даёт контролируемую ошибку, а не подмену (status ${missing && missing.status})`);
  ok(missText !== 'script:BUILD-C-BROKEN' && missText !== 'network:FRESH-C',
    'сценарий 8: ни сломанная C, ни свежий network bundle не подмешаны к странице B');
  ok(fetched === 0, 'сценарий 8: сеть в recovery для ассетов приложения не используется');

  // Присутствующий в LKG ассет отдаётся из LKG.
  const present = await C2.api.handleAsset('./lucide.js');
  ok(present && (await present.text()) === 'lucide:BUILD-B-GOOD',
    'сценарий 8: присутствующий ассет по-прежнему отдаётся из LKG');

  // Навигация при пустом LKG-index — тоже контролируемая ошибка, не V.
  const lkgCache = await CACHES.open('arch-lkg');
  await lkgCache.delete('./index.html'); await lkgCache.delete('./');
  const nav = await C2.api.handleNavigate({ url: './', mode: 'navigate' });
  ok(nav && nav.status === 503 && (await nav.text()).includes('Режим восстановления'),
    'сценарий 8: навигация без index в LKG даёт recovery-ошибку, а не сломанную C');
}

// ── Сценарий 9: независимый recovery bootstrap (hard-startup failure) ─
// Bootstrap извлекается из РЕАЛЬНОГО index.html и исполняется в песочнице
// БЕЗ app.js — ровно как при syntax error основного бандла.
{
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  const m = html.match(/\/\*ARCH_RECOVERY_BOOTSTRAP_START\*\/([\s\S]*?)\/\*ARCH_RECOVERY_BOOTSTRAP_END\*\//);
  ok(!!m, 'bootstrap: блок присутствует в index.html');
  const bootSrc = m ? m[1] : '';
  const appPos = html.indexOf('<script src="app.js">');
  const bootPos = html.indexOf('ARCH_RECOVERY_BOOTSTRAP_START');
  ok(bootPos > 0 && appPos > 0 && bootPos < appPos,
    'bootstrap: исполняется ДО основного бандла');
  ok(!/\b(persist|hydrate|rStorage|toast|openOv|DB\.)\w*\s*\(/.test(bootSrc),
    'bootstrap: не вызывает функций основного приложения и не читает DB');
  ok(!/localStorage|indexedDB|arch5_/.test(bootSrc),
    'bootstrap: не обращается к пользовательским данным');

  // Песочница: фейковые window/document/navigator, НИКАКОГО app.js.
  function makeSandbox({ lkg, ackOk }) {
    const created = [];
    let reloads = 0;
    const timeouts = [];
    const mkEl = (tag) => {
      const el = {
        tag, style: { cssText: '' }, children: [], attrs: {}, textContent: '', disabled: false,
        setAttribute(k, v) { this.attrs[k] = v; },
        appendChild(c) { this.children.push(c); return c; },
        onclick: null, type: '', id: '',
      };
      created.push(el);
      return el;
    };
    const fakeCtl = {
      postMessage(msg, ports) {
        const port2 = ports && ports[0];
        if (!port2) return;
        // Отвечаем асинхронно, как настоящий SW.
        queueMicrotask(() => {
          if (msg.type === 'arch:version?') port2._deliver({ type: 'arch:version', current: 'arch-vC', lastKnownGood: lkg, recovery: false });
          else if (msg.type === 'arch:restore-lkg') port2._deliver(ackOk ? { type: 'arch:restore-lkg-result', ok: true, version: lkg } : { type: 'arch:restore-lkg-result', ok: false, reason: 'no-last-known-good' });
        });
      },
    };
    class FakePort {
      constructor() { this.onmessage = null; }
      _deliver(data) { if (this.pair && this.pair.onmessage) this.pair.onmessage({ data }); }
    }
    class FakeMessageChannel {
      constructor() {
        this.port1 = new FakePort(); this.port2 = new FakePort();
        this.port1.pair = this.port1; this.port2.pair = this.port1;
        // postMessage со стороны SW доставляет в port1
        this.port2._deliver = (data) => { if (this.port1.onmessage) this.port1.onmessage({ data }); };
      }
    }
    const win = {
      addEventListener: () => {},
      location: { reload: () => { reloads++; } },
      get reloads() { return reloads; },
    };
    win.window = win;
    const sandbox = {
      window: win,
      document: {
        body: mkEl('body'),
        documentElement: mkEl('html'),
        getElementById: (id) => created.find(e => e.id === id) || null,
        createElement: mkEl,
      },
      navigator: { serviceWorker: { controller: lkg === 'none' ? null : fakeCtl } },
      MessageChannel: FakeMessageChannel,
      setTimeout: (fn, ms) => { timeouts.push({ fn, ms }); return timeouts.length; },
      clearTimeout: () => {},
      queueMicrotask, Promise, console, location: win.location,
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    return { sandbox, created, win, timeouts, flushTimers: (maxMs) => { timeouts.splice(0).forEach(t => { if (t.ms <= (maxMs == null ? Infinity : maxMs)) t.fn(); }); } };
  }

  // 9.1 Основной бандл НЕ стартовал (флага нет) + LKG есть → recovery UI.
  {
    const env = makeSandbox({ lkg: 'arch-vB', ackOk: true });
    vm.runInContext(bootSrc, env.sandbox);
    ok(typeof env.sandbox.window.__archRecoveryBoot === 'object',
      'bootstrap: экспортирует управляемый вход для проверки');
    const res = await env.sandbox.window.__archRecoveryBoot.check();
    ok(res && res.shown === true && res.lkg === 'arch-vB',
      'bootstrap: при упавшем основном бандле и существующем LKG показан recovery UI');
    const dlg = env.created.find(e => e.id === 'arch-boot-recovery');
    ok(!!dlg, 'bootstrap: recovery-панель реально создана в DOM');
    const btn = dlg && dlg.children.find(c => c.tag === 'button');
    ok(!!btn && btn.type === 'button' && /предыдущей рабочей версии/.test(btn.textContent),
      'bootstrap: кнопка возврата присутствует и названа понятно');

    // Клик → ACK ok:true → reload (и только после ACK).
    btn.onclick();
    await new Promise(r => setTimeout(r, 5));      // микротаски ответа SW
    ok(env.win.reloads === 0, 'bootstrap: reload не мгновенный — ждёт подтверждения');
    env.flushTimers();                              // отложенный reload после ok:true
    ok(env.win.reloads === 1, 'bootstrap: после ACK ok:true выполняется ровно один reload');
  }

  // 9.2 ACK отрицательный → reload запрещён, кнопка снова доступна.
  {
    const env = makeSandbox({ lkg: 'arch-vB', ackOk: false });
    vm.runInContext(bootSrc, env.sandbox);
    await env.sandbox.window.__archRecoveryBoot.check();
    const dlg = env.created.find(e => e.id === 'arch-boot-recovery');
    const btn = dlg.children.find(c => c.tag === 'button');
    btn.onclick();
    await new Promise(r => setTimeout(r, 5));
    env.flushTimers();
    ok(env.win.reloads === 0, 'bootstrap: отрицательный ACK — перезагрузки нет');
    ok(btn.disabled === false, 'bootstrap: после отказа кнопка снова активна');
    const status = dlg.children.find(c => c.attrs && c.attrs['aria-live']);
    ok(!!status && /не подтверждено/.test(status.textContent),
      'bootstrap: пользователь видит точную причину отказа');
  }

  // 9.3 Основной бандл стартовал нормально → bootstrap молчит.
  {
    const env = makeSandbox({ lkg: 'arch-vB', ackOk: true });
    vm.runInContext(bootSrc, env.sandbox);
    env.sandbox.window.__archAppStarted = true;
    const res = await env.sandbox.window.__archRecoveryBoot.check();
    ok(res && res.shown === false,
      'bootstrap: при нормальном старте приложения recovery UI не показывается');
    ok(!env.created.find(e => e.id === 'arch-boot-recovery'),
      'bootstrap: панель не создана при здоровом старте');
  }

  // 9.4 LKG не существует → UI не показывается, reload невозможен.
  {
    const env = makeSandbox({ lkg: null, ackOk: false });
    vm.runInContext(bootSrc, env.sandbox);
    const res = await env.sandbox.window.__archRecoveryBoot.check();
    ok(res && res.shown === false && res.reason === 'no-last-known-good',
      'bootstrap: без last-known-good честно сообщается, что откатываться некуда');
    ok(env.win.reloads === 0, 'bootstrap: и никакой перезагрузки не происходит');
  }
}

// ── Сценарий 10 (owner review 5227067870): ACK routing через РЕАЛЬНЫЙ ─
//    зарегистрированный message-listener. В настоящем ExtendableMessageEvent
//    от контролируемой страницы e.source (Client) существует ОДНОВРЕМЕННО с
//    e.ports[0]. RPC-ответ обязан уйти в ПОРТ — иначе swRequest() на стороне
//    приложения никогда не получит ACK и restore закончится таймаутом именно
//    в production. Прямой вызов handleMessage() этот дефект не ловит.
{
  CACHES.caches.clear();
  await seedBuild('arch-vB', 'BUILD-B-GOOD');
  const B = await loadSW('vB', { cacheStorage: CACHES });
  await B.api.activateWithRecovery();
  await B.api.handleMessage({ type: 'arch:startup-ok', build: 'vB' });

  const messageListeners = B.listeners['message'] || [];
  ok(messageListeners.length === 1,
    `ACK routing: в sw.js зарегистрирован ровно один message-listener (${messageListeners.length})`);
  const listener = messageListeners[0];

  // Событие, как его доставляет браузер: И Client-source, И MessagePort.
  const makeEvent = (data) => {
    const sourceMsgs = [], portMsgs = [];
    let settled = null;
    const e = {
      data,
      source: { postMessage: (m) => sourceMsgs.push(m) },          // Client
      ports: [{ postMessage: (m) => portMsgs.push(m) }],           // переданный порт
      waitUntil: (p) => { settled = Promise.resolve(p); },
    };
    return { e, sourceMsgs, portMsgs, settle: () => settled || Promise.resolve() };
  };

  // 10.1 arch:restore-lkg — ACK строго в порт, Client не используется для RPC.
  {
    const { e, sourceMsgs, portMsgs, settle } = makeEvent({ type: 'arch:restore-lkg' });
    listener(e);
    await settle();
    ok(portMsgs.length === 1 && portMsgs[0].type === 'arch:restore-lkg-result' && portMsgs[0].ok === true,
      `ACK routing: restore-lkg ответил в MessagePort (${portMsgs.length} сообщ.)`);
    ok(sourceMsgs.length === 0,
      `ACK routing: Client.postMessage НЕ использован для RPC-ответа (${sourceMsgs.length} сообщ.)`);
    await B.api.exitRecovery();   // вернуть состояние для следующих проверок
  }

  // 10.2 arch:version? — тот же контракт.
  {
    const { e, sourceMsgs, portMsgs, settle } = makeEvent({ type: 'arch:version?' });
    listener(e);
    await settle();
    ok(portMsgs.length === 1 && portMsgs[0].type === 'arch:version' && portMsgs[0].current === 'arch-vB',
      'ACK routing: version? ответил в MessagePort с корректной версией');
    ok(sourceMsgs.length === 0, 'ACK routing: version? не ушёл через Client');
  }

  // 10.3 arch:exit-recovery — тот же контракт.
  {
    await B.api.enterRecovery();
    const { e, sourceMsgs, portMsgs, settle } = makeEvent({ type: 'arch:exit-recovery' });
    listener(e);
    await settle();
    ok(portMsgs.length === 1 && portMsgs[0].type === 'arch:exit-recovery-result' && portMsgs[0].ok === true,
      'ACK routing: exit-recovery ответил в MessagePort');
    ok(sourceMsgs.length === 0, 'ACK routing: exit-recovery не ушёл через Client');
  }

  // 10.4 Событие БЕЗ порта (broadcast-сообщение, arch:startup-ok из приложения):
  // listener не падает, а ответ, если он есть, уходит в source — деградация
  // корректная, RPC-контракт не нарушен.
  {
    const sourceMsgs = [];
    let settled = null;
    const e = {
      data: { type: 'arch:startup-ok', build: 'vB' },
      source: { postMessage: (m) => sourceMsgs.push(m) },
      ports: [],
      waitUntil: (p) => { settled = Promise.resolve(p); },
    };
    listener(e);
    await (settled || Promise.resolve());
    ok(sourceMsgs.length === 1 && sourceMsgs[0].type === 'arch:startup-ok-result',
      'ACK routing: сообщение без порта корректно отвечает через source (fallback)');
  }
}

// ── Сценарий 6: данные пользователя восстановление не трогает ───────
{
  const touchesUserData = /localStorage|indexedDB|arch5_/.test(swSource);
  ok(!touchesUserData,
    'восстановление касается только ассетов приложения: service worker не обращается к данным пользователя');
}

console.log(`\nWave 5 (SW deploy recovery): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
