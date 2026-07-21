# Phase 2 Contract P2-A — Encrypted Portable Backup and Complete Restore

Status: `PHASE_2_P2_A_CONTRACT_APPROVED`

Decision date: 2026-07-21

Canonical base: `agent/astrology-harness-foundation`

Approved Phase 1 exit baseline: `91358ecf4a70bd6242ca202589ba198987090519`

## Purpose

Define the first narrow Phase 2 implementation contract: a user-controlled, encrypted, portable backup that can be created and restored on the existing PWA from iPhone or iPad without a local computer, terminal or manual code handling.

The contract closes two preserved risks from Phase 1:

1. ordinary JSON backup is plaintext;
2. ordinary JSON backup does not contain the media blobs stored outside the main JSON database.

This contract does not itself implement the feature. Implementation becomes eligible only after this documentation-only contract is reviewed, validated and merged.

## Product outcome

The application shall provide a portable backup file that:

- is encrypted before leaving the application;
- contains the selected profile database and safe portable configuration;
- contains a manifest for every included store and media object;
- includes actual media blobs when the user selects a complete backup;
- excludes connection credentials, provider keys, passphrases, recovery material and feedback diagnostic stores;
- can be restored into an empty profile or a newly created profile;
- validates integrity before changing active user data;
- performs restore transactionally with a recoverable pre-restore snapshot;
- remains usable through browser file pickers/share sheets on iPhone and iPad;
- never requires GitHub, a developer terminal or a desktop computer.

## User-controlled modes

### 1. Encrypted data backup

Includes:

- profile `DB`;
- safe portable `CFG` only;
- schema/export metadata;
- collection and object counts;
- integrity manifest;
- no media blob bytes.

The UI must label this mode as incomplete for media restoration.

### 2. Encrypted complete backup

Includes everything in encrypted data backup plus:

- media metadata;
- actual IndexedDB media blob bytes;
- a manifest entry for every media object;
- explicit missing-blob records when a reference exists but its blob is unavailable.

The UI must display the estimated size before creation where the platform permits it.

## Required user decisions at export

The export flow must require explicit choices for:

- profile being backed up;
- data-only or complete backup;
- a new backup password entered twice;
- acknowledgement that losing the backup password makes the file unrecoverable;
- acknowledgement that the backup contains sensitive personal information even though encrypted.

The application must not silently reuse the sync passphrase, Recovery Key, provider key or local connection secret as the backup password.

## Cryptographic boundary

Implementation must reuse audited browser WebCrypto primitives already supported by the application where compatible, behind a dedicated backup adapter.

Required properties:

- authenticated encryption;
- a fresh random salt for each backup;
- a fresh random IV/nonce for each encrypted object or encrypted archive;
- a password-derived key using an explicit versioned KDF parameter set;
- versioned envelope metadata sufficient for future migration;
- integrity/authentication failure before any restore mutation;
- no plaintext diary, health, chat, dream or media content in the exported file;
- no raw backup password, derived key, sync passphrase or recovery material stored in the file;
- no deterministic encryption of repeated backups;
- no custom cryptographic algorithm.

The exact KDF, authenticated-encryption algorithm and parameters must be documented from the current runtime implementation before coding. Any algorithm change requires explicit security review and focused compatibility fixtures.

## Portable envelope

The implementation PR must define a versioned envelope with, at minimum:

- format identifier;
- envelope version;
- created timestamp;
- application/schema version;
- backup mode;
- KDF identifier and parameters;
- salt;
- encryption algorithm identifier;
- IV/nonce information;
- ciphertext or encrypted object table;
- authenticated manifest digest or equivalent authenticated manifest;
- non-sensitive size/count metadata required for file handling.

Plaintext envelope metadata must be minimized. It must not include profile name, diary titles, record text, health values, contact details, media filenames containing personal text, API URLs, space keys or user identifiers unless proven necessary and explicitly disclosed.

## Data inclusion policy

### Must include

- every current profile DB store defined by the current schema;
- collection-scoped tombstones;
- scalar timestamp map;
- optional additive `_meta` fields;
- safe portable configuration fields;
- format/schema metadata;
- complete manifest and counts;
- media metadata and bytes in complete mode.

### Must exclude

