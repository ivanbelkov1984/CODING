# 04 — IMPLEMENTATION ROADMAP

> Реалистичная последовательность **небольших вертикальных срезов**. Никаких гигантских PR. Каждый срез — отдельный task-контракт, один PR, мобильная проверка. Порядок согласован с `claude-handoff/06-BACKLOG.md` (P2→P6) и capability map (`product/01`).

## Принципы

- Один активный implementation-task за раз; `MAIN` меняется только по явному решению Ивана.
- **Сначала общий фундамент (Evidence & Model Kernel + Privacy/AI-safety), и только потом доменные фичи.** Это исправление по независимому review: нельзя добавлять психику/здоровье/астрологию до доказательного и защитного ядра.
- Data-контракты и эпистемическая обёртка вводятся **аддитивно** (`product/06`,`07`).
- Тяжёлые/чувствительные домены (health, astrology, PDRE, prediction) — позже, за отдельными owner-approved контрактами и review/license/regulatory гейтами (`product/14`).

## Порядок этапов (A–H, скорректирован по review)

`A` исправить PR #67 (текущий, docs-only) → `B` **Evidence & Model Kernel** (`product/07`) → `C` **Privacy at-rest + AI validator framework** (`product/09`) → `D` низкорисковые фичи (Momentary State, «Зачем?») → `E` Health Organizer (`product/12`) → `F` Astrology technical foundation (`product/11`) → `G` PDRE / сценарии → `H` Prediction research (`product/10`). **Momentary State идёт на этапе D, после B и C, а не первым.**

## Формат среза

Каждый срез описан полями: **Результат · Файлы · Новые данные · Миграция · Privacy/safety · Rollback · Focused tests · Browser evidence · Mobile acceptance · Зависимости · Stop conditions.**

---

## S0 (текущий) — Product architecture consolidation *(documentation-only)*
- **Результат:** единый owner-readable план (`architect/docs/product/`).
- **Файлы:** только `architect/docs/product/*.md`. **Новые данные:** нет. **Миграция:** нет.
- **Privacy/safety:** synthetic-only; runtime не тронут. **Rollback:** удалить доки.
- **Tests:** build + существующий E2E (без изменения runtime), `git diff --stat` = только доки.
- **Mobile acceptance:** доки читаемы с iPad. **Зависимости:** нет. **Stop:** любой diff runtime-кода.

## B — Evidence & Model Kernel *(фундамент, `product/07`)*
- **Результат:** обёртка записи (knowledgeType/verificationStatus/provenance/purpose/inputDeps/modelVersion/lifecycle/…); append-only corrections; один вычисляемый результат корректно инвалидируется и пересчитывается при правке входа; фиксация версий моделей/правил (реестр `product/08`).
- **Файлы:** `app.js` (аддитивные поля + коллекция corrections + invalidation для одного пилотного поля), focused tests. Возможно `index.html` (бейдж источника).
- **Новые данные:** опц. обёртка (backfill `unverified/current`); коллекция corrections. **Миграция:** идемпотентно, в migration registry (`product/08` §7); образец — `migrateRecords()` (`app.js:249`).
- **Privacy/safety:** без новых внешних вызовов. **Rollback:** поля опциональны; поведение за флагом.
- **Focused tests:** roundtrip старых записей; correction→projection; invalidation→recompute. **Browser evidence:** Chromium+WebKit; offline reload. **Mobile:** старые данные читаются.
- **Зависимости:** `product/07`. **Stop:** любая потеря/переименование старых полей; сведе́ние к одному score.

## C — Privacy at-rest + AI validator framework *(фундамент, `product/09`)*
- **Результат:** каркас AI-safety на choke-point `callClaude` с 2–3 реально включёнными валидаторами (grounding, claim-class, domain-safety) + structured `SynthesisInput` + consent/minimisation + safe fallback; перевод AI→`cravingRisk` связи под лейбл «гипотеза ИИ» с возможностью отклонить (`app.js:1002–1003`). Заготовка encrypted blob vault для будущих sensitive данных.
- **Файлы:** `app.js` (framework вокруг `callClaude`, `app.js:4350`), focused tests.
- **Новые данные:** consent receipts (`product/08` §1); метаданные без личного текста. **Миграция:** нет.
- **Privacy/safety:** validator только ужесточает; без передачи sensitive без согласия. **Rollback:** framework за флагом.
- **Focused tests:** validator блокирует запрещённый вывод; AI-сигнал не повышает risk без лейбла/подтверждения. **Browser evidence:** Chromium+WebKit; offline.
- **Зависимости:** B. **Stop:** AI-гипотеза как факт/score; изменение кризисного протокола без review (`product/14`).

