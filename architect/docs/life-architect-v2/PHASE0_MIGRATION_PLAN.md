# Phase 0 Migration Plan and Phase 0.5 Gate

Status: `DOCUMENTATION_AND_TEST_EVIDENCE_ONLY`

## Decision

Phase 0 does not transition directly into production Phase 1. An explicit **Phase 0.5** is required. Phase 0.5 may add tests, synthetic fixtures, CI evidence, and documentation, but must not change production data shape or user-visible behavior.

## Phase 0.5 entry criteria

- Phase 0 correction PR is reviewed and merged into the approved architecture branch.
- MAIN, architecture base, and implementation head are compared and the canonical implementation baseline is recorded.
- No unresolved production incident is active.
- All work uses synthetic fixtures; no real diary, health, relationship, birth, astrology, or credential data.

## Phase 0.5 tasks

### P0.5-1 — branch and command evidence

Allowed: documentation and test/evidence scripts only.

Run and record:

- `git status --short`
- `git diff --stat`
- `git diff --name-only`
- `node --check architect/app.js`
- `node --check architect/sw.js`
- `node --check architect/backend/server.js`
- repository-defined clean install command
- standalone build command
- `npm test`

Acceptance: exact command, working directory, exit code, concise output, modified files, and limitation are committed to an evidence report.

### P0.5-2 — migration/import/export roundtrip evidence

Create synthetic profiles covering every mapped collection, scalar store, `_del`, `__ts`, configuration, snapshots, backups, and a media manifest.

Required assertions:

1. export → clear → import preserves normalized content;
2. repeated import is idempotent or explicitly conflict-resolved;
3. old profile keys still migrate;
4. missing optional metadata is backfilled without destructive rewrite;
5. secrets are excluded from export/sync unless explicitly allowed;
6. media omissions are surfaced rather than silently ignored;
7. failed import restores the pre-import backup.

### P0.5-3 — tombstone isolation

Use identical ids in two distinct `IDCOLS` collections, delete one, merge in both directions, sync roundtrip, restore snapshot, and import/export. Classify the result as confirmed defect, disproven, or remaining evidence gap.

### P0.5-4 — privacy boundary proof

With synthetic sensitive-looking strings, inspect:

- localStorage and IndexedDB;
- export files;
- sync payload before/after encryption;
- server-stored object in a controlled environment;
- AI request payload;
- feedback request;
- error buffer and triage payload.

Acceptance: each path is labelled plaintext/ciphertext, automatic/opt-in, destination, retention, and redaction behavior.

### P0.5-5 — mobile CI evidence

Add test-only/CI-only evidence for supported iPhone/iPad viewport classes, offline reload, service-worker update, installability metadata, touch targets, keyboard overlap, and screenshot artifacts. No production deploy workflow changes without a separate approved contract.

### P0.5-6 — owner decisions

Record explicit decisions for:

- canonical implementation branch;
- browser-side BYO AI keys vs future gateway;
- health intended-purpose wording;
- feedback/error retention and access;
- acceptable preview visibility;
- PWA-only period and native-entry criteria.

## Safe migration sequence after Phase 0.5

1. Freeze current schema behavior with tests.
2. Add optional schema/provenance metadata only.
3. Add read-compatible migration that leaves old keys readable.
4. Add validators and synthetic fixtures.
5. Prove backup, import/export, snapshot, tombstone, and encrypted-sync roundtrips.
6. Enable additive metadata behind a feature flag if needed.
7. Observe and retain rollback path.
8. Consider storage-engine migration only in a later dedicated phase.

## Rollback

Phase 0.5 changes must be removable without converting user data. Tests, fixtures, CI evidence, and documentation can be reverted independently. If any test reveals silent loss or privacy leakage, stop the phase; do not “fix forward” inside the audit PR.

## Stop conditions

- Any runtime file changes outside a separately approved task contract.
- Any fixture containing real personal data or credentials.
- Any inability to restore the pre-test state.
- Any unresolved critical privacy/security/regulatory risk.
- Any branch mismatch that makes evidence non-reproducible.

## Exit criteria

- Complete command ledger is green or gaps are explicitly blocking.
- Canonical branch decision is recorded.
- Roundtrip and tombstone tests have determinate outcomes.
- Privacy boundaries are proven with synthetic data.
- Mobile review artifacts are accessible from iPad/iPhone.
- Owner decisions are recorded.
- Independent review approves Phase 1 entry.

Final marker: `PHASE_0_5_REQUIRED_AND_DEFINED`