- `spaceKey`;
- `apiUrl`;
- `lastSync`;
- configuration `_ts` used for local connection state;
- sync passphrase material;
- recovery key material;
- AI provider keys;
- backend tokens;
- feedback error buffer;
- feedback outbox;
- feedback sent-ID store;
- browser caches and service-worker internals;
- production logs;
- unrelated profiles unless separately selected.

The implementation PR must include a machine-readable inclusion/exclusion inventory generated from synthetic fixtures.

## Restore safety model

Restore must be fail-closed and transactional.

Required sequence:

1. select file;
2. parse only the minimal envelope header;
3. validate format/version and bounded size before decryption;
4. request backup password;
5. authenticate and decrypt without changing active data;
6. validate manifest, schemas, object counts and media hashes;
7. present a restore summary;
8. create a local pre-restore snapshot/backup;
9. restore into a new profile by default;
10. allow replacement of an existing profile only after a second explicit warning;
11. write DB/config/media in staged order;
12. verify the committed result by re-reading it;
13. activate the restored profile only after verification;
14. retain a rollback action if any post-write verification fails.

A wrong password, corrupt file, unsupported version, truncated file, manifest mismatch, missing required object or storage quota failure must leave the current profile unchanged.

## Conflict policy

The first implementation must not merge an encrypted backup into an existing profile record-by-record.

Allowed restore targets:

- new profile;
- empty profile;
- explicit full replacement of a selected profile after a recoverable snapshot.

Record-level merge belongs to a separate future contract because it introduces conflict, tombstone and provenance decisions.

## Media behavior

Complete backup must prove:

- every exported media reference maps to one manifest entry;
- blob MIME type and size are preserved;
- blob bytes survive encrypt → file → decrypt → IndexedDB restore;
- missing source blobs are reported before export completes;
- corrupt media objects fail validation before profile activation;
- duplicate media may be deduplicated only by a documented content hash and without changing record references;
- no real user media appears in fixtures or CI artifacts.

The implementation may use a streaming/archive library only if it is already suitable for browser/iOS memory limits, is narrowly scoped and passes dependency/security review. Adding a large framework is forbidden.

## iPhone and iPad constraints

The feature must work with the existing PWA and mobile-only ownership model.

Required evidence:

- iPhone compact portrait;
- iPhone large portrait;
- iPad portrait;
- iPad landscape;
- Chromium and WebKit CI proxies;
- file creation and download/share initiation;
- file selection and password entry;
- keyboard-safe restore confirmation;
- progress and cancellation UI for large backups;
- no horizontal overflow;
- no transparent compositor frames;
- no dependence on drag-and-drop or desktop-only APIs.

Physical-device testing remains desirable but is not claimed by CI. The implementation PR must state exactly what was tested on a real iPhone/iPad, if anything.

## Performance and resource boundaries

The implementation must define and enforce:

- maximum supported input size for non-streaming parsing;
- bounded manifest and metadata sizes;
- progress reporting for long operations;
- cancellation before commit where possible;
- cleanup of temporary object URLs, buffers and staged IndexedDB objects;
- protection against decompression bombs, oversized arrays and unbounded object counts;
- a clear error when the browser cannot allocate enough memory or storage.

No claim of supporting unlimited backup size is permitted.

## Synthetic fixture requirements

Tests must use obviously fictional data only and include:

- at least two profiles while exporting only one;
- every current DB collection;
- optional `_meta` fields;
- collection-scoped tombstones and legacy-safe data;
- scalar timestamps;
- Unicode and long text;
- safe portable configuration;
- at least three synthetic media blobs of different MIME types and sizes;
- one missing-media reference case;
- no real names, diary text, health history, relationships, credentials, keys or personal media.

## Required automated tests

### Cryptography and envelope

- same input and password produce different ciphertext across backups;
- correct password roundtrip;
- wrong password fails without partial plaintext output;
- modified ciphertext fails authentication;
- modified authenticated manifest fails;
- truncated envelope fails;
- unsupported version fails with a public error;
- KDF/encryption parameters are validated and bounded;
- plaintext scan finds none of the synthetic sensitive strings.

### Inclusion and exclusion

- every current store roundtrips;
- `_meta`, tombstones and timestamps survive;
- connection fields and all named secrets are absent;
- feedback diagnostic stores are absent;
- only the selected profile is present;
- data-only mode reports media incompleteness;
- complete mode restores blob bytes and metadata.

### Restore integrity

