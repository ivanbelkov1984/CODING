# Phase 1 Additive Schema Metadata

Status: `PHASE_1_P1_A_IMPLEMENTATION_COMPLETE`

Approved prerequisite: `architect/docs/life-architect-v2/PHASE0_5_EXIT_DECISION.md`

## Scope

This task implements only Contract P1-A. It adds optional metadata to records when they are touched or imported. Existing records remain readable and are not eagerly rewritten during hydration.

No UI, storage engine, backend, deployment, native wrapper, health logic or AI-provider payload is changed.

## Optional field

Records may contain `_meta`:

```json
{
  "metadataVersion": 1,
  "collection": "insights",
  "recordClass": "UserSelfReport",
  "privacyClass": "sensitive_personal",
  "verificationStatus": "unverified",
  "provenance": {
    "origin": "user_local",
    "firstMetadataAt": "2026-07-20T00:00:00.000Z",
    "lastTouchedAt": "2026-07-20T00:00:00.000Z"
  },
  "correction": {
    "status": "current",
    "revision": 0,
    "history": []
  }
}
```

The field is optional. Readers must continue to accept records without `_meta`.

## Provenance taxonomy

Allowed `provenance.origin` values:

| Value | Meaning |
|---|---|
| `user_local` | metadata first attached through a local user touch |
| `portable_import` | record first entered this metadata model through a version-2 portable JSON import |
| `legacy_import` | record first entered this metadata model through an older JSON import |
| `system_generated` | reserved for an explicitly governed system-generated record |
| `unknown_legacy` | origin cannot be established without guessing |

Re-import does not overwrite an already known original provenance. It adds `importedAt` and `sourceFormat` while preserving `origin`.

Profile membership remains represented by the profile storage namespace. P1-A does not duplicate local profile identifiers into portable record metadata and therefore does not widen the export boundary.

## Record classes

The adapter uses the classes already approved in the epistemic contract where they fit current collections:

| Collection | Record class |
|---|---|
| `insights`, `dreams`, `patterns`, `spiritual`, `chats` | `UserSelfReport` |
| `checkins`, `spheres`, `cravings` | `ContextObservation` |
| `sphereLogs`, `bots` | `BehavioralEvent` |
| `evolution` | `DescriptiveState` |
| `digests` | `LLMExplanation` |

This classification does not upgrade a record into objective evidence, diagnosis or causal truth.

## Privacy classes

| Value | Current use |
|---|---|
| `personal` | ordinary personal planning or behavioral records |
| `sensitive_personal` | diary, dream, pattern, spiritual, chat, digest and evolution material |
| `health_sensitive` | check-ins and cravings |

The metadata contains classification labels only. It contains no API key, sync key, passphrase, recovery material, token or backend URL.

## Verification status

P1-A defaults records to `unverified`. The adapter preserves only the approved vocabulary:

- `unverified`;
- `user_confirmed`;
- `source_confirmed`;
- `observational`;
- `repeated_personal_pattern`;
- `model_supported`;
- `validated_for_use`.

P1-A adds no UI or automation that promotes verification status.

## Correction lifecycle

P1-A creates the seam, not a full correction editor.

- First metadata attachment creates `status: current`, `revision: 0`, empty history.
- A later touch of a record that already has metadata increments `revision`, changes status to `corrected`, and appends a minimal event `{at, kind}`.
- Correction events contain no previous record body, diary text or other duplicated sensitive payload.
- History is bounded to the latest 20 events.
- Unknown future correction fields are preserved.
- Correction history begins only after a record has entered the metadata model; P1-A does not invent historical corrections for untouched legacy records.

A later task may add append-only correction payloads and invalidation graphs only under a separate approved contract.

## Write boundaries

Metadata is written only at two existing boundaries:

1. `touch(record)` — a record already being changed by the application;
2. JSON import — records already being written into the active profile.

Hydration does not backfill `_meta` across untouched records. Sync merge preserves optional fields through existing record object semantics and does not independently create metadata.

## Import behavior

Version-2 portable imports receive `portable_import` provenance when no prior origin exists. Older files receive `legacy_import`.

Import preserves:

- record IDs;
- `_u` timestamps;
- unknown record fields;
- existing metadata and original provenance;
- old files without metadata.

## Backward compatibility and rollback

Old application logic ignores unknown `_meta` and continues to read record payloads. Rollback may disable metadata writes and remove the adapter wiring while leaving already written optional fields harmless.

No destructive conversion, rename or eager rewrite occurs. Export and encrypted sync continue to serialize the whole record object, so `_meta` roundtrips as an optional field.

## Adapter

`architect/data-metadata.js` is a classic-script global adapter because the current application runtime is a non-module script. It exposes a frozen `ARCH_METADATA` API:

- `touchRecord`;
- `markImportedRecord`;
- `markImportedDB`;
- `readRecordMetadata`;
- collection policy and version constants.

The build inlines the adapter before `app.js` so production and combined E2E builds use the same order.

## Required regression coverage

`architect/tests/evidence/additive_schema_metadata_regression.mjs` verifies:

- untouched legacy reads do not mutate records;
- first touch is additive;
- later correction events are minimal and bounded;
- unknown optional fields survive;
- collection privacy/class policy;
- version-2 and legacy import provenance;
- idempotent re-import;
- original provenance preservation;
- mixed old/new JSON roundtrip;
- rollback readability;
- absence of credential-shaped metadata fields;
- exact runtime touch/import wiring;
- adapter-before-runtime build order;
- inclusion in the ordinary data test gate.

The complete Phase 0.5 data/privacy tests, build, Playwright E2E and mobile evidence workflow remain mandatory.

## Validation evidence

The implementation head passed:

- ordinary repository CI, including 17 focused additive-metadata assertions, the existing tombstone/privacy regressions, deterministic combined build and Playwright E2E;
- mobile evidence in Chromium and WebKit across iPhone SE, iPhone 14, iPad Mini portrait and iPad landscape;
- 117 of 117 mobile checks with zero failures;
- 16 visually inspected PNG artifacts and 8 Playwright traces;
- offline reload, service-worker update and browser import/export privacy smoke.

Artifact digests for the validated implementation run:

- mobile evidence: `sha256:d10a1ce716453a1b5b34dfc9b769e90ed83e9bdb509fb96cdd3afb23590afa2f`;
- static preview: `sha256:52a11ccd0940dcbbf8a1f4f589033df5429af0ed95f2e5a20bbe21f629223537`.

No unexplained visual change was found. The screenshots render the same application state across both engines and all four viewports.

## Stop conditions

Do not merge if the implementation:

- rewrites untouched records during hydration;
- changes IDs or existing timestamps;
- requires destructive conversion;
- modifies backend or deployment behavior;
- sends metadata to an AI provider through a new path;
- adds credentials to exports or sync payloads;
- causes unexplained visual changes;
- breaks old JSON import/export or rollback readability.

## Rollback

1. Stop loading `data-metadata.js`.
2. Restore the previous `touch` and import adapter calls.
3. Remove the focused test command and module from the build.
4. Leave existing `_meta` fields in records; older code ignores them safely.

No reverse data migration is required.

## Final markers

`PHASE_1_ADDITIVE_SCHEMA_METADATA_COMPLETE`

`BACKWARD_COMPATIBLE_OPTIONAL_FIELDS_ONLY`

`NO_EAGER_BACKFILL`

`PHASE_1_P1_B_NOT_STARTED`
