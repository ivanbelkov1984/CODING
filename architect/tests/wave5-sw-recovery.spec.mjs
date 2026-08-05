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
  await B.api.handleMessage({ type: 'arch:startup-ok' });
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
  await B.api.handleMessage({ type: 'arch:startup-ok' });
  await B.api.enterRecovery();                       // пользователь был в восстановлении

  const D = await loadSW('vD', { cacheStorage: CACHES });
  await seedBuild('arch-vD', 'BUILD-D-FIXED');
  await D.api.activateWithRecovery();
  await D.api.handleMessage({ type: 'arch:startup-ok' });

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
  await B.api.handleMessage({ type: 'arch:startup-ok' });

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

// ── Сценарий 6: данные пользователя восстановление не трогает ───────
{
  const touchesUserData = /localStorage|indexedDB|arch5_/.test(swSource);
  ok(!touchesUserData,
    'восстановление касается только ассетов приложения: service worker не обращается к данным пользователя');
}

console.log(`\nWave 5 (SW deploy recovery): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
