---
name: astrology-implementation
description: Implement the approved western tropical astrology foundation in controlled phases after repository audit and license gates.
effort: xhigh
context: fork
agent: studio-dispatcher
---

# Astrology Implementation

Read `architect/docs/astrology/00-IMPLEMENTATION_INDEX.md`. Execute one epic at a time:

1. repository contracts and schema scaffolding;
2. licensing/build spike;
3. birth evidence/time/place normalization;
4. WASM adapter and provenance;
5. zodiac/houses/aspects;
6. event and sensitivity engines;
7. UI and interpretation boundaries;
8. tests and release gates.

Each epic requires a task contract, migrations/roundtrip tests, adversarial QA and handoff. Never implement all layers in one context/window. Do not expose unlicensed Swiss Ephemeris artifacts publicly.
