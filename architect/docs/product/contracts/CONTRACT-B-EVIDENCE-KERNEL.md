# TASK CONTRACT — Этап B: Evidence & Model Kernel (first runtime slice)

> **Статус: READY_FOR_OWNER_GO.** Готовый к запуску контракт. Реализация начинается ТОЛЬКО после явного «go» Ивана. `riskClass=medium` (изменение ядра данных) → перед merge обязателен independent diff-review (`product/14`). Documentation-only до «go».

## 1. Цель (user outcome)

Каждая запись приложения несёт минимальный «паспорт» (provenance/verification/versioning), исправления не стирают оригинал (append-only correction), а зависимые вычисления пересчитываются при правке входа. Пользователь позже видит источник и статус любого вывода; система перестаёт смешивать факт / догадку ИИ / расчёт.

Это фундамент для всех доменов (`product/07`). Без пользовательской «фичи» в этом срезе — только ядро + один видимый бейдж источника на детали инсайта как доказательство.

## 2. Scope (что делаем)

1. **Record envelope (аддитивные опциональные поля)** на записи существующих коллекций и новых: `knowledgeType, occurredAt, recordedAt, timezone, source, sourceVersion, verificationStatus, privacyClass, purpose, consentScope, originalRef, inputDeps, modelVersion, ruleSetVersion, catalogVersion, lifecycle, recomputable, deletePolicy, exportPolicy` (`product/07` §2). Все опциональны; отсутствие = дефолт (`unverified/current`).
2. **Идемпотентный backfill** старых записей: проставить `verificationStatus='unverified'`, `lifecycle='current'`, `recordedAt=createdAt` там, где нет — по образцу `migrateRecords()` (`app.js:249`), без потери/переименования.
3. **Коллекция corrections (append-only):** новая коллекция `corrections` в `DEFAULT_DB` — `{id, targetId, field, oldValue, newValue, reason, at}`; проекция «текущее принятое» вычисляется при чтении. Оригинал не мутируется.
4. **Dependency graph + invalidation (пилот):** для ОДНОГО вычисляемого поля (кандидат — агрегат по инсайтам или `cravingRisk` вход) реализовать: правка входа → `lifecycle='stale'` → пересчёт → `current`; несовместимая версия модели → `invalidated`. Регистрация версии из реестра моделей (`product/08` §5).
5. **Реестр моделей (минимальный):** зафиксировать `cravingRisk` как `heuristic / personal_heuristic_not_validated` (`product/08`§5, `product/10`).
6. **Feature flag** `flag_evidence_kernel` (default off) + kill-switch (`product/08` §3).
7. **Один видимый бейдж** источника/статуса на экране детали инсайта (доказательство, что паспорт читается в UI).

## 3. Non-goals (в этом срезе НЕ делаем)

Momentary State, «Зачем?», health, astrology, prediction, PDRE, AI validator framework (это Этап C), encrypted vault (Этап C), UI-редизайн, смена nav/IA, любые сетевые/крипто-изменения, изменение sync-протокола.

## 4. Затрагиваемые файлы

- `architect/app.js` — аддитивные поля в записи; `DEFAULT_DB.corrections`; helper'ы `wrapRecord()/applyCorrections()/projectRecord()`; invalidation для одного поля; регистрация модели; бейдж-рендер в детали.
- `architect/index.html` — минимальный бейдж-контейнер в overlay детали инсайта.
- `architect/styles.css` — стиль бейджа (в системе токенов).
- `architect/build.mjs` / `sw.js` — **не меняем** (ядро — чистый JS внутри app.js; если понадобится отдельный модуль — инлайнить как в backup).
- `architect/tests/` — новый focused test `tests/kernel.test.mjs` (или расширить существующий) через production-функции/DI.
- `architect/docs/product/08-REGISTRIES.md` — запись в migration registry.

## 5. Данные и миграция

- Новые поля/коллекция — **аддитивные**; старые коллекции `insights/dreams/...` не переименовываются.
- `SCHEMA_VERSION` bump на 3 **только** с идемпотентной обратно совместимой миграцией (backfill), зарегистрированной в migration registry (`product/08` §7), с synthetic-тестом и rollback.
- Backup/sync: новые коллекции внутри `arch5_db_<id>` попадают в backup автоматически — **обязателен** backup-roundtrip тест (include/exclude, media, integrity) на synthetic данных.
- localStorage↔IndexedDB не объединяем в одну транзакцию.

## 6. Privacy / safety

- Без новых внешних вызовов и без изменения крипто/sync. `privacyClass` — поле-метка, sensitive-хранилище будет в Этапе C.
- Synthetic-only в тестах; реальные данные — никогда в git/CI/fixtures.

## 7. Rollback

- Всё за флагом `flag_evidence_kernel` (off по умолчанию) + kill-switch.
- Поля опциональны; при откате чтение старых/новых данных не ломается.
- Миграция обратно совместима; при сбое — snapshot-and-restore (образец — transactional restore backup PR #66); частичное состояние не активируется.

## 8. Focused tests (обязательно, production-модуль/DI, не дубль логики)

1. roundtrip старых записей без паспорта → читаются как `unverified/current`.
2. backfill идемпотентен (двойной прогон = тот же результат).
3. correction: оригинал не мутируется; проекция = original ⊕ corrections.
4. invalidation: правка входа → зависимое поле `stale` → пересчёт → `current`; несовместимая версия → `invalidated`.
5. backup roundtrip с новыми коллекциями (include/exclude, integrity).
6. migration registry заполнен; `SCHEMA_VERSION` bump обратно совместим.

## 9. Browser evidence (Chromium + WebKit; BLOCKED ≠ PASS)

- Загрузка приложения с флагом on; создание/правка записи; бейдж источника виден; правка входа → пересчёт; reload → персистентность; offline reload.
- Артефакты в CI (как backup-evidence.yml), Chromium полный reload обязателен; WebKit — cache presence + сценарии, offline reload BLOCKED_ENGINE_LIMITATION допустим.

## 10. Mobile acceptance

- Флаг переключается из настроек; бейдж читаем на iPhone; правка/пересчёт работают на телефоне; старые данные видны без потерь.

## 11. Definition of Done

Все §8 тесты PASS · build+combined PASS · существующий E2E PASS · browser evidence Chromium+WebKit · offline reload · rollback проверен · миграция в реестре · синтетические данные · один PR · мобильная приёмка · явные non-goals.

## 12. Процесс / гейты

- Ветка от актуального MAIN: `claude/task-evidence-kernel` (одна активная task-ветка; PR #67 к этому моменту должен быть решён владельцем).
- `riskClass=medium` → **independent diff-review до merge** (ChatGPT/другой агент), затем owner «мержим».
- Claude может реализовать и довести CI до зелёного автономно; **merge — только по явному решению Ивана** после independent review (`product/14`).

## 13. Оценка

Один небольшой вертикальный срез. Реализация + тесты + evidence — за один рабочий проход; merge — после review/approval.
