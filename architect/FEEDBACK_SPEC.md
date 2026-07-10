# Архитектор — модуль обратной связи и логирования (спека для реализации)

> Готово к передаче Fable без уточнений. Адаптировано под реальность приложения:
> ванильный JS PWA (offline-first, E2EE личных данных), бэкенд Express+PostgreSQL
> на Railway (`architect/backend/server.js`), деплой MAIN→CI(26 E2E)→gh-pages,
> версия сборки = хеш (`arch-v<hash>`), AI = Claude API. Никаких новых сервисов:
> хранение — та же Postgres; триаж и дайджест — GitHub Actions cron; «автофикс» —
> PR через существующий CI-шлюз.

## КЛЮЧЕВОЙ ПРИНЦИП ПРИВАТНОСТИ (не нарушать)
Дневник пользователя E2EE и не читается сервером. Фидбэк — ОТДЕЛЬНЫЙ канал:
отправляется только то, что пользователь написал в форму + явно показанный ему
тех-контекст. НИКОГДА не прикреплять содержимое DB (инсайты/чек-ины/сферы).

---

# ЧАСТЬ 1: UI ФОРМЫ (фронт, `app.js`/`index.html`/`styles.css`)

## Launcher и триггеры
- Постоянный, неблокирующий: пункт **«Обратная связь»** в Настройках
  (`pg-settings`, карточка «О приложении») и в будущем drawer-меню. Иконка
  `message-square`. Никаких модалок при входе.
- Контекстные триггеры (мягкая карточка-надж через существующий `rNudge`-слот,
  не модалка; кнопка «Позже» = dismiss на 14 дней в localStorage
  `arch5_fb_snooze`):
  1. после первого успешного AI-обзора (`aiDigest` OK впервые);
  2. после 3-го использования новой фичи (счётчик `arch5_fb_used_<feature>`);
  3. после пойманной JS-ошибки (см. errorBuffer ниже) — «Что-то пошло не так?
     Расскажи — починим».
- Не показывать чаще 1 раза в 14 дней и никогда посреди ввода (не показывать,
  если фокус в input/textarea или открыт оверлей).

## Форма (`ov-feedback`, bottom-sheet как остальные `ov-*`)
- Один вопрос: **«Что расскажешь?»** + одно свободное текстовое поле
  (textarea, 4 строки) — похвала/идея/жалоба/ошибка своими словами.
  Без длинной анкеты и без обязательного выбора категории (тип определит AI).
- Опционально: **скриншот/фото** — переиспользовать существующий фото-флоу
  (`addPhoto`, IndexedDB): в фидбэк уходит downscale ≤1280px JPEG ≤700KB base64.
- **Тех-контекст — автоматически, но ПРОЗРАЧНО**: под полем свёрнутый блок
  «Будет приложено: версия, экран, устройство» (раскрываемый, с чекбоксом
  `checked` по умолчанию). Состав:
  `{ appVersion: <arch-v-хеш из SW>, screen: <активный pg-* / открытый ov-*>,
    ua: navigator.userAgent, lang, viewport, online, ts: ISO,
    lastErrors: errorBuffer.slice(-3) }`
- `errorBuffer`: глобальный `window.addEventListener('error'|'unhandledrejection')`
  пишет в кольцевой буфер (≤10 записей: message, source:line, ts) — только в
  памяти/localStorage `arch5_errbuf`, никуда не шлётся без отправки формы.
- Кнопки: primary «Отправить», ghost «Позже». Оффлайн — очередь
  `arch5_fb_outbox` (localStorage), фоновая отправка при online.
- После отправки: тост «Спасибо! Мы читаем каждое сообщение» + `feedbackId`
  сохраняется в `arch5_fb_sent` (для замыкания цикла, ч.4).

# ЧАСТЬ 2: ПАЙПЛАЙН ОБРАБОТКИ

