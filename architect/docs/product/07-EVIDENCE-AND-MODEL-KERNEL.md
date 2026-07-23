# 07 — EVIDENCE AND MODEL KERNEL (cross-cutting foundation)

> **Статус: NORMATIVE_CURRENT.** Это самый важный архитектурный блокер проекта. Ни один тяжёлый домен (психика/здоровье/астрология/PDRE/prediction) не начинается в runtime до появления этого ядра. Провенанс: независимый architectural review (Иван/ChatGPT), `product/02`, `life-architect-v2/03` (reference).

## 1. Проблема

Сейчас записи в DB несут только `id, createdAt, day, sv, _u` (`app.js:52–80`). Общих сущностей доказательства, источника, согласия, модели и зависимостей в runtime **нет**. Без единого ядра неизбежно: AI-гипотеза выглядит как факт; медзапись смешивается с интерпретацией; астро-аннотация протекает в психологический вывод; после исправления входа старые выводы остаются действующими; невозможно понять версию расчёта; прогноз нельзя воспроизвести/опровергнуть.

Поэтому **общий Evidence and Model Kernel вводится ПЕРВЫМ** (Этап B в `product/04`), до любых доменных фич.

## 2. Обязательная обёртка записи (record envelope)

Каждая новая запись обязана нести минимум:

| Поле | Смысл |
|---|---|
| `knowledgeType` | наблюдение · самоотчёт · документ · LLM-гипотеза · вычисление · сценарий · символическая аннотация (16 классов, `product/02`) |
| `occurredAt` / `recordedAt` | когда событие произошло / когда записано |
| `timezone` | часовой пояс события (pinned, см. `product/11`) |
| `source` + `sourceVersion` | источник и его версия (инструмент/документ/модель/правило) |
| `verificationStatus` | `unverified · user_confirmed · source_confirmed · observational · repeated_personal_pattern · model_supported · validated_for_use` |
| `privacyClass` | класс приватности (обычный / sensitive / medical) |
| `purpose` + `consentScope` | цель использования и объём согласия (`product/08`, `09`) |
| `originalRef` | ссылка на immutable оригинал |
| `corrections[]` | append-only коррекции |
| `inputDeps[]` | входные зависимости (IDs) |
| `modelVersion` / `ruleSetVersion` / `catalogVersion` | версия алгоритма/модели/правил/справочника |
| `lifecycle` | `current · stale · invalidated` |
| `recomputable` | можно ли пересчитать |
| `deletePolicy` / `exportPolicy` | политика удаления и экспорта |

Старые записи без обёртки валидны и читаются как `verificationStatus=unverified`, `lifecycle=current`.

## 3. Модель коррекции

```text
immutable original
  + correction event(s)   (append-only, ссылаются на originalRef)
  + accepted current projection   (вычисляется при чтении)
  + invalidation graph   (по inputDeps)
  + recalculated derived outputs
```

- Оригинал **не мутируется**. Правка — новое correction-событие.
- «Текущее принятое» — проекция; совместима с существующим `_u`-merge (проекция считается поверх смёрженного состояния).
- Удаление удаляет current projection (+ по `deletePolicy` — source blob); tombstone `_del` (`app.js:78`) уже распространяет удаление в sync.

## 4. Dependency graph, invalidation, recompute

- `inputDeps[]` образуют направленный граф зависимостей вычислений.
- Правка/удаление входа → все зависимые `DerivedFeature/DescriptiveState/...` помечаются `lifecycle=stale` → пересчёт → `current`.
- Если пересчёт невозможен (изменилась `modelVersion`/`ruleSetVersion` несовместимо) → `lifecycle=invalidated`, результат не показывается как действующий.
- Пример существующего безопасного пересчёта: `smartInsights` пересобирается (`app.js:2753`) — но без явной пометки инвалидции; ядро добавляет её явно.

## 5. Версионирование моделей/правил

Любой вычисленный результат хранит версии всех входных моделей/правил/справочников (см. реестр `product/08`). Смена версии → результат либо пересчитывается, либо `invalidated`. Без этого прогноз/аннотация невоспроизводимы.

## 6. Что ядро даёт доменам

- Психика: AI-гипотеза = `knowledgeType=llm_hypothesis` с evidence spans, alternatives, expiry, confirmation; не может молча стать фактом/score.
- Здоровье: документ = immutable `originalRef`; извлечённые поля = отдельные записи с `verificationStatus`; в графики попадают только `source_confirmed`/`user_confirmed`.
- Астрология: аннотация несёт `ruleSetVersion`/`catalogVersion` и изолирована `privacyClass`/`purpose`.
- Prediction: уровни 4–5 требуют `modelVersion` с `validated_for_use`; иначе `prediction=null` (`product/10`).

## 7. Порядок ввода (аддитивно, без слома)

1. Ввести обёртку как **опциональные поля** (backfill `unverified/current`) — идемпотентно, обратно совместимо, synthetic-тесты, rollback (образец — `migrateRecords()` `app.js:249`).
2. Ввести коллекцию correction-событий (append-only).
3. Ввести dependency graph + invalidation для одного вычисляемого поля (пилот), затем расширять.
4. Каждый шаг — focused tests (production-модуль/DI) + backup/sync roundtrip + browser evidence + mobile.

## 8. Definition of Done ядра

Обёртка на новых записях · append-only corrections работают · один вычисляемый результат корректно инвалидируется и пересчитывается при правке входа · версии моделей/правил фиксируются · старые данные читаются без потерь · backup/sync roundtrip зелёный · rollback доказан. Только после этого — доменные фичи (D–H в `product/04`).
