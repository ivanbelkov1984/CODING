# Tombstone Namespacing Remediation

Status: `TOMBSTONE_COLLISION_REMEDIATED_PENDING_CI`

## Problem

Phase 0.5-B reproduced a confirmed data-integrity defect in the previous sync model. `DB._del` was a flat object keyed only by record ID:

```json
{ "shared-id": 1720000000000 }
```

`mergeDB` supplied that same tombstone map to every collection in `IDCOLS`. When two collections contained the same ID, deleting one record could suppress the unrelated record in the other collection.

## New contract

Tombstones are collection-scoped:

```json
{
  "insights": { "shared-id": 1720000000000 },
  "dreams": { "another-id": 1720000001000 }
}
```

Internal deletion paths now call `tomb(collection, id)`. Merge applies only `DB._del[collection]` to that collection.

Undo calls `untomb(collection, id)` and cannot remove a tombstone belonging to another collection.

## Legacy migration

The previous flat format remains readable.

During hydration and merge:

1. A flat legacy tombstone whose ID exists in exactly one collection is migrated into that collection.
2. A flat legacy tombstone whose ID is present in multiple collections is retained under `_legacy`.
3. Ambiguous `_legacy` tombstones are not applied destructively. Both records survive until the ambiguity can be resolved by a future explicit migration or user action.
4. Already namespaced tombstones are preserved.
5. Migration is idempotent.
6. The existing 120-day tombstone retention policy remains in place.

This policy deliberately prefers a possible resurrection of a legacy-deleted record over silent deletion of unrelated personal data.

## Updated production paths

- generic undo-capable record deletion;
- sphere deletion;
- associated sphere-log deletion;
- digest deduplication;
- weekly digest replacement;
- digest retention cleanup;
- merge and sync reconciliation;
- hydration migration;
- undo restoration.

## Regression coverage

`architect/tests/evidence/tombstone_namespacing_regression.mjs` verifies:

- source-level presence of the collection namespace and migration hook;
- explicit collection arguments at internal deletion paths;
- same-ID collision isolation;
- reverse merge direction;
- unique legacy migration;
- ambiguous legacy fail-safe behavior;
- migration idempotence;
- timestamp precedence and 120-day retention;
- collection-aware undo;
- JSON snapshot/export preservation;
- newer-update versus older-deletion ordering.

The focused regression command is executed before the existing build and Playwright E2E suite through `npm test`.

## Compatibility

- Existing namespaced profiles, local backups, daily snapshots and encrypted sync envelopes continue to serialize `DB._del` as JSON.
- Existing flat tombstones remain readable.
- No backend schema change is required because the backend stores the client payload as an opaque JSON object or encrypted envelope.
- Encrypted payload format is unchanged.

## Safety decision

The remediation changes production merge behavior because the previous behavior could destroy unrelated records. It does not alter UI, health logic, AI behavior, encryption algorithms, deployment or native configuration.

## Remaining risk

An ambiguous tombstone created by an old client is preserved under `_legacy` and intentionally does not delete either colliding record. This is a conservative compatibility compromise. New clients create only collection-scoped tombstones.

Older clients that have not received this remediation still understand the rest of the database but do not understand nested tombstones correctly. Therefore all actively syncing clients should be updated before relying on cross-device deletion semantics.

## Rollback

Reverting the remediation restores the flat collision-prone behavior and is not recommended. The namespaced structure is retained in backups and exports, so rollback must not be performed after new-format tombstones have been created unless a reverse migration is explicitly written and tested.

## Gate

The tombstone blocker is closed only after:

- focused regression tests pass;
- existing Playwright E2E passes;
- final PR diff contains no temporary patch workflows or patcher scripts;
- independent review confirms the migration policy.

`PHASE_1_NOT_STARTED`