- restore to new profile;
- restore to empty profile;
- explicit replacement with pre-restore rollback snapshot;
- wrong password leaves active state unchanged;
- corrupt data leaves active state unchanged;
- quota/write failure leaves active state unchanged or rolls back fully;
- interrupted staged restore is detected and recoverable;
- repeated restore creates deterministic profile-level outcomes without duplicate partial media;
- final re-read matches the authenticated manifest.

### Compatibility

- current-version encrypted backup;
- at least one frozen older envelope fixture after the first implementation version exists;
- ordinary legacy plaintext JSON import remains available but is clearly labelled as unencrypted and media-incomplete;
- no regression in sync encryption, ordinary export/import, snapshots or profiles.

## Required CI and artifacts

The implementation PR must run:

- syntax checks for runtime and backend files;
- focused encrypted-backup tests;
- complete existing evidence suite;
- standalone build;
- full `npm test`;
- Chromium/WebKit mobile evidence;
- static preview artifact;
- machine-readable backup test report;
- synthetic encrypted backup fixture artifact that contains no plaintext sensitive fixture strings;
- screenshots for export choice, password warning, progress, restore summary, wrong-password error and successful restore.

Artifacts must contain synthetic data only.

## Allowed implementation files

The implementation contract may change only:

- one dedicated browser backup/encryption adapter;
- one dedicated media backup adapter if separation is needed;
- minimal wiring in `app.js`;
- exact backup/restore UI in `index.html` and `styles.css`;
- build/service-worker static-asset lists where required;
- focused tests and synthetic fixtures;
- `package.json` only for focused test wiring or one approved narrow dependency;
- mobile evidence harness;
- Phase 2 implementation evidence document.

Every changed file must be listed in the implementation PR description.

## Forbidden changes

Do not include:

- framework rewrite;
- primary storage-engine migration;
- sync protocol redesign;
- provider gateway changes;
- AI prompt/feature changes;
- feedback behavior changes;
- health diagnosis or treatment logic;
- native/Capacitor wrapper;
- deployment redesign;
- public-store release work;
- production analytics or telemetry;
- production data migration;
- real user data, keys, passwords or media.

## Stop conditions

Stop without merge if:

- plaintext sensitive content appears in the encrypted file;
- any secret or local connection field is exported;
- restore can partially overwrite an active profile without rollback;
- media integrity cannot be verified;
- wrong-password or corrupt-file paths mutate data;
- implementation requires real data or credentials;
- iPhone/iPad browser file handling cannot be demonstrated;
- memory/storage limits remain unbounded or misleading;
- a new cryptographic construction is invented;
- ordinary or mobile CI fails;
- visual artifacts reveal an unreadable or hidden critical dialog.

## Rollback

The feature must be removable without changing existing user records:

1. remove the encrypted backup UI entry points;
2. stop loading the backup adapters;
3. retain existing plaintext JSON import/export as the documented legacy fallback;
4. leave previously created encrypted files untouched as external user-owned files;
5. do not require reverse migration of DB records or media.

## Implementation branch and PR

After this contract is approved:

- branch: `agent/phase-2-encrypted-portable-backup`;
- PR title: `Phase 2 encrypted portable backup and complete restore`;
- initial state: Draft;
- base: `agent/astrology-harness-foundation`;
- merge only after independent diff review, ordinary CI, mobile evidence, artifact inspection and restore rollback proof.

## Contract acceptance

Approve this contract only when:

- Phase 1 exit PR #60 remains merged;
- this PR changes exactly this Markdown contract;
- ordinary and mobile CI are green;
- the feature remains user-controlled and PWA-compatible;
- no claim implies encryption at rest for the application database;
- Phase 2 authorization is limited strictly to P2-A.

## Contract validation

Contract head before approval: `926e31b986350566afba62b1e9a26e0412f2b760`.

- `CI — Архитектор`, run 293: `success`;
- `Mobile evidence — Phase 0.5`, run 117: `success`;
- PR changes exactly one permanent Markdown contract after temporary workflow removal;
- Phase 1 exit PR #60 remains merged;
- implementation remains not started;
- authorization is limited strictly to P2-A.

## Markers

`PHASE_2_P2_A_CONTRACT_DEFINED`

`ENCRYPTED_PORTABLE_BACKUP_ONLY`

`COMPLETE_MEDIA_RESTORE_REQUIRED`

`NO_REAL_USER_DATA`

`IMPLEMENTATION_NOT_STARTED`

`PHASE_2_OTHER_WORK_NOT_AUTHORIZED`