# Эпистемика и контракты данных

## Основное правило

Тип данных определяется не тем, насколько уверенно он звучит, а способом получения и проверки. Все объекты имеют `id`, `profileId`, `createdAt`, `updatedAt`, `source`, `provenance`, `privacyClass`, `verificationStatus`, `schemaVersion` и correction history.

## Классы

### RawObservation

Сырой ввод/сенсор/лог. Payload immutable; исправление append-only; current representation пересчитывается. Не используется напрямую для диагноза или причинности.

### UserSelfReport

Слова и оценки пользователя. Это источник правды о сообщённом опыте, но не объективная истина о причине или диагнозе. Пользователь может исправить в любое время.

### ImportedEvidence

Копия внешнего документа/записи с issuer, import time, checksum и source metadata. Оригинал сохраняется.

### BehavioralEvent

Операционализированное действие: тип, цель, context, status, verification. Нельзя выводить «избегание» только из пропуска.

### ContextObservation

Сон, нагрузка, место, доступность ресурсов, здоровье, социальная среда. Missing context не трактуется как отсутствие.

### ValidatedQuestionnaireResult

Результат конкретной версии инструмента и перевода. Хранятся ответы, scoring policy, rights status, time window, SEM/uncertainty где доступно. LLM не имитирует этот класс.

### LLMExtractedHypothesis

Гипотеза с evidence spans, alternatives, model/prompt version, confidence class, expiry и user confirmation. Запрещены диагноз, causal claim и скрытое преобразование в score.

### DerivedFeature

Rebuildable computation с policy version и input IDs. Исправление входа invalidates downstream.

### DescriptiveState

Сводка наблюдаемого окна без будущего утверждения.

### DetectedTrend

Результат формальной модели с assumptions, fit, uncertainty и null comparator.

### DetectedChangepoint

Ретроспективный кандидат изменения параметров. Не «прорыв судьбы». Требует stability check после новых данных.

### ScenarioHypothesis

Условное описание: «если условия сохранятся». Содержит alternatives и invalidation triggers.

### PredictionEstimate

Разрешён только при `modelValidationStatus=approved_for_intended_use`; содержит outcome, horizon, interval, version, calibration status.

### CausalEffectEstimate

Требует экспериментального или обоснованного quasi-experimental design. Последовательность во времени не доказывает причинность.

### SymbolicAstrologyAnnotation

Расчётный факт + school rule + symbolic meaning + uncertainty. Не empirical predictor по умолчанию.

### LLMExplanation

Presentation artifact. Ссылается на IDs результатов, не создаёт новые факты. Может быть regenerated и deleted без потери evidence.

## Correction model

```text
immutable original
  + correction event(s)
  + accepted current projection
  + invalidation graph
  + recalculated derived outputs
```

Удаление пользователем удаляет current projection и, согласно выбранной policy, source blob; audit сохраняет только минимальный неидентифицирующий факт удаления, если это юридически допустимо.

## Confidence vocabulary

- `unverified` — ещё не проверено;
- `user_confirmed` — подтверждено пользователем;
- `source_confirmed` — подтверждается исходным документом;
- `observational` — описательная связь;
- `repeated_personal_pattern` — повторилось при заранее заданном minimum n;
- `model_supported` — формальная модель лучше baseline;
- `validated_for_use` — прошла заявленные evaluation gates.

Число 0–1 не называется вероятностью без probabilistic semantics.
