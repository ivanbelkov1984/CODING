# 01 — CURRENT CAPABILITY MAP

> Реальное состояние по доменам на `MAIN@2325a8b`. Источник фактов — код `architect/app.js` и `09-REPOSITORY-AUDIT.md`. Легенда статуса: **RUNTIME** (есть в коде) · **PARTIAL** (частично) · **DOC-ONLY** (только документирован) · **ABSENT** (отсутствует).

## Как читать

Для каждого домена: статус · где в коде · что уже даёт пользователю · чего не хватает до v2 · риск · зависимость · нужный task-контракт · минимальный вертикальный срез.

Базовые факты хранилища (общие для всех доменов):
- `DEFAULT_DB` коллекции: `insights, dreams, patterns, evolution, spiritual, checkins, spheres, sphereLogs, bots, chapters, digests, chats, cravings, oq, vit, env` + `_del` (tombstones) + `__ts` (`app.js:52–80`).
- Запись: `id, createdAt, day, sv` (schema version, `SCHEMA_VERSION=2` `app.js:14`), `_u` (merge marker). Миграция — `migrateRecords()` (`app.js:249`), загрузка — `hydrate()` (`app.js:181`).
- Хранилище: localStorage per-profile (`arch5_db_<id>` и др.), медиа — глобальный IndexedDB `arch5_media` (`app.js:1161`). E2EE — `encryptPayload` (`app.js:3800`). AI — `callClaude` (`app.js:4350`), реестр `AI_PROVIDERS` (`app.js:4264`).

---

## 1. Today / Momentary State — **PARTIAL**
- **Есть:** ежедневный чек-ин `saveCI()` (`app.js:1946`) пишет `DB.vit` (`{sl,sq,cl,st,mv,tone,note,ci,date}`, `app.js:76`); эмоция/тонус присутствуют как поля.
- **Даёт:** быстрый ввод состояния дня, влияет на «Сегодня»/компас/витальность.
- **Не хватает:** отдельная сущность momentary state с `valence`+`activation` (0–100), опц. emotion/color/context, привязкой к времени (`recordedAt`), progressive disclosure. `vit` — агрегат дня, не поток моментальных состояний.
- **Риск:** низкий (аддитивно). **Зависимость:** эпистемическая обёртка (`product/02`).
- **Task-контракт:** новая коллекция momentary states поверх DB без слома `vit`; схема ← `life-architect-v2/schemas/momentary-state.schema.json` (reference).
- **Мин. срез:** двухосевой ввод (valence/activation) + опц. заметка → запись в новую коллекцию → показ на «Сегодня» и в динамике. Без цветовой семантики по умолчанию.

## 2. Insights / diary — **RUNTIME**
- **Есть:** коллекция `insights`, добавление/редактирование/удаление, теги, медиа-ссылки, поиск, «умные» инсайты `smartInsights()` (`app.js:2753`), связывание, AI-«разобрать».
- **Не хватает:** явные source-labels (запись vs гипотеза vs вывод), progressive disclosure «Почему?→источники→uncertainty».
- **Риск:** низкий. **Зависимость:** `product/02`.
- **Task-контракт:** аддитивные метаданные provenance/verificationStatus на запись (не ломая старые).
- **Мин. срез:** поле «источник вывода» + бейдж в UI детали инсайта.

## 3. Dreams — **RUNTIME**
- **Есть:** коллекция `dreams`, диалог-толкование через AI (режим «толкование», не «Зачем?»).
- **Не хватает:** символические аннотации как отдельный класс; связь с паттернами.
- **Риск:** низкий. **Мин. срез:** тег символа + ссылка «связать с паттерном».

## 4. Patterns — **RUNTIME**
- **Есть:** коллекция `patterns`, детект `detectPatterns()`/связи, отображение на карте смыслов.
- **Не хватает:** различие DetectedTrend/Changepoint vs описательный паттерн; `repeated_personal_pattern` с minimum n.
- **Риск:** низкий. **Мин. срез:** метка «повторилось n раз» с явным порогом.

