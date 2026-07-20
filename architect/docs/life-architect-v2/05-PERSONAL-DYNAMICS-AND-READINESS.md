# Personal Dynamics and Readiness Engine

## Название

`Personal Singularity` остаётся продуктовой метафорой. Нормативное ядро: `Personal Dynamics and Readiness Engine (PDRE)`.

## Что система не делает

- не предполагает экспоненциальный рост;
- не вычисляет «точку судьбоносного прорыва»;
- не умножает астрологию на психологический score;
- не называет частоту дневниковых записей прогрессом;
- не создаёт probability без outcome contract.

## Цели и outcomes

Каждая аналитическая задача начинается с:

- target life domain;
- goal definition;
- observable outcome;
- eligibility/prediction time;
- horizon;
- data cutoff;
- competing events;
- missing-data policy;
- intended use;
- decision consequence.

Неоперационализированные цели («найти любовь», «стать собой») могут иметь reflective scenario, но не binary probability.

## Action ontology

Типы: intention, planning, preparation, initiation, execution, repetition, maintenance, deliberate practice, recovery, adaptation, help seeking, reflection, externally blocked, intentionally postponed, intentionally abandoned, missed, outcome unknown, possible avoidance, externally verified action.

Planning не получает низкий вес автоматически; missed не равно avoidance. Качество определяется domain-specific policy и хранится отдельно от количества.

## ActionTrajectoryState

Содержит observation window, eligible actions, planned/completed counts, adherence, frequency, recency, regularity, quality, difficulty, volatility, recovery, persistence under disruption, context dependence, outcome feedback, missingness и uncertainty.

## Readiness dimensions

- physical capability;
- psychological capability;
- physical opportunity;
- social opportunity;
- reflective motivation;
- automatic motivation;
- self-efficacy;
- values alignment;
- recovery capacity;
- data quality.

Не создаётся глобальный score до отдельного weighting/sensitivity validation. UI может показывать compact summary, но сохраняет dimensions.

## Dynamic model registry

Система поддерживает policy-based candidates:

- null/no-trend;
- linear;
- EWMA для текущего состояния;
- exponential-to-asymptote и power для узких learning tasks;
- logistic;
- piecewise;
- state-space/hidden-state при достаточных данных;
- changepoint;
- relapse/recovery;
- seasonal.

MVP использует прозрачные descriptive summaries, EWMA и pre-specified comparisons. Сложные модели включаются только после synthetic tests и minimum-data gates.

## Changepoint

PELT — retrospective penalised segmentation и не выдаёт probability сам по себе. BOCPD возвращает posterior run-length в рамках hazard/observation model. UI использует «изменение паттерна» и показывает method/stability; слова bifurcation/tipping point/singularity forecast заблокированы.

## ScenarioOutlook

Раздельные секции:

- observed state;
- descriptive trend;
- conditional continuation;
- supporting conditions;
- barriers;
- alternative scenarios;
- data quality/uncertainty;
- prediction estimate (обычно null);
- separate symbolic astrology;
- reflection/action options.

## Prediction gate

`PredictionEstimate` недоступен до:

- representative development data;
- fixed predictor definitions;
- temporal/evaluation split;
- leakage audit;
- baseline;
- calibration intercept/slope and plot;
- Brier/log loss, discrimination where relevant;
- uncertainty;
- subgroup/missingness/drift checks;
- model card and monitoring;
- TRIPOD+AI reporting and PROBAST+AI review.

## Intervention and causality

JITAI decision contract содержит decision points, tailoring variables, intervention options, decision rule, availability, burden, proximal outcome и distal outcome. До MRT/другого causal design система говорит «личное наблюдение/association», не «эта подсказка вызвала улучшение».
