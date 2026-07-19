---
name: rectification-engine
description: Build the rectification module as a research preview with ranked hypotheses, anti-overfitting validation and immutable source evidence.
effort: xhigh
context: fork
agent: studio-dispatcher
---

# Rectification Engine

Use `03-RECTIFICATION_SPEC.md`. Mandatory boundaries:

- no overwrite of OriginalBirthEvidence;
- no “true time” or probability percentage without independent calibration;
- candidate windows plus alternatives, stability, supporting/contradicting events;
- methods and weights versioned;
- training/validation/holdout event roles;
- null/permutation comparison;
- worker budget, cancellation/resume and provenance;
- private encrypted LifeEvents;
- accepted hypothesis creates derived normalization revision and remains reversible.

Begin with schemas/manual hypotheses. Automatic scoring remains Research Preview.
