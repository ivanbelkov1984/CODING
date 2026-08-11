# FINAL A — Continuous GPT / Google Drive Bridge: implementation contract

Реализация `FINAL_BRIDGE_CONTRACT.md` (Phase A мастер-программы завершения).
Base: MAIN `76d0b90`. Ветка: `claude/phase-a-continuous-bridge`, Draft PR #169,
tracking issue #168. Merge только по независимой приёмке владельца.

> **СТАТУС: Phase A НЕ объявлена завершённой.** Реализовано ядро моста
> (инкрементальный канал с чекпойнтом, атомарным apply и claim-safety), но
> требование контракта «authenticated Drive/GPT source discovery/read» имеет
> **архитектурный блокер, требующий решения владельца** — см. раздел
> «BLOCKER: authenticated intake» ниже. Ручной файл/вставка НЕ выдаётся за
> живое авторизованное подключение (статус в UI: «канал активен (приём
> вручную)»).

---

## BLOCKER: authenticated intake требует owner-provisioned контракта

Повторный аудит текущей архитектуры (backend/server.js, backend/astro_batch.js,
frontend AI-маршрутизация, GitHub Pages static build) дал следующие факты:

**Что есть сейчас.** Backend — тонкий E2EE sync-store: Express + PostgreSQL,
4 endpoint'а `/api/space/*` (CRUD зашифрованных пространств по секретному
UUID-ключу), Web Push, feedback-лог и OpenAI Batch для астро-текстов (ключ
только в env). **Никакой** OAuth-инфраструктуры, хранения пользовательских
токенов, per-user auth или Google API-проксирования нет. Frontend — статический
GitHub Pages PWA без сервера.

**Google Drive.** Реальное авторизованное чтение Drive требует:

1. **OAuth 2.0 Client ID** — создаётся ТОЛЬКО владельцем в Google Cloud
   Console (проект, consent screen, scope `drive.readonly` или
   `drive.file`). Это owner-provisioned credential, который Claude не может
   и не должен создавать сам.
2. **Решение о хранении токенов.** Два безопасных варианта, оба — новый
   контракт:
   - **(а) Browser-only PKCE:** access token живёт только в памяти вкладки
     (НЕ в localStorage — это запрещено и владельцем, и threat-моделью
     приложения: localStorage открыт любому XSS). Без refresh token —
     Google не выдаёт его публичным SPA-клиентам надёжно; повторный вход
     при каждой сессии. «Continuous» получается только на время вкладки.
   - **(б) Backend token broker:** confidential client (client_secret в
     env backend'а), таблица refresh-токенов с шифрованием at rest, новые
     endpoint'ы (auth-редирект, token exchange, revoke), продуманный
     доступ по существующему space-ключу. Это расширение backend'а с новой
     ответственностью (хранение доступа к личному Drive владельца) —
     существующий контракт backend'а («хранит только шифроблобы, не имеет
     доступа к содержимому») этим НАРУШАЕТСЯ и требует явного решения.
3. В обоих вариантах связь «authorization подключения» отделена от
   «canonical import» (норма уже заложена в модель: authorization меняет
   только статус `externalConnections`, импорт всегда идёт через
   FETCH → PREVIEW → COMMIT).

**GPT/ChatGPT.** У OpenAI **нет API для чтения истории чатов пользователя**
— ни авторизованного, ни какого-либо ещё. Единственный канал — ручной
экспорт (Settings → Data controls → Export). Для `gpt_export` файл/вставка —
объективный максимум, не временный компромисс.

**Вывод.** Безопасный authenticated intake из Google Drive объективно
невозможен в текущей архитектуре без owner-provisioned credential (вариант а)
или нового backend-контракта (вариант б). По указанию владельца: Phase A
не объявляется complete; требуется owner architecture decision —
**вариант (а), вариант (б) или осознанное принятие owner-mediated канала**.
До решения ingestion остаётся owner-controlled (файл/вставка), и UI честно
называет его ручным.

---

## 1. Реализованная архитектура (ядро моста)

