# Data Model and Migration Plan

## Phase 0 requirement

Audit actual `DEFAULT_DB`, `migrateRecords`, `dbCount`, snapshots, sync merge, `IDCOLS`, tombstones and backend space schema before adding fields. This file describes target contracts, not permission to bypass current storage semantics.

## Proposed local collections

- `birthEvidence`;
- `birthNormalizations`;
- `astroProfiles`;
- `astroCalculations` or content-addressed cache metadata;
- `lifeEvents`;
- `rectificationRuns`;
- `rectificationHypotheses`;
- `scenarioDefinitions`;
- `featureSnapshots`;
- `predictionRuns`;
- `consentRecords`;
- `licenseManifestRefs`.

Large ephemeris assets and generated dense result grids should not be embedded in the main DB JSON. Use verified Cache Storage/IndexedDB asset stores after a spike.

## Record requirements

```yaml
id:
schemaVersion:
createdAt:
updatedAt:
_u:
profileId:
privacyClass:
sourceRevision:
provenance:
```

Collection-specific ids remain stable. Deletes follow current tombstone/LWW rules. Derived caches can be invalidated; source evidence cannot.

## Migration discipline

1. inventory old schema and record count logic;
2. add defaults without overwriting existing arrays;
3. write idempotent migration;
4. update dbCount/data-loss guards;
5. update sync collection lists and merge policy;
6. update snapshots/export/import;
7. test legacy fixture → migrate → persist → reload → sync roundtrip;
8. test empty/corrupt slots and rollback;
9. bump schema version only after tests.

## Privacy

Life events, birth evidence, diaries and synthesis are sensitive personal. Repository fixtures must be synthetic. Public share uses redacted snapshots, never raw records.