## 5. Spheres — **RUNTIME**
- **Есть:** `spheres` + `sphereLogs` (`app.js:59–60`), рендер `rSpheres()` (`app.js:2990`), тип трекера у сферы, дневные отметки.
- **Не хватает:** связь сфер с readiness/действиями (PDRE) — отложено.
- **Риск:** низкий. **Мин. срез:** тренд по сфере (описательный, без прогноза).

## 6. Relationships — **ABSENT**
- **Есть:** только «близкий человек» в настройках/кризис-карте (контакт), не домен.
- **Не хватает:** сущности отношений, взаимодействий, границ.
- **Риск:** средний (чувствительные данные о третьих лицах — не выдавать гипотезы за факты).
- **Task-контракт:** отдельный, поздний. **Мин. срез:** заметки об отношениях как подтип инсайта с явным лейблом «моя интерпретация».

## 7. Метод «Зачем?» — **PARTIAL / DOC-ONLY**
- **Есть:** психологические инструменты и AI-диалоги существуют; отдельного оформленного потока «симптом→функция→вторичная выгода→потребность→цена→альтернатива→действие» нет.
- **Не хватает:** структурированный пошаговый поток + сохранение как LLMExtractedProcessHypothesis (с evidence spans, alternatives, expiry, confirmation).
- **Риск:** средний (психология ≠ диагноз). **Зависимость:** `product/02`,`03`, LLM validators.
- **Мин. срез:** гайдированный поток «Зачем?» → запись гипотезы процесса с обязательным лейблом и подтверждением пользователя.

## 8. PDRE / readiness — **ABSENT (DOC-ONLY)**
- **Не хватает:** многомерная readiness (capability/opportunity/motivation/…); ActionTrajectoryState (adherence/recency/regularity/…). Нормативно принято, **реализация отложена**.
- **Риск:** высокий концептуальный (нельзя сводить к одному score). **Зависимость:** стабильные BehavioralEvent/ContextObservation.
- **Мин. срез (поздний):** описательный ActionTrajectory по одной привычке без единого score.

## 9. Health documents — **ABSENT**
- **Есть:** нет (существуют `vit`, `cravings`, `env` — не медицина).
- **Не хватает:** ImportedEvidence (immutable оригинал), pipeline OCR/LLM-кандидат→source fragment→deterministic checks→verification→accepted observation.
- **Риск:** высокий (regulatory quarantine; privacy). **Зависимость:** `product/03` §health, отдельный owner-approved контракт.
- **Мин. срез:** хранение медицинского документа как immutable ImportedEvidence + ручные поля (без OCR/LLM в первом срезе).

## 10. Symptoms and measurements — **ABSENT**
- **Не хватает:** симптомы/физиологические показатели/лаборатории как DescriptiveState/RawObservation с графиком только подтверждённых значений.
- **Риск:** высокий (не clinical alerts). **Мин. срез:** ручной ввод одного показателя + график подтверждённых точек.

## 11. Medications / supplements / intake — **ABSENT**
- **Не хватает:** раздельно PrescriptionEvidence / MedicationPlan / MedicationUseStatement / MedicationIntakeEvent / PerceivedEffect / AdverseEffectObservation (схемы: `life-architect-v2/schemas/medication-*`).
- **Риск:** высокий (запрет dosage/interaction/diagnosis). **Мин. срез:** MedicationPlan (по явно заданному пользователем плану) + напоминание + запись фактического intake. Без проверки доз/взаимодействий.

## 12. Astrology — **ABSENT**
- **Есть:** в коде нет (grep astro/natal/birth/zodiac — пусто). Детальные контракты — на закрытой ветке (`life-architect-v2/07`).
- **Не хватает:** цепочка birth evidence→normalization→astronomy→geometry→school→interpretive→SymbolicAstrologyAnnotation; explicit opt-in; изоляция.
- **Риск:** средний (изоляция от health/psych/readiness; символическое, не causal). **Мин. срез:** ввод birth data + один расчёт (astronomy) с явным символическим лейблом, полностью изолированный.