Поверх **нетронутой** машинерии импорта Волн 6–7 (`extParsePackage` /
`extBuildPlan` / `extCommitPlan`; форматы v1 — 9 типов, v2 — 14 типов не
изменены):

1. **Именованные подключения** — коллекция `externalConnections`
   (SCHEMA_VERSION 8 → 9, аддитивно): `{ id, label, kind
   (google_drive|gpt_export|other), status, checkpoint, stats,
   sourceStatusNote, privacyClass:'sensitive', sv, _u }`.
2. **Модель состояний** — машинные значения `connected | syncing |
   error_requires_user | permission_revoked | disconnected` (по контракту).
   Пока authenticated intake не реализован, `connected` отображается как
   «канал активен (приём вручную)» — интерфейс не притворяется живым
   коннектором. Ошибка разбора/чтения НИКОГДА не маскируется под «новых
   данных нет»: статус `error_requires_user` + причина в
   `checkpoint.lastError`.
3. **Инкрементальный детерминированный курсор** —
   `checkpoint.committedPackageHashes` (bounded, последние 200).
4. **Feed-обёртка** `architect-external-work-feed-v1` (≤50 пакетов) поверх
   неизменённых v1/v2; одиночный пакет принимается как feed из одного.
   v2 не бампался: существующего контракта достаточно, новый
   write-протокол не вводился.

## 2. FETCH / PREVIEW / COMMIT + атомарность feed

- **FETCH/PREVIEW** — `extBridgeRefresh`: разбор + per-package `extBuildPlan`
  на чистом клоне БД, ноль канонических мутаций.
- **COMMIT** — `extBridgeApply`: пользователь видит ОДИН preview и жмёт ОДНУ
  кнопку, поэтому **весь previewed feed — одна транзакция**. Перед
  применением снимается полный снимок canonical состояния
  (`extBridgeRestoreFeedSnapshot`); ошибка ЛЮБОГО пакета (конфликт, сбой
  persist) откатывает ВСЁ — записи, ledger `externalWorkSessions`,
  sourceRefs-merges, чекпойнт — byte-identical к состоянию до Apply, и в
  памяти, и в localStorage. Никаких partial import. Пользователь исправляет
  feed и повторяет его целиком.
- **Чекпойнт двигается ОДИН раз** — после успешного commit всего feed.
  Порядок cursor-after-commit закреплён мутациями
  (`cursor-advanced-on-failed-feed`, `feed-rollback-removed`,
  `commit-failure-ignored`).

## 3. Checkpoint persistence: честное degraded-состояние

Если canonical пакеты применены и сохранены, а сохранение чекпойнта
отказало, apply НЕ отчитывается успехом: возвращает
`{ ok:false, degraded:true }` с явным сообщением («записи применены, но
контрольная точка не сохранена — повтори обновление: дубли исключены
журналом импорта»), подключение помечается `error_requires_user`.
Replay безопасен: ledger даёт 0 дублей, а apply **догоняет чекпойнт** по
ledger (пакеты, известные ledger'у, но не чекпойнту, добавляются в чекпойнт
без повторного commit). Закреплено мутациями `checkpoint-persist-ignored`
и `checkpoint-catchup-removed`. Крэш между commit и чекпойнтом безопасен
той же парой механизмов; устаревший/потерянный курсор — тоже.

## 4. Noop-пакеты

Пакет, где всё уже импортировано (нет новых записей/связей/addRefs-merge) И
нет проблем (conflict/invalid/unsupported/unresolvedRefs) — честный noop:
хэш попадает в чекпойнт вместе со всем feed, commit не вызывается. Пакет с
конфликтом обязан пройти через commit и честно упасть
(мутация `noop-swallows-conflicts`).

## 5. Идентичность и дедупликация (без изменений, подтверждено тестами)

- Семантический `sourceId` = идентичность; module/chat/session/batch =
  provenance. Тот же sourceId другим маршрутом → ОДНА запись, merged
  sourceRefs/aliases.
- Одинаковый текст + разные sourceId → ДВЕ записи. **Text-dedup запрещён**
  (мутация `text-dedup-introduced`).

