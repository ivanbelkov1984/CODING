# 12 — HEALTH CONTOUR SEPARATION

> **Статус: IMPLEMENTATION_CONTRACT + REGULATORY_REVIEW_REQUIRED.** Пробел 11 из review. Официально разделяет три контура. Текущий раздел «Здоровье» — это **не медицина**, а поведенческая поддержка.

## 0. Что сейчас реально есть

Текущее «Здоровье» = никотин/сахар/алкоголь (`vit`, `app.js:76`), тяга/срыв (`cravings`, `app.js:71`), поведенческие триггеры, микроинтервенции, привычки, AI-оценки настроения, простая саморегуляция. Это **Behavioral Health / JITAI Support**, не Personal Health Organizer.

**Не реализованы:** медицинские документы, симптомы как события, измерения, лаборатории, диагнозы из источника, аллергии, препараты, планы приёма, фактический приём, пропуски, PRN, побочные эффекты, perceived effects, остатки препарата, отчёт врачу, верификация извлечённых полей.

## 1. Три контура (жёсткое разделение)

### 1. Personal Health Record / Organizer — РАЗРЕШЁН (за флагом, после privacy-gate)
Хранение документов (immutable), ручной ввод, timeline, лекарства и фактический приём, симптомы и измерения, подготовка к врачу. Раздельные классы: `PrescriptionEvidence · MedicationPlan · MedicationUseStatement · MedicationIntakeEvent · PerceivedEffect · AdverseEffectObservation` (схемы: `life-architect-v2/schemas/medication-*`, reference).

### 2. Behavioral Health Support — УЖЕ СУЩЕСТВУЕТ
Тяга, привычки, психологическая саморегуляция, JITAI-подобные подсказки. Остаётся, но **отделяется** в UI/данных от медицинского организатора. Health barrier ≠ psychological weakness (`product/03` §3).

### 3. Clinical Decision Support — ВЫКЛЮЧЕН (regulatory quarantine)
Диагноз · выбор лечения · изменение дозировки · проверка взаимодействий · противопоказания · прогноз болезни · критические медицинские оповещения. Реестр — `product/08` §4. Включение — только owner-approved regulatory contract + review (`product/14`).

## 2. Intended purpose имеет юридическое значение

Квалификация функции как медицинского ПО определяется её **фактическим назначением**, а не дисклеймером. Надпись «это не медицинский совет» **не спасает** функцию, если она фактически принимает медицинское решение (напр. рекомендует дозу или диагноз). Ориентир — руководство MDCG по квалификации/классификации медицинского ПО.

> Конкретная редакция/дата руководства (MDCG 2019-11 rev.1 и т.п.) — вне независимой проверки этого агента; подтверждать по первоисточнику перед реализацией health-контура (`product/13`). Здесь фиксируется **принцип** intended-purpose.

## 3. Privacy prerequisite (блокер)

Medical documents **нельзя** добавлять в текущем виде (открытый localStorage/IndexedDB, `product/09` §1). До них обязателен encrypted local blob vault + session lock + CSP/XSS + selective export + отдельное согласие на передачу медицинского фрагмента AI (`product/09` §2–3, `product/08` §1).

## 4. FHIR — совместимость, не импорт стандарта

Внутренняя модель **FHIR-compatible**, но не hospital EHR clone. Нельзя «объявить FHIR реализованным»: нужна **собственная лёгкая модель** + зафиксированное отображение на выбранные FHIR-ресурсы (профилирование под конкретное назначение), а не импорт всего стандарта.

> Конкретная версия FHIR (R5 5.0.0 и т.п.) и требования профилирования — подтверждать по первоисточнику HL7 (`product/13`). Принцип: профилировать и валидировать под назначение, не тащить весь стандарт.

## 5. Pipeline медицинских документов (когда дойдём, Этап E)

`Original file (immutable ImportedEvidence) → OCR/LLM extraction candidate → source page/fragment/bounding evidence → deterministic checks → user verification → accepted observation → graph/report`. **Draft extraction НЕ попадает в графики** до верификации. Оригинал immutable. Синтетические данные в тестах; реальные медданные — никогда в git/CI/fixtures.

## 6. Связь с readiness

Health barriers связываются с readiness как **ограничение**, а не как «лень/слабость» (`product/03` §3). Это отдельный сигнal, не психологический диагноз.
