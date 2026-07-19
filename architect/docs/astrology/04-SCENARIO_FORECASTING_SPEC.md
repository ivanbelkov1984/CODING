# Scenario Forecasting и Personal Readiness Engine

## Решение

Предложенная формула

```text
P = P_astro × (1 + A_kurz) × (1 − F_psych)
```

отклонена как вероятностная модель. Её коэффициенты, нелинейная форма и ограничения не получены из данных; не определены outcome, горизонт, калибровка и независимая проверка. Умножение символической астрологии на психологические scores не создаёт вероятность.

«Закон ускоряющейся отдачи» Курцвейла относится к гипотезе о технологическом и эволюционном прогрессе, а не к валидированному закону индивидуального поведения. В продукте он заменяется измеримым **Action Momentum Model**.

## Слои продукта

### 1. Scenario annotation

Структурированное описание возможного сценария, его сферы, горизонта и наблюдаемого исхода. Вероятность пока отсутствует.

### 2. Behavioral/context baseline

Признаки, добровольно полученные из реальных действий, контекста, целей и исходов. Это единственная допустимая отправная точка эмпирической модели.

### 3. Personal readiness state

Недiagnostic time-varying indicators: возможность, способность, барьеры, adherence, неопределённость и качество данных.

### 4. Action momentum

Описательное состояние, а не обещание «сингулярности». Пример EWMA:

```text
m_t = λ m_(t-1) + (1-λ) q_t
```

`q_t` — заранее определённый показатель качества/выполнения действия; `λ` подбирается по данным или задаётся прозрачной policy. Отдельно хранятся trend, volatility, recency и missingness. Количество действий не возводится в экспоненту по умолчанию.

### 5. Experimental symbolic timing

Астрология создаёт `AstrologyWindowAnnotation`: геометрия, правило школы, источник и uncertainty. Этот объект не называется базовой вероятностью события.

### 6. Validated prediction model — только в будущем

После операционализации исхода может оцениваться:

```text
P(Y в горизонте h | X_t)
```

или динамическая time-to-event модель. Разработка и независимая оценка разделяются. Вероятности требуют калибровки.

## Выход MVP

- `readiness_index` как прозрачный composite score, явно не probability;
- momentum/trend и качество данных;
- наблюдаемые барьеры и поддерживающие факторы;
- scenario windows на основании планов и контекста пользователя;
- необязательная символическая астрологическая аннотация в отдельном блоке;
- uncertainty и альтернативные объяснения;
- вопросы для рефлексии.

Запрещённый текст MVP:

- «внешние циклы открыты на 80%»;
- «внутренний фрикционный слой блокирует событие»;
- «событие наступит на 3–6 месяцев раньше»;
- «Сатурн даёт вероятность 75%».

## Контракт prediction target

```yaml
outcome_definition_id:
subject_population:
eligibility_time:
prediction_time:
prediction_horizon:
observable_outcome:
outcome_source:
censoring_policy:
competing_events:
predictor_cutoff:
missing_data_policy:
baseline_model:
intended_use:
decision_consequence:
```

Исход должен быть объективно наблюдаемым и этически допустимым, например выполнение пользовательского плана к заданному горизонту. «Встретить любовь» или «личностно трансформироваться» не являются валидными binary outcomes без операционального определения.

## Gates разработки модели

1. репрезентативные development data;
2. predictor definitions фиксируются до evaluation;
3. temporal split и независимый evaluation set;
4. отсутствие leakage из будущих записей дневника;
5. baseline без астрологии;
6. calibration plot, intercept и slope;
7. Brier/log loss и discrimination, где уместно;
8. uncertainty intervals;
9. subgroup/fairness и missingness checks;
10. model card, version, monitoring и recalibration policy;
11. отчётность TRIPOD+AI и review по PROBAST+AI.

## Эксперимент incremental value астрологии

Астрологические признаки находятся в изолированной экспериментальной группе.

Сравнение:

- M0: behavioral/context baseline;
- M1: M0 + readiness self-report;
- M2: M1 + action momentum;
- M3: M2 + astrology features.

M3 может войти в вероятностный продукт только если preregistered evaluation покажет устойчивую дополнительную ценность и калибровку на untouched data без вредного subgroup behaviour. Нулевые и отрицательные результаты сохраняются. Иначе астрология остаётся reflective context.

## Психология

Диагнозы запрещены. Score должен опираться на названный валидированный инструмент либо прозрачный product composite. Пользователь может просмотреть и исправить входы. Missing data не трактуется как патология.

## Эффект вмешательства

Изменение micro-actions и последующий исход не доказывают причинность. Если продукт заявляет causal optimisation JITAI, нужны экспериментальные дизайны, например micro-randomized trials. До этого UI говорит об ассоциации или личном наблюдении.

## Контракты данных

- `ScenarioDefinition`;
- `OutcomeDefinition`;
- `ObservationWindow`;
- `BehavioralFeatureSnapshot`;
- `ReadinessFeatureSnapshot`;
- `ActionMomentumState`;
- `AstrologyWindowAnnotation`;
- `PredictionModelDefinition`;
- `PredictionRun`;
- `ProbabilityEstimate`;
- `CalibrationReport`;
- `FeatureContributionExplanation`;
- `PersonalResearchHypothesis`.

`ProbabilityEstimate` недоступен, пока `model_validation_status` не равен `approved_for_intended_use`.

## Failure states

- insufficient_data;
- outcome_not_operationalized;
- model_not_validated;
- stale_model;
- distribution_shift;
- consent_missing;
- feature_group_disabled;
- calibration_failed;
- uncertainty_too_high.

## UX

Три раздельные карточки:

1. **Что наблюдается сейчас** — факты и готовность;
2. **Что может поддержать или затруднить сценарий** — некаузальные drivers;
3. **Символический астрологический контекст** — optional, с источником, без вероятности.

Probability card появляется только для одобренной валидированной модели и показывает outcome, горизонт, interval, version и calibration status.