## Шаг 1 — приём и сырой лог (бэкенд, `backend/feedback.js`, монтируется как push.js)
`POST /api/feedback` (rate-limit 5/час на IP поверх общего лимитера):
валидация (text 3..4000 симв., screenshot ≤1MB base64, context — объект) →
INSERT в `raw_feedback_log`. Таблица append-only: приложению выдать право
только INSERT/SELECT (без UPDATE/DELETE) — неизменяемость на уровне грантов.
Ответ: `{ id }`. Никакой AI-обработки в запросе (мгновенный приём).

`GET /api/feedback/status?ids=…` — публичный, отдаёт по id только
`{ id, status, fixedInVersion }` (для ч.4).

## Шаг 2 — AI-классификация (GitHub Action cron `feedback-triage.yml`, каждые 6ч)
Скрипт `backend/triage.mjs` (Node, запускается в Action; секреты:
`DATABASE_URL`, `ANTHROPIC_API_KEY` — серверный ключ, НЕ пользовательский):
1. SELECT из `raw_feedback_log` WHERE id NOT IN (classified).
2. Один вызов Claude (`claude-opus-4-8`, structured output JSON-schema) на батч
   ≤20 сообщений: для каждого → `{ type: gratitude|suggestion|bug|ux_complaint|
   irrelevant, sentiment: pos|neu|neg|critical, confidence: 0-100,
   module: today|spheres|mind|results|sync|ai|pwa|other, summary: 1 строка }`.
   Module выводится из текста + `context.screen`.
3. INSERT в `classified_feedback`. confidence <55 → type дополнительно
   помечается `needs_review`.

## Шаг 3 — дедупликация и паттерны (в том же прогоне triage)
- Масштаб приложения — десятки открытых паттернов, поэтому семантику дешевле
  делать тем же Claude-вызовом: в промпт триажа подаётся список открытых
  паттернов (`id + summary`), модель возвращает `pattern_id | null` для каждого
  сообщения (semantic match, не keywords).
- Совпадение → `pattern_id` проставляется, `patterns.mention_count += 1`,
  новый тикет НЕ создаётся.
- Нет совпадения и type ∈ {bug, suggestion, ux_complaint} → создать pattern.
- Авто-приоритет: ≥3 упоминаний паттерна за 72ч → `patterns.priority='high'`
  (SQL-триггером или в triage-скрипте).
- Задел на масштаб: колонка `embedding vector(1536)` NULL + расширение pgvector
  закомментировано в миграции — включить, когда паттернов станет >100.

## Шаг 4 — маршрутизация по типу (в triage-скрипте, РАЗНЫЕ пути)

**gratitude** → `positive_log` (view по classified_feedback), действий нет;
попадает только в недельный отчёт «что хвалят».

**bug** → строка в `fix_queue`:
- confidence ≥75 И module ∈ ALLOWLIST (см. шаг 5) → `status='auto_fix_candidate'`;
- confidence ≥75 И module ∈ HIGH_RISK → `status='pending_review'` (диагноз AI
  прикладывается, правка НЕ применяется);
- confidence <75 или пустой контекст → `status='needs_clarification'`;
  follow-up: пометка отдаётся через `GET /api/feedback/status` как
  `status='question', question='…'` — приложение показывает вопрос тостом-карточкой
  при следующем открытии (у нас нет email — канал только in-app).

**suggestion / ux_complaint** → НИКОГДА не в автоисполнение. Карточка в
`founder_digest_items`: `{ суть 1-2 предложения, module, mention_count,
ai_complexity: low|med|high + однострочное обоснование }`. Никаких
реалтайм-уведомлений — только недельный дайджест.

**irrelevant** → `classified_feedback.type='irrelevant'`, в отчёты не входит,
хранится (сырьё в raw_log неприкосновенно).

