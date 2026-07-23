# 08 — REGISTRIES (consent, purpose, flags, quarantine, models, terminology/licence, migration)

> **Статус: NORMATIVE_CURRENT.** Набор обязательных реестров, отсутствовавших в первой версии PR #67 (пробелы 1–7 из review). Реестры — это структуры данных/документа, к которым обязаны обращаться доменные фичи. В runtime внедряются на Этапе B (`product/04`), здесь — контракт.

## 1. Consent receipts (согласия) — пробел 1

Каждая операция, использующая чувствительные данные или внешний AI, создаёт **consent receipt**:
`id, purpose, dataScope (какие IDs/классы), grantedAt, expiresAt, revocable, channel (local|sync|ai-provider), version`.
- Передача любого фрагмента внешнему AI требует явного согласия с указанным `purpose` и `dataScope`.
- Health-фрагмент → **отдельное** согласие на каждую передачу AI (`product/12`).
- Отзыв согласия инвалидирует связанные производные (`product/07` §4).

## 2. Purpose limitation (ограничение цели) — пробел 2

Данные, собранные для цели X, не используются для несовместимой цели Y без нового согласия. Каждая запись несёт `purpose`; каждый consumer объявляет `requiredPurpose`; несовпадение → доступ запрещён. Астрология не используется как вход для readiness/prediction/health (жёстко, `product/03`).

## 3. Feature-flag registry — пробел 3

Единый реестр флагов: `flagKey, domain, default(false), owner, riskClass (low|medium|high), requiresOwnerApproval, requiresReviewGate, killSwitch`.
- Все новые домены — **за флагом**, по умолчанию выключены.
- High-risk домены (health clinical, astrology interpretation, prediction) — `requiresOwnerApproval=true` и `requiresReviewGate=true` (`product/14`).
- Kill-switch обязателен для любого домена, касающегося health/astrology/prediction/AI-synthesis.

## 4. Regulatory quarantine registry — пробел 4

Явный реестр функций, которые **запрещены** без owner-approved regulatory contract:
диагноз · выбор/изменение лечения · изменение дозировки · проверка взаимодействий · противопоказания · прогноз болезни · клинические критические оповещения.
- Каждая запись: `capability, status=QUARANTINED, reason, gate=REGULATORY_REVIEW_REQUIRED`.
- Intended purpose имеет юридическое значение (MDCG 2019-11 rev.1, см. `product/12`): дисклеймер «не медсовет» не выводит функцию из-под регулирования, если она фактически принимает медицинское решение.

## 5. Model / calculation / ruleset registry — пробел 5

Реестр всех моделей, расчётных движков и наборов правил: `id, kind (heuristic|stat-model|ephemeris|ruleset|llm-policy), version, validationStatus, inputs, boundsOfApplicability, changelog`.
- Пример существующего: `cravingRisk` — `kind=heuristic, validationStatus=personal_heuristic_not_validated` (`app.js:961`). Регистрируется как эвристика, **не** как prediction.
- Любой вычисленный результат ссылается на конкретную версию из реестра (`product/07` §5).

## 6. Terminology and licence registry — пробел 6

Реестр внешних данных/движков/текстов и их лицензий/прав: `asset, kind, licence, licenceStatus, cost, redistribution, gate`.
- Астрология: Swiss Ephemeris — `licenceStatus=LICENSE_REVIEW_REQUIRED` (AGPL vs Professional, `product/11`).
- Медицина: медикаментозные справочники/терминологии — только после явного лицензионного решения; FHIR-профили фиксируются (`product/12`).
- Астрологические интерпретационные тексты — с источником и правами использования (`product/11`).

## 7. Formal migration registry — пробел 7

Реестр всех миграций схемы: `migrationId, fromVersion, toVersion, idempotent, backwardCompatible, syntheticTestRef, rollback, appliedAt`.
- Дополняет существующий `SCHEMA_VERSION` (`app.js:14`) и `migrateRecords()` (`app.js:249`) формальным журналом.
- Правило (`03`§A): версионирована · идемпотентна · обратно совместима · протестирована на synthetic fixtures · с явным rollback либо доказательством ненужности reverse-миграции.

## 8. Как реестры связаны

`Evidence Kernel` (`product/07`) ссылается на: model/ruleset registry (версии), consent receipts (purpose/consent на записи), feature flags (доступность домена), migration registry (schemaVersion). Regulatory quarantine и licence registry — гейты, блокирующие включение соответствующих флагов до owner-approved review (`product/14`).
