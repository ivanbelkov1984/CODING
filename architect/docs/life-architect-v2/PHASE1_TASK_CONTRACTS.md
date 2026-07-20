# Phase 1 Task Contracts

Status: `DOCUMENTATION_ONLY`

Do not start Phase 1 from this audit PR. These are exact task contracts for later dedicated branches.

## Contract 1 — Schema and migration evidence

- Owner workflow: mobile-only.
- Scope: add tests/docs proving current `DEFAULT_DB`, `IDCOLS`, `migrateRecords`, profiles, snapshots, merge, tombstones, import/export, E2EE roundtrip.
- Files likely owned: `architect/tests/**`, optional docs under `architect/docs/life-architect-v2/**`.
- Out of scope: production behavior changes, schema rewrite, dependency changes unless separately approved.
- Evidence: `architect/app.js`; `DEFAULT_DB` lines 52-79; `migrateRecords` lines 249-268; `IDCOLS` line 3775; `mergeDB` lines 3794-3808; `packPayload` lines 3810-3818.
- Acceptance: existing tests pass; new synthetic roundtrip tests pass; no real personal data in fixtures.
- Rollback: remove tests/docs only.

## Contract 2 — AI policy, validators, and synthetic evals

- Scope: introduce governed AI task policy around existing `callClaude` without changing provider behavior.
- Files likely owned: new docs/tests/policy files; minimal app hooks only after separate approval.
- Evidence: `AI_PROVIDERS` lines 4202-4286; `callClaude` lines 4288-4322; `AI_SYSTEM` line 4327; `PSY_SYSTEM` line 5340; `markPsyBatch` lines 5345-5369.
- Acceptance: synthetic prompt-injection, data-leakage, crisis/health wording, JSON-schema failure, and degraded-output tests.
- Privacy: no real diary/health/birth data.
- Rollback: remove policy/tests; keep existing AI calls.

## Contract 3 — Mobile CI evidence

- Scope: add CI artifacts for mobile screenshots/accessibility/offline checks.
- Files likely owned: `.github/workflows/**`, `architect/tests/**`, docs.
- Dependency: owner approval because GitHub Actions changes are production workflow changes.
- Evidence: current CI `.github/workflows/ci.yml` lines 1-24.
- Acceptance: artifacts readable from iPad/iPhone for 390x844, 430x932, 834x1194, 1194x834; both themes; reduced motion; offline reload.
- Rollback: revert workflow/test changes.

## Contract 4 — Privacy and feedback boundary

- Scope: document and test distinction between E2EE personal store and plaintext feedback/triage.
- Evidence: `packPayload`/`unpackServer` lines 3810-3828; feedback error/outbox lines 4626-4678; feedback triage workflow.
- Acceptance: privacy UI/text says what leaves device; tests prove diary DB is not included in feedback payload by default.
- Rollback: revert docs/UI copy/tests.

## Contract 5 — v2 metadata additive migration

- Scope: add optional provenance/source/claim-class fields to records with idempotent migration.
- Dependency: Contract 1 must be green.
- Evidence: current collections in `DEFAULT_DB` lines 52-79 and current inline `psy` assignment lines 5365-5369.
- Acceptance: old exports import; current local profile upgrades; encrypted sync roundtrip; no data loss; user-visible uncertainty.
- Rollback: migration must tolerate absence of new fields and preserve old fields.

## Open questions

1. Should Contract 3 be Phase 1 or a prerequisite before any user-visible v2 slice?
2. Should AI validators live inside `architect/app.js` initially or in separate plain JS modules loaded by index?
3. Should health features receive an intended-purpose ADR before or during Contract 2?