## Шаг 5 — Auto-fix agent (правила безопасности; субстрат = существующий CI)
- ALLOWLIST модулей автофикса (конфиг `backend/autofix.allow.json`, правит
  только владелец): опечатки/тексты в `index.html`, стилевые правки
  `styles.css`, документация. **НИКОГДА**: `app.js` (синк/шифрование/движки/
  данные), `backend/*`, `sw.js`, `build.mjs`, `.github/*` — идут к человеку
  при любом confidence.
- Механика: Action `autofix.yml` (запуск вручную или после triage) берёт
  `auto_fix_candidate`, агент (Claude) готовит патч → ветка `autofix/<id>` →
  локально `npm test` (26 E2E) → **PR в MAIN** с diff, причиной, тегом
  `AI-fixed`, ссылкой на фидбэк. Фаза 1 (по умолчанию): автомерж ВЫКЛЮЧЕН —
  зелёный PR ждёт кнопки владельца; это и есть review-шлюз.
  Фаза 2 (включается владельцем позже): автомерж при зелёном CI только для
  ALLOWLIST + пост-деплойный смоук (curl прод-версии и маркеров); красный смоук
  → автоматический revert-PR + эскалация (issue с меткой `critical`).
- Каждый автофикс логируется в `fix_queue`: diff-ссылка (PR URL), причина,
  `status='auto_fixed'`, версия деплоя.

# ЧАСТЬ 3: ОТЧЁТНОСТЬ ВЛАДЕЛЬЦУ

Еженедельный дайджест — Action cron (пн 08:00 UTC) собирает из БД и создаёт
**GitHub Issue** «📬 Фидбэк-дайджест недели N» (читается с телефона, ноль новой
инфраструктуры). Секции:
1. **Автоисправлено** — список PR-ссылок с diff (информационно).
2. **Требует решения** — карточки предложений, сгруппированы по module,
   отсортированы по mention_count. Формат карточки: суть (1-2 предложения) ·
   упоминаний: N · модуль · сложность (low/med/high + обоснование) ·
   чекбоксы `[ ] В roadmap [ ] Отклонить (коммент) [ ] Позже` — владелец
   ставит галку, следующий прогон читает issue и обновляет статусы.
3. **Критические баги на review** — с контекстом, lastErrors и AI-диагнозом.
4. **Тренды** — sentiment по неделям (SQL: avg по classified), топ-3 темы,
   «что хвалят» из positive_log.

# ЧАСТЬ 4: ЗАМЫКАНИЕ ЦИКЛА
- Приложение при старте (и после синка) дергает
  `GET /api/feedback/status?ids=<arch5_fb_sent>`; для `fixed` показывает тост
  «Спасибо за сообщение — исправлено в версии X» один раз
  (`arch5_fb_thanked`). Персональные ручные ответы не нужны.
- `suggestion → accepted` виден в разделе «Что нового»: статический
  `CHANGELOG.json` в gh-pages (генерируется дайджест-Action из принятых
  карточек), приложение рендерит в Итоги → О приложении.

# ЧАСТЬ 5: DATA MODEL (миграция `backend/migrations/002_feedback.sql`)

