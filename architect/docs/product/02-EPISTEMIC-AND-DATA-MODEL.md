# 02 — EPISTEMIC AND DATA MODEL

> Норматив о том, как различать факт / самоотчёт / гипотезу / вывод и как это лечь на существующее localStorage-хранилище **без разрушительной миграции**. Reference: `life-architect-v2/03-EPISTEMIC-DATA-CONTRACTS.md` (закрытый PR #40). Схема в runtime **не внедряется** этой задачей.

## 1. Базовое правило

Тип данных определяется **способом получения и проверки**, а не тем, насколько уверенно звучит. LLM-гипотеза ≠ факт ≠ результат валидированного опросника ≠ диагноз ≠ причинный вывод.

Каждая v2-сущность несёт общую обёртку:
`id, profileId, createdAt, updatedAt, schemaVersion, source, provenance, privacyClass, verificationStatus` + история коррекций.

## 2. Шестнадцать классов и приоритет ввода

| # | Класс | Что это | Нужен в ближайшей версии | Комментарий |
|---|---|---|---|---|
| 1 | RawObservation | сырой ввод/сенсор/лог | **да** | базис для momentary/симптомов |
| 2 | UserSelfReport | слова/оценки пользователя | **да** | правда о сообщённом, не о причине |
| 3 | ImportedEvidence | копия внешнего документа (immutable) | да (для health) | оригинал сохраняется |
| 4 | BehavioralEvent | операционализированное действие | да (для «Зачем?»/readiness) | пропуск ≠ избегание |
| 5 | ContextObservation | сон/нагрузка/место/ресурсы | да | missing ≠ отсутствие |
| 6 | LLMExtractedHypothesis | гипотеза ИИ | **да** | evidence spans, alternatives, expiry, confirmation |
| 7 | ValidatedQuestionnaireResult | результат конкретного инструмента | отложить | LLM не имитирует этот класс |
| 8 | DerivedFeature | пересчитываемое вычисление | да (позже) | правка входа → invalidate downstream |
| 9 | DescriptiveState | сводка окна без прогноза | **да** | безопасный «сейчас» |
| 10 | DetectedTrend | формальная модель тренда | отложить | assumptions/fit/uncertainty/null |
| 11 | DetectedChangepoint | ретроспективный кандидат изменения | отложить | не «прорыв судьбы» |
| 12 | ScenarioHypothesis | «если условия сохранятся» | отложить | альтернативы + триггеры инвалидции |
| 13 | PredictionEstimate | прогноз при approved-модели | **нет** (gate) | только `modelValidationStatus=approved` |
| 14 | CausalEffectEstimate | причинный эффект | **нет** (gate) | нужен экспериментальный/quasi дизайн |
| 15 | SymbolicAstrologyAnnotation | расчёт+школа+символ | отложить (astro-домен) | не empirical predictor |
| 16 | LLMExplanation | презентационный артефакт | **да** | ссылается на IDs, не создаёт факты, regenerable |

**Минимальный набор для ближайших срезов:** 1, 2, 6, 9, 16 (+ 3/4/5 по мере доменов health/«Зачем?»). Классы 10–15 — отложены до стабильных данных и явных gate'ов.

## 3. Словарь уверенности (не называть вероятностью без вероятностной семантики)

`unverified · user_confirmed · source_confirmed · observational · repeated_personal_pattern · model_supported · validated_for_use`. Число 0–1 — не вероятность, если нет вероятностной модели.

## 4. Correction / invalidation / recompute

```text
immutable original
  + correction event(s)   (append-only)
  + accepted current projection
  + invalidation graph
  + recalculated derived outputs
```

- **Оригинал не мутируется.** Исправление — новое событие коррекции; «текущее принятое» — проекция.
- Правка входа **инвалидирует** зависимые DerivedFeature/DescriptiveState → пересчёт.
- Удаление пользователем удаляет current projection (и по policy — source blob); аудит хранит только минимальный неидентифицирующий факт удаления, если юридически допустимо.

## 5. Отображение на существующее хранилище (без слома)

Реальность на `MAIN`: записи несут `id, createdAt, day, sv (SCHEMA_VERSION=2), _u`; merge — CRDT-подобное объединение по `id`, скаляры по `__ts`; удаление — tombstones `_del` (`app.js:50–51,78`). Формального versioned-migration framework нет (`09` §4).

**Стратегия ввода эпистемики — строго аддитивная:**

1. **Не переименовывать и не пересобирать** существующие коллекции. Новые сущности — новые коллекции/поля.
2. **Эпистемическая обёртка — опциональные поля** поверх записи: `source`, `provenance`, `privacyClass`, `verificationStatus`, `schemaVersion` (уже есть `sv`). Старые записи без них читаются как `verificationStatus=unverified`.
3. **Append-only correction** реализуется как коллекция correction-событий, ссылающихся на `id` оригинала; текущая проекция вычисляется при чтении. Существующий `_u`-merge не ломается.
4. **DerivedFeature/DescriptiveState** — вычисляемые, не хранят истину; при правке входа помечаются stale и пересчитываются (аналогично тому, как `smartInsights` пересобирается).
5. **schemaVersion bump** — только идемпотентная, обратно совместимая, протестированная на synthetic fixtures миграция (правило `03` §A). `migrateRecords()` (`app.js:249`) — существующий безопасный образец (backfill без потери).

Детали совместимости и порядок — в `06-MIGRATION-AND-COMPATIBILITY.md`.

## 6. Границы (кратко; полностью — `03`)

LLM может создавать только `LLMExtractedHypothesis` / `LLMExplanation` с обязательными evidence spans, alternatives, model/prompt version, confidence class, expiry и подтверждением пользователя. Прямое преобразование гипотезы в score или в диагноз — запрещено.
