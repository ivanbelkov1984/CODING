// ═══════════════════════════════════════════════════════════════
//  Архитектор — Service Worker
//  · HTML (навигация) — network-first, оффлайн-фолбэк на кэш
//  · шрифты/иконки/CDN — stale-while-revalidate (работают офлайн)
//  · API (Railway) и Anthropic — passthrough (свежесть + приватность)
//  Версия кэша меняется при каждой сборке (__BUILD__), старые чистятся.
//
//  Wave 5 (issue #158, owner review #1) — DEPLOY RECOVERY.
//  Логика вынесена в self.__archSw, чтобы её можно было прогнать
//  детерминированным сценарным тестом на mock CacheStorage, а не проверять
//  регулярками по исходнику.
// ═══════════════════════════════════════════════════════════════
const V = 'arch-__BUILD__';
// Кэш последней ПОДТВЕРЖДЁННО рабочей сборки.
const LKG = 'arch-lkg';
// Служебные ключи внутри LKG (не URL приложения — их не отдаём как ассеты).
const LKG_VERSION_KEY = '__arch_lkg_version__';
const RECOVERY_FLAG_KEY = '__arch_recovery_mode__';
const SHELL = ['./', './index.html', './lucide.js', './astronomy.min.js', './astro_rules.js', './inter-latin.woff2', './inter-cyrillic.woff2', './manifest.json', './icon-192.png', './icon-512.png',
  // ESM-модули зашифрованного backup — в app shell, чтобы UI работал офлайн
  // (dynamic import из index.html резолвится из кэша). Пути относительны scope
  // (/CODING/architect/). Сами backup-ФАЙЛЫ пользователя (blob-скачивание) не
  // проходят через этот кэш и не кэшируются.
  './backup/backup-core.mjs', './backup/backup-adapter.mjs', './backup/backup-restore.mjs', './backup/backup-ui.mjs', './backup/backup-boot.mjs'];

// ─── Примитивы над CacheStorage ─────────────────────────────────────
async function copyCache(fromName, toName, { fresh = true } = {}) {
  const from = await caches.open(fromName);
  const reqs = await from.keys();
  if (!reqs.length) return 0;
  if (fresh) await caches.delete(toName);
  const to = await caches.open(toName);
  let n = 0;
  for (const rq of reqs) {
    const res = await from.match(rq);
    if (res) { await to.put(rq, res.clone()); n++; }
  }
  return n;
}
async function cacheText(name, key) {
  const c = await caches.open(name);
  const r = await c.match(key);
  return r ? await r.text() : null;
}
async function cachePutText(name, key, text) {
  const c = await caches.open(name);
  await c.put(key, new Response(text, { headers: { 'content-type': 'text/plain' } }));
}
async function lastKnownGoodVersion() { return cacheText(LKG, LKG_VERSION_KEY); }
async function recoveryMode() { return (await cacheText(LKG, RECOVERY_FLAG_KEY)) === '1'; }

// ─── ACTIVATE: seed LKG ПЕРЕД удалением старых кэшей ────────────────
// Ключевой фикс owner review #1. Раньше activate сносил все versioned-кэши
// кроме V и LKG. На ПЕРВОМ обновлении после внедрения Wave 5 кэша LKG ещё
// не существует — значит предыдущая рабочая сборка удалялась до того, как
// новая подтвердит старт. Если новая сборка сломана, откатываться уже не к
// чему. Теперь: если LKG пуст, предыдущий versioned-кэш назначается LKG
// (он рабочий по построению — пользователь на нём работал), и только потом
// выполняется уборка.
async function activateWithRecovery() {
  const keys = await caches.keys();
  const versioned = keys.filter(k => k !== LKG && k.indexOf('arch-') === 0);
  const stale = versioned.filter(k => k !== V);

  const haveLkg = !!(await lastKnownGoodVersion());
  if (!haveLkg && stale.length) {
    // Кандидат — прежняя рабочая сборка. Их может быть несколько только при
    // аварийном прерывании прошлой уборки; берём непустую.
    for (const cand of stale) {
      const copied = await copyCache(cand, LKG, { fresh: true });
      if (copied > 0) { await cachePutText(LKG, LKG_VERSION_KEY, cand); break; }
    }
  }
  for (const k of stale) await caches.delete(k);
  return { seededFrom: haveLkg ? null : (await lastKnownGoodVersion()), deleted: stale };
}

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    await activateWithRecovery();
    await self.clients.claim();
  })());
});

