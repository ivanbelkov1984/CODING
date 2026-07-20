# Phase 0.5 Exit Decision

Status: `PHASE_0_5_APPROVED`

Decision date: 2026-07-20

Canonical branch: `agent/astrology-harness-foundation`

Approved base commit: `16bbe4acd7ff998f56c9ce9111e88aec18f90a74`

## Decision

Phase 0.5 is complete and approved. Contract P1-A — Additive schema metadata — is eligible to start in its own branch and pull request.

This approval does not authorize any later Phase 1 contract, framework rewrite, primary storage migration, native wrapper, public-store release, AI gateway redesign, health diagnosis/treatment behavior or production-data migration.

## Exit evidence

| Area | Pull request | Merged commit | Decision |
|---|---:|---|---|
| Corrected Phase 0 repository audit and contracts | #47 | `aa262c48899068d32aa1da2c646b7807f7b14a28` | accepted |
| P0.5-A repository and command evidence | #48 | `dcf138f374d1f68bec626226db410306ee4f2810` | accepted |
| MAIN/architecture branch reconciliation | #49 | `a6ceab260b5ffa971829029db2806cf4a377ba76` | accepted; architecture branch no longer behind MAIN at reconciliation time |
| P0.5-B roundtrip, snapshot, merge and encrypted-sync evidence | #50 | `5c2ab8c339eafdf1cb58de57f3e06e086cdb40a3` | accepted; blockers separated into remediation PRs |
| P0.5-C privacy and E2EE boundary evidence | #51 | `3d78ef011261ea48d3b91493051b4fac26de2807` | accepted |
| Initial P0.5-D mobile/preview gap report | #52 | `3ab7c2c0febfbc4ff39ca925bcfb0e39489f2ca4` | accepted as gap evidence, not final mobile exit |
| Collection-scoped tombstone remediation | #53 | `8b055ba47e2f4684d671e8f17dadc27854b21a98` | accepted; cross-collection deletion blocker closed |
| Portable export privacy remediation | #54 | `ace3b5537377cecb616c8a81f963863775a59a47` | accepted; connection-field export/import blocker closed |
| Executable mobile CI, artifacts and rendering remediation | #55 | `16bbe4acd7ff998f56c9ce9111e88aec18f90a74` | accepted; final mobile gate closed |

## Data-integrity exit conditions

The following properties are now covered by permanent focused tests and the existing E2E suite:

- profile namespacing and legacy profile migration;
- persistence, hydration and backup recovery;
- daily snapshots and restore semantics;
- synthetic JSON export/import roundtrip;
- collection-scoped deletion tombstones;
- conservative and idempotent migration of old flat tombstones;
- same-ID isolation across collections;
- collection-aware undo;
- merge timestamp and deletion ordering;
- encrypted envelope roundtrip with synthetic data;
- named secret exclusion;
- media-reference behavior and explicit out-of-band blob limitation.

The confirmed global tombstone collision is closed by collection-scoped tombstones. Ambiguous old flat tombstones are retained under `_legacy` and fail safe by preserving records rather than deleting unrelated data.

## Privacy exit conditions

Ordinary JSON export is versioned as `portable-no-connection-secrets` and excludes:

- `spaceKey`;
- `apiUrl`;
- `lastSync`;
- configuration `_ts`;
- passphrase and recovery storage;
- AI-provider key storage.

Import strips those fields from legacy files and preserves the current device connection identity. The backup itself still contains personal diary data and is not encrypted; it must be handled as sensitive personal data.

The approved boundary remains:

- local application data is plaintext at rest in browser storage;
- sync with a configured passphrase uses the encrypted envelope path;
- sync without a passphrase must not be described as E2EE;
- media blobs remain outside ordinary JSON backup completeness.

## Mobile exit evidence

Final PR #55 head: `ba4dadd350c7724399076229af0815d191c4f862`

Final successful workflows:

- `CI — Архитектор`, run `29782915387`, conclusion `success`;
- `Mobile evidence — Phase 0.5`, run `29782915366`, conclusion `success`.

Final machine report:

- 117 checks total;
- 117 passed;
- 0 failed;
- Chromium and WebKit;
- iPhone SE, iPhone 14, iPad Mini portrait and iPad landscape;
- 16 populated PNG screenshots;
- 8 Playwright trace archives;
- browser export/import privacy smoke;
- service-worker activation, offline reload and update-cache evidence.

Final retained artifacts:

| Artifact | ID | SHA-256 digest | Expiry |
|---|---:|---|---|
| `phase-0-5-mobile-evidence` | `8477355791` | `6e99ffd52497737615e74b458f0611452cd9db2a567bbaed080b0a0e3935c446` | 2026-08-19 |
| `phase-0-5-static-preview` | `8477356312` | `8cf88660b95fc7110e7ca392b6048823ca4564a47ea2b5996eda2aaed18edd74` | 2026-08-19 |

Visual inspection confirmed that all Chromium and WebKit viewport and `#app` screenshots contain the expected application content.

The mobile gate also found and closed a concrete cross-engine rendering risk: the active-page opacity animation could remain on a transparent first frame in composited runs. Active pages now use deterministic visible state without that non-essential fade.

## Remaining risks that do not block P1-A

- No physical iPhone/iPad device-lab run has been performed.
- The WebKit CI engine is a proxy for Safari, not proof from every Safari release.
- A complete WCAG and screen-reader audit remains open.
- Native packaging, secure native key storage, background execution and app-store readiness remain unproven.
- Ordinary JSON backup is not encrypted and does not contain media blobs.
- Local browser storage is not encrypted at rest.

These risks do not expand under P1-A because that contract is limited to optional additive metadata, adapters, tests and documentation.

## Approved first Phase 1 task

Only Contract P1-A is approved next:

- branch: `agent/phase-1-additive-schema-metadata`;
- pull request: `Phase 1 additive schema metadata`;
- optional fields only;
- backward-compatible reads;
- idempotent additive writes;
- no destructive rename;
- backfill only on touched or imported records;
- old exports remain readable;
- full Phase 0.5 tests and mobile smoke remain mandatory.

The provenance taxonomy and correction lifecycle must be explicitly defined in that PR. No UI redesign is authorized.

## Stop conditions for P1-A

Stop without merging if implementation requires:

- destructive record conversion;
- eager rewrite of untouched user records;
- backend or deployment changes;
- new data sent to AI providers;
- widening export or sync privacy boundaries;
- primary IndexedDB migration;
- unexplained runtime or visual diff.

## Final markers

`PHASE_0_5_COMPLETE`

`PHASE_1_P1_A_ELIGIBLE`

`PHASE_1_IMPLEMENTATION_NOT_YET_STARTED`
