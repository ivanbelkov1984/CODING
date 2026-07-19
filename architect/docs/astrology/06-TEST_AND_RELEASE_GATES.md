# Test and Release Gates

## Repository baseline

```bash
cd architect
node --check app.js
node build.mjs --combined dist/app.html
npm test
```

Add new tests without reducing full-suite coverage. UI requires mobile visual/accessibility review according to current design system.

## Calculation tests

- pinned native/WASM golden fixtures;
- requested/returned flags;
- body/file/range failures;
- zodiac boundaries;
- house codes and polar errors;
- branch-aware aspects;
- stations, retrograde loops, tangent/near misses;
- uncertainty partitions;
- cache invalidation/provenance.

## Time tests

- zones/links;
- gaps/folds;
- release diffs;
- calendar reform/proleptic/BCE;
- unresolved historical hypotheses;
- client/server parity.

## Data tests

- migration idempotence;
- encrypted sync roundtrip;
- tombstones/LWW;
- backup/restore;
- import/export;
- consent revocation and derived invalidation.

## Rectification gates

- no probability language;
- full search provenance;
- alternatives and contradicting events;
- holdout/null comparison;
- sensitivity and step perturbation;
- budget/cancel/resume;
- revert accepted profile.

## Scenario forecasting gates

- operational outcome;
- no future leakage;
- baseline model;
- temporal/evaluation split;
- calibration and overall scoring;
- uncertainty;
- astrology isolated incremental-value test;
- approved intended use;
- drift monitoring.

## Security/license gates

- Swiss Ephemeris contract and artifacts;
- dependency/SBOM;
- CSP/XSS/service worker;
- E2EE/key lifecycle;
- authorization/public share;
- content license registry;
- prompt injection and harmful-output evals;
- privacy/legal review.

A feature is not production-ready because tests pass if its license, scientific validation or safety gate is red.
