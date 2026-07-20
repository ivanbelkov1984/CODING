# Единая архитектура продукта

## 1. Архитектурный цикл

```text
Capture
  → Evidence normalization
  → Personal memory and relationships
  → State/goal/action models
  → Descriptive analytics
  → Scenario and intervention decision
  → Separate symbolic context
  → LLM explanation
  → User action/outcome
  → Feedback and recalculation
```

## 2. Четырнадцать слоёв

### L1. Identity, profile and consent

Профиль, ключи, timezone, language, consent receipts, feature flags. Никаких психологических или медицинских выводов.

### L2. Source evidence

Оригинальные тексты, файлы, импорты, device records. Raw payload не переписывается; correction создаётся append-only.

### L3. Event and observation

Действия, состояния, симптомы, приёмы, контекст. Явно указаны source, verification и timestamps.

### L4. Structured measurement

Валидированные questionnaire results, laboratory observations, user scales. Лицензия и версия шкалы обязательны.

### L5. Extraction and hypotheses

OCR/LLM candidates, psychological process hypotheses, terminology mappings. Они не являются source of truth до подтверждения.

### L6. Feature derivation

Детерминированные и rebuildable признаки: adherence, recency, lagged association, trend inputs, data quality.

### L7. Personal memory graph

Связи записей, целей, людей, потребностей, health episodes, outcomes и insights. Каждая связь имеет тип и provenance.

### L8. State and readiness dimensions

Многомерное состояние, COM-B barriers, physical capacity, self-efficacy, opportunity, flexibility candidates. Нет универсальной «инерции».

### L9. Dynamic models

EWMA, null/linear, plateau, piecewise, changepoint candidate, relapse/recovery. Модель выбирается по target и data sufficiency, а не по метафоре Курцвейла.

### L10. Scenario research and approved prediction

`ScenarioOutlook` описателен. `PredictionEstimate` существует только у approved model с outcome/horizon/evaluation/calibration.

### L11. Intervention decision

Контекстные prompts и JITAI-lite. До эксперимента говорит об association, не causal effect. Медицинские decisions заблокированы.

### L12. Symbolic astrology

Raw astronomy → geometry → school rule → annotation. Передаёт только отдельно маркированный reflective context.

### L13. LLM explanation and dialogue

LLM объясняет структурированный результат, цитирует evidence, спрашивает подтверждение, предлагает варианты. Не изменяет факты и модели.

### L14. Audit, safety and governance

Consent, access, model version, source rights, feature status, regulatory review, deletion, incident log, post-release monitoring.

## 3. Направление зависимостей

Нижний слой не зависит от интерпретации верхнего. LLM не записывает в raw evidence. Astrology не входит в empirical model. Health source data может влиять на capability/context, но психологическая гипотеза не переписывает health record.

## 4. Privacy topology

- plaintext personal data: browser only;
- local database: encrypted records and versioned blobs;
- E2EE sync: ciphertext + minimal transport metadata;
- cloud LLM: explicit opt-in, minimal selected payload, provider disclosure, deletion policy;
- server: authentication/sync envelopes, never diary/health plaintext by default.

## 5. Failure philosophy

Каждый subsystem возвращает typed failure:

- insufficient_data;
- consent_missing;
- source_unverified;
- extraction_unconfirmed;
- license_unavailable;
- model_not_approved;
- calibration_failed;
- stale_model;
- unsupported_jurisdiction;
- regulatory_quarantine;
- provider_unavailable;
- local_key_unavailable.

UI не заменяет failure красивой догадкой.
