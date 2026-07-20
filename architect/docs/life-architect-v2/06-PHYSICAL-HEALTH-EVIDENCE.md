# Physical Health Evidence and Medication Intelligence

## Intended purpose MVP

Персональный health organizer и descriptive record:

- медицинская история;
- лекарства, OTC, витамины и добавки;
- фактический приём и напоминания;
- симптомы и измерения;
- анализы и документы;
- понятное объяснение терминов;
- продольное отображение source-confirmed values;
- подготовка структурированного отчёта врачу.

Не предназначен для diagnosis, disease prediction, therapy selection, dose modification, medication safety clearance или замены врача.

## Семь подсистем

1. Health Evidence: source documents, clinician records, user conditions, allergies, procedures.
2. Medication & Substance: products, ingredients, orders, plans, intake, stock, effects.
3. Measurements & Labs: observations, units, ranges, specimen, method, source.
4. Symptoms & Episodes: onset, severity, location, duration, functional impact, context.
5. Health Dynamics: descriptive change, temporal co-occurrence, data quality.
6. Visit Preparation: medication list, allergies, symptoms, labs, questions, source links.
7. Safety & Regulatory Boundary: allowed/blocked functions, consent, licences, intended-purpose review.

## Medication semantics

Разделяются:

- `PrescriptionEvidence`/clinician recommendation;
- `MedicationPlan` пользователя;
- `MedicationIntakeEvent` фактического приёма;
- `MedicationUseStatement` «обычно принимаю»;
- pause/change/discontinue с source;
- PRN intake;
- perceived effect;
- adverse effect observation;
- refill/stock.

Исправления intake доступны всегда через append-only correction. Никакого «замораживания через 48 часов».

## Общая модель веществ

`HealthProduct` классифицируется как prescription, OTC, vitamin, mineral, herbal или other supplement. Все используют `HealthProductIngredient`; это позволяет обнаружить точное дублирование вещества, только если ingredient mapping source-confirmed.

## Документы и лаборатории

Pipeline:

```text
original file/checksum
→ OCR/extraction run
→ field candidates with source page/box
→ deterministic type/unit checks
→ user verification
→ terminology candidate
→ accepted observation
→ longitudinal view
```

Original document immutable. Draft fields не участвуют в графиках. Сохраняются original unit/range и normalized value separately. Референс лаборатории не равен diagnosis; critical status показывается только если source explicitly flags it либо имеется отдельная clinically validated policy.

## Standards mapping

Минимальная внутренняя модель отображается в FHIR R4/R5 concepts:

- DocumentReference;
- DiagnosticReport;
- Observation;
- Condition;
- AllergyIntolerance;
- MedicationRequest;
- MedicationStatement;
- MedicationAdministration-like intake event.

LOINC и UCUM используются только после licence/attribution implementation. SNOMED CT — optional provider behind affiliate/jurisdiction licence gate. Полная EHR/openEHR не строится.

## AI levels

### Allowed

- organization/deduplication;
- extraction candidate;
- source-bound plain-language education;
- descriptive timelines;
- question list for doctor.

### Quarantined

- interaction/contraindication engine;
- dose checking;
- diagnosis/prognosis;
- therapy advice;
- critical-value clinical decision;
- automatic medication change.

LLM не является drug-interaction database. Полноценная safety проверка требует licensed deterministic knowledge base, validation, jurisdiction policy и MDR/AI Act review.

## Integration with PDRE

Health data создаёт `HealthBarrierEvidence` и physical capability context. Оно не становится «психологической инерцией». Система показывает возможные contributors и спрашивает подтверждение, а не объявляет физический симптом причиной автоматически.

## Privacy

Health records — highest sensitivity. Local encryption, E2EE sync, separate cloud-AI consent, provider/DPA/subprocessor/transfer/retention disclosure, temporary file deletion, selective export and audit log обязательны.

## Regulatory modularity

- Module A Personal Health Record — MVP;
- Module B Descriptive Analytics — ограниченный MVP;
- Module C Medical Safety Intelligence — feature flag OFF / quarantine;
- Module D Diagnostic/Therapeutic Intelligence — out of scope.

Каждый новый health feature проходит Intended Purpose Review → MDR/IVDR qualification → Rule 11 classification → AI Act review → clinical safety review.
