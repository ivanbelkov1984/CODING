# Астрология: подсистема и эпистемическая граница

## Сохранение v1

Существующая астрологическая мастер-спецификация, Swiss Ephemeris boundary, time/geography, school registries и rectification preview сохраняются. Этот документ определяет взаимодействие с глобальной системой.

## Pipeline

`birth evidence → time/location normalization → astronomical calculation → geometric state → school rule → interpretive claim → symbolic annotation → optional LLM explanation`.

LLM не вычисляет позиции и не изменяет raw calculation facts.

## Rectification

- OriginalBirthEvidence immutable;
- alternatives versioned;
- supporting/contradicting events;
- training/validation/holdout separation;
- null/permutation comparisons;
- accepted profile reversible;
- output: ranked hypothesis, not true birth time.

## Dependencies

Astrology may read consent, birth evidence, time/location, selected domain/horizon and school rules.

Astrology may output only `separatelyLabelledSymbolicContext` to ScenarioOutlook, reflection prompt and LLM explanation.

Astrology may not influence validated questionnaire, health risk, readiness dimension, action trajectory, prediction estimate, causal estimate or JITAI rule.

## Experimental incremental value

If ever studied, astrology is isolated feature group M3 after behavioral baseline M0/M1/M2. It enters an empirical product only after preregistered untouched evaluation, stable incremental value, calibration and subgroup safety. Null/negative results retained. Until then it remains reflective context.

## UX language

Allowed: «В выбранной традиции этот период символически связывают с…».

Forbidden: «Марс повышает риск болезни», «окно брака 85%», «событие произойдёт раньше», «астрология подтверждает диагноз».
