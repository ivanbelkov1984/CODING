# Phase 0 Migration Plan

Status: `DOCUMENTATION_ONLY`

## Migration constraints

### Observed repository fact

Current data lives primarily in profile-scoped localStorage keys and is merged/synced through existing JSON blob semantics. Evidence: `architect/app.js`; `dbKey`, `cfgKey`, `passKey` lines 104-108; `persistLocal` lines 141-170; `mergeDB` lines 3794-3808; `packPayload` lines 3810-3818. Confidence: high.

## Ordered safe migration sequence

1. **Freeze repository reality in tests.** Add read-only tests for `DEFAULT_DB`, `IDCOLS`, profile keys, snapshots, encrypted payload roundtrip, import/export, tombstones, and merge. Production behavior unchanged.
2. **Add schema metadata contract.** Add documentation and tests for `sv`, `createdAt`, `day`, `__ts`, `_del`, and profile id boundaries.
3. **Introduce additive provenance fields.** Add optional metadata on records: source class, source reference, generated-by, confidence, and user-visible uncertainty. Do not move collections yet.
4. **Separate LLM hypotheses from source records.** Either keep embedded `psy` with provenance or add a new annotation collection only after roundtrip tests pass.
5. **Add import/export versioning.** Preserve current JSON export shape, then add versioned wrapper compatibility.
6. **Harden E2EE sync.** Keep server ciphertext/plaintext boundary explicit; add downgrade and recovery tests before changing payload shape.
7. **Only then implement v2 vertical slices.** Each slice gets task contract, rollback, CI, mobile preview, and synthetic data only.

## Rollback requirements

- Every migration must be idempotent. Evidence: current `migrateRecords` is idempotent by checking missing fields before writing. Confidence: high.
- Every migration must preserve old flat-key migration. Evidence: `ensureProfiles` copies `arch5_db`, `arch5_cfg`, `arch5_pass` into profile keys. Confidence: high.
- Every migration must leave a local snapshot/export route. Evidence: `snapshotDaily` and `exportData` exist. Confidence: high.

## Risks

- Do not replace localStorage with IndexedDB/RxDB in Phase 1. Current IndexedDB usage is media-specific (`idbOpen` line 1164), so a primary DB switch is a major architecture change. Confidence: high.
- Do not normalize `insights`/`psy` until data-loss and privacy roundtrips are tested. Confidence: high.

## Open questions

1. Is `DB._del` intentionally global across collections or should v2 tombstones become collection-scoped?
2. Should exported JSON include encrypted payloads, plaintext local DB, or both behind explicit user choice?
3. What is the maximum acceptable local DB size before moving primary persistence to IndexedDB?
