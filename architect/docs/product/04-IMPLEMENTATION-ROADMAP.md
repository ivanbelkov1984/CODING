# 04 — IMPLEMENTATION ROADMAP

> Реалистичная последовательность **небольших вертикальных срезов**. Никаких гигантских PR. Каждый срез — отдельный task-контракт, один PR, мобильная проверка. Порядок согласован с `claude-handoff/06-BACKLOG.md` (P2→P6) и capability map (`product/01`).

## Принципы

- Один активный implementation-task за раз; `MAIN` меняется только по явному решению Ивана.
- Data-контракты и эпистемическая обёртка вводятся **аддитивно** (см. `product/06`), до тяжёлых доменов.
- Тяжёлые/чувствительные домены (health, astrology, PDRE, scenario) — позже, за отдельными owner-approved контрактами.

## Формат среза

Каждый срез описан полями: **Результат · Файлы · Новые данные · Миграция · Privacy/safety · Rollback · Focused tests · Browser evidence · Mobile acceptance · Зависимости · Stop conditions.**

---

## S0 (текущий) — Product architecture consolidation *(documentation-only)*
- **Результат:** единый owner-readable план (`architect/docs/product/`).
- **Файлы:** только `architect/docs/product/*.md`. **Новые данные:** нет. **Миграция:** нет.
- **Privacy/safety:** synthetic-only; runtime не тронут. **Rollback:** удалить доки.
- **Tests:** build + существующий E2E (без изменения runtime), `git diff --stat` = только доки.
- **Mobile acceptance:** доки читаемы с iPad. **Зависимости:** нет. **Stop:** любой diff runtime-кода.

## S1 — Эпистемическая обёртка + одна LLM-safety проверка *(малый, инфраструктурный)*
- **Результат:** записи получают опциональные `provenance/verificationStatus`; один validator на choke-point AI (например astrology-isolation или tone/shame).
- **Файлы:** `app.js` (аддитивные поля + один seam в `callClaude`), focused test в `tests/`. Возможно `index.html` (бейдж источника).
- **Новые данные:** опц. поля на записи; коллекций не удаляем. **Миграция:** идемпотентный backfill `verificationStatus=unverified` (образец — `migrateRecords()` `app.js:249`).
- **Privacy/safety:** без новых внешних вызовов; validator только ужесточает. **Rollback:** поля опциональны; seam выключаем флагом.
- **Focused tests:** roundtrip старых записей; validator блокирует запрещённый вывод. **Browser evidence:** Chromium+WebKit; offline reload.
- **Mobile acceptance:** старые данные читаются, бейдж виден. **Зависимости:** `product/02`. **Stop:** любая потеря/переименование старых полей.

## S2 — Momentary State (двухосевой ввод) *(P3, первый продуктовый)*
- **Результат:** быстрый ввод `valence`+`activation` (+опц. заметка) на «Сегодня»; отображение в динамике.
- **Файлы:** `app.js` (новая коллекция + рендер), `index.html` (виджет), `styles.css` (стиль виджета).
- **Новые данные:** коллекция momentary states (схема ← `life-architect-v2/schemas/momentary-state.schema.json`, reference). `vit` **не трогаем**. **Миграция:** нет (новая коллекция).
- **Privacy/safety:** без цветовой семантики по умолчанию; локально. **Rollback:** коллекция аддитивна; фича за флагом.
- **Focused tests:** запись/чтение/бэкап-совместимость momentary. **Browser evidence:** ввод→сохранение→reload→персистентность.
- **Mobile acceptance:** ввод удобен одним тапом на телефоне. **Зависимости:** S1 (обёртка). **Stop:** влияние на `vit`/чек-ин.

## S3 — Метод «Зачем?» как структурированный поток *(P3)*
- **Результат:** гайд «симптом→функция→вторичная выгода→потребность→цена→альтернатива→действие»; результат — `LLMExtractedProcessHypothesis` с alternatives/confirmation.
- **Файлы:** `app.js` (поток + сохранение), `index.html`/`styles.css` (шаги).
- **Новые данные:** записи гипотез процесса (лейбл, evidence spans, expiry). **Миграция:** нет.
- **Privacy/safety:** психология ≠ диагноз; обязательный лейбл и подтверждение. **Rollback:** фича за флагом.
- **Focused tests:** гипотеза всегда помечена, не превращается в факт/score. **Browser evidence:** прохождение потока, сохранение с лейблом.
- **Mobile acceptance:** поток проходится на телефоне. **Зависимости:** S1. **Stop:** отсутствие явного лейбла/подтверждения.

## S4 — Health foundation (Personal Health Organizer, первый срез) *(P4, отдельный owner-approved контракт)*
- **Результат:** хранение медицинского документа как **immutable ImportedEvidence** + ручные поля; без OCR/LLM в первом срезе.
- **Файлы:** `app.js` (домен), `index.html`/`styles.css`; медиа — существующий IndexedDB.
- **Новые данные:** ImportedEvidence + Descriptive поля. **Миграция:** нет.
- **Privacy/safety:** **regulatory quarantine** (нет диагноза/доз/interactions/alerts); оригинал immutable; synthetic-only в тестах. **Rollback:** домен за флагом.
- **Focused tests:** immutable оригинал, verification-gate до графика. **Browser evidence:** загрузка документа, отображение, offline.
- **Mobile acceptance:** документ добавляется/просматривается с телефона. **Зависимости:** S1; owner-approved health-контракт. **Stop:** любой намёк на clinical decisioning.

## S5 — Astrology foundation (изолированный расчёт) *(P5)*
- **Результат:** ввод birth data + один расчёт (astronomy) → SymbolicAstrologyAnnotation с явным символическим лейблом.
- **Файлы:** `app.js` (изолированный модуль), `index.html`/`styles.css`.
- **Новые данные:** birth evidence + аннотация. **Миграция:** нет.
- **Privacy/safety:** explicit opt-in; **полная изоляция** от health/psych/readiness; не causal. **Rollback:** домен за флагом.
- **Focused tests:** аннотация не влияет ни на readiness/prediction/health. **Browser evidence:** ввод→расчёт→символический вывод.
- **Mobile acceptance:** ввод/просмотр с телефона. **Зависимости:** S1. **Stop:** любое проникновение astro в эмпирические выводы.

## S6 — PDRE / ActionTrajectory (описательный) и Scenario (позже) *(P5–P6)*
- **Результат:** описательный ActionTrajectory по одной привычке (adherence/recency/regularity) **без единого score**; позже — один ScenarioHypothesis.
- **Зависимости:** стабильные BehavioralEvent/ContextObservation (из S2–S4). **Stop:** сведение readiness к одному числу; изобретённые вероятности.

---

## Что не планируется как «большой PR»

Информационная архитектура (8 хабов) меняется **инкрементально** внутри профильных срезов, не одним рефактором. Native (Capacitor) — **отложено**, работаем в web. Server-side RAG/vector DB, автоматические clinical alerts, автоматический удалённый backup — **Deferred** (`claude-handoff/06`).

## Общие Definition of Done для любого runtime-среза

Build+combined PASS · focused tests PASS (production-модуль/DI, не дубль логики) · существующий E2E PASS · Chromium+WebKit browser evidence (BLOCKED ≠ PASS) · offline reload · rollback описан и проверен · синтетические данные · один PR · мобильная приёмка · явные non-goals.
