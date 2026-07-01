// ═══════════════════════════════════════════════════════════════
//  Архитектор — Service Worker
//  · HTML (навигация) — network-first, оффлайн-фолбэк на кэш
//  · шрифты/иконки/CDN — stale-while-revalidate (работают офлайн)
//  · API (Railway) и Anthropic — passthrough (свежесть + приватность)
//  Версия кэша меняется при каждой сборке (__BUILD__), старые чистятся.
// ═══════════════════════════════════════════════════════════════
const V = 'arch-__BUILD__';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

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
