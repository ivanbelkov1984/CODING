---
name: ui-adversarial-review
description: Run UI Engineer versus QA Auditor review for functionality, accessibility, design consistency and AI-slop elimination.
effort: high
context: fork
agent: studio-dispatcher
---

# UI Adversarial Review

1. UI Engineer supplies implementation, task flow, screenshot evidence and tests.
2. QA Auditor independently reviews DOM/state, mobile viewport, keyboard/accessibility, uncertainty/fallback states and design slop.
3. Tokenizer checks generated tokens and contrast.
4. UI Engineer addresses findings.
5. QA reruns checks and records acceptance or blockers.

No acceptance based only on visual taste.
