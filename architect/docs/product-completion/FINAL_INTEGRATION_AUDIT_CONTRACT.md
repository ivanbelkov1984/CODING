# FINAL INTEGRATION / RELEASE AUDIT CONTRACT

## Entry gate
Start only after the Continuous Bridge implementation is accepted and the controlled private «МОЯ ЖИЗНЬ» backfill has passed its private acceptance checks.

## Goal
Decide whether Life Architect is a coherent, safe, recoverable production product rather than a collection of individually green waves.

## Audit scope
Read the real current MAIN and production deployment. Do not trust historical PR descriptions as evidence.

Verify end-to-end:
- navigation and discoverability of all primary user workflows;
- canonical data model and absence of parallel duplicate ledgers;
- external-work provenance, sourceRefs, claimClasses and semantic source identity;
- incremental Bridge idempotence and disconnect/revoke behavior;
- Psychology Workspace, adaptive engine and Mind–Body derived layer;
- Health organizer, reports and red-flag boundaries;
- Astrology provenance/epistemic labeling and isolation from medical/psychological claims;
- Unified Intelligence evidence links and dedup rules;
- profile isolation, sync, tombstones and conflict behavior;
- encrypted portable backup/restore for every current persistent slice;
- offline/degraded behavior where promised;
- privacy: no raw private data in public logs, CI evidence, GitHub fixtures or analytics;
- accessibility/mobile matrix and no dead/decorative paths;
- production deployment parity with audited MAIN.

## Required adversarial checks
- duplicate source presented through multiple provenance routes;
- same text/different source identity;
- cross-type source conflict;
- stale/replayed Bridge page/cursor;
- interrupted import and interrupted restore;
- wrong backup password/corrupt ciphertext -> zero mutation;
- edit/delete/tombstone followed by sync and recompute;
- connector permission revocation;
- missing data != zero;
- causal/diagnostic/predictive wording mutation guards still fail;
- real user-data detector is capable of catching a seeded synthetic canary pattern without any real private sample.

## Product-completion reconciliation
Update `PRODUCT_COMPLETION_AUDIT.md` from the real final MAIN. For every former WORKING/PARTIAL/UI-ONLY/BROKEN/MISSING item, state final status and evidence. Explicitly list any consciously deferred item and explain whether it blocks the promised product.

Review old open Studio/v2/umbrella issues and PRs. Close/archive only when the final audit proves they are superseded or complete; do not erase historical reference branches solely for tidiness.

## Release governance
Before declaring completion, MAIN should have an owner-approved protection rule requiring the relevant CI checks before merge and preventing autonomous bypass. No code agent should rely on a blanket authorization to merge to production.

## Definition of done
- all required CI/evidence green on final MAIN;
- production deploy green and parity verified;
- no blocker in privacy, data integrity, backup/restore, canonical-source architecture or safety boundaries;
- final audit contains no unresolved promised MISSING/BROKEN item;
- any deferrals are explicitly owner-approved and non-blocking;
- umbrella #145 is closed only after these conditions are met.
