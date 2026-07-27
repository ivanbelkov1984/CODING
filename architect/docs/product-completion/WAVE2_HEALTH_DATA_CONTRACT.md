# Wave 2 — Data Contract: «Здоровье как органайзер»

> issue [#150](https://github.com/ivanbelkov1984/CODING/issues/150), родитель [#145](https://github.com/ivanbelkov1984/CODING/issues/145).
> Реализовано поверх принятой Волны 1 (PR #149). Все изменения аддитивны.
> Существующие коллекции `meds`/`medIntakes`/`symptoms`/`measures`/`cravings` и их
> поля не переименовывались, не объединялись и не переписывались.

## 1. Не переизобретённые сущности

`meds` (план), `medIntakes` (факт приёма), `symptoms`, `measures`, `cravings` и
существующий «Отчёт врачу» остались как есть. Новый UI — слой поверх них:

- «Сегодня» читает `meds`/`medIntakes` напрямую (`medTakenOnDay`/`markMedTakenOnDay`)
  и пишет в `medIntakes` тем же классом записи (`kType:'medication_intake'`,
  `push`+`persist()`), что и существующий `logMedIntake()` — НЕ новая коллекция.
- «Дневник тела» (симптомы/измерения) не тронут.
- «Отчёт врачу» — тот же единственный `buildDoctorReport()`/`ov-doc-report`,
  расширенный, а не заменённый.

## 2. Новые коллекции

### `labObservations`

Лабораторный результат как личная запись пользователя — то, что указано в бланке.
Не диагноз, не оценка нормы/риска, не медицинская рекомендация.

```text
id                string   — namespaced 'lab:' + psyUid() (см. §4 — collision safety)
testName          string   — название показателя
valueText         string   — исходное значение как введено (без потери форматирования, напр. «120/80»)
valueNumber       number|null — ТОЛЬКО если valueText однозначно числовое (запятая→точка,
                               /^-?\d+(\.\d+)?$/); иначе null. Никогда не «подгоняется».
unit              string
referenceText     string   — референс лаборатории как введён пользователем (не пересчитывается)
collectedAt       string (YYYY-MM-DD или ISO)
resultedAt        string|null — не используется UI в этом PR, зарезервировано контрактом
laboratory        string
note              string
media             array    — id существующего media-store (см. §5), 0..N вложений
privacyClass      'sensitive'
createdAt         ISO-строка
day               YYYY-MM-DD
sv                4
_u                integer  — Date.now(), для sync-слияния (LWW)
```

### `healthDocuments`

Метаданные медицинского документа + вложения. Личный архив, не медицинский документ.

```text
id                string   — namespaced 'healthDoc:' + psyUid()
title             string
kind              'lab_report' | 'prescription' | 'discharge' | 'imaging' | 'doctor_note' | 'other'
documentDate      string (YYYY-MM-DD или ISO)
provider          string   — учреждение/врач
note              string
media             array    — id существующего media-store, 0..N вложений
privacyClass      'sensitive'
createdAt/day/sv/_u — как у labObservations
```

Редактирование обеих коллекций — через принятый в приложении безопасный путь:
прямая мутация найденной записи + `touch(rec)` (проставляет `_u`) + `persist()` —
тот же паттерн, что и `saveEdit()` у инсайтов. Evidence Kernel-коррекции
(`addCorrection`/`proj`) здесь не используются: это отдельный, уже существующий
паттерн для append-only workflow-статусов (напр. `actionDone` у «Зачем?» в Wave 1),
а не общий механизм редактирования полей.

## 3. Миграция (schema 3 → 4)

- `SCHEMA_VERSION` `3 → 4`.
- Инициализация — тот же `hydrate()`-спред (`{...DEFAULT_DB, ...db}`): старые
  профили без `labObservations`/`healthDocuments` получают `[]` из `DEFAULT_DB`,
  ничего не переписывая в уже сохранённых `meds`/`medIntakes`/`symptoms`/`measures`.
  Формальной пошаговой migration-функции не потребовалось — тот же паттерн, что
  и во всех предыдущих волнах.
- `migrateRecords()` теперь итерирует и по `labObservations`/`healthDocuments`
  (добавлены в `IDCOLS`) — безопасно, новые записи создаются с полными полями.
- Проверено тестом: pre-Wave-2 DB (sv=3, без новых полей) → `hydrate()` →
  `meds`/`medIntakes`/`symptoms`/`measures` byte-идентичны; новые коллекции
  инициализированы пустыми; повторный `migrateRecords()` не меняет DB.

## 4. Collision-safe id (тот же принцип, что и Wave 1, issue #148/#149)

`tomb(id)` пишет в один общий `DB._del` по сырому id; `mergeDB()`/`mergeById()`
применяет этот общий tombstone-набор одинаково ко всем коллекциям `IDCOLS`.
`labObservations`/`healthDocuments` поэтому используют namespaced строковые id
через уже существующий `psyUid(prefix)` (`app.js`, введён в Wave 1) —
`lab:...`/`healthDoc:...` структурно не могут численно совпасть с числовым
id любой другой коллекции (`meds`/`medIntakes`/`moments`/... остаются
`Date.now()`-числовыми и не затронуты). Общий `tomb()`/`mergeById()`/`mergeDB()`
не менялся — по прямому указанию issue №150 («не трогать глобальную Wave 5
tombstone-миграцию и общий рефакторинг legacy tombstones»).

Все UI-пути передают эти id как экранированную строку (`esc(id)`), никогда через
`parseInt()` — проверено тестами (`openLabDet`/`openDocDet`/rename-аналогов нет,
но detail/edit/delete кнопки везде цитируют id корректно).

## 5. Медиа (вложения)

Используется тот же production IndexedDB media-store (`arch5_media`,
`idbPut`/`idbGet`/`idbDel`, формат записи `{data, type, createdAt}`), что и у
фото инсайтов — никакой новой media-архитектуры. Отличие только в двух местах:

- Отдельный staging-массив в `STATE` (`labAddMedia`/`docAddMedia`), а не
  `STATE.addMedia` — чтобы форма лаборатории/документа не конфликтовала с формой
  инсайта.
- Поддержка произвольных файлов (не только изображений): изображения по-прежнему
  проходят через `compressImage()` (canvas, JPEG), а не-изображения (PDF и т.п.)
  читаются как есть через уже существующий `blobToDataURL()` — MIME берётся из
  самого файла и сохраняется в data URL, `type:'file'` (существующее
  предусмотренное производственным adapter'ом значение, см.
  `backup-adapter.mjs`'s `mediaTypeFor()`).

Удаление `labObservations`/`healthDocuments` НЕ удаляет media синхронно —
как и удаление инсайта не удаляет его фото. Осиротевшие media убирает уже
существующий generic `gcMedia()` (считает ссылки по `record.media` во ВСЕХ
коллекциях и ВСЕХ профилях, см. `collectDbMediaRefs()`), поэтому media,
на которую всё ещё ссылается другая запись (в т.ч. другая коллекция),
гарантированно переживает удаление одной ссылающейся записи. Подтверждено
тестом: удаление одного из двух документов, ссылающихся на одну media,
не удаляет blob; удаление обоих — удаляет.

## 6. Sync / backup / import-export покрытие

- `IDCOLS` расширен: `labObservations`, `healthDocuments` — id-merge
  (`mergeById`) с tombstone-семантикой, как и все коллекции-массивы.
- `dbCount()` включает обе новые коллекции.
- `REC_COLLS` («Мои записи») получил записи для обеих коллекций — id-safe
  через уже существующий `JSON.stringify(r.id)` в `recDel()` (не менялся).
- Обычный (plain) `exportData()`/`handleImport()` — не потребовал изменений:
  оба генерично сериализуют весь `DB`.
- Зашифрованный portable backup (`backup-core.mjs`/`backup-adapter.mjs`/
  `backup-restore.mjs`) — не потребовал изменений: `buildBundle()`/
  `collectMediaRefs()`/`rewriteRefs()` уже трактуют `DB` и `record.media`
  полностью генерично (без allowlist имён коллекций). Подтверждено тестом
  `tests/wave2-health-backup.test.mjs`: complete-режим несёт canonical
  media bytes/MIME; реальный production `restoreBackup()` (mode=new)
  восстанавливает `labObservations`/`healthDocuments` со string id И их
  media byte-в-byte с тем же MIME в целевой IndexedDB; wrong password и
  повреждённый (не-JSON) файл — fail closed, ноль мутаций существующего
  целевого профиля, ни осиротевшего профиля, ни частично записанной media.

## 7. «Сегодня»: план × факт за выбранный день

- `_healthDay` (module state) — выбранный день, по умолчанию `todayKey()`.
- `shiftDayKey(day, delta)` — day-арифметика по компонентам `YYYY-MM-DD` через
  `Date.UTC`, НЕ через `new Date(str).getDate()` (частый баг сдвига на день
  в отрицательных часовых поясах). Та же «локальная»/UTC-конвенция, что и у
  `todayKey()` и `day`-полей во всём приложении.
- `medTakenOnDay(medId, day)` / `markMedTakenOnDay(medId, day)` — бинарный
  статус «Принято / По плану, не отмечено» (НЕ «Пропущено» — у `medIntakes`
  нет такой семантики, придумывать её в этом PR запрещено issue №150).
  `markMedTakenOnDay` идемпотентен: повторный тап при уже существующем факте
  за этот день — no-op, не создаёт дубль. Это НЕ меняет и не трогает
  существующий `logMedIntake()` (тот обслуживает другой, уже работающий
  контракт — счётчик «сегодня: N ✓» в «Плане приёма», намеренно допускающий
  несколько приёмов в день).
- `openMedDetail(medId)` — деталь плана: название/доза + список фактов
  приёма за выбранный день с возможностью убрать ошибочную отметку
  (`deleteMedIntake` → тот же `delUndo`).

## 8. Лаборатория

CRUD (`openLabAdd`/`saveLab`/`deleteLab`/`openLabDet`), поиск по `testName`
(`healthLabSearch`), read-only тренд (`labTrendFor`) — строго тот же
`testName` + та же `unit`, только записи с однозначно числовым `valueNumber`;
никогда не смешивает единицы и не строится по нечисловым значениям
(«120/80», «гемолиз» и т.п. — исключены). Рядом всегда пометка «Личные
записи, не диагноз и не медицинская рекомендация».

## 9. Документы здоровья

CRUD (`openDocAdd`/`saveDoc`/`deleteDoc`/`openDocDet`), список с типом/датой/
учреждением, одно или несколько вложений, безопасное открытие (изображение —
`<img>`, файл — `<a href="data:..." target=_blank>`). Profile isolation и
media-безопасность — см. §5.

## 10. Единая хронология здоровья

`healthTimelineItems()` строит ВРЕМЕННЫЙ массив ссылок
`{kind, coll, id, at, text}` поверх `projAll('medIntakes'|'symptoms'|
'measures'|'labObservations'|'healthDocuments'|'cravings')` на каждый рендер —
НЕ копирует записи в новую коллекцию, оригиналы не мутируются (подтверждено
тестом: `JSON.stringify` исходных массивов до/после рендера идентичен).
Сортировка — по реальному времени события (`medIntakes.at`,
`labObservations.collectedAt`, `healthDocuments.documentDate`, иначе
`createdAt` — legacy fallback). Фильтр по типу (`healthTimelineFilter`) и
окну (`healthTimelineWindow`, по умолчанию 90 дней). Переход по записи
(`healthTimelineOpen`) открывает исходную деталь там, где она есть
(`labObservations`/`healthDocuments`/план препарата через `medIntakes`), иначе
безопасно ведёт на экран «Здоровье» (у `symptoms`/`measures`/`cravings` своих
detail-экранов нет — не создавали их в этом PR ради этого списка).

## 11. Отчёт врачу — расширение, не второй отчёт

Тот же единственный `buildDoctorReport(days)` / `ov-doc-report` / `shareDoctorReport()`.
Добавлено:

- Пользователь выбирает период (7/30/90/180 дней) через новые кнопки в
  существующем sheet (`setDoctorReportPeriod`) — тот же textarea, тот же
  share-путь.
- Раздел «ЛАБОРАТОРНЫЕ РЕЗУЛЬТАТЫ» — `testName`/`valueText`/`unit`/
  `referenceText`/`laboratory`/`collectedAt` за период.
- Раздел «ПРИЛОЖЕННЫЕ ДОКУМЕНТЫ» — только `title`/`kind`/`documentDate`/
  `provider`, БЕЗ media id и БЕЗ встраивания байтов вложений.

Строго исключено (проверено тестом на реальных значениях-приманках в
`CFG.apiUrl`/`CFG.spaceKey`/`DB.psyAiConsent`/`DB.astroBirth`): API-ключи,
`apiUrl`/`spaceKey`, sync-конфигурация, внутренние `_u`/`sv`/`privacyClass`/
tombstones, AI ledger, психологические (`psyAiConsent`) и астрологические
(дата/место рождения) данные, любые автоматически сгенерированные
диагнозы/рекомендации (текст `buildDoctorReport()` — чисто детерминированная
сборка сохранённых пользователем полей, никакого ИИ и интерпретации).

Границы периода — включительно (`(Date.parse(...) || 0) >= from`, где
`from = Date.now() - days*864e5`), тот же принцип, что и у уже существующих
разделов (лекарства/симптомы/измерения) — не менялся, только переиспользован
для новых разделов.

## 12. Privacy и безопасность

- `labObservations`/`healthDocuments` несут `privacyClass:'sensitive'`, как
  здоровье/психология/астрология.
- Никакого ИИ в этой волне — ни одного нового вызова `callClaude`/
  `AI_PROVIDERS`, ни AI-ассистента для здоровья.
- Никакой диагностики, схем лечения, дозировок, проверки взаимодействий,
  советов «отменить/начать препарат» — только буквально сохранённые
  пользователем факты. Значения никогда не помечаются «опасное»/«нормальное»/
  «патологическое» — только показ введённого референса лаборатории как есть.
- Здоровье не смешивается с астрологическими/символическими выводами
  (проверено тестом на отчёте врачу: `DB.astroBirth` не попадает в текст).
- Ничего не отправляется во внешнюю сеть — весь контур локальный/
  E2EE-синхронизируемый, как и остальные данные приложения.

## 13. Навигация

Никакого нового top-level раздела — весь контур целиком внутри уже
существующего экрана `pg-health` (`#health-out`, функция `rHealth()`),
новые под-секции («Сегодня», «Лаборатория», «Документы», «Хронология
здоровья») отрендерены в новые `<div>`-контейнеры внутри той же страницы,
без изменения `TITLES`/`goTo()`/`arch_nav_v2`/хабов/таб-бара.

## 14. Известные ограничения (честно, не скрыто)

- **`resultedAt`** у `labObservations` зарезервирован контрактом, но не
  используется в текущем UI (нет отдельного поля ввода) — сама лаборатория
  обычно указывает единственную дату, различие «забор vs результат»
  оставлено для будущей волны, если появится реальная необходимость.
- **`symptoms`/`measures`/`cravings`** не получили собственных detail-экранов
  в этой волне — хронология безопасно ведёт на общий экран «Здоровье» для
  этих типов вместо конкретной записи (те же ограничения, что и у Волны 1
  для `patterns`).
- **Хронология не пагинируется дальше первых 200 записей** окна (по
  умолчанию 90 дней) — достаточно для честного обзора, полный список
  каждого типа остаётся доступен через «Мои записи».
- **`kind` документа — фиксированный enum** (`lab_report`/`prescription`/
  `discharge`/`imaging`/`doctor_note`/`other`) без произвольных
  пользовательских типов — сознательный минимальный выбор, чтобы не плодить
  свободный текст там, где достаточно понятной категории.
- Известный баг синка `astroTexts`/`astroAiConsent`/`astroRectify` (найден в
  Волне 0) остаётся для Волны 5, не тронут здесь — как и в Волне 1.
