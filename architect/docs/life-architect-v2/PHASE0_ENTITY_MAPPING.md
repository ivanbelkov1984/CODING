# Phase 0 Entity Mapping — Complete Current Store Map

Status: `DOCUMENTATION_ONLY`

## Mapping rules

Claim taxonomy: **observed repository fact**, **architectural inference**, **plausible risk**, **recommendation**, **open question**, **evidence gap**, **owner decision required**. No real user data is included.

## DEFAULT_DB collections and scalar stores

| Store/entity | Current location | Ownership / profile scope | ID model | Timestamps/versioning | Sync behavior | Export/import | Privacy class | v2 mapping | Migration decision | Unresolved gap |
|---|---|---|---|---|---|---|---|---|---|---|
| `insights` | `architect/app.js`, `DEFAULT_DB` | profile DB | `id`; included in `IDCOLS` | migration backfills `createdAt/day/sv` where applicable | merged by id | exported/imported | highly personal reflection | Insight / Evidence-backed note | preserve; add provenance later | distinguish user-created vs computed |
| `dreams` | `DEFAULT_DB` | profile DB | `id`; `IDCOLS` | record migration metadata | merged by id | exported/imported | sensitive personal | Dream record | preserve | AI consent/provenance |
| `patterns` | `DEFAULT_DB` | profile DB | `id`; `IDCOLS` | migration metadata | merged by id | exported/imported | sensitive psychological | Pattern observation | preserve; source-class field later | computed vs authored ambiguity |
| `evolution` | `DEFAULT_DB` | profile DB | `id`; `IDCOLS` | migration metadata | merged by id | exported/imported | personal development | Evolution note | preserve | v2 entity definition |
| `spiritual` | `DEFAULT_DB` | profile DB | `id`; `IDCOLS` | migration metadata | merged by id | exported/imported | sensitive worldview | Spiritual note | preserve | epistemic classification |
| `checkins` | `DEFAULT_DB` | profile DB | `id`; `IDCOLS` | day/createdAt where present | merged by id | exported/imported | personal state | Momentary state | preserve | schema consistency |
| `spheres` | `DEFAULT_DB` | profile DB | `id`; `IDCOLS` | record-level fields | merged by id | exported/imported | personal goals/life domains | Life sphere | preserve | ownership rules |
| `sphereLogs` | `DEFAULT_DB` | profile DB | `id`; `IDCOLS` | day/createdAt | merged by id | exported/imported | personal activity | Sphere event/log | preserve | relation integrity |
| `bots` | `DEFAULT_DB` | profile DB | `id`; `IDCOLS` | record fields | merged by id | exported/imported | configuration/private prompts | Assistant configuration | preserve; isolate policy later | prompt governance |
| `chapters` | `DEFAULT_DB` | profile DB | `id`; `IDCOLS` | record fields | merged by id | exported/imported | authored content | Chapter/document | preserve | attachments/reference model |
| `digests` | `DEFAULT_DB` | profile DB | `id`; `IDCOLS` | period metadata | merged by id | exported/imported | derived personal synthesis | Digest | preserve; add input refs later | provenance/evaluation |
| `chats` | `DEFAULT_DB` | profile DB | `id`; `IDCOLS` | record metadata | merged by id | exported/imported | highly sensitive | Conversation/session | preserve | provider/source/retention |
| `cravings` | `DEFAULT_DB` | profile DB | `id`; `IDCOLS` | day/createdAt | merged by id | exported/imported | health/self-management | Craving event | preserve; quarantine medical claims | intended-purpose boundary |
| `oq` / questions | `DEFAULT_DB` | profile DB | implementation-specific | document/record metadata | verify | exported/imported | personal inquiry | Open question | preserve | exact name/shape |
| `vit` / vitals | `DEFAULT_DB` | profile DB | implementation-specific | implementation-specific | verify | exported/imported | health-sensitive | Self-reported measurement | preserve; regulated quarantine | exact schema and units |
| `env` | `DEFAULT_DB` | profile DB | scalar/object | `__ts` may govern scalar merge | document timestamp merge | exported/imported | contextual | Environment/context flags | preserve | field-level semantics |
| `_del` | `DEFAULT_DB` | profile DB | tombstone ids | deletion timestamps/metadata | merged in sync | exported/imported with DB | sync integrity metadata | Collection-qualified deletion ledger target | preserve until tests; do not reshape yet | collision behavior |
| `__ts` | `DEFAULT_DB` | profile DB | field-keyed map | document/field timestamps | scalar conflict resolution | exported/imported | technical metadata | Version clock | preserve | clock semantics/tests |

## Non-DB stores

| Store | Current location/key | Scope | Content | Sync/export | Privacy | v2 decision | Gap |
|---|---|---|---|---|---|---|---|
| Profile registry | `arch5_profiles` / `PKEY` | browser-wide registry | profile ids/names/metadata | not assumed synced | personal metadata | preserve | deletion/rename semantics |
| Active profile | active-profile key/function | browser-wide selection | selected profile id | local only | low-sensitive metadata | preserve | exact key and fallback |
| Profile config | `cfgKey(profileId)` | per profile | UI/app configuration | may be included in backup/export; verify sync | personal preferences | preserve | field inventory |
| Passphrase storage | `passKey(profileId)` | per profile | sync passphrase or related material | local only by design | secret | review and minimize | storage protection |
| AI keys | provider-key storage helpers | browser/profile dependent | third-party API credentials | must not sync/export by default | secret | explicit BYO-key policy or future gateway | current persistence/scope |
| AI ledger | ledger storage in app | profile/local | usage/cost/task metadata | verify | personal operational metadata | preserve; minimize | retention/export |
| Media IndexedDB | `idbOpen` and media stores | browser profile/origin | blobs/media metadata | separate from main sync unless explicit | potentially sensitive | preserve as separate store | backup/export completeness |
| Snapshots | snapshot keys/functions | per profile | plaintext DB snapshots | local restore; normally not sync | highly sensitive | preserve until tested | retention and quota |
| Backup slots | local backup keys/functions | per profile | plaintext DB/config recovery copies | local | highly sensitive | preserve | exact rotation |
| Export files | generated JSON/Markdown | user-selected destination | selected/full plaintext data | leaves app boundary | highly sensitive | explicit consent/warning | manifest of included stores |
| Feedback buffer | feedback functions/endpoints | browser + server workflow | user feedback/diagnostics | separate plaintext boundary | potentially sensitive | minimize + disclose | retention/access |
| Error buffer | error capture/storage | browser | errors/context | may feed feedback | potentially sensitive | redact/minimize | exact fields/retention |

## Migration principles

1. No destructive rename or normalization before Phase 0.5 roundtrip tests.
2. Existing keys and collections remain readable throughout additive migration.
3. New metadata must be optional and backfilled idempotently.
4. Secrets are excluded from sync/export unless explicitly and safely designed.
5. Media completeness is tested separately from JSON DB roundtrips.
6. `_del` changes are blocked until collection-collision tests resolve the plausible risk.
7. Health-sensitive stores remain self-management data and are quarantined from diagnosis/treatment logic.

## Exit status

`CURRENT_ENTITY_MAP_COMPLETE_ENOUGH_FOR_PHASE_0_5_TEST_DESIGN`
