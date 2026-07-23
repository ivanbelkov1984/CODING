# 06 — BACKLOG

## Priority 0 — Repository reality and cleanup

### P0-A — Read-only audit of `MAIN`

Deliver `09-REPOSITORY-AUDIT.md` with:

- runtime/file map;
- storage/profile/media model;
- E2EE/sync map;
- AI provider call-site map;
- backend/deploy/service-worker map;
- current test coverage;
- high-risk defects found;
- proof that runtime was not modified.

### P0-B — Audit old open Claude PR

Do not merge or delete blindly. Classify each as:

- KEEP ACTIVE;
- SUPERSEDED;
- CLOSE WITHOUT MERGE;
- REBUILD CLEANLY;
- MERGE CANDIDATE AFTER REBASE/TEST.

Open pre-Codex Claude/Studio PR visible at cleanup time:

- #13 — design status/brief documents;
- #14 — vision/agent brief/handoff documents;
- #16 — orders inbox permanent channel;
- #25 — design tokens candidate, likely superseded by merged #39;
- #27 — CI syntax lint/studio trigger;
- #30 — ADR documents;
- #31 — graph animation;
- #37 — `.gitignore` audit;
- #38 — menu 6→3;
- #43 — elevation variant, likely superseded by merged #44/#45.

Claude must compare each PR against current `MAIN`, not rely only on titles.

### P0-C — Delete abandoned GPT/Codex branches

Use `07-CLEANUP-MANIFEST.md`. Delete only after confirming:

- associated PR is closed;
- branch is not protected/default;
- no unique owner-approved work needs preservation;
- `MAIN` and the clean Claude branch are unaffected.

## Priority 1 — Encrypted portable backup

Implement from scratch from `MAIN` according to `05-ENCRYPTED-BACKUP-SPEC.md`.

No Codex code import. First audit production storage/media formats, then plan, then one focused implementation PR.

## Priority 2 — Consolidate product documentation

After repository audit:

- reconcile real application capabilities with `02-PRODUCT-VISION.md`;
- remove duplicated/stale handoff docs;
- create one owner-readable product index;
- retain exact historical decisions in decision log rather than many conflicting source-of-truth documents.

## Priority 3 — Psych module

Prepare a separate contract for:

- momentary state;
- emotions/activation;
- patterns;
- relationships;
- method «Зачем?»;
- direct evidence-grounded mentor voice;
- source labels and confidence;
- crisis boundaries.

No implementation in backup PR.

## Priority 4 — Health module

Separate contract for:

- health documents;
- symptoms;
- measurements;
- laboratory results;
- medication/supplement plans and actual intake;
- preparation for doctor;
- privacy and regulatory quarantine.

No diagnosis/dosage/interaction engine without later explicit approval.

## Priority 5 — Astrology domain

Separate architecture and implementation contract:

- astronomy/time/geography calculations;
- Swiss Ephemeris feasibility;
- school/tradition/ruleset ontology;
- natal/transits/prognostics;
- rectification hypotheses;
- source citations and confidence;
- hard isolation from medical and psychological diagnosis.

## Priority 6 — Scenario planning and synthesis

Only after evidence/data contracts are stable:

- structured synthesis;
- scenarios with conditions/alternatives;
- trend and prediction separation;
- deterministic validators;
- evidence links;
- no invented probability.

## Deferred

- Capacitor/native wrapper;
- Apple Health/Health Connect;
- server-side RAG/vector DB;
- analytics/telemetry;
- automated clinical alerts;
- automatic remote backup.

## Rule

Only one Priority 1+ implementation task may be active at a time. Documentation/audit tasks may accompany it only when directly required.
