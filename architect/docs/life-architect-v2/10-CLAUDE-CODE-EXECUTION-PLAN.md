# Claude Code execution and migration plan

## Fundamental rule

Claude Code is implementer and repository analyst, not scientific authority. It receives approved contracts, finds actual integration points, proposes repository-grounded ADRs and builds one vertical slice at a time.

## Session start

```text
/effort ultracode        # optional only if current Claude Code supports it
/status                  # verify actual effort/model/features
/life-architect-v2-kickoff
```

If the slash skill is not discovered, instruct Claude to read:

`architect/docs/life-architect-v2/00-INDEX.md`

Do not claim ultracode active unless `/status` confirms it. Project configuration may use a supported persistent effort level, but session command support is version-dependent.

## Phase 0 — repository audit only

No production changes. Audit:

- DEFAULT_DB and migrations;
- IDCOLS/merge/tombstone/snapshot/export/import;
- local encryption and E2EE sync;
- current check-in, diary, insights, psy annotations;
- health/cravings/smartInsights/smartNudge;
- AI routing and provider payloads;
- service worker/cache/versioning;
- UI routes/components/tokens;
- tests and synthetic seeding;
- server schema and what remains ciphertext.

Deliver:

1. `REPOSITORY_REALITY_REPORT.md`;
2. mapping conceptual entity → current structure;
3. conflicts/debt;
4. minimal migration sequence;
5. Phase 1 task contracts;
6. no code commit except audit docs.

## Phase 1 — cross-cutting foundation

- typed metadata conventions in vanilla JS;
- schemaVersion/provenance/privacy/verification/correction;
- migration registry and roundtrip tests;
- feature flags and regulatory quarantine;
- invalidation/recompute infrastructure;
- consent receipts;
- synthetic fixtures.

## Phase 2 — Momentary State vertical slice

Capture valence/activation, optional emotion/color, longitudinal view, personal association with minimum-data gates. Reuse existing check-in; no new menu.

## Phase 3 — Goal/Action vertical slice

GoalDefinition, OutcomeDefinition, ActionEvent ontology, ActionTrajectory descriptive summary, recovery-friendly UX.

## Phase 4 — Health Organizer foundation

HealthProduct/Ingredient, MedicationPlan, IntakeEvent, symptom observations, source document metadata, encrypted blobs, visit-report draft. No interaction or diagnosis.

## Phase 5 — Document extraction

Local/manual first, then optional cloud extraction with consent. Draft field candidates, source bounding evidence, user confirmation, terminology providers behind feature flags.

## Phase 6 — PDRE descriptive analytics

Readiness dimensions, EWMA/null/linear comparisons, data-quality cards, ScenarioOutlook with prediction=null.

## Phase 7 — unified UX

Today/Me/Path/Spheres/Health/Time/Reviews/Library information architecture, progressive disclosure, mobile light/dark QA.

## Phase 8 — astrology integration

Integrate existing subsystem as separately labelled context; preserve rectification boundary; no empirical dependency.

## Phase 9 — advanced research previews

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

UI: 390×844, light/dark, no console errors, offline reload, import/export roundtrip, profile isolation, E2EE sync, migration rollback fixture.

## Commit discipline

One semantic vertical slice per commit. No drive-by refactor. Update handoff after each accepted slice. PR description distinguishes docs, implementation, research preview, quarantine and known gaps.
