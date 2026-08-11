# FINAL A — Universal External Sources Bridge

Реализация Phase A по `FINAL_BRIDGE_CONTRACT.md` с учётом owner architecture
decision: **FINAL A = универсальный мост внешних источников**, а не
обязательная интеграция с Google Drive.

Base: MAIN `76d0b90`. Ветка `claude/phase-a-continuous-bridge`, Draft PR #169,
tracking issue #168. Merge — только по независимой приёмке владельца.

---

## 0. Что это такое

```
внешний источник → канал приёма (adapter) → normalize
   → canonical external-work contract (v1/v2, feed)
   → preview / provenance / dedup / claim safety
   → атомарный commit
   → canonical коллекции Life Architect
```

**Ядро provider-neutral.** Приложение полностью работает без Google, ChatGPT и
любого внешнего провайдера. От пользователя НЕ требуется Google Cloud project,
Client ID, включение API, credentials или developer-настройка.

- **Google Drive:** owner-mediated/ручной адаптер в текущем релизе;
  прямой OAuth-адаптер — **OPTIONAL / FUTURE PRODUCT ADAPTER**.
- **ChatGPT:** приём экспорта (у платформы нет API чтения истории чатов).
- **Ядро:** provider-neutral и production-ready.

Отсутствие встроенного Google OAuth **не является блокером** ни Phase A, ни
Phase B: приватная выгрузка владельца проходит owner-side коннектором,
превращается в `architect-external-work-v2`/feed и принимается этим же
универсальным мостом.

## 1. Каналы приёма (provenance-слой)

`EXT_CHANNEL_KINDS`: `manual_file`, `chatgpt_export`, `google_drive_export`,
`external_connector`, `other`.

`EXT_CHANNEL_ADAPTERS` — интерфейс канала-адаптера (концепт, без plugin-механики):
`read → normalize → canonical feed`. Сейчас у всех каналов `read: 'owner_mediated'`
(файл / вставка / готовая подача) и общий `normalize` (`extBridgeParseFeed`).
Будущий адаптер (например прямой Drive OAuth) приносит только свой `read`;
importer, canonical-модель и контракты не меняются.

## 2. Состояния источника (честные формулировки)

`EXT_SOURCE_STATUSES`: `ready` («источник настроен»), `refreshing` («идёт
разбор»), `preview_ready` («предпросмотр готов»), `source_unavailable`
(«источник недоступен»), `error_requires_user` («ошибка — нужно
вмешательство»), `disconnected` («отключён»).

Слово **«подключён»/«connected» не используется** — постоянного авторизованного
соединения с провайдером нет. Ошибка чтения НИКОГДА не показывается как «новых
данных нет»: источник переходит в `error_requires_user` с причиной.

## 3. Дескриптор источника

`externalConnections` (SCHEMA_VERSION 8 → 9, аддитивно):
`{ id, label, kind (канал), status, checkpoint { committedPackageHashes,
lastRefreshAt, lastError }, stats, container { kind, id, label } | null,
sourceStatusNote, privacyClass:'sensitive', sv, _u }`.

**Контейнер ≠ идентичность.** Идентификатор контейнера (file ID Google Drive,
архив экспорта ChatGPT, имя локального файла) хранится ТОЛЬКО как provenance.
Идентичность canonical-записи — всегда семантический `sourceId`:

- один `sourceId`, пришедший разными каналами → ОДНА запись (merged sourceRefs);
- один контейнер с разными `sourceId` → РАЗНЫЕ записи;
- одинаковый текст с разными `sourceId` → РАЗНЫЕ записи (text-dedup запрещён).

Обратная совместимость: `migrateRecordsOn` идемпотентно переводит значения
раннего черновика (`google_drive`→`google_drive_export`, `gpt_export`→
`chatgpt_export`, `connected`→`ready`, `syncing`→`refreshing`,
`permission_revoked`→`source_unavailable`) и добавляет `container: null`.

## 4. Feed и приём

`architect-external-work-feed-v1` — тонкая обёртка над **неизменёнными** v1
(9 типов) и v2 (14 типов): `{ format, container?, packages[≤50] }`. Одиночный
пакет принимается как feed из одного элемента. Новый write-протокол не
вводился, v2 не бампался.

## 5. FETCH / PREVIEW / COMMIT и атомарность

- **FETCH/PREVIEW** (`extBridgeRefresh`) — разбор + план на чистом клоне БД,
  ноль канонических мутаций.
- **COMMIT** (`extBridgeApply`) — **один подтверждённый feed = одна
  транзакция**: полный снимок canonical до применения; ошибка ЛЮБОГО пакета
  откатывает всё (записи, ledger `externalWorkSessions`, sourceRefs-merges,
  чекпойнт) byte-identical в памяти и в localStorage. Никаких partial import —
  пользователь исправляет данные и повторяет подачу целиком.
