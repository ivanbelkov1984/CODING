# Phase 1 Task Contracts

Status: `PLANNING_ONLY_PHASE_1_NOT_STARTED`

These contracts become eligible only after Phase 0.5 exit approval. Each task must use its own branch and PR.

## Contract P0.5-A — Repository evidence harness

**Classification:** Phase 0.5.

- Objective: produce reproducible branch, syntax, build, test, and diff evidence.
- Prerequisites: corrected Phase 0 merged; canonical base decision pending.
- Allowed files: test/evidence scripts, synthetic fixtures, CI evidence docs, dedicated non-production workflow only if separately approved.
- Forbidden files: production behavior in `architect/app.js`, `sw.js`, backend runtime, deploy workflow, real data.
- Production behavior policy: unchanged.
- Steps: compare branches; execute command ledger; capture results; verify seven/specified-file boundaries.
- Tests/CI: clean install, syntax checks, standalone build, full `npm test`.
- Mobile evidence: not required unless workflow/UI changes.
- Acceptance: reproducible green ledger or explicit blocking gaps.
- Rollback: revert evidence-only PR.
- Stop: runtime diff, real data, ambiguous base.
- Owner decisions: canonical implementation base.
- Branch: `agent/phase-0-5-repository-evidence`.
- PR title: `Phase 0.5 repository and command evidence`.
- Marker: `PHASE_0_5_REPOSITORY_EVIDENCE_COMPLETE`.

## Contract P0.5-B — Data roundtrip and tombstone tests

**Classification:** Phase 0.5.

- Objective: freeze existing profile, migration, backup, snapshot, import/export, sync, and deletion behavior with synthetic tests.
- Prerequisites: P0.5-A base decision.
- Allowed files: tests, synthetic fixtures, test helpers, evidence docs.
- Forbidden files: production schema/data conversion, deploy, provider credentials.
- Data/privacy: synthetic values only; include no real diary/health/birth/relationship data.
- Steps: inventory stores; create complete fixture; roundtrip; collision test; failure recovery.
- Required tests: legacy profile migration; export/import idempotence; snapshot restore; backup recovery; same-id cross-collection tombstone; encrypted sync roundtrip; secret exclusion; media manifest behavior.
- CI evidence: test report and fixture manifest.
- Mobile evidence: one browser import/export smoke flow on iPad viewport.
- Acceptance: determinate tombstone classification and zero silent loss.
- Rollback: remove tests/helpers; no user conversion occurred.
- Stop: production fix needed—open separate PR instead.
- Owner decisions: acceptable conflict policy if existing behavior is ambiguous.
- Branch: `agent/phase-0-5-data-roundtrip-evidence`.
- PR title: `Phase 0.5 data roundtrip and tombstone evidence`.
- Marker: `PHASE_0_5_DATA_EVIDENCE_COMPLETE`.

## Contract P0.5-C — Privacy boundary evidence

**Classification:** Phase 0.5.

- Objective: prove plaintext/ciphertext, destinations, consent, retention, and redaction for sync, AI, feedback, errors, exports, and local stores.
- Allowed files: tests/mocks, synthetic fixtures, privacy evidence docs.
- Forbidden files: real provider calls/keys, production endpoint changes, personal data.
- Tests: network interception, local store inspection, export inspection, encrypted envelope assertions, feedback/error payload redaction.
- CI: synthetic mock endpoints only.
- Mobile evidence: consent/disclosure screenshots at supported viewports where UI already exists.
- Acceptance: every path in the repository reality table has evidence or is explicitly blocking.
- Rollback: evidence-only revert.
- Stop: any real credential or production payload appears.
- Owner decisions: BYO key policy; feedback retention/access; preview visibility.
- Branch: `agent/phase-0-5-privacy-boundaries`.
- PR title: `Phase 0.5 privacy boundary evidence`.
- Marker: `PHASE_0_5_PRIVACY_EVIDENCE_COMPLETE`.

## Contract P0.5-D — Mobile CI evidence

**Classification:** Phase 0.5.