## D — Momentary State (двухосевой ввод) *(первая продуктовая фича, после B+C)*
- **Результат:** быстрый ввод `valence`+`activation` (+опц. заметка) на «Сегодня»; отображение в динамике.
- **Файлы:** `app.js` (новая коллекция + рендер), `index.html` (виджет), `styles.css` (стиль виджета).
- **Новые данные:** коллекция momentary states (схема ← `life-architect-v2/schemas/momentary-state.schema.json`, reference). `vit` **не трогаем**. **Миграция:** нет (новая коллекция).
- **Privacy/safety:** без цветовой семантики по умолчанию; локально. **Rollback:** коллекция аддитивна; фича за флагом.
- **Focused tests:** запись/чтение/бэкап-совместимость momentary. **Browser evidence:** ввод→сохранение→reload→персистентность.
- **Mobile acceptance:** ввод удобен одним тапом на телефоне. **Зависимости:** B+C. **Stop:** влияние на `vit`/чек-ин.

## D2 — Метод «Зачем?» как структурированный поток *(этап D)*
- **Результат:** гайд «симптом→функция→вторичная выгода→потребность→цена→альтернатива→действие»; результат — `LLMExtractedProcessHypothesis` с alternatives/confirmation.
- **Файлы:** `app.js` (поток + сохранение), `index.html`/`styles.css` (шаги).
- **Новые данные:** записи гипотез процесса (лейбл, evidence spans, expiry). **Миграция:** нет.
- **Privacy/safety:** психология ≠ диагноз; обязательный лейбл и подтверждение. **Rollback:** фича за флагом.
- **Focused tests:** гипотеза всегда помечена, не превращается в факт/score. **Browser evidence:** прохождение потока, сохранение с лейблом.
- **Mobile acceptance:** поток проходится на телефоне. **Зависимости:** B+C. **Stop:** отсутствие явного лейбла/подтверждения.

## E — Health foundation (Personal Health Organizer, первый срез) *(отдельный owner-approved контракт)*
- **Результат:** хранение медицинского документа как **immutable ImportedEvidence** + ручные поля; без OCR/LLM в первом срезе.
- **Файлы:** `app.js` (домен), `index.html`/`styles.css`; медиа — существующий IndexedDB.
- **Новые данные:** ImportedEvidence + Descriptive поля. **Миграция:** нет.
- **Privacy/safety:** **regulatory quarantine** (нет диагноза/доз/interactions/alerts); оригинал immutable; synthetic-only в тестах. **Rollback:** домен за флагом.
- **Focused tests:** immutable оригинал, verification-gate до графика. **Browser evidence:** загрузка документа, отображение, offline.
- **Mobile acceptance:** документ добавляется/просматривается с телефона. **Зависимости:** B+C; **encrypted blob vault (`product/09`)**; owner-approved health-контракт + regulatory/privacy gates (`product/12`,`14`). **Stop:** любой намёк на clinical decisioning.

## F — Astrology foundation (изолированный расчёт) *(после license/WASM/tzdb/golden gates)*
- **Результат:** ввод birth data + один расчёт (astronomy) → SymbolicAstrologyAnnotation с явным символическим лейблом.
- **Файлы:** `app.js` (изолированный модуль), `index.html`/`styles.css`.
- **Новые данные:** birth evidence + аннотация. **Миграция:** нет.
- **Privacy/safety:** explicit opt-in; **полная изоляция** от health/psych/readiness; не causal. **Rollback:** домен за флагом.
- **Focused tests:** аннотация не влияет ни на readiness/prediction/health. **Browser evidence:** ввод→расчёт→символический вывод.
- **Mobile acceptance:** ввод/просмотр с телефона. **Зависимости:** B+C; licence/WASM/tzdb/golden gates (`product/11`,`14`). **Stop:** любое проникновение astro в эмпирические выводы.

## G — PDRE / ActionTrajectory (описательный) и сценарии *(после стабильных данных)*
- **Результат:** описательный ActionTrajectory по одной привычке (adherence/recency/regularity) **без единого score**; позже — один ScenarioHypothesis (уровень 3, `product/10`).
- **Зависимости:** стабильные BehavioralEvent/ContextObservation (из D–E). **Stop:** сведение readiness к одному числу; изобретённые вероятности.

## H — Prediction research *(только при накопленных данных, `product/10`)*
- **Результат:** переход к уровню 4 (Prediction Estimate) **только** при определённых target/horizon/outcome/predictors/temporal-validation/baseline/calibration/external-eval/drift и одобрении. До этого `prediction=null`.
- **Зависимости:** G + данные. **Stop:** любой «процент вероятности будущего» без валидированной модели и review.

---

## Что не планируется как «большой PR»

Информационная архитектура (8 хабов) меняется **инкрементально** внутри профильных срезов, не одним рефактором. Native (Capacitor) — **отложено**, работаем в web. Server-side RAG/vector DB, автоматические clinical alerts, автоматический удалённый backup — **Deferred** (`claude-handoff/06`).

## Общие Definition of Done для любого runtime-среза

Build+combined PASS · focused tests PASS (production-модуль/DI, не дубль логики) · существующий E2E PASS · Chromium+WebKit browser evidence (BLOCKED ≠ PASS) · offline reload · rollback описан и проверен · синтетические данные · один PR · мобильная приёмка · явные non-goals.