// ─── FETCH ──────────────────────────────────────────────────────────
async function handleNavigate(req) {
  // Режим восстановления: навигацию обслуживает ТОЛЬКО last-known-good.
  // Без этого «выдача по явному запросу восстановления» была бы заявлением
  // без реализации — caches.match('./index.html') мог вернуть сломанный V.
  if (await recoveryMode()) {
    const lkg = await caches.open(LKG);
    const fromLkg = (await lkg.match('./index.html')) || (await lkg.match('./'));
    if (fromLkg) return fromLkg;
  }
  try {
    const r = await fetch(req);
    const cp = r.clone();
    caches.open(V).then(c => c.put('./index.html', cp)).catch(() => {});
    return r;
  } catch (_) {
    const cur = await caches.open(V);
    const cached = (await cur.match('./index.html')) || (await cur.match('./'));
    if (cached) return cached;
    const lkg = await caches.open(LKG);
    return (await lkg.match('./index.html')) || (await lkg.match('./'));
  }
}
async function handleAsset(req) {
  if (await recoveryMode()) {
    const lkg = await caches.open(LKG);
    const fromLkg = await lkg.match(req);
    if (fromLkg) return fromLkg;
  }
  const cached = await caches.match(req);
  const net = fetch(req).then(r => {
    if (r && (r.status === 200 || r.type === 'opaque')) {
      const cp = r.clone();
      caches.open(V).then(c => c.put(req, cp)).catch(() => {});
    }
    return r;
  }).catch(() => cached);
  return cached || net;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // Данные и внешние сервисы — не кэшируем (свежесть/приватность)
  if (/railway\.app|api\.anthropic\.com|backboard\.railway/.test(url.host)) return;

  if (req.mode === 'navigate') { e.respondWith(handleNavigate(req)); return; }
  e.respondWith(handleAsset(req));
});

// ─── HEALTH MARKER / RECOVERY API ───────────────────────────────────
// Сборка становится last-known-good ТОЛЬКО после подтверждения старта.
async function promoteToLastKnownGood() {
  const copied = await copyCache(V, LKG, { fresh: true });
  if (!copied) return false;
  await cachePutText(LKG, LKG_VERSION_KEY, V);
  await cachePutText(LKG, RECOVERY_FLAG_KEY, '0');   // успешный старт снимает режим
  return true;
}
// Явный запрос восстановления: включает выдачу из LKG. Ничего не перезагружает
// сам — reload инициирует приложение по решению пользователя, поэтому петли
// перезагрузок не возникает.
async function enterRecovery() {
  const v = await lastKnownGoodVersion();
  if (!v) return { ok: false, reason: 'no-last-known-good' };
  await cachePutText(LKG, RECOVERY_FLAG_KEY, '1');
  return { ok: true, version: v };
}
async function exitRecovery() {
  await cachePutText(LKG, RECOVERY_FLAG_KEY, '0');
  return { ok: true };
}
async function versionInfo() {
  return { current: V, lastKnownGood: await lastKnownGoodVersion(), recovery: await recoveryMode() };
}
async function handleMessage(msg, reply) {
  const type = msg && msg.type;
  if (type === 'arch:startup-ok') { await promoteToLastKnownGood(); return; }
  if (type === 'arch:version?') { reply && reply(Object.assign({ type: 'arch:version' }, await versionInfo())); return; }
  if (type === 'arch:restore-lkg') { const r = await enterRecovery(); reply && reply(Object.assign({ type: 'arch:restore-lkg-result' }, r)); return; }
  if (type === 'arch:exit-recovery') { await exitRecovery(); reply && reply({ type: 'arch:exit-recovery-result', ok: true }); return; }
}
self.addEventListener('message', e => {
  const src = e.source || (e.ports && e.ports[0]);
  const reply = src && src.postMessage ? (m => src.postMessage(m)) : null;
  e.waitUntil(handleMessage(e.data || {}, reply).catch(() => {}));
});

// ─── PUSH-УВЕДОМЛЕНИЯ ───────────────────────────────────────────
// Показываем уведомление из payload сервера (активируется backend'ом).
self.addEventListener('push', e => {
  let d = { title: 'Архитектор', body: 'Хороший момент отметить день?' };
  try { if (e.data) d = Object.assign(d, e.data.json()); } catch (_) {}
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body, icon: './icon-192.png', badge: './icon-192.png',
    tag: d.tag || 'arch-reminder', data: { url: d.url || './' }, renotify: true,
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if ('focus' in c) return c.focus();
    if (clients.openWindow) return clients.openWindow(url);
  }));
});

// Экспорт логики для детерминированного сценарного теста (mock CacheStorage).
// В браузере это просто дополнительное поле на self — поведение не меняет.
self.__archSw = {
  V, LKG, LKG_VERSION_KEY, RECOVERY_FLAG_KEY, SHELL,
  activateWithRecovery, promoteToLastKnownGood, enterRecovery, exitRecovery,
  lastKnownGoodVersion, recoveryMode, versionInfo, handleMessage,
  handleNavigate, handleAsset, copyCache,
};
