# Claude Code execution and migration plan

## Fundamental rule

Claude Code is implementer and repository analyst, not scientific, medical or psychological authority. It receives approved contracts, finds actual integration points, proposes repository-grounded ADRs and builds one vertical slice at a time.

## Owner operating environment

The owner has only iPad Pro 11 and iPhone 14 Pro Max.

Default execution path:

```text
Claude Code cloud
→ dedicated GitHub branch
→ draft PR
→ GitHub Actions / preview
→ owner review on iPad/iPhone
→ explicit merge decision
```

Do not require a local computer, local clone, desktop IDE, terminal installation or manual coding by the owner.

Read:

- `17-CLAUDE-CODE-INSTALLATION-AND-PHASE0-START.md`;
- `18-MOBILE-ONLY-DEVELOPMENT-AND-NATIVE-MIGRATION.md`.

## Current repository baseline

- existing vanilla-JS/offline-first PWA is preserved;
- local-first/E2EE remains invariant;
- Dual Realm (`Deep Space` / `Ethereal Light`) is already merged into `MAIN` through the existing CSS token layer;
- do not introduce Next.js, React, TypeScript, Tailwind, shadcn, RxDB or a new application root without a separately approved migration ADR;
- the v2 documentation branch is synchronized with the current design baseline;
- PWA is the implementation core; native packaging is a later wrapper stage.

## Mobile cloud session start

In the official Claude app Code tab or `claude.ai/code`:

1. select repository `ivanbelkov1984/CODING`;
2. select base branch `agent/astrology-harness-foundation` for Phase 0;
3. choose **Plan mode**;
4. paste the exact prompt from document `17`;
5. require a new Claude-generated branch and documentation-only draft PR;
6. stop after Phase 0.

Custom slash skills may be available, but the mobile workflow does not depend on them. Reading the indexed documents is sufficient.

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
- current build/deploy/preview path;
- mobile safe areas, keyboard, PWA install and offline behavior;
- future Capacitor readiness and native adapter seams;
- smallest safe module seams that avoid expanding `app.js`.

Deliver:

1. `REPOSITORY_REALITY_REPORT.md`;
2. mapping conceptual entity → current structure;
3. conflicts/debt;
4. minimal migration sequence;
5. Phase 1 task contracts;
6. proposed repository path for LLM policy/validators, justified by actual code;
7. proposed mobile-accessible preview and CI path;
8. native-readiness findings;
9. no production-code commit except audit documents.

## Phase 0.5 — mobile cloud development foundation

After owner acceptance of the reality report:

- create repository-grounded GitHub Actions checks;
- make CI summaries readable from GitHub mobile;
- provide preview URL or artifact accessible on iPad/iPhone;
- add synthetic fixtures only;
- define protected secret boundaries;
- add mobile viewport screenshot/accessibility tests;
- document Codespaces fallback and private port use;
- require final handoff and rollback for every cloud session.

Gate: the owner can initiate, inspect, preview and approve/reject work using only mobile devices.

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

Mobile preview must cover iPhone/iPad, keyboard, safe area, correction and offline reload.

## Phase 3 — Goal/Action vertical slice

GoalDefinition, OutcomeDefinition, ActionEvent ontology, ActionTrajectory descriptive summary, recovery-friendly UX.

## Phase 4 — Health Organizer foundation

HealthProduct/Ingredient, MedicationPlan, IntakeEvent, symptom observations, source-document metadata, encrypted blobs, visit-report draft. No interaction or diagnosis.

Development and CI use synthetic/redacted health fixtures only.

## Phase 5 — Document extraction

Mobile file-picker flow first, then optional cloud extraction with consent. Draft field candidates, source bounding evidence, user confirmation, terminology providers behind feature flags. Support interrupted review recovery.

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

# Native migration — after web stability

## Native N0 — readiness audit

Confirm build output, routing, WebView/service-worker behavior, IndexedDB persistence, deep links, blobs/files, CSP/network domains, background constraints and privacy requirements.

## Native N1 — Capacitor shell spike

Add Capacitor to the existing web app on an experimental branch. Create iOS/Android shells without rewriting domain logic. Introduce PlatformAdapter seams for native capabilities.

## Native N2 — cloud builds and internal testing

- Android: Linux CI builds APK/AAB and sends to internal testing.
- iOS: macOS CI or Xcode Cloud builds archive and sends to TestFlight.
- signing credentials live only in protected CI stores.
- owner reviews from App Store Connect/TestFlight and Google Play tools on mobile.

## Native N3 — native capabilities

Add notifications, biometric lock, secure key storage, camera/file import, share sheet and background tasks one by one behind feature flags.

Apple Health/Health Connect import requires separate privacy, consent and regulatory review.

## Native N4 — store release

Separate Apple and Google release gates: privacy/data safety, account deletion/export, screenshots, age rating, health-claims audit, signing, staged rollout and rollback.

## Task contract template

```yaml
id:
phase:
owner:
owner_workflow: mobile_only
objective:
out_of_scope:
base_branch:
branch:
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
mobile_viewports:
preview_required: true
ci_required: true
manual_qa:
evidence_handoff:
release_gate:
manual_merge_only: true
```

## Verification

Use exact repository commands confirmed by Phase 0. Current baseline:

```bash
cd architect
node --check app.js
node build.mjs --combined dist/app.html
npm test
```

UI matrix:

- 390×844;
- 430×932;
- 834×1194;
- 1194×834;
- Dual Realm light/dark;
- safe areas and software keyboard;
- no console errors;
- reduced motion;
- offline reload and PWA standalone;
- import/export roundtrip;
- profile isolation;
- E2EE sync;
- migration rollback fixture.

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

One semantic vertical slice per commit. No drive-by refactor. Every cloud session ends with pushed changes or an explicit no-change report, exact branch/commit/PR evidence and a handoff that survives disconnects. PR description distinguishes docs, implementation, research preview, quarantine and known gaps.
