# Awesome Design — Tournament Rubric for Architect

This document does not replace `architect/design_guide.md`. It turns the existing system into a repeatable tournament rubric.

## Immutable visual contract

- Linear-style quiet minimalism;
- current surface ladder and hairlines;
- one accent;
- no decorative shadows/gradients;
- existing typography/radius/motion tokens;
- information hierarchy before decoration;
- uncertainty and warnings visible but not alarmist;
- mobile-first density.

## Three-direction tournament

Art Director proposes exactly three directions by varying only task-relevant composition, hierarchy and density. Each direction includes:

- user task and first-glance answer;
- content hierarchy;
- component inventory;
- token usage;
- empty/loading/error/uncertain/degraded states;
- accessibility risks;
- what it deliberately does not add.

Tokenizer scores mechanical compliance. QA audits AI slop:

- generic dashboard cards;
- random glassmorphism;
- default box shadows;
- unnecessary gradients;
- oversized hero copy;
- meaningless charts;
- duplicated labels;
- fake precision;
- colour used decoratively;
- “AI-generated” visual clichés.

Winner is selected before production CSS. Stripe/Apple may inform clarity and restraint, never copied components or branding.
