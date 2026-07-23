// ═══════════════════════════════════════════════════════════════
//  Архитектор — Service Worker
//  · HTML (навигация) — network-first, оффлайн-фолбэк на кэш
//  · шрифты/иконки/CDN — stale-while-revalidate (работают офлайн)
//  · API (Railway) и Anthropic — passthrough (свежесть + приватность)
//  Версия кэша меняется при каждой сборке (__BUILD__), старые чистятся.
// ═══════════════════════════════════════════════════════════════
const V = 'arch-__BUILD__';
const SHELL = ['./', './index.html', './lucide.js', './inter-latin.woff2', './inter-cyrillic.woff2', './manifest.json', './icon-192.png', './icon-512.png',
  // ESM-модули зашифрованного backup — в app shell, чтобы UI работал офлайн
  // (dynamic import из index.html резолвится из кэша). Пути относительны scope
  // (/CODING/architect/). Сами backup-ФАЙЛЫ пользователя (blob-скачивание) не
  // проходят через этот кэш и не кэшируются.
  './backup/backup-core.mjs', './backup/backup-adapter.mjs', './backup/backup-restore.mjs', './backup/backup-ui.mjs', './backup/backup-boot.mjs'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // Данные и внешние сервисы — не кэшируем (свежесть/приватность)
  if (/railway\.app|api\.anthropic\.com|backboard\.railway/.test(url.host)) return;

  // Навигация (HTML) — сеть в приоритете, оффлайн — из кэша
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(r => { const cp = r.clone(); caches.open(V).then(c => c.put('./index.html', cp)); return r; })
        .catch(() => caches.match('./index.html').then(m => m || caches.match('./')))
    );
    return;
  }

  // Прочее (шрифты, иконки, lucide) — отдаём из кэша, фоном обновляем
  e.respondWith(
    caches.match(req).then(cached => {
      const net = fetch(req).then(r => {
        if (r && (r.status === 200 || r.type === 'opaque')) {
          const cp = r.clone(); caches.open(V).then(c => c.put(req, cp));
        }
        return r;
      }).catch(() => cached);
      return cached || net;
    })
  );
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
