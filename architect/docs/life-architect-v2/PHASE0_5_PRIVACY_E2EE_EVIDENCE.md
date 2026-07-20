# Phase 0.5-C Privacy, E2EE and Secret-Boundary Evidence

Status: `PHASE_0_5_C_EVIDENCE_ONLY`

## Scope

This task records current privacy and encryption boundaries without changing production behavior. It adds one static Node evidence harness and this report. No runtime, schema, workflow, deployment, sync-protocol, encryption-algorithm, AI, health, native, or user-data changes are made.

## Evidence sources

- `architect/app.js`
- `architect/tests/evidence/phase0_5_data_roundtrip_evidence.mjs`
- `architect/docs/life-architect-v2/PHASE0_5_DATA_ROUNDTRIP_EVIDENCE.md`
- GitHub CI

Claims are classified as observed repository fact, confirmed behavior, confirmed risk, plausible risk, evidence gap, or recommendation.

## Boundary inventory

| Boundary | Current evidence | Verdict |
|---|---|---|
| Profile DB | `arch5_db_<profileId>` | observed repository fact: namespaced |
| Profile CFG | `arch5_cfg_<profileId>` | observed repository fact: namespaced |
| Profile passphrase slot | `arch5_pass_<profileId>` | observed repository fact: separate namespaced slot |
| Legacy passphrase | migrated from `arch5_pass`, then removed | observed repository fact |
| Backup | DB JSON backup slot | confirmed local-device plaintext boundary |
| Snapshots | local JSON snapshots | confirmed local-device plaintext boundary |
| JSON export | DB plus selected CFG semantics | confirmed user-controlled plaintext export boundary |
| Encrypted sync | `packPayload` / `encryptPayload` / `unpackPayload` and Web Crypto path | observed implementation boundary; synthetic roundtrip passed in Phase 0.5-B |
| No-passphrase sync | explicit plaintext path | confirmed security boundary, not E2EE |
| Media | JSON references plus IndexedDB blobs out of band | confirmed split boundary |
| Feedback diagnostics | optional context checkbox; bounded local error buffer | observed privacy control |

## Static harness

`architect/tests/evidence/phase0_5_privacy_e2ee_evidence.mjs` asserts the presence of:

1. profile DB namespace;
2. profile CFG namespace;
3. separate passphrase namespace;
4. legacy passphrase migration;
5. legacy secret-slot cleanup;
6. `spaceKey` configuration field;
7. separate CFG persistence;
8. encryption entry point;
9. pack entry point;
10. unpack entry point;
11. Web Crypto usage;
12. IndexedDB/media separation;
13. feedback-context opt-in control;
14. bounded local error buffer.

This harness proves source-level boundary presence. It does not prove cryptographic strength, browser keystore security, side-channel resistance, server deletion, or compliance.

## Confirmed safe behavior

- Profiles use separate DB, CFG, and passphrase storage keys.
- Legacy flat passphrase data is moved into the active profile namespace and the old flat key is removed.
- Phase 0.5-B synthetic evidence confirmed encrypted envelope roundtrip and wrong/corrupted input failure behavior.
- Phase 0.5-B confirmed that passphrase, recovery key, and AI provider key were excluded from its tested JSON export path.
- Stored encrypted payload did not expose the synthetic diary, health, or chat plaintext used by the Phase 0.5-B harness.
- Media blobs are not embedded in the JSON database/export payload.

## Confirmed risks

### 1. `CFG.spaceKey` in JSON export

Phase 0.5-B confirmed that `CFG.spaceKey` is included in current export behavior. It may be an identifier rather than a cryptographic secret, but it can disclose account/workspace linkage and should be treated as sensitive metadata until explicitly classified.

Verdict: `PRIVACY_REVIEW_REQUIRED`.

### 2. Plaintext local storage

DB, CFG, backups, snapshots, diagnostic buffers, and passphrase material are stored in browser-managed local storage or IndexedDB. E2EE protects the encrypted remote envelope; it does not encrypt all data at rest on the local device.

Verdict: `LOCAL_DEVICE_TRUST_REQUIRED`.

### 3. No-passphrase sync path

When no passphrase is configured, remote sync cannot be described as end-to-end encrypted. Product language must distinguish encrypted sync from plaintext sync.

Verdict: `USER_DISCLOSURE_REQUIRED`.

### 4. Tombstone collision

The confirmed cross-collection tombstone collision from Phase 0.5-B remains a data-integrity blocker. Encryption does not mitigate this semantic defect.

Verdict: `PHASE_1_BLOCKER`.

## Plausible risks

- A user with device/browser access may read localStorage and IndexedDB data.
- Browser extensions, injected scripts, or XSS could access decrypted in-memory data and local storage.
- Configuration exports may reveal API endpoint, workspace identifiers, contact metadata, model settings, or operational timestamps.
- Feedback context can include user-agent, viewport, screen identifier, application version, and recent error messages when opted in.
- Server metadata, request timing, payload size, IP address, and workspace routing may remain visible even when content is encrypted.
- Media references may survive while blobs are missing, causing incomplete restore semantics.

## Evidence gaps

- No independent cryptographic review of algorithms, KDF parameters, nonce generation, authentication mode, or key lifecycle.
- No browser-level test proving that exported files exclude every secret under all UI paths.
- No server-side audit of envelope retention, logs, backups, deletion, authorization, rate limiting, or metadata exposure.
- No CSP/XSS/third-party-script audit.
- No native secure-storage evidence.
- No threat-model validation for lost/stolen devices.
- No automated privacy regression suite in the default `npm test` command.

## Required decisions before Phase 1

1. Classify `spaceKey`: public identifier, pseudonymous identifier, or secret.
2. Exclude `spaceKey` from normal export by default unless there is a documented restore requirement.
3. Define explicit UI language for local-only, plaintext-sync, and E2EE-sync states.
4. Approve a dedicated tombstone namespace/migration contract.
5. Decide whether passphrases and recovery material must move to stronger device storage in a future native build.
6. Define server metadata and retention guarantees.

## Recommended next action

Proceed to Phase 0.5-D mobile CI/preview evidence because it is evidence-only. Keep Phase 1 blocked. In parallel, prepare two separate future remediation contracts:

- tombstone namespacing and migration;
- export/privacy hardening for `CFG.spaceKey` and configuration metadata.

## Validation commands

Expected PR validation:

- `node architect/tests/evidence/phase0_5_privacy_e2ee_evidence.mjs`
- `node --check architect/app.js`
- `node --check architect/sw.js`
- `node --check architect/backend/server.js`
- `node architect/build.mjs`
- `cd architect && npm test`

GitHub CI is authoritative for Playwright Chromium execution.

## Rollback

Revert the two evidence-only files. No runtime state, user data, encryption envelope, schema, or deployment behavior is affected.

## Final markers

`PHASE_0_5_PRIVACY_E2EE_EVIDENCE_COMPLETE`

`PRODUCTION_BEHAVIOR_UNCHANGED`

`TOMBSTONE_FIX_REQUIRED_BEFORE_PHASE_1`

`SPACEKEY_PRIVACY_DECISION_REQUIRED`

`PHASE_1_NOT_STARTED`
