# Phase 1 Exit Decision

Status: `PHASE_1_EXIT_REVIEW_PENDING`

Decision date: 2026-07-21

Canonical branch: `agent/astrology-harness-foundation`

Candidate approved baseline: `179b017d3b14726ea55002d2103ef19f3a95390f`

## Decision scope

The executable Phase 1 contract document defines exactly three Phase 1 implementation contracts:

- P1-A — Additive schema metadata;
- P1-B — AI policy and validators seam;
- P1-C — Privacy and feedback boundaries.

All three contracts are merged into the canonical architecture branch. No P1-D or Phase 2 implementation contract currently exists in the repository.

This document therefore records the Phase 1 exit gate. It does not authorize additional product features, a framework rewrite, a storage-engine migration, a provider gateway migration, native packaging, store submission, diagnosis/treatment behavior, analytics, telemetry, or production-data migration.

## Completed contract evidence

| Contract | Pull request | Merge commit | Result |
|---|---:|---|---|
| P1-A — Additive schema metadata | #57 | `425251f88222cc9a4e15627c0472db7df6e4b938` | optional `_meta` provenance/privacy/verification/correction seam; backward-compatible touched/imported-record writes; focused and full CI/mobile evidence passed |
| P1-B — AI policy and validators seam | #58 | `7e3ff5cfb2207c30260c15c5c74afd7fab50a3c0` | central request policy, timeout/budget controls, structured-output validation and output safety checks behind existing provider routing; focused and full CI/mobile evidence passed |
| P1-C — Privacy and feedback boundaries | #59 | `179b017d3b14726ea55002d2103ef19f3a95390f` | client/server minimization, redaction, explicit consent, bounded local diagnostics/outbox, public error boundary and cross-engine modal rendering; focused and full CI/mobile evidence passed |

## Phase 1 delivered architecture

### Additive record governance

- Existing records remain readable without metadata.
- Untouched legacy records are not eagerly rewritten.
- Touched and imported records may receive optional `_meta` fields.
- Provenance, privacy class, verification state and bounded correction history are independently testable.
- Existing ids, timestamps, unknown fields, exports and encrypted-sync object roundtrips remain compatible.

### Governed AI boundary

- Existing feature triggers and provider routing remain in place.
- Requests pass through one policy seam before provider dispatch.
- Timeouts, task token caps, schema validation, malformed JSON, provider failures, no-key behavior and unsafe output patterns are covered by permanent synthetic tests.
- Invalid structured output fails closed instead of silently entering downstream personal records.
- No additional diary fields were authorized for provider transfer.

### Privacy-safe feedback and diagnostics

- Feedback remains a separate voluntary channel from the diary.
- Diary collections, configuration, keys, passphrases and recovery material are forbidden in feedback payloads.
- Contact masking is enabled by default; credential/token redaction cannot be disabled.
- Technical context and local errors are separately disclosed and controlled.
- Error attachment is explicit opt-in and disabled by default.
- Local diagnostics and failed-send feedback are bounded, inspectable and independently clearable.
- The server repeats allowlisting and redaction and does not trust the browser as the only privacy control.
- Retention is disclosed honestly as having no automatic expiry; raw access is operationally limited to the project owner.

## Final P1-C validation baseline

PR #59 final head: `b07791c75780009e3c445f3801a8c7ff73b8731a`

Successful pre-merge workflows:

- `CI — Архитектор`, run 287, conclusion `success`;
- `Mobile evidence — Phase 0.5`, run 111, conclusion `success`.

Final mobile report:

- 181 checks total;
- 181 passed;
- 0 failed;
- Chromium and WebKit;
- iPhone SE, iPhone 14, iPad Mini portrait and iPad landscape;
- 24 PNG screenshots;
- 8 Playwright trace archives;
- all eight feedback sheets visually reviewed as visible and readable;
- mobile evidence digest `sha256:1a50f640e89e602b7d531a21cf2b0456dced2c7168884302994732b3623a0417`;
- static preview digest `sha256:8968da4996aa201ddd8fbe10fba36d858fbcfeb97add47ad0a986560d762ebd8`.

Post-merge validation on baseline `179b017d3b14726ea55002d2103ef19f3a95390f`:

- `CI — Архитектор`, run 288: `success`;
- `Mobile evidence — Phase 0.5`, run 112: `PENDING_AT_DOCUMENT_CREATION`.

The exit decision must remain unapproved until the post-merge mobile run is successful and this document is updated with that fact.