## 6. Claim safety — правило A7 (full-set)

В `extParsePackage`: текст с `textOrigin:'assistant_interpretation'` не может
нести фактический класс (`EXT_FACTUAL_CLAIMS = user_fact, external_event,
practice_action`) **ни в primary `claimClass`, ни в любом слое
`claimClasses[]`** — отклоняется fail-closed. Честная многослойность без
фактических классов (например symbolic_interpretation + working_hypothesis)
проходит со всеми слоями. Закреплено мутациями `claim-promotion-allowed`
(полное снятие) и `claim-promotion-primary-only` (откат к primary-only).

## 7. Исчезновение источника ≠ удаление

`extConnMarkRevoked` / `extConnDisconnect` / `extConnForget` не трогают
канонические записи. Forget = tombstone подключения + удаление только самой
записи подключения. Мутации `revoke-deletes-canonical`,
`forget-deletes-canonical`.

## 8. Управление пользователем (UI, ov-ext-import)

Подключить (label+kind) → Обновить (файл/вставка) → Предпросмотр →
Применить / Отмена → Отключить / Переподключить / Забыть. Ошибка отката и
degraded-состояние показываются отдельными честными сообщениями. Все
операции transactional; write-lock восстановления уважается; labels
экранируются (XSS-тест). Никаких скрытых AI/network вызовов (0 запросов в
тестах).

## 9. Тесты

- `tests/finalA-bridge.spec.mjs` — 70 проверок: схема v9, lifecycle,
  malformed feed fail-closed, первый импорт, checkpoint-after-commit,
  инкремент/replay/stale-cursor/checkpoint-recovery, same-text ≠ дубль,
  interrupted transaction, **atomic feed (good A + merge M + failing B +
  good C → полный byte-identical откат в памяти и storage + повтор
  исправленного feed целиком)**, **commit-успех + checkpoint-сбой →
  degraded + replay 0 дублей + recovery**, claim safety (primary,
  multi-claim adversarial, external_event/practice_action, честная
  многослойность), disappearance≠delete, изоляция профилей + recovery
  lock, XSS, privacy canary, network=0, JS errors=0.
- `tests/finalA-mutation.mjs` — 15 мутаций (каждая роняет ровно свой
  сценарий): feed-rollback-removed, commit-failure-ignored,
  cursor-advanced-on-failed-feed, checkpoint-persist-ignored,
  claim-promotion-allowed, claim-promotion-primary-only,
  noop-swallows-conflicts, ledger-skip-removed, checkpoint-catchup-removed,
  error-hidden-as-connected, revoke-deletes-canonical,
  forget-deletes-canonical, text-dedup-introduced, provenance-dropped,
  profile-isolation-broken.
- `tests/finalA-backup-roundtrip.test.mjs` — 10 проверок: подключения +
  checkpoint через encrypted backup/restore byte-identical; в envelope нет
  labels/hashes/sourceId открытым текстом; wrong password/corrupt → ноль
  мутаций.
- Все сюиты включены в `npm test` / `npm run test:backup`. Wave 6/7/8/9
  сюиты не ослаблялись.

## 10. Известные ограничения

- Authenticated Drive intake — заблокирован до owner architecture decision
  (см. BLOCKER выше). ChatGPT-история читается только экспортом — ограничение
  платформы OpenAI, не этой реализации.
- Feed ≤50 пакетов за проход; большие объёмы — несколькими проходами.
- `committedPackageHashes` bounded (200): выпавшие из окна пакеты ловятся
  ledger'ом (тест stale cursor).
- При отказе хранилища в degraded-пути статус меняется best-effort в памяти
  (persist только что отказал); истинное состояние всегда восстановимо
  через ledger.

## 11. Rollback

Один revert-commit PR возвращает MAIN к `76d0b90`. Схема аддитивна
(v8 → v9: пустой `externalConnections` + правило A7 в parse); данные
пользователей v8 читаются без потерь; откат не разрушает существующие
записи (новая коллекция игнорируется старым кодом).
