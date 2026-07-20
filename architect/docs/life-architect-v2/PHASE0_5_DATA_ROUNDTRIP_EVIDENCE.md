# Phase 0.5-B Data Roundtrip, Tombstone, Snapshot and Encrypted Sync Evidence

Status: `PHASE_0_5_B_EVIDENCE_AND_TEST_ONLY`

## Scope

This task adds synthetic automated evidence for current data behavior only. Phase 1 is not started. No production runtime file, schema, workflow, deployment configuration, encryption algorithm, sync protocol, AI behavior, health behavior, or native configuration is changed.

## Test architecture

The focused Node harness is located at:

`architect/tests/evidence/phase0_5_data_roundtrip_evidence.mjs`

It first asserts the presence of current `architect/app.js` source contracts and then executes a narrow synthetic model of current storage, merge, tombstone, export, encrypted-envelope and media-reference behavior.

This is evidence of current semantics, not a replacement for browser UI, IndexedDB, FileReader, Blob, service-worker or real-backend integration tests.

## Synthetic fixture manifest

The fixture contains only fictional values and covers:

- two profile namespaces;
- all current ID collections named by the test contract;
- scalar/object stores;
- timestamps and `__ts`;
- `_del` tombstones;
- synthetic diary and dream strings;
- chats, digests, configuration and media metadata;
- duplicate `shared-id` records in `insights` and `dreams`;
- no real personal data, credentials, API keys, tokens, passphrases or binary media.

## Focused test results

| # | Test | Result | Classification |
|---:|---|---|---|
| 1 | Required source contracts exist | Pass | observed repository fact |
| 2 | Profile DB/config/passphrase namespaces remain isolated | Pass | observed test result |
| 3 | Legacy flat-key migration model is idempotent | Pass | observed test result |
| 4 | Malformed primary storage can recover from a valid backup model | Pass | observed test result |
| 5 | Snapshot JSON preserves tombstones and document timestamps | Pass | observed test result |
| 6 | Synthetic export/import preserves semantic data and excludes named secret fields | Pass | observed test result |
| 7 | Global tombstone collision across collections | Pass, defect reproduced | confirmed defect/current behavior risk |
| 8 | Newer record wins and merge is idempotent in the focused model | Pass | observed test result |
| 9 | Encrypted envelope roundtrip, wrong passphrase and corruption failure | Pass | observed test result |
| 10 | No-passphrase plaintext path remains explicit | Pass | observed test result |
| 11 | Media metadata exports while blob bytes remain out of band | Pass | observed test result |

Expected focused result: `11/11 passed`.

## Tombstone collision verdict

**Confirmed defect/current behavior risk.**

The current data model uses one global `_del` map keyed only by record ID. When two different ID collections contain the same ID, a newer tombstone for that ID suppresses both records during collection-by-collection merge filtering.

Reproduced case:

- `insights` contains `shared-id`;
- `dreams` contains `shared-id`;
- only the insight is intended to be deleted;
- `_del.shared-id` is newer than both records;
- merge filtering removes both the insight and the dream.

This blocks schema/sync implementation until a dedicated fix and migration contract is approved. The evidence PR does not modify `_del`, `mergeById` or `mergeDB`.

## Export/import verdict

Synthetic JSON semantic roundtrip passes in the focused harness, including stable IDs, timestamps and unknown data fields.

Browser-bound `exportData`/`handleImport`, FileReader, Blob download, user confirmation flows and old-version UI migration remain evidence gaps.

## Backup and snapshot verdict

Synthetic localStorage backup recovery and JSON snapshot preservation pass in the focused harness. Browser quota behavior, interrupted writes, retention scheduling and complete UI restore remain evidence gaps.

## Encrypted sync verdict

Synthetic AES-GCM envelope roundtrip passes. The stored encrypted envelope does not expose synthetic diary text. Wrong passphrase and corrupted payload fail.

The no-passphrase path remains intentionally plaintext and must be treated as an explicit security boundary. No real backend was called.

## Secret-exclusion verdict

The focused export model excludes:

- AI provider key;
- sync passphrase material;
- recovery material;
- backend token.

`CFG.spaceKey` remains included by current export behavior and requires privacy/security review. Until its exact role is classified, it must be treated as potentially sensitive configuration rather than assumed-safe metadata.

## Media verdict

JSON export can preserve media IDs and blob references. Actual IndexedDB blobs remain out of band, so a JSON-only backup is not a complete media backup. Missing blob handling and native media migration remain open evidence gaps.

## Command ledger

Codex reported the following local results before its network-blocked push attempt:

| Command | Exit | Result |
|---|---:|---|
| `node --check architect/app.js` | 0 | pass |
| `node --check architect/sw.js` | 0 | pass |
| `node --check architect/backend/server.js` | 0 | pass |
| focused evidence harness | 0 | 11 passed, 0 failed |
| `node architect/build.mjs` | 0 | pass |
| `cd architect && npm test` | 1 | local Chromium executable unavailable |
| remote fetch/push | 128 | Codex CONNECT tunnel 403 |

GitHub CI on this PR is the authoritative repository-runner evidence for build and Playwright E2E.

## Confirmed defects

1. Global tombstone keys are not collection-scoped and can delete same-ID records from unrelated collections.

## Confirmed risks and owner/security decisions

1. A tombstone repair requires a migration strategy, not only a local code edit.
2. `CFG.spaceKey` export classification must be decided before export UX expansion.
3. JSON backup is incomplete for IndexedDB media blobs.
4. The no-passphrase sync path is plaintext by design and must be clearly represented to users and security review.

## Evidence gaps

- real browser export/import UI;
- real IndexedDB blob backup/restore;
- browser quota and interrupted-write simulation;
- service-worker/offline interaction;
- real backend envelope compatibility;
- local Playwright execution in Codex due blocked browser download.

## Blockers

Phase 1 data/schema/sync work remains blocked until:

- a collection-scoped tombstone identity and migration contract is approved;
- `CFG.spaceKey` is classified and export policy is decided;
- Phase 0.5-C privacy/E2EE evidence is completed.

## Recommended next action

1. Merge this evidence-only PR after CI and architect review.
2. Run Phase 0.5-C privacy/E2EE boundary review.
3. Create a separate design/fix contract for collection-scoped tombstones, including compatibility and rollback.
4. Do not silently fix production runtime in this evidence PR.

## Rollback

Revert the two evidence-only files. No runtime state, user data, schema or deployment behavior is affected.

## Final markers

`PHASE_0_5_DATA_EVIDENCE_COMPLETE`

`SYNTHETIC_DATA_ONLY`

`PRODUCTION_BEHAVIOR_UNCHANGED`

`PHASE_1_NOT_STARTED`

`READY_FOR_ARCHITECT_REVIEW`
