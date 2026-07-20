# Claude Code execution and migration plan

## Fundamental rule

Claude Code is implementer and repository analyst, not scientific, medical or psychological authority. It receives approved contracts, finds actual integration points, proposes repository-grounded ADRs and builds one vertical slice at a time.

## Current repository baseline

- existing vanilla-JS/offline-first PWA is preserved;
- local-first/E2EE remains invariant;
- Dual Realm (`Deep Space` / `Ethereal Light`) is already merged into `MAIN` through the existing CSS token layer;
- do not introduce Next.js, React, TypeScript, Tailwind, shadcn, RxDB or a new application root without a separately approved migration ADR;
- the v2 documentation branch is synchronized with the current design baseline.

## Session start

```text
/effort ultracode        # optional only if current Claude Code supports it
/status                  # verify actual effort/model/features
/life-architect-v2-kickoff
```

If the slash skill is not discovered, instruct Claude to read:

1. `CLAUDE.md`;
2. `STUDIO_HANDOFF.md`;
3. `architect/AGENT_BRIEF.md`;
4. `architect/docs/life-architect-v2/00-INDEX.md`;
5. this execution plan.

Do not claim ultracode active unless `/status` confirms it. Project configuration may use a supported persistent effort level, but session command support is version-dependent.

## Phase 0 — repository audit only

No production changes. Audit:

- DEFAULT_DB and migrations;
- IDCOLS/merge/tombstone/snapshot/export/import;
- local encryption and E2EE sync;
- current check-in, diary, insights, psy annotations;
- health/cravings/smartInsights/smartNudge;
- AI routing, provider modules and exact payloads;
- current prompt construction, safety/post-processing and logging;
- structured-output capabilities and provider differences;
- service worker/cache/versioning;
- UI routes/components/current Dual Realm tokens;
- tests, synthetic seeding and mock-provider options;
- server schema and what remains ciphertext;
- smallest safe module seams that avoid expanding `app.js`.

Deliver:

1. `REPOSITORY_REALITY_REPORT.md`;
2. mapping conceptual entity → current structure;
3. conflicts/debt;
4. minimal migration sequence;
5. Phase 1 task contracts;
6. proposed repository path for LLM policy/validators, justified by actual code;
7. no production-code commit except audit documents.

## Phase 1 — cross-cutting foundation

- typed metadata conventions in vanilla JS;
- schemaVersion/provenance/privacy/verification/correction;
- migration registry and roundtrip tests;
- feature flags and regulatory quarantine;
- invalidation/recompute infrastructure;
- consent receipts;
- synthetic fixtures;
- versioned policy/hash registry usable later by the LLM synthesis layer.

## Phase 2 — Momentary State vertical slice

Capture valence/activation, optional emotion/color, longitudinal view, personal association with minimum-data gates. Reuse existing check-in; no new menu.

## Phase 3 — Goal/Action vertical slice

GoalDefinition, OutcomeDefinition, ActionEvent ontology, ActionTrajectory descriptive summary, recovery-friendly UX.

## Phase 4 — Health Organizer foundation

HealthProduct/Ingredient, MedicationPlan, IntakeEvent, symptom observations, source-document metadata, encrypted blobs, visit-report draft. No interaction or diagnosis.

## Phase 5 — Document extraction

Local/manual first, then optional cloud extraction with consent. Draft field candidates, source bounding evidence, user confirmation, terminology providers behind feature flags.

## Phase 6 — PDRE descriptive analytics

Readiness dimensions, EWMA/null/linear comparisons, data-quality cards, ScenarioOutlook with prediction=null.

## Phase 7 — LLM synthesis, voice and safety

Read `16-LLM-SYNTHESIS-VOICE-AND-SAFETY.md` and `schemas/llm-synthesis.schema.json`.

Implement in this order:

1. repository-grounded input/output adapters;
2. versioned prompt-policy blocks;
3. schema, input-reference, claim-class, astrology-isolation, health-safety, tone, numeric and temporal validators;
4. synthetic eval fixtures and mock provider;
5. one low-risk purpose such as `pattern_explanation`;
6. user feedback/correction and audit trail;
7. feature-flagged provider integration after consent review.

Do not create an «oracle» persona, TypeScript file or new framework by assumption. Normative role: `EvidenceGroundedDirectMentor`.

## Phase 8 — unified UX

Today/Me/Path/Spheres/Health/Time/Reviews/Library information architecture, progressive disclosure, evidence drawer, mobile Dual Realm QA. New screens must use existing CSS variables and `design/tokens.json` rather than a parallel design system.

## Phase 9 — astrology integration

Integrate existing subsystem as separately labelled symbolic context; preserve rectification boundary; no empirical dependency. Removing the astrology section must not change the empirical conclusion.

## Phase 10 — advanced research previews

Changepoint candidate, JITAI learning, predictive models only behind research flags and gates.

## Task contract template

```yaml
id:
phase:
owner:
objective:
out_of_scope:
files_owned:
read_dependencies:
data_contracts:
privacy_class:
consent:
feature_flags:
migrations:
rollback:
acceptance_criteria:
tests:
manual_qa:
evidence_handoff:
release_gate:
```

## Verification commands

```bash
cd architect
node --check app.js
node build.mjs --combined dist/app.html
npm test
```

UI: 390×844, Dual Realm light/dark, no console errors, reduced motion, offline reload, import/export roundtrip, profile isolation, E2EE sync and migration rollback fixture.

LLM slice additionally verifies:

- JSON Schema validation;
- no nonexistent input references;
- no probability without approved prediction;
- astrology only in symbolic section;
- no diagnosis/dose/interaction language;
- no shame, coercion or unsupported mind-reading;
- numeric/temporal fidelity;
- safe degraded response on validator failure;
- prompt-injection resistance with synthetic diary/document fixtures.

## Commit discipline

One semantic vertical slice per commit. No drive-by refactor. Update handoff after each accepted slice. PR description distinguishes docs, implementation, research preview, quarantine and known gaps.
