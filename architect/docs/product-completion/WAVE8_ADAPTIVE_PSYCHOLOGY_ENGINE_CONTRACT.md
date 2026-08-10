# Wave 8 — Adaptive Psychology Engine

> issue [#163](https://github.com/ivanbelkov1984/CODING/issues/163) + OWNER
> ADDENDUM `5230792191` (научный журнал, минимальное участие пользователя) и
> `5230889736` (personal evidence + граница mind–body inference).
> База — свежий `MAIN` `6d50daea2aacfa4d4715eb2e6ad0748c861b9008` (merge Волны 7,
> PR #165). SHA перепроверен на remote перед созданием ветки.

Wave 8 строит поверх научного журнала Волны 7 **адаптивный персональный
движок**: что, вероятно, помогает этому пользователю, в каком контексте,
на каких данных и с какими ограничениями. Не диагностика, не замена
специалисту, не «AI-психолог».

## 1. Три уровня науки (не смешиваются)

| Уровень | Режим | Causal claim |
|---|---|---|
| A. Practice-based monitoring | default: эпизоды + наблюдения + review | никогда |
| B. EMA | event-based / scheduled / manual | никогда |
| C. N-of-1 | только по условиям допуска | максимум `supported_within_design` для валидного реплицированного дизайна |

## 2. Модель данных (SCHEMA_VERSION 7 → 8, аддитивно)

Две новые коллекции (обе `privacyClass='sensitive'`, namespaced id, `IDCOLS`
31→33, `REC_COLLS` +2, `dbCount()` +2):

- **`psyAdaptivePlans`** — JITAI-план: все 6 обязательных компонентов
  (`distalOutcome`, `proximalOutcome`, `decisionPoints[]`,
  `tailoringVariables[]`, `interventionOptions[]` — всегда включая
  `NO_INTERVENTION`, `decisionRules[]`) + `safetyGateId` + `enabled`.
- **`psyExperiments`** — N-of-1: `question`, `designType`, `conditions`,
  `baselinePlan`, `randomizationPlan`, `washoutPlan`, `measurementSchedule`,
  `fidelityPlan`, `stopRules[]`, `consentAt`, `status`, append-only
  `history[]`, `resultSummary` c обязательными `limitations`.

Один новый **скаляр** `psyAdaptiveSettings` (LWW-документ, автоматически в
sync/backup через вывод из `DEFAULT_DB`, зарегистрирован в `SCALAR_REGISTRY`):
prompt burden EMA (`promptsEnabled` — по умолчанию **выключено**,
`maxPromptsPerDay`, ограниченный `promptLog`) и `methodExclusions` — жёсткое
пользовательское «не предлагать снова».

`psyObservation` расширен опциональной структурой **`episode`**
(`event/firstThought/body/emotion/impulse/action/result`) — low-friction EMA;
все поля опциональны, достаточно одного. Числа из текста **не извлекаются**.

Новые типы сохраняются тем же транзакционным `psySaveRecord()` (recovery lock,
снимок + полный откат при сбое `persist()`), но **не добавлены в
`PSY_TYPE_TO_COLL`** — от него зависит список типов external-work **v2**, и
формат v2 не расширяется молча: планы и эксперименты — локальные решения
пользователя, извне они не импортируются. v1/v2 не изменены.

## 3. Derived personal method profile — точная логика

`psyMethodProfiles(db)` — **чистая функция**: профиль нигде не хранится, не
редактируется и пересчитывается при каждом чтении. Удаление/правка эпизода
меняет результат детерминированно (тест: byte-identical при повторном вызове).

Вход: только `psyInterventionEpisodes` текущего профиля с `methodId`
(naturalistic-наблюдения без интервенции методу **не приписываются** —
addendum 2 §1). Контекст = нормализованный `targetMechanism` эпизода.

Слои считаются раздельно и не сливаются в одно число:

- **adherence-слой**: attempts / completed / partial / notDone; в оценку исхода
  входят только `done|partial` (**not_done ≠ not_helpful**);
- **outcome-слой (immediate)**: тэлли `outcomeClass`; позитив =
  `{promising, helpful_in_context, probably_helpful}`, сильный позитив =
  `{helpful_in_context, probably_helpful}`; негатив = `not_helpful`;
- **proximal** = эпизоды с `postObservationRefs`; **follow-up** = с
  `followUpRefs` (счётчики, без интерпретации чисел);
- **acceptability** — отдельный тэлли; **adverseEffects** сохраняются всегда.

Статус контекста — детерминированный порядок правил (безопасность и вред
приоритетнее пользы):

```
unsafe_or_out_of_scope  если есть хотя бы один такой эпизод
counterproductive       если есть хотя бы один среди оцениваемых
poorly_tolerated        если adverse-эпизодов ≥ половины оцениваемых
unclear (insufficient)  если оцениваемых нет (adherenceIssue при attempts>0)
not_helpful             ≥2 негатива и 0 позитивов
helpful_in_context      ≥3 позитива, 0 негативов, ≥1 сильный позитив
promising               ≥1 позитив, 0 негативов  ← потолок одного яркого раза
unclear                 смешанный сигнал
```

Свод по методу: контексты с разными статусами → `contextDependence=true`,
конфликт «позитив в одном, вред/негатив в другом» → честный `unclear`, а не
среднее. Всё раскрывается до `contributingEpisodeIds`. Никаких скрытых
числовых `confidence 0..1` (addendum 2 §3).

## 4. Safety gate + receptivity gate

`psySafetyGate(ctx)` — детерминированный, **fail-closed**:

- **red**: кризисная лексика (`detectCrisisLanguage`) или самоотчёт «кризис» →
  движок остановлен полностью, только кризисный/профессиональный путь;
- **amber**: самоотчёт «на пределе» ИЛИ состояние не подтверждено — при amber
  допускаются только методы с `amberSafe: true` из реестра, эксперименты
  запрещены;
- **green**: только явный самоотчёт «я в порядке».

Receptivity: техника предлагается **только** при явном `receptivity='yes'`;
`no` и «неизвестно» → `NO_INTERVENTION`. Пользователь, сам открывший «Сейчас»
и отметивший готовность, — единственный источник этого сигнала.

## 5. Adaptive decision engine — детерминированный и объяснимый

`psyAdaptiveDecide(plan, ctx, db)` — без `Date.now`/`Math.random`, тот же вход
→ то же решение. Конвейер:

```
план включён → safety gate → receptivity gate
→ правила по порядку (первое совпавшее)
→ пригодность метода: реестр → amber-ограничение → жёсткое исключение
  пользователя → персональный вред в ЭТОМ контексте
  (counterproductive / unsafe / poorly_tolerated)
→ предложение ОДНОЙ техники ИЛИ NO_INTERVENTION
```

Правила — явные структуры `if {triggerType, mechanism, contextTag,
arousalMin..Max} then {methodId | NO_INTERVENTION}`. Пороговое правило по
возбуждению **не срабатывает без замера** (missing ≠ zero). Непригодный метод
не «ломает» решение — движок переходит к следующему правилу, а исключение
попадает в `explain.exclusions` с источником и contributing IDs.

`explain` возвращает: входы, safety с причинами, receptivity, трассировку
каждого правила, исключения, персональную доказательность
(`insufficient personal evidence` — честный статус, предложение тогда
опирается на внешнюю доказательность как стартовую точку) и внешние метаданные
метода. Отказ пользователя от предложения **не записывается против метода**.

## 6. EMA-контракт

- event-based (цепочка `episode`), scheduled и manual — один write contract;
- пропуск подсказки = missing, **не** ноль; пропуски видимы как сигнал
  нагрузки («много пропусков — снизить частоту/выключить»);
- prompt stream по умолчанию выключен; дневной бюджет `maxPromptsPerDay`;
  отключается одним переключателем;
- ИИ не создаёт измерений (источник `ai` отклоняется — Волна 7) и не
  извлекает числа из свободного текста.

## 7. N-of-1: допуск и сила дизайна

Создание (`psyBuildExperiment`) отклоняется fail-closed, если нет любого из:
метод в реестре с `riskClass='low_reversible'`; измеримый повторяемый outcome;
`baselinePlan.rationale` (система обязана показать, почему данных достаточно);
для причинно-способных дизайнов (`ABA/ABAB/alternating/randomized_crossover`)
`plannedPoints ≥ 3`; washout/carryover-план при смене условий; stop-правила;
fidelity-план; график измерений; **явное согласие**; **safety=green** с явным
самоотчётом; тема без кризисной лексики.

- `randomizationPlan` — целый seed + cycles ≥ 2 → детерминированная
  последовательность (mulberry32), один seed → одна последовательность;
- статусы `draft→active→stopped/completed/abandoned` только по допустимой
  схеме; `active` требует `consentAt`; история **append-only**;
- **`observational` и одиночный `AB` никогда не эмитят причинный статус**;
  «до → после» один раз экспериментом не называется;
- максимум для валидного реплицированного дизайна без срабатывания
  stop-правила — `supported_within_design` (не «доказано»); итог без
  `limitations` не принимается, ограничения показываются рядом с результатом;
- разбор — детерминированное описательное сравнение: счётчики и среднее только
  по фактически введённым числам.

## 8. Два слоя доказательности

Внешний слой — Method Registry `psy-method-registry-v2` (bump явный):
добавлены `riskClass`, `amberSafe`, у `evidenceMetadata` — `population` и
`limitations`. Персональные результаты в реестр не попадают; реестр заморожен.

UI «Что помогает мне» показывает «Внешняя база: …» и «Мои данные: …» **всегда
раздельно**; тест запрещает появление «эффективности N%». Персональный слой не
может перезаписать внешний и наоборот (реестр frozen, профиль derived).

## 9. AI role

Адаптивный движок v1 полностью детерминирован — **AI не участвует в выборе**
(движок работает при отозванном `psyAiConsent`, что закреплено тестом).
Существующие AI-функции психологии остаются consent-gated с кризисным гейтом.
Новых AI-поверхностей Wave 8 не добавляет (см. §13).

## 10. Privacy / safety / система

- local-first, 0 сетевых вызовов во всём adaptive/EMA/N-of-1 пути (route-
  перехват в тестах); AI-леджер пуст;
- профильная изоляция: планы/эксперименты/derived-профиль не пересекают
  границу профиля;
- sync: коллекции — id-merge с надгробиями (удалённый план не воскресает),
  скаляр — LWW;
- backup: генерический адаптер, шифрованный roundtrip byte-identical, неверный
  пароль/повреждённый файл → zero mutation;
- удаление записи (`psyDeleteRecord`) транзакционно (снимок + надгробие +
  откат при сбое persist) и детерминированно пересчитывает derived-профиль;
- XSS-фикстуры в EMA-полях не исполняются (только `esc()`); inline-обработчики
  получают только числовые индексы.

## 11. Unified Intelligence boundary

Ни `psyAdaptivePlans`, ни `psyExperiments`, ни коллекции Волны 7 **не входят в
`EVENT_SOURCES`**: создание плана/эпизода не добавляет unified-событий
(закреплено тестом и мутацией) — corr-инфляции из мета-записей нет.

## 12. Граница mind–body (addendum 5230889736)

- health-сигналы (`symptom_signal`, `measure_signal`) допустимы как tailoring
  variables **только** со ссылками на реальные записи здоровья и не
  доказывают психологическую причину симптома;
- никаких TAS-20/alexithymia из текста, авто-ACE, polyvagal state machine,
  GNM/Hamer/Recall Healing — ни в коде, ни в тегах;
- отдельный mind–body temporal-association engine (#164) в Wave 8 не включён;
  подготовлены только hooks: sourceRefs на health-записи, детерминированный
  пересчёт, закрытый реестр tailoring-переменных.

## 13. Известные ограничения

1. AI-хелперы движка (кандидат-механизм, объяснение методов, формулировка
   текста интервенции) не реализованы — v1 намеренно полностью
   детерминирован; интеграция потребует отдельного consent-контракта.
2. Rules-редактор минимален: форма создаёт план с одним правилом + fallback
   `NO_INTERVENTION`; сложные многоправильные планы — через тот же builder
   (API покрыт тестами), но без расширенного UI.
3. Scheduled EMA — in-app подсказка при открытом приложении; push/локальных
   уведомлений нет (отдельная поверхность).
4. `psyExpAnalysis` — только описательные счётчики/средние; SCED-статистики
   (Tau-U и т.п.) не реализованы и не имитируются.
5. Декомпозиция отказов («Не сейчас») не сохраняется — сознательное решение:
   отказ не является данными против метода.
6. Method Registry не редактируется пользователем.

## 14. Тесты

| Файл | Объём |
|---|---|
| `tests/wave8-adaptive-engine.spec.mjs` | **84** проверки (все 38 минимальных сценариев issue #163) |
| `tests/wave8-mutation.mjs` | **15** мутаций |
| `tests/wave8-backup-roundtrip.test.mjs` | **17** проверок |

Mutation sanity: снятие safety-red, игнор receptivity, missing→zero в пороге,
снятие приоритета adverse, оценка not_done как исхода, повышение одного
инсайта, игнор персонального вреда, игнор «не предлагать снова»,
причинный статус для observational, обход согласия, снятие baseline-гейта,
переписывание истории, невоспроизводимая рандомизация, мета-коллекция в
EVENT_SOURCES, удаление без надгробия — каждая роняет ровно свой сценарий.

## 15. Regulatory / product claims boundary

Функция описывается как персональный журнал самонаблюдения с адаптивными
подсказками по самопомощи. Не медицинское устройство, не диагностика, не
клиническое исследование, не замена терапии; кризисные состояния выводятся из
адаптивного контура в кризисный/профессиональный путь.

## 16. Rollback

Волна аддитивна: удаление двух коллекций, скаляра `psyAdaptiveSettings`,
Wave-8 блока `app.js`, overlay `ov-psy-exp-done`, Wave-8 стилей и возврат
`SCHEMA_VERSION=7` + registry v1 возвращает поведение `MAIN 6d50dae`.
Миграция пользовательских данных не требуется.