## Preserved safety boundaries

- The PWA remains the approved implementation baseline.
- Local browser storage remains plaintext at rest and must not be described otherwise.
- Encrypted sync is E2EE only when the configured encrypted-envelope/passphrase path is used.
- Ordinary JSON backup remains plaintext and does not include out-of-band media blobs.
- Browser-side BYO provider keys remain a disclosed architectural risk.
- Health-related records remain self-management data; diagnosis and treatment behavior remain prohibited.
- Public App Store / Play Store release remains blocked.
- A private Capacitor prototype remains deferred until a dedicated contract and evidence plan are approved.

## Remaining risks

The following risks remain open and are not silently closed by Phase 1:

1. No physical iPhone/iPad device-lab run has been recorded.
2. CI WebKit is a Safari proxy, not proof for every physical Safari/device release.
3. A complete WCAG, keyboard, screen-reader and assistive-technology audit is not complete.
4. LocalStorage and IndexedDB contents are not encrypted at rest.
5. Ordinary JSON backup is unencrypted and media-incomplete.
6. Browser BYO API-key storage does not provide native secure credential storage.
7. Feedback has no automatic server-side expiry or user-facing deletion workflow.
8. Native lifecycle, update, background eviction, file sharing, secure storage and push behavior remain unproven.
9. Production operational monitoring and incident-response policy are not defined by these contracts.
10. Health intended-purpose wording has not been elevated into a dedicated owner-approved product policy contract.

## Owner decisions required before Phase 2

No Phase 2 implementation branch may be opened until the owner chooses and approves a dedicated contract covering one narrow objective.

Required decisions:

1. **Next product objective:** continue PWA hardening, build a private native prototype, improve backup/media completeness, perform accessibility/device evidence, or pursue another explicitly defined priority.
2. **Native direction:** remain PWA-only or authorize a private Capacitor evidence prototype; public store submission is not an available default.
3. **AI credential architecture:** retain disclosed browser BYO keys or authorize a separately designed gateway/secure-storage contract.
4. **Health intended purpose:** approve exact self-management wording, prohibited medical claims and escalation behavior.
5. **Feedback lifecycle:** keep append-only owner access or define retention, deletion, support and data-subject handling.
6. **Backup policy:** decide whether encrypted portable backup and media completeness are required next.
7. **Device evidence:** decide whether physical iPhone/iPad testing is required before further user-facing expansion.
8. **Accessibility target:** define the minimum WCAG/screen-reader acceptance level for the next release gate.
9. **Operational baseline:** define production error monitoring, privacy-safe diagnostics, incident response and rollback expectations.

## Candidate future contracts — not approved

The following are planning candidates only and must not be treated as authorization:

- PWA production hardening and operational evidence;
- encrypted portable backup and media-completeness contract;
- physical-device and accessibility evidence contract;
- private Capacitor lifecycle/storage/WebCrypto/file-sharing prototype;
- feedback retention/deletion lifecycle;
- provider gateway or native secure-key architecture;
- health intended-purpose and claim-governance contract.

Each candidate requires its own branch, exact allowed/forbidden files, privacy/data boundary, acceptance tests, mobile evidence, rollback and stop conditions.

## Phase 1 exit acceptance

Approve this exit only when:

- PRs #57, #58 and #59 remain merged in the canonical branch;
- post-merge ordinary and mobile CI on `179b017d3b14726ea55002d2103ef19f3a95390f` are green;
- this documentation-only PR changes exactly one Markdown file;
- no runtime, workflow, dependency, schema or deployment behavior changes;
- Phase 2 remains explicitly unauthorized pending owner decisions and a new executable contract.

## Rollback

This decision is documentation only. Reverting it changes no runtime behavior and converts no user data. The merged P1-A/P1-B/P1-C implementations each retain their own documented rollback boundary.

## Stop conditions

Do not merge this exit decision if:

- the post-merge mobile run fails or remains incomplete;
- the branch contains any file other than this Markdown document;
- any claim exceeds repository evidence;
- the document is interpreted as automatic approval for native, gateway, health, analytics or storage migration work;
- an unresolved critical data-loss, privacy or security defect is active.

## Markers

`PHASE_1_IMPLEMENTATION_CONTRACTS_COMPLETE`

`PHASE_1_EXIT_EVIDENCE_PENDING_POST_MERGE_MOBILE`

`PHASE_2_NOT_AUTHORIZED`
