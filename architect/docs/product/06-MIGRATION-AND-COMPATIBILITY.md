# 06 — MIGRATION AND COMPATIBILITY

> Как вводить v2-сущности и эпистемическую обёртку **без разрушительной миграции** существующего localStorage-хранилища. Ничего из этого не внедряется в runtime данной documentation-only задачей. Провенанс: `claude-handoff/03` §A, `09-REPOSITORY-AUDIT.md` §4, `life-architect-v2/14-MIGRATION-FROM-V1` (reference).

## 1. Реальная база хранилища (что нельзя сломать)

- Per-profile localStorage: `arch5_db_<id>`, `arch5_cfg_<id>`, `arch5_pass_<id>`, `arch5_rec_<id>`, `arch5_aikey_…`, `arch5_bak_<id>`, `arch5_snap_<id>_…`; реестр `arch5_profiles`, active `arch5_active` (`app.js:104` и далее).
- `DEFAULT_DB` коллекции + `_del` (tombstones) + `__ts` (`app.js:52–80`).
- Запись: `id, createdAt, day, sv (SCHEMA_VERSION=2, app.js:14), _u`.
- Merge: объединение по `id`, скаляры по `__ts`; удаление — `_del` (`app.js:50–51,78`).
- Медиа: глобальный IndexedDB `arch5_media` (`app.js:1161`).
- Загрузка/миграция: `hydrate()` (`app.js:181`), `migrateRecords()` (`app.js:249`) — идемпотентный backfill без потери (образец безопасной миграции).
- **Нет** формального versioned-migration framework (`09` §4) — вводить осторожно.

## 2. Правила совместимости (обязательные)

1. Никакая функция не удаляет/переименовывает/пересобирает существующие пользовательские данные молча (`03` §A).
2. Любая миграция: версионирована · идемпотентна · обратно совместима · протестирована на synthetic fixtures · с явным rollback либо доказательством ненужности reverse-миграции.
3. localStorage и IndexedDB — **не одна транзакция**; кросс-хранилищные операции требуют компенсирующего протокола (как в encrypted backup restore, PR #66).
4. Реальные данные — никогда в git/CI/fixtures.

## 3. Как ложатся v2-сущности (аддитивно)

| v2-сущность | Куда в существующем DB | Тип изменения |
|---|---|---|
| Эпистемическая обёртка (`provenance/verificationStatus/privacyClass/source`) | опциональные поля на существующих записях; `sv` уже есть | **аддитивное поле**, backfill `unverified` |
| RawObservation / UserSelfReport | частично покрыты `insights`/`vit`/`checkins`; новые — новая коллекция | **новая коллекция** |
| Momentary State | **новая коллекция** (не `vit`) | новая коллекция |
| LLMExtractedHypothesis / Explanation | новая коллекция гипотез/объяснений, ссылки на `id` | новая коллекция |
| Correction events (append-only) | **новая коллекция** correction-событий, ссылка на `id` оригинала | новая коллекция |
| ImportedEvidence (health) | новая коллекция + оригинал в IndexedDB (immutable) | новая коллекция + медиа |
| Medication* / Symptom / Measurement | новые коллекции (раздельные классы) | новые коллекции |
| SymbolicAstrologyAnnotation | новая коллекция, isolated | новая коллекция |
| DerivedFeature / DescriptiveState / Trend / Changepoint | **вычисляемые**, не хранят истину; кэш помечается stale | вычисление, не хранение |

**Ключевой принцип:** новое — в новых коллекциях/полях; старое читается как есть. Никаких переименований существующих коллекций `insights/dreams/patterns/…`.

## 4. Immutable original + append-only correction (как реализовать без слома)

```text
original record (id, immutable payload)
   └── correctionEvents[]  (append-only, ссылаются на id)
         └── accepted projection = original ⊕ corrections (вычисляется при чтении)
               └── invalidation: правка входа → зависимые DerivedFeature/DescriptiveState помечаются stale → пересчёт
```

- Оригинал не мутируется; правка — новое correction-событие.
- Текущее «принятое» — проекция (вычисляемая), совместима с существующим `_u`-merge (проекция считается поверх смёрженного состояния).
- Удаление: удаляет current projection (+ по policy source blob); tombstone `_del` уже существует и используется для распространения удаления.
- Пересчёт derived-значений — как уже делается для `smartInsights` (rebuild), но с явной пометкой инвалидции.

## 5. schemaVersion и порядок

- `SCHEMA_VERSION` bump — только при необходимости и только идемпотентной, обратно совместимой миграцией с synthetic-тестами.
- Порядок ввода (см. `product/04`): сначала эпистемическая обёртка (S1, backfill `unverified`), затем новые коллекции доменов (S2+). Обёртка не требует bump — опциональные поля.
- Обратная совместимость: старые записи без обёртки валидны (`verificationStatus=unverified`); старый backup-файл (PR #66) читается новыми версиями (envelope versioned, fail-closed).

## 6. Взаимодействие с sync/backup

- Encrypted portable backup (PR #66) уже сериализует DB/CFG + media; новые коллекции попадут в backup автоматически (они внутри `arch5_db_<id>`), но **каждый новый домен обязан** иметь focused backup-roundtrip тест (include/exclude, media, integrity).
- Device-local поля (`apiUrl/spaceKey/lastSync`) и секреты (`pass/rec/aikey`) остаются исключены из export (правило `03` §C, реализовано в backup).
- E2EE-sync не меняется; новые коллекции синкаются в составе зашифрованного бандла.

## 7. Rollback-дисциплина

Любой data-срез обязан иметь: snapshot до мутации, exact restore при ошибке (образец — transactional restore в backup PR #66), и доказанную обратную совместимость чтения старых данных. «Тест не запущен» ≠ «covered».

## 8. Что запрещено в миграциях

Разрушительное пересоздание коллекций; объединение localStorage+IndexedDB в одну транзакцию без компенсации; перенос кода из закрытых Codex-веток как production; копирование реальных health/diary примеров в fixtures; изменение крипто/медицинской логики/privacy boundary без отдельного контракта.