- **Чекпойнт** двигается ОДИН раз, после успешного commit всего feed.
- **Degraded**: commit прошёл, а чекпойнт не сохранился → НЕ full success:
  `{ok:false, degraded:true}` с честным сообщением, статус
  `error_requires_user`; повтор безопасен (ledger → 0 дублей), а apply
  догоняет чекпойнт по ledger (checkpoint recovery, включая stale cursor).

## 6. Claim safety (правило A7, full-set)

Текст с `textOrigin:'assistant_interpretation'` не может нести фактический
класс (`EXT_FACTUAL_CLAIMS`: `user_fact`, `external_event`, `practice_action`)
ни в primary `claimClass`, ни в любом слое `claimClasses[]` — отказ
fail-closed. Честная многослойность (например `symbolic_interpretation` +
`working_hypothesis`) проходит со всеми слоями.

## 7. Исчезновение источника ≠ удаление

`extConnDisconnect` / `extConnMarkUnavailable` / `extConnForget` не трогают
канонические записи. Forget = tombstone источника; импортированные данные
остаются с provenance.

## 8. UI (обычный пользователь, без техножаргона)

Экран «Импорт данных из внешних источников»: список источников с честным
статусом → «Выбрать файл» / «Вставить данные» → предпросмотр человеческим
языком (Новых записей / Уже существуют / Будут объединены источники /
Конфликты / Отклонено) → **обязательное подтверждение** → импорт.
Выбор файла при выбранном источнике идёт через мост; разовая техническая
проверка пакета (путь Волны 6) сохранена, но убрана в раскрывающийся блок
«для продвинутых», чтобы обычный путь был один.
Технические детали (формат, sourceId/sourceRefs/claimClasses, чекпойнт) — в
раскрывающемся блоке «Подробности для продвинутых». Поддерживаемые источники
перечислены словами: экспорт ChatGPT · подготовленные данные Google Drive ·
JSON Архитектора · другие совместимые источники.

Учётные данные провайдеров (token/OAuth/credential) не хранятся и не
запрашиваются; сеть в ядре моста не используется вовсе.

## 9. Тесты

- `tests/finalA-bridge.spec.mjs` — **91 проверка**: схема v9 и неизменность
  v1/v2; жизненный цикл источника; malformed feed fail-closed; первый импорт;
  checkpoint-after-commit; инкремент/replay/stale-cursor/checkpoint-recovery;
  same-text ≠ дубль; interrupted transaction; атомарный откат всего feed
  (good A + merge M + failing B + good C, включая persisted-состояние);
  degraded checkpoint + replay + recovery; claim safety (primary, multi-claim
  adversarial, external_event/practice_action, честная многослойность);
  **provider-neutral: один sourceId через Drive/ChatGPT/файл → одна запись;
  один контейнер с двумя sourceId → две записи; контейнер не попадает в
  identity**; отсутствие Google/OAuth-эндпоинтов и учётных данных; честный UI
  (нет «подключён», человеческий предпросмотр, обязательное подтверждение,
  до подтверждения — ноль мутаций, выбор файла идёт через мост, техтермины
  только в блоке «для продвинутых»); disappearance≠delete; изоляция профилей +
  recovery lock; XSS; privacy canary; network = 0; JS errors = 0.
- `tests/finalA-mutation.mjs` — **17 мутаций**, каждая роняет ровно свой
  сценарий: feed-rollback-removed, commit-failure-ignored,
  cursor-advanced-on-failed-feed, checkpoint-persist-ignored,
  claim-promotion-allowed, claim-promotion-primary-only,
  noop-swallows-conflicts, ledger-skip-removed, checkpoint-catchup-removed,
  error-hidden-as-ready, unavailable-deletes-canonical,
  forget-deletes-canonical, text-dedup-introduced, provenance-dropped,
  **channel-identity-override**, **container-becomes-identity**,
  profile-isolation-broken.
- `tests/finalA-backup-roundtrip.test.mjs` — 10 проверок: источники,
  чекпойнт и контейнеры через зашифрованную копию byte-identical; в envelope
  нет открытых меток/hash/sourceId/контейнеров; wrong password и повреждённый
  файл → ноль мутаций.
- Сюиты Волн 6/7/8/9 не ослаблялись; все включены в `npm test` /
  `npm run test:backup`.

## 10. Известные ограничения

- Прямого сетевого чтения провайдеров нет (осознанно): данные приносит
  владелец файлом/вставкой или внешний доверенный коннектор готовым feed.
  Прямой Google Drive OAuth-адаптер — optional/future и может быть добавлен
  поверх этого моста без изменения canonical-модели.
- ChatGPT-история читается только экспортом — ограничение платформы OpenAI.
- Feed ≤ 50 пакетов за подачу; большие объёмы — несколькими подачами.
- `committedPackageHashes` ограничен 200: выпавшие из окна пакеты ловятся
  ledger'ом (тест stale cursor).

## 11. Rollback

Один revert-commit возвращает MAIN к `76d0b90`. Схема аддитивна (v8 → v9:
пустой `externalConnections` + правило A7); данные v8 читаются без потерь;
старый код игнорирует новую коллекцию.