- Objective: create mobile-accessible screenshots/artifacts and offline/update evidence without production deployment.
- Allowed files: tests, CI workflow dedicated to PR evidence, synthetic preview configuration, docs.
- Forbidden files: production deploy behavior, secrets, real backend data, UI redesign.
- Tests: iPhone/iPad viewport matrix, keyboard/touch, overflow, offline reload, service-worker update, accessibility smoke.
- CI evidence: screenshots, trace/report, static build artifact.
- Acceptance: owner opens evidence on iPad/iPhone; no public secrets/data.
- Rollback: delete evidence workflow/artifacts; production deploy unaffected.
- Stop: preview requires production credentials or writes.
- Owner decisions: artifact vs authenticated temporary preview.
- Branch: `agent/phase-0-5-mobile-ci-evidence`.
- PR title: `Phase 0.5 mobile CI and preview evidence`.
- Marker: `PHASE_0_5_MOBILE_EVIDENCE_COMPLETE`.

## Contract P1-A — Additive schema metadata

**Classification:** Phase 1.

- Objective: add optional provenance/privacy/correction/version metadata without breaking current records.
- Prerequisites: all Phase 0.5 contracts approved.
- Allowed files: narrowly defined schema/migration module, related tests, docs; exact list must be stated in the task PR.
- Forbidden files: UI redesign, storage-engine migration, deploy, native wrapper, health diagnosis/treatment, AI gateway.
- Production policy: backward-compatible reads; idempotent additive writes; no destructive rename.
- Steps: define optional metadata; adapter at existing boundaries; backfill only on touched/imported records; preserve old export readability.
- Tests: full Phase 0.5 roundtrip suite plus old-version fixtures and rollback fixture.
- CI/mobile: full CI; import/export mobile smoke; no visual regression.
- Acceptance: old and new records roundtrip; no secret/data boundary expansion; rollback reads all records.
- Rollback: disable writes/remove adapter while keeping optional fields harmless.
- Stop: any required destructive conversion or unexplained diff.
- Owner decisions: final provenance taxonomy and correction lifecycle.
- Branch: `agent/phase-1-additive-schema-metadata`.
- PR title: `Phase 1 additive schema metadata`.
- Marker: `PHASE_1_ADDITIVE_SCHEMA_COMPLETE`.

## Contract P1-B — AI policy and validators seam

**Classification:** Phase 1.

- Objective: extract governed policy/validators/evals behind unchanged AI call sites.
- Prerequisites: privacy boundary approval and synthetic AI fixtures.
- Allowed files: new AI policy/validator modules, minimal imports/call-site wiring, tests, docs.
- Forbidden files: provider gateway migration, autonomous tools, new health claims, real diary fixtures.
- Production policy: same feature triggers and provider routing; fail closed on invalid structured output.
- Privacy: no added fields in provider payload without explicit review.
- Tests: golden synthetic cases, malformed JSON, injection corpus, provider error, timeout, budget, no-key path.
- CI/mobile: full CI; screenshots only where error state changes.
- Acceptance: behavior compatibility documented; validators independently testable; injection and unsafe outputs contained.
- Rollback: restore inline constants/call sites without data migration.
- Stop: behavior expansion or new provider data transfer.
- Owner decisions: approved tone, safety rules, refusal/escalation behavior.
- Branch: `agent/phase-1-ai-policy-validators`.
- PR title: `Phase 1 governed AI policy and validators`.
- Marker: `PHASE_1_AI_POLICY_SEAM_COMPLETE`.

## Contract P1-C — Privacy and feedback boundaries

**Classification:** Phase 1.

- Objective: implement approved consent, minimization, redaction, retention-visible behavior for AI/feedback/errors.
- Prerequisites: P0.5-C owner decisions.
- Allowed files: exact feedback/error/privacy adapters and associated UI/tests/docs.
- Forbidden files: unrelated UI, sync crypto redesign, production analytics, medical logic.
- Tests: synthetic PII redaction, opt-in/opt-out, clear buffer, failed submit, export exclusion.
- CI/mobile: consent and error-state screenshots on iPhone/iPad.
- Acceptance: automatic paths contain no sensitive content beyond approved minimum; retention/access disclosed.
- Rollback: disable submission and keep local clear action.
- Stop: endpoint cannot meet policy or consent is ambiguous.
- Branch: `agent/phase-1-privacy-feedback-boundaries`.
- PR title: `Phase 1 privacy-safe feedback and diagnostics`.
- Marker: `PHASE_1_PRIVACY_BOUNDARIES_COMPLETE`.

## Global Phase 1 prohibitions

No task may silently include Capacitor, primary IndexedDB migration, framework rewrite, diagnosis/treatment, public-store release, provider gateway redesign, or production-data migration. Those require separate architecture decisions and contracts.

`PHASE_1_CONTRACTS_EXECUTABLE_AFTER_PHASE_0_5_APPROVAL`