```sql
-- Неизменяемый сырой лог (append-only: приложению только INSERT/SELECT)
CREATE TABLE raw_feedback_log (
  id          BIGSERIAL PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  text        TEXT NOT NULL CHECK (length(text) BETWEEN 3 AND 4000),
  screenshot  TEXT,                          -- base64 JPEG ≤1MB, NULL если нет
  context     JSONB NOT NULL DEFAULT '{}',   -- version/screen/ua/lastErrors…
  space_hint  UUID                           -- опц., для in-app замыкания цикла
);
REVOKE UPDATE, DELETE ON raw_feedback_log FROM architect_app;

CREATE TABLE classified_feedback (
  feedback_id BIGINT PRIMARY KEY REFERENCES raw_feedback_log(id),
  type        TEXT NOT NULL CHECK (type IN
              ('gratitude','suggestion','bug','ux_complaint','irrelevant')),
  sentiment   TEXT NOT NULL CHECK (sentiment IN ('pos','neu','neg','critical')),
  confidence  SMALLINT NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  module      TEXT NOT NULL,
  summary     TEXT NOT NULL,
  pattern_id  BIGINT REFERENCES patterns(id),
  classified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cf_type_idx    ON classified_feedback(type);
CREATE INDEX cf_module_idx  ON classified_feedback(module);
CREATE INDEX cf_pattern_idx ON classified_feedback(pattern_id);

CREATE TABLE patterns (
  id            BIGSERIAL PRIMARY KEY,
  summary       TEXT NOT NULL,
  module        TEXT NOT NULL,
  mention_count INT NOT NULL DEFAULT 1,
  priority      TEXT NOT NULL DEFAULT 'normal',  -- normal|high
  status        TEXT NOT NULL DEFAULT 'open',    -- open|accepted|rejected|done
  first_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen     TIMESTAMPTZ NOT NULL DEFAULT now()
  -- embedding vector(1536)  -- включить с pgvector при >100 паттернов
);
CREATE INDEX patterns_open_idx ON patterns(status) WHERE status='open';

CREATE TABLE fix_queue (
  id          BIGSERIAL PRIMARY KEY,
  feedback_id BIGINT NOT NULL REFERENCES raw_feedback_log(id),
  status      TEXT NOT NULL CHECK (status IN ('auto_fix_candidate','auto_fixed',
              'pending_review','needs_clarification','done','wontfix')),
  ai_diagnosis TEXT,
  pr_url      TEXT,                -- diff-ссылка автофикса
  fixed_in    TEXT,                -- arch-v<hash>
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX fq_status_idx ON fix_queue(status);

CREATE TABLE founder_digest_items (
  id          BIGSERIAL PRIMARY KEY,
  pattern_id  BIGINT NOT NULL REFERENCES patterns(id),
  week        DATE NOT NULL,
  complexity  TEXT NOT NULL,       -- low|med|high
  rationale   TEXT NOT NULL,
  decision    TEXT DEFAULT NULL,   -- roadmap|rejected|later (из чекбоксов issue)
  UNIQUE (pattern_id, week)
);
```
Поиск дублей: v1 — семантический матч Claude по открытым паттернам (их десятки);
масштабирование — pgvector + `CREATE INDEX ON patterns USING hnsw (embedding
vector_cosine_ops)`.

# ЧАСТЬ 6: МЕТРИКИ УСПЕХА (SQL-вычислимы, в конец каждого дайджеста)
- **Auto-close rate**: % фидбэка, закрытого без человека =
  (auto_fixed + gratitude + irrelevant) / всего за неделю.
- **Time-to-fix**: медиана `fix_queue.updated_at(done|auto_fixed) −
  raw.received_at`.
- **Точность триажа**: % ручных переклассификаций владельцем (правки типа в
  issue-дайджесте фиксируются в `classified_feedback` — расхождение = ошибка AI).
- **Замыкание цикла**: % сообщивших о баге, получивших «исправлено» in-app
  (fixed-статусы, запрошенные клиентами / всего fixed).
- **Паттерн-эффективность**: среднее mention_count на паттерн (растёт →
  дедуп работает).

# ПОРЯДОК РЕАЛИЗАЦИИ (для Fable, по кирпичу, тесты зелёные)
1. Бэкенд: миграция + `feedback.js` (POST/status) + E2E-тест эндпоинта.
2. Фронт: errorBuffer + `ov-feedback` (форма, авто-контекст, outbox) + тест.
3. `triage.mjs` + `feedback-triage.yml` (классификация+паттерны+маршрутизация).
4. Дайджест-Action (issue) + CHANGELOG.json + «Что нового».
5. `autofix.yml` фаза 1 (PR-режим, автомерж выключен).
Ограничения проекта действуют: ноль новых фронт-зависимостей, самодостаточная
сборка, деплой только через MAIN→CI, приватность дневника неприкосновенна.
