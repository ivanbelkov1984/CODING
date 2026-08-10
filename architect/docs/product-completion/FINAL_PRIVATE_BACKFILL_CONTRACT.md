# FINAL PRIVATE BACKFILL CONTRACT

## Goal
Perform the controlled owner-side/private migration of the user's «МОЯ ЖИЗНЬ» material into the application's canonical records only after the Continuous Bridge is accepted.

## Privacy boundary
This phase is intentionally private and must not place real user content in public GitHub. No real LIFE/DREAM/PARA/PSY/health/relationship text, source IDs, chat IDs, Drive object IDs, names, screenshots or exported JSON may be committed, attached to issues/PRs, pasted into test fixtures or emitted to public logs/artifacts.

Public evidence may contain only non-identifying aggregate counts and pass/fail statements.

## Source classification
Every candidate object must preserve its original provenance and claim layer. At minimum distinguish user-authored fact/report, user experience, practice action, working hypothesis, symbolic/esoteric interpretation, assistant interpretation, external/reference material and unknown/unsupported claim. Existing `claimClasses[]` / primary claim semantics remain authoritative; never promote a weaker class to an established fact.

## Identity / dedup
- semantic source object identity is `sourceId` alone;
- module/chat/session are provenance, not identity;
- all aliases are preserved through `sourceRefs[]`;
- dedup is provenance-based, never text-based;
- identical text from distinct sourceIds stays distinct;
- the same sourceId encountered through LIFE/DREAM/PARA/PSY/Drive/chat aliases resolves to one canonical entity when the target semantic object is the same;
- cross-type conflicts fail closed and require explicit review.

## Execution stages
1. Inventory privately accessible source modules and periods. Record only aggregate counts publicly.
2. Dry-run with preview only. No canonical mutation.
3. Review rejected/conflicting/ambiguous candidates privately.
4. Commit in bounded batches using the accepted bridge transaction contract.
5. After every batch run dedup, provenance, profile isolation, sync and encrypted-backup integrity checks.
6. Re-run the same source window and prove idempotence: zero new canonical records unless the source itself changed.
7. Perform private spot checks from source object -> canonical record -> provenance -> backup/restore.
8. Produce a private migration manifest for the owner. A public completion note may include only aggregate totals by safe generic category, with no identifiers.

## Stop conditions
Stop immediately on any evidence of:
- private data entering public GitHub/logs/artifacts;
- duplicate creation for an already known sourceId;
- claim-class promotion;
- cross-profile contamination;
- non-transactional partial commit;
- loss of sourceRefs/provenance after sync or restore;
- destructive deletion inferred from a missing external object;
- canonical-source model bypass.

## Definition of done
The intended «МОЯ ЖИЗНЬ» source scope is imported/linked privately, repeat runs are idempotent, provenance and claim classes survive sync and encrypted backup/restore, no public artifact contains real personal data, and the owner can trace a sampled canonical record back to its original source provenance.
