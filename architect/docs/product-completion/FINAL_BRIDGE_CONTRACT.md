# FINAL BRIDGE CONTRACT

## Goal
Implement a continuous, user-controlled GPT / Google Drive bridge on top of the canonical External Work contracts already established by Waves 6–8.

## Non-negotiable invariants
- No private real-data fixtures or examples in the public repository.
- No second life ledger and no new EVENT_SOURCE for imported/meta material.
- Canonical application collections remain canonical.
- semantic `sourceId` is source-object identity; module/chat/session are provenance only.
- Reuse `sourceRefs[]`, `claimClasses[]`, textOrigin, preview/confirm, transactional zero-mutation-on-error, profile isolation, sync, tombstones and encrypted backup semantics.
- Never deduplicate by text.
- Never silently promote claims.
- No background publication/export of user data.

## Required behavior
1. Fresh read-only audit of current MAIN before implementation.
2. Decide the minimum viable architecture for authenticated Drive/GPT intake without weakening the browser privacy boundary. Reuse existing backend only if it can preserve the contract; otherwise keep ingestion owner-controlled rather than inventing unsafe OAuth shortcuts.
3. Add source discovery/read flow with explicit scope and visible provenance.
4. Convert discovered external material to `architect-external-work-v2` (or an explicitly versioned successor only if the existing contract is insufficient).
5. Preview before any mutation: new records, exact dedup matches, alias/sourceRef merges, conflicts, rejected items and claim classes.
6. Explicit confirmation before commit. Batch commit must remain transactional.
7. Incremental refresh must be idempotent: re-reading the same Drive/chat object must create 0 duplicates and may only append new provenance aliases when justified.
8. Deletion/edit semantics must be explicit. Never interpret disappearance from Drive as deletion of canonical user data without explicit owner action.
9. Network/connector errors, revoked permission, malformed payload, stale cursor and partial source reads must fail closed with zero canonical mutation.
10. Provide disconnect/revoke UI and explain what local imported records remain after disconnect.

## Tests
Synthetic-only tests must cover at least:
- first import;
- same source twice -> zero duplicates;
- same semantic sourceId through a different module/chat provenance -> one canonical record, merged sourceRefs;
- different sourceIds with identical text -> two records;
- multi-claim record preserves all claimClasses and primary membership;
- claim promotion mutation fails;
- dedup-only-by-primary mutation fails;
- sourceId+module identity mutation fails;
- partial network/read failure -> zero mutation;
- profile isolation;
- sync + encrypted backup/restore roundtrip;
- malicious/XSS payload;
- recovery lock;
- revoked connector permission;
- no raw private content in logs/evidence/artifacts.

## Delivery
One fresh branch from current MAIN, one Draft PR, green CI/evidence, then stop for independent owner acceptance. Do not merge or enable auto-merge autonomously.