## 13. Scenario planning — **ABSENT**
- **Не хватает:** ScenarioHypothesis (условия/альтернативы/триггеры инвалидции), отделённый от PredictionEstimate/CausalEffectEstimate.
- **Риск:** высокий (нельзя изобретать вероятности). **Зависимость:** стабильные data/эпистемические контракты. **Мин. срез (поздний):** один сценарий «если условия сохранятся» с альтернативами, без чисел-вероятностей.

## 14. Long-term memory / book / creative archive — **PARTIAL**
- **Есть:** `chapters` («книга», `app.js:64`), `evolution`, `spiritual`, инсайты как долговременная память; поиск.
- **Не хватает:** связывание материалов творческого архива, версия личной модели.
- **Риск:** низкий. **Мин. срез:** связка «глава ↔ инсайты/паттерны».

## 15. AI synthesis and validators — **PARTIAL (транспорт, не синтезатор)**
- **Есть:** единый вход `callClaude()` (`app.js:4350`) — **транспорт и роутер** (провайдеры `AI_PROVIDERS` `app.js:4264`, модели, task-маршруты, ledger `arch5_ai_ledger`, бюджет, optional JSON schema).
- **Существенная проблема:** AI-оценки из диалога (`mood/stress/lonely`, сохраняются как `stateNote` `app.js:844`) **уже подмешиваются** в алгоритм `cravingRisk` (факторы `chat-stress`/`chat-lonely`, `app.js:1002–1003`) — **без** эпистемического лейбла «гипотеза ИИ», evidence spans, alternatives, подтверждения, expiry и без invalidation после исправления.
- **Не хватает:** не «один validator», а **framework** (`product/09` §3): eligibility→consent→minimisation→labels→structured input→policy→LLM→schema→grounding→claim-class→domain safety→numeric/temporal→uncertainty/alternatives→crisis override→retry→safe fallback. Голос `EvidenceGroundedDirectMentor` не формализован.
- **Риск:** средний–высокий (AI-гипотеза влияет на решение без лейбла; leakage/injection — `claude-handoff/09` §12). **Зависимость:** `product/07` (kernel), `product/09`.
- **Мин. срез:** AI-safety framework с 2–3 включёнными валидаторами + перевод AI→risk связи под контракт (лейбл, отдельный сигнал, отклонение). **Не** одиночный validator.

## 16. Profiles / sync / backup — **RUNTIME**
- **Есть:** профили (`app.js:104`), E2EE sync (`encryptPayload` `app.js:3800`, PBKDF2 600k+AES-GCM-256), recovery key, **encrypted portable backup (PR #66 merged)**.
- **Не хватает:** для дневника — ничего блокирующего. Но **local-at-rest данные в открытом виде**: `DB`=plaintext JSON в localStorage (`app.js:166–168`), медиа=plaintext в IndexedDB (`app.js:1169`); E2EE защищает sync, не локальный профиль; forward-encryption gap при пустой passphrase. Это **блокер для добавления медицинских документов** (`product/09` §1, `product/12` §3), не для дневника одного пользователя.
- **Риск:** низкий (дневник) / высокий (health). **Не переписывать** крипто без отдельного контракта.

## 17. Mobile / offline / native readiness — **RUNTIME (web) / DEFER (native)**
- **Есть:** PWA offline-first, service worker (`sw.js`), mobile-only workflow (GitHub→CI→PR→preview), backup-модули в SW cache (PR #66).
- **Не хватает (native):** Capacitor wrapper — **отложено**, сейчас работаем в web.
- **Риск:** низкий. **Мин. срез (web):** улучшения offline UX по мере необходимости.

---

## Сводка приоритетности реализации

| Домен | Статус | Готовность к срезу | Data-риск |
|---|---|---|---|
| Momentary State | PARTIAL | **высокая** (аддитивно) | низкий |
| Метод «Зачем?» | PARTIAL | средняя | средний |
| LLM validators | PARTIAL | **высокая** (один seam) | низкий |
| Health foundation | ABSENT | средняя (крупный контракт) | **высокий** |
| Astrology foundation | ABSENT | средняя (изолированный) | средний |
| PDRE / Scenario | ABSENT | низкая (зависит от данных) | высокий |

Выбор следующего среза — в `05-NEXT-VERTICAL-SLICE-OPTIONS.md`.
