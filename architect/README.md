# Архитектор

Умный дневник жизни (PWA): свои сферы жизни + движок, который превращает данные
в действенные выводы. Ванильный JS, без фреймворков; офлайн-first; данные
шифруются и синхронизируются между устройствами.

## Структура

```
architect/
  index.html        # разметка (ссылается на styles.css, app.js, lucide.js)
  styles.css        # стили (дизайн-система)
  app.js            # вся логика: данные, движки, рендер, синхронизация
  sw.js             # service worker (офлайн-кэш; версия = __BUILD__)
  lucide.js         # иконки (самохостинг, pinned 1.23.0 — без внешнего CDN)
  manifest.json     # PWA-манифест
  icon-*.png        # иконки приложения
  build.mjs         # сборка → dist/ (инлайн CSS/JS, версия по хешу контента)
  tests/e2e.mjs     # регрессионные E2E-тесты (Playwright + Chromium)
  package.json      # scripts + playwright (dev)
  backend/          # Express + PostgreSQL (Railway): синхронизация «пространств»
```

## Сборка

```bash
node build.mjs                 # → dist/ (index.html + sw.js + lucide.js + иконки)
node build.mjs --combined x.html   # только инлайн-HTML (для тестов)
```

Версия сборки **детерминирована по хешу** контента (`index/styles/app/sw/lucide`):
одинаковый код → та же версия → service worker не «обновляется» зря; любое
изменение кода даёт новую версию кэша.

## Тесты

```bash
npm test        # собирает combined + гоняет E2E в Chromium (25 проверок)
```

Локально нужен Playwright и путь к Chromium:
```bash
npm install
npx playwright install chromium
PW_CHROMIUM=/path/to/chrome node tests/e2e.mjs
```

Покрытие: навигация (4 вкладки + подразделы «Разум»), умные движки
(`smartInsights`, `correlations`, `stateScore`, `periodReview`, `smartNudge`,
`sphereStats`), сферы, AI «копни глубже», RULER, самохостинг иконок и —
критично после инцидента — **roundtrip снапшот→восстановление данных**.

## CI / Деплой (автоматически)

- **CI** (`.github/workflows/ci.yml`) — на каждый push/PR в `architect/**`:
  сборка + E2E. Красный CI = код не идёт дальше.
- **Деплой** (`.github/workflows/deploy.yml`) — **только после зелёного CI на
  MAIN**: собирает `dist/` и публикует в ветку `gh-pages` (force-push).
  Сломанный код физически не попадёт в прод.

Прод: **https://ivanbelkov1984.github.io/CODING/**

## Ветки

- `MAIN` — источник правды (исходники).
- `gh-pages` — артефакт сборки (обновляется деплоем автоматически).
- `claude/*` — рабочие ветки.

## Данные и надёжность

- **Офлайн-first синхронизация**: пер-record LWW-merge с `_u`-метками и
  «надгробиями»; коллекции в `IDCOLS` (вкл. `spheres`/`sphereLogs`).
- **E2E-шифрование** (AES-GCM + PBKDF2) — пароль-фраза локальна на профиль.
- **Ежедневные снапшоты** в localStorage (`arch5_snap_*`, хранится 7) +
  восстановление из «Итоги → Настройки → Резервные копии».
- **Мультипрофиль**: данные неймспейсятся по id профиля.

## Backend

`backend/` — Express + PostgreSQL (Railway). Хранит «пространства» (db/cfg по
секретному ключу-UUID). `push.js` — Web Push, под VAPID-guard (без ключей —
no-op, синхронизацию не трогает). Хардненинг: helmet, rate-limit, CORS-allowlist.
