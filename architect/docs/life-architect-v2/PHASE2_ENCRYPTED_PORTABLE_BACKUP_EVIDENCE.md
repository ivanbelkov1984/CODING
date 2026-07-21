# Phase 2 Encrypted Portable Backup Evidence

## Corrections

- PBKDF2-SHA-256 is fixed at **600,000 iterations** for encrypted portable backups.
- Restore is transactional: DB, CFG, profile registry, activation state and newly written IndexedDB media are rolled back on any failure.
- Complete backup mode serializes real Blob, ArrayBuffer and typed-array bytes, preserves MIME type, and verifies SHA-256 over canonical raw bytes.
- Import validation is fail-closed for envelope schema, KDF and algorithm parameters, decoded ciphertext size, object and collection limits, media count, per-media size, total media size, manifest consistency, media hashes, malformed base64, and unsupported versions/schemas.
- Restore supports new-profile restore and explicit replacement of the currently selected profile. Replacement requires a second destructive-action confirmation.

## Browser evidence scope

The Chromium mobile and WebKit mobile evidence scenarios cover:

1. opening the encrypted backup sheet;
2. password mismatch;
3. missing acknowledgements;
4. creating a data-only backup;
5. creating a complete backup;
6. wrong-password restore;
7. corrupted-file restore;
8. cancel before mutation;
9. successful new-profile restore;
10. successful existing-profile replacement;
11. visible progress and final status.

## Local test evidence

- `npm run test:backup` exercises cryptographic parameters, real media bytes, fail-closed validation, transactional rollback, replacement confirmation, and full reread after successful restore.
- `npm run test:data`, `npm test`, and `npm run build` remain required regression gates.
