# Wave 4 — Data Contract: «Unified Intelligence Engine» («Закономерности»)

> issue [#152](https://github.com/ivanbelkov1984/CODING/issues/152). Реализовано
> поверх принятых Волны 1 (PR #149) и Волны 2 (PR #151). Все изменения
> аддитивны. Существующие коллекции, их поля, `mergeDB()`, `IDCOLS`,
> tombstone-механизм, синк, медиа-хранилище, навигация и существующие экраны
> не переименовывались, не объединялись и не переписывались.

## 0. Что это НЕ

Явно по требованию issue №152, проверено тестами (`tests/wave4-unified-intelligence.spec.mjs`,
раздел 12 «AI/LLM отсутствует», см. §9 ниже):

- НЕ ИИ-чат, НЕ генератор советов. Ни одного вызова `callClaude`/`AI_PROVIDERS`
  в этой волне.
- НЕ сеть, НЕ облако. Весь расчёт — синхронный JS в браузере пользователя,
  над уже существующими локальными коллекциями.
- НЕ диагноз, НЕ психотерапия, НЕ эзотерика, НЕ медицинская рекомендация.
  Движок находит статистические совпадения в данных, которые пользователь
  сам туда занёс, — не интерпретирует их смысл и не советует действия.
- НЕ хранит вычисленные корреляции/паттерны. Единственное персистентное
  состояние Волны 4 — `DB.correlationSettings` (настройки + список скрытых
  сигнатур), см. §3. Сами закономерности пересчитываются заново при каждом
  открытии экрана — нет риска устаревшего вывода и нет отдельного
  source-of-truth, конкурирующего с исходными коллекциями.

## 1. Архитектурное решение: 11 требований — 1 движок, не 11 движков

issue №152 перечисляет 11 подсистем (Unified Event Engine, Correlation
Engine, Trigger Engine, Pattern Engine, Cause Graph, Sphere Influence,
Timeline Correlations, Statistics Engine, Insight Generator, Relationship
Graph, Confidence System). Реализация сознательно не создаёт 11 отдельных
расчётов — большинство являются **представлениями (views) поверх одного
Correlation Engine**, а не независимой логикой:

| # | Требование | Реализация |
|---|---|---|
| 1 | Unified Event Engine | `unifiedEvents(days)` — единственный агрегатор (§2) |
| 2 | Correlation Engine | `findCorrelations(events, opts)` — единственный расчёт (§4) |
| 3 | Trigger Engine | `triggersFor(pairs, tag)` — фильтр результата Correlation Engine (§7) |
| 4 | Pattern Engine | `findRecurringSequences(events, opts)` — отдельный n-gram-расчёт по дням (§8), т.к. ищет многодневные СЕКВЕНЦИИ, а не парные связи |
| 5 | Cause Graph | `buildCauseChains(pairs, opts)` — жадный обход рёбер Correlation Engine (§9), НЕ новый расчёт |
| 6 | Sphere Influence | `sphereInfluencePairs(pairs)` — фильтр по префиксу `sphere:` (§10) |
| 7 | Timeline Correlations | экран «Закономерности», периоды 7/30/90/365 дней (§13) |
| 8 | Statistics Engine | `synthesisStats(events)` — независимые чистые подсчёты (§5) |
| 9 | Insight Generator | `correlationSentence(pair)` — шаблоны, не генеративный текст (§6) |
| 10 | Relationship Graph | `relationshipPairs(pairs)` — фильтр по префиксу `person:` (§10) |
| 11 | Confidence System | `correlationConfidence(pair)` — чистая функция от `{supportA, hits, lift}` (§4.2) |

Это задокументированное архитектурное решение, не срезание объёма: избегает
дублирования логики совпадений/статистики в 4+ местах и гарантирует, что
Cause Graph/Sphere Influence/Relationship Graph по построению никогда не
расходятся с основным Correlation Engine (одни и те же пороги, один и тот же
Confidence System).

## 2. Unified Event Engine — `unifiedEvents(days)` (`app.js:7435`)

Read-only агрегатор: на каждый вызов заново обходит `EVENT_SOURCES`
(`app.js:7387`) — по одному чистому мапперу `record → {tags[], importance,
sphereId?} | null` на источник — через уже существующий Evidence Kernel
`projAll(coll)` (Волна 1). **Не копирует записи, не пишет ничего в `DB`,
не создаёт новую коллекцию.** Источники (ровно те, что перечислены в issue
№152, кроме `astro` — Волна 3 ещё не реализована в этой ветке, см. §14):

```text
moments             emo:<normTrigger>, valence:high|mid|low, activation:high|mid|low
whys                symptom:<normTrigger>, need:<normTrigger>
insights            insight:<normTrigger(tag)>
patterns            pattern:<normTrigger(type)>
evolution           evolution:milestone
dreams              dream:<normTrigger(tone)> | dream:любой
medIntakes           med:принят (только status==='taken')
symptoms            symptom:<normTrigger(name)>
measures             measure:<normTrigger(name)>
cravings             craving:устоял|уступил (+ trigger:<normTrigger> если есть)
labObservations      lab:<normTrigger(testName)>
healthDocuments      doc:<normTrigger(kind)>
relationshipContexts  context:<normTrigger(label)> (только status !== 'archived')
sphereLogs            sphere:<normTrigger(name)>:done (только если habit выполнена ИЛИ сфера не habit-типа)
```

Каждое событие: `{id: coll+':'+refId, type, date, time, importance, tags[],
sphereId, sourceCollection, referenceId}`. `id` — синтетический, вычисляется
на лету, никогда не пишется в `DB` (не путать с id самой записи-источника).
`eventTimeOf(rec)` (`app.js:7430`) берёт первое найденное из
`at|collectedAt|documentDate|createdAt|(date+'T12:00:00.000Z')` — как и у
`healthTimelineItems()` (Волна 2).

`normTrigger()` — переиспользован существующий нормализатор свободного
текста (Волна 1), новый не писался.

`psyLinks` **не** трактуются как отдельные события (см. комментарий
`app.js:7425`): psyLink — это связь МЕЖДУ уже включёнными событиями
(`moments`/`whys`/`insights`/`patterns`, `RELATIONSHIP_LINKABLE_COLLS`,
`app.js:2547`), а не новый факт. Вместо этого `unifiedEvents()` обогащает
теги событий из этих 4 коллекций тегом `person:<normTrigger(label)>` через
уже существующий `relationshipContextOf()` (Волна 1) — так Relationship
Graph получает данные без двойного учёта. Perf-примечание: обогащение
короткозамкнуто (`hasPsyLinks`, `app.js:7443`), если `DB.psyLinks` пуст —
на 100k+ событий из `RELATIONSHIP_LINKABLE_COLLS` это заметно (см. §11).

## 3. Единственное новое персистентное состояние: `DB.correlationSettings`

```text
DB.correlationSettings = {
  minSamples: 3,     // минимум наблюдений, чтобы вывод вообще показывался
  lagDays: 7,         // ширина «окна следствия» в днях
  dismissed: [],       // string[] — сигнатуры скрытых пользователем пар ("a→b")
}
```

Это **скаляр**, не массив/не `IDCOLS`-коллекция — тот же паттерн, что и
`DB.env`/`DB.vit`/`DB.astroBirth`/`DB.psyAiConsent`. Сознательное решение:
единственное, что нужно хранить — настройки порогов и то, что пользователь
попросил скрыть; сами вычисленные закономерности **никогда** не
персистентны (см. §0) — значит, нет риска рассинхронизации store vs
источник, и нет отдельной таблицы, которую нужно было бы мигрировать при
изменении формулы Correlation Engine в будущем.

Т.к. это скаляр, а не `IDCOLS`-коллекция, у Волны 4 **нет поверхности
id-коллизий вообще** (в отличие от Волн 1/2, которым потребовался namespaced
`psyUid()` — здесь нет ни одного нового объекта со своим `id`).

`dismissed` хранит **сигнатуру** пары (`pairSignature(p) = p.a+'→'+p.b`,
`app.js:7539`), не id базы данных — потому что у самой пары нет
персистентного id (она не хранится). Сигнатура стабильна между пересчётами,
пока теги `a`/`b` не меняются.

## 4. Correlation Engine — `findCorrelations(events, opts)` (`app.js:7475`)

Association-rule подход (support/confidence/lift), детерминированный,
объяснимый, без ML/ИИ. Работает по агрегату **день→множество тегов**
(`dayToTags`), не по отдельным событиям напрямую — поэтому производительность
зависит от числа уникальных дней/тегов, а не от сырого числа событий (важно
для требования 100 000+ событий, см. §11).

- `support(A)` = количество отдельных дней, где встречается тег A.
- `windowHasTag(day, tagDaysSet)` — есть ли тег в окне `[day, day+lagDays]`
  включительно (`lagDays+1` дней).
- `confidence(A→B) = hits/support(A)`, где `hits` — число A-дней, для
  которых окно содержит B.
- `baseline(B)` — **та же самая** оконная метрика, посчитанная
  БЕЗУСЛОВНО по ВСЕМ календарным дням диапазона (не только дням с
  событиями): доля дней `d` во всём диапазоне, для которых `windowHasTag(d,
  B)` истинно. Кэшируется на тег (`baselineCache`), т.к. не зависит от `A`.
- `lift = confidence/baseline`.
- Пара выводится, только если `lift` отклоняется от 1× за порог (`< 0.77`
  или `> 1.3`, `app.js:7532`) И `hits >= minSamples`.

### 4.1 Найденный и исправленный статистический баг (до этого PR)

Первая версия использовала «наивный» `baseline = support(B)/totalDays`
(доля дней с B), а не оконную метрику. Это систематически завышало `lift`
для ЛЮБОЙ пары при `lagDays > 0` — просто из-за расширения окна confidence
относительно однодневного baseline, независимо от реальной связи A и B
(обнаружено тестом false-positive-avoidance на статистически независимых
случайных тегах: 72 «находки» из чистого шума). Исправлено переводом
`baseline(B)` на ту же оконную метрику, что и `confidence` (§4, выше) —
после фикса число ложных находок на том же синтетическом шуме упало
72 → 4, все — пограничные (`lift` 0.75–0.77, у самой границы порога), а не
систематическое искажение. См. `app.js:7503-7508` (комментарий в коде) и
тест «false-positive avoidance» в §12.

### 4.2 Confidence System — `correlationConfidence(pair)` (`app.js:7545`)

```text
n = min(supportA, hits)
strongLift = |ln(lift)| >= ln(2)   // ×2 или ÷2 от базовой частоты
n < 5              → «Низкая»  (независимо от силы lift)
n < 12 ИЛИ !strongLift → «Средняя»
иначе               → «Высокая»
```

Намеренно никогда не даёт «Высокая» на малой выборке, даже при экстремальном
`lift` — на `n < 5` экстремальные значения обычно шум, не сигнал.

## 5. Statistics Engine — `synthesisStats(events)` (`app.js:7554`)

Чистые подсчёты без статистических выводов: `totalEvents`, `activeDays`
(уникальные дни), `byType` (счётчик по `event.type`), `topTags` (топ-8 тегов
по частоте). Никакого ИИ — просто `Object`/`Set`-агрегация.

## 6. Insight Generator — `correlationSentence(pair)` (`app.js:7579`)

Шаблонный текст, НЕ генеративный ИИ: два фиксированных шаблона (для
`lift > 1` и `lift <= 1`), подставляющие только реальные посчитанные числа
(`confidenceStat`, `baseline`, `supportA`, `lagDays`) и человекочитаемые
подписи тегов (`tagLabel()`/`TAG_TYPE_LABELS`, `app.js:7565`). Выводится
ТОЛЬКО для уже статистически подтверждённых пар (прошедших порог
Correlation Engine) — никогда для недостаточных данных (см. §12, «честный
отказ»).

## 7. Trigger Engine — `triggersFor(pairs, targetTag)` / `topTriggerTargets(pairs, n)` (`app.js:7589`)

Фильтр результата Correlation Engine по стороне `b` (следствие), отсортированный
по убыванию `lift` — «что чаще всего предшествует X». `topTriggerTargets()`
выбирает целевые теги для блока UI из семейств `emo|craving|symptom|valence|
activation`. Отдельного расчёта нет — те же пары, тот же Confidence System.

## 8. Pattern Engine — `findRecurringSequences(events, opts)` (`app.js:7604`)

Единственная подсистема с собственным расчётом (не проекция), т.к. ищет
многодневные ПОВТОРЯЮЩИЕСЯ СЦЕНАРИИ, а не парные связи. Метод: «сигнатура
дня» — полный отсортированный набор тегов дня, склеенный в строку; скользящее
окно длиной `seqLen` (по умолчанию 3) дней; точное совпадение склеенных
сигнатур окна считается повтором. Дни без тегов исключают окно (не
считаются «пустым совпадением»). Выводится только если сценарий повторился
`>= minSamples` раз — честно молчит при единичном совпадении.

## 9. Cause Graph — `buildCauseChains(pairs, opts)` (`app.js:7628`)

Жадный обход графа: карта `tag → исходящие пары`, отсортированные по
убыванию `lift`; от каждого возможного тега-старта строится цепочка до
`maxDepth` (по умолчанию 4) шагов, на каждом шаге беря самую сильную ещё не
использованную связь, без повторного посещения тега. Цепочки короче 3 тегов
отбрасываются. **Не новый расчёт** — использует ровно те пары, что уже нашёл
Correlation Engine, поэтому Cause Graph никогда не противоречит
Correlations/Confidence System.

## 10. Sphere Influence / Relationship Graph — фильтры (`app.js:7652-7653`)

```js
sphereInfluencePairs(pairs)  = pairs.filter(p => p.a.startsWith('sphere:') || p.b.startsWith('sphere:'))
relationshipPairs(pairs)     = pairs.filter(p => p.a.startsWith('person:') || p.b.startsWith('person:'))
```

`sphere:` теги приходят из `sphereLogs` (§2), `person:` — из обогащения
`unifiedEvents()` через `relationshipContextOf()`/`psyLinks` (§2). Оба —
чистые фильтры уже посчитанных пар, ни одного дополнительного вычисления.

## 11. Производительность на 100 000+ событий

Индексация по «день × тег», а не по сырым событиям, ограничивает сложность
`findCorrelations()` числом уникальных дней/тегов диапазона (плюс кэш
`baselineOf`), а не числом событий напрямую. Измерено тестом (§12, раздел
20): 120 000 синтетических событий (30 000 записей × 4 коллекции) —
`unifiedEvents(365)` + `findCorrelations` + `findRecurringSequences` + полный
DOM-рендер экрана «Закономерности» укладываются в единицы сотен
миллисекунд (порог теста — `< 8000мс`, реально ~200мс на CI-окружении).
Дополнительная оптимизация: короткое замыкание `relationshipContextOf()`-
обогащения, когда `DB.psyLinks` пуст (`app.js:7443`) — частый случай для
профилей, ещё не пользовавшихся Волной 1.

`SYN_MAX_TAGS = 200` (`app.js:7474`) — fail-safe ограничение кардинальности
тегов (берутся 200 самых частых); при экстремально «рваных» свободных
текстовых значениях (напр. уникальный `emo` на каждую запись) редкие теги
всё равно почти никогда не проходят `minSamples`, так что это не теряет
реальные закономерности на практике.

## 12. Тесты (`tests/wave4-unified-intelligence.spec.mjs`, 53 проверки) + backup (`tests/wave4-backup-roundtrip.test.mjs`, 12 проверок)

Обязательные категории по issue №152, все покрыты:

- Миграция schema 4→5: точное посерийное сравнение с явно вычисленным
  baseline (тот же паттерн, что и Wave 2 fix, PR #151 дефект 5),
  идемпотентность повторного `migrateRecords()`.
- Unified Event Engine: корректность тегов по источникам, window-фильтрация,
  read-only (не мутирует исходные коллекции), стабильный синтетический id.
- Correlation Engine: точная математика на синтетическом входе
  (`supportA===10, hits===10, confidence===1.0, lift>1.3`).
- **False-positive avoidance**: 300 дней статистически НЕЗАВИСИМЫХ
  случайных тегов (seeded `mulberry32` PRNG — два независимых потока для
  emo/symptom, не модульная арифметика от одного индекса, которая была бы
  идеально периодической и создавала бы настоящую, хоть и искусственную,
  корреляцию). После фикса baseline (§4.1): ≤6 пограничных находок (ожидаемо
  при ~56 проверяемых упорядоченных парах — проблема множественных сравнений,
  плюс структурная слабая антикорреляция между категориальными значениями
  одного семейства в один день), все с `lift < 2.5` (`allWeak`).
- Честный отказ при недостатке данных (1-2 наблюдения): ноль
  корреляций/последовательностей/цепочек, UI показывает «недостаточно
  данных», не пустой экран и не выдуманный вывод.
- Confidence System: границы `n<5`→низкая (даже при экстремальном lift),
  `n<12` или слабый lift→средняя, иначе→высокая.
- Trigger Engine: фильтрация и сортировка по lift.
- Pattern Engine: находит повтор ровно с реальным числом повторений; честно
  не находит, если `minSamples` выше фактического числа повторов.
- Cause Graph: цепочка A→B→C→D строится из отдельных пар без пересчёта, в
  правильном причинно-следственном порядке.
- Sphere Influence: `sphere:...:done` тег + `sphereId` в событии + находка
  через тот же общий движок.
- Relationship Graph: `person:<label>` тег через реальные `psyLinks`/
  `relationshipContexts`/`createPsyLink()` (Волна 1) + находка через тот же
  движок.
- Dismiss/restore: `dismissCorrelation()`/`restoreDismissedCorrelations()`
  корректно скрывают/возвращают через `DB.correlationSettings.dismissed`.
- Детерминированность: два вызова `synthesisReport(90)` на одинаковом `DB`
  дают побайтово идентичный JSON.
- Profile isolation: `correlationSettings.dismissed` не течёт между
  профилями.
- Обычный (plain) export/import: `correlationSettings` восстанавливается
  полностью.
- Зашифрованный portable backup/restore (`tests/wave4-backup-roundtrip.test.mjs`,
  тот же production `backup-core.mjs`/`backup-adapter.mjs`/`backup-restore.mjs`,
  что и Волны 1/2): data-only и complete bundle несут `correlationSettings`
  byte-identical; encrypt→decrypt roundtrip не теряет `dismissed`; wrong
  password и повреждённый файл — fail closed, ноль мутаций существующего
  целевого профиля; реальный `restoreBackup()` (mode=new) восстанавливает
  `correlationSettings` полностью в свежий профиль.
- UI: реальные клики по кнопкам периода (7/30/90/365 дней), `aria-pressed`,
  кнопка «Назад» (`sysGo('patterns')` → `sysGo('overview')`).
- Offline reload: `correlationSettings` переживает перезагрузку без сети.
- Мобильные вьюпорты (iPhone SE/standard/Pro Max, iPad portrait): реальный
  `<button>`, tap-target ≥44×44, не выходит за экран; тёмная/светлая тема;
  клавиатурная активация (`Enter` на кнопке доказательства «Записи «…»»).
- Большой synthetic dataset: 120 000 событий, полный рендер (сбор +
  корреляция + последовательности + DOM) < 8000мс без ошибок.

Ни одного нового вызова `callClaude`/`AI_PROVIDERS` во всей волне — движок
целиком детерминированный и локальный, что подтверждено отсутствием таких
вызовов в новом коде (`app.js:7383-7770`) и отсутствием сетевых side-effects
в тестах (Playwright перехватывает `pageerror`, тесты идут по `file://`
без сервера).

## 13. UI — экран «Закономерности» (`sysGo('patterns')`)

Новый экран целиком внутри уже существующего `pg-sys` («Итоги») — тот же
паттерн, что и добавление под-разделов в Волнах 1/2 (внутри `mt-psy`/
`pg-health`). Существующий бинарный переключатель `sysGo('overview'|
'detail')` (`app.js:2986`) расширен до трёхпозиционного добавлением
`sysGo('patterns')`, переключающего новый `<div id="sys-patterns">`
(`index.html`) — рядом с существующими `#sys-overview`/`#sys-detail`.
`TITLES`/`goTo()`/`arch_nav_v2`/хабы/таб-бар не изменены. Кнопка входа —
новая строка `«Закономерности»` в существующем `#sys-overview` сразу после
кнопки «Подробный обзор».

Период (7/30/90/365 дней, `synGoDays(days)`, по умолчанию 90) — настоящие
кнопки с `aria-pressed`, тот же паттерн, что и timeline-фильтр Волны 2
(owner review, PR #151, дефект 3). Каждая найденная пара — карточка
(`pairRowHtml()`) с шаблонным текстом (§6), меткой уверенности (§4.2), и
тремя кнопками: «Записи «A»»/«Записи «B»» (`openSynEvidence(tag)` →
находит одно реальное событие с этим тегом → `openSourceRecord()` →
открывает существующий detail-экран источника — `openLabDet`/`openDocDet`/
`openMedDetail`/`showDet`/`openWhy`/`openMoment`, либо безопасный fallback
на `goTo('map'|'vit'|'sys')` для коллекций без отдельного detail-экрана) и
«Скрыть» (`dismissCorrelation()`). Кнопка «Показать скрытые (N)» появляется,
только если `dismissed.length > 0`.

## 14. Известные ограничения (честно, не скрыто)

- **Источник `astro`** (натальные/транзитные события) из списка issue №152
  в этой волне отсутствует — Волна 3 (интеграция астрологии) на момент
  реализации Волны 4 в этой ветке не найдена в коде (`astro`-специфичных
  коллекций/событий нет). `EVENT_SOURCES` спроектирован так, чтобы добавить
  источник `astro` позже АДДИТИВНО (ещё один ключ объекта), без изменения
  остального движка — но сам источник не добавлен, чтобы не выдумывать
  несуществующие данные.
- **`dismissed` хранит сигнатуру, не id.** Если пользователь изменит
  `minSamples`/`lagDays` так, что появится НОВАЯ пара с теми же тегами `a`/
  `b`, но иными числами, — она унаследует то же скрытое состояние (это
  осознанный выбор: скрытие относится к «этой связи», не к конкретному
  снимку чисел).
- **Pattern Engine ищет точные совпадения сигнатур дня**, не «похожие»
  сценарии — специально, чтобы не выдумывать сходство там, где его нет
  буквально; более мягкое (fuzzy) сопоставление сознательно не реализовано
  в этой волне.
- **`SYN_MAX_TAGS=200`** — см. §11, fail-safe для экстремально «рваных»
  свободнотекстовых значений; не должен возникать при обычном использовании.
- Известный баг синка `astroTexts`/`astroAiConsent`/`astroRectify` (найден в
  Волне 0) остаётся для будущей волны, не тронут здесь — как и в Волнах 1/2.

## 15. Sync / backup / import-export покрытие

`DB.correlationSettings` — скаляр, поэтому сливается через уже существующий
scalar-merge путь `mergeDB()` (список расширен: `app.js:8790`,
`['vit','chapters','oq','env','astroBirth','psyAiConsent',
'correlationSettings']`) — «последний писатель побеждает» по `DB.__ts`, тот
же принцип, что и у `DB.env`/`DB.vit`/`psyAiConsent`. Не входит в `IDCOLS`
(не массив записей) — id-merge/tombstone-логика к нему не относится и не
нуждается в изменении. Обычный (plain) `exportData()`/`handleImport()` не
потребовал изменений (генерично сериализуют весь `DB`). Зашифрованный
portable backup также не потребовал изменений в `backup-core.mjs`/
`backup-adapter.mjs`/`backup-restore.mjs` — `buildBundle()` копирует `db`
целиком за вычетом `DB_INTERNAL=['__ts']` и media-ссылок внутри
array-коллекций; скаляр `correlationSettings` под это исключение не
подпадает и проходит как есть. Подтверждено тестом
`tests/wave4-backup-roundtrip.test.mjs` (§12).
