# Portable Export Privacy Remediation

Status: `EXPORT_CONNECTION_SECRET_LEAK_REMEDIATED_PENDING_CI`

## Confirmed issue

Phase 0.5-B and Phase 0.5-C established that the ordinary JSON export serialized the entire `CFG` object. This included:

- `spaceKey` — the identifier/credential used to address the user’s sync space;
- `apiUrl` — device-specific sync endpoint configuration;
- `lastSync` — service-state metadata;
- `_ts` — internal configuration conflict timestamp.

The same import path accepted those fields from any imported JSON file and replaced the current device configuration.

## New ordinary export contract

The portable JSON export now includes:

- `exportVersion: 2`;
- `exportPolicy: portable-no-connection-secrets`;
- export timestamp;
- application database;
- portable user-facing configuration produced by `exportSafeCfg`.

The following fields are intentionally omitted:

- `spaceKey`;
- `apiUrl`;
- `lastSync`;
- `_ts`.

Passphrases, recovery material and AI-provider keys already live outside `CFG` and remain outside the ordinary export.

## Import contract

Import continues to restore the database and portable configuration, including axes, labels and user preferences.

Connection fields are device-local:

1. current local `apiUrl`, `spaceKey` and `lastSync` are captured before import;
2. matching fields from the file are stripped, including legacy export files;
3. portable settings are merged with defaults;
4. current local connection fields are restored last and therefore cannot be overwritten by the file;
5. `persist()` creates a fresh local `_ts` after import.

## Security model

This is a portable data backup, not a full device clone. A restored device must configure its own sync connection explicitly through Settings.

The change reduces accidental disclosure through:

- emailing or uploading a backup;
- importing an untrusted or old backup;
- sharing a backup for support;
- moving diary data to another device that should not inherit the source device’s sync identity.

## Data retained in export

Personal diary content and user-selected preferences remain in the backup because they are the purpose of the export. The file is not encrypted by this feature and must still be handled as sensitive personal data.

`trustedContact` remains portable user data. It is personal information but not an authentication credential. A future encrypted backup feature may provide stronger at-rest protection for the entire file.

## Regression coverage

`architect/tests/evidence/export_privacy_regression.mjs` verifies:

- versioned export-policy metadata;
- exclusion of all four connection/service fields;
- preservation of portable user settings;
- absence of secret sentinel values in serialized JSON;
- preservation of the current device connection during import;
- rejection of connection overrides from legacy files;
- axes/default merging;
- source-level stripping of legacy fields;
- absence of passphrase, recovery and AI-key storage references from the ordinary export block.

The test is part of `npm test` and runs before build and Playwright E2E.

## Compatibility

- Existing version-1/legacy exports remain importable.
- Connection fields in old exports are deliberately ignored.
- Existing local sync configuration survives an import.
- Database format, encrypted sync envelope and backend storage format are unchanged.
- Markdown export behavior is unchanged.

## Rollback

Rollback would reintroduce connection fields into newly created backups and allow imported files to overwrite local sync identity. It is not recommended. No reverse data migration is required because the remediation only changes future serialization and import filtering.

## Gate

The export privacy blocker is closed only after:

- focused regression tests pass;
- existing Playwright E2E passes;
- final PR contains no temporary workflow or patcher;
- final diff is limited to the runtime boundary, tests, package wiring and this report.

`PHASE_1_NOT_STARTED`
