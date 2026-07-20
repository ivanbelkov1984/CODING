# Phase 0 Native Readiness Report

Status: `NATIVE_IMPLEMENTATION_DEFERRED`

## Decision matrix

| Option | Current suitability | Storage persistence | WebCrypto | API keys | Push | Privacy disclosures | Health intended purpose | Backup/export | Mobile CI | App lifecycle | Decision |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PWA-only | suitable current core | existing localStorage/IDB behavior, still needs quota/recovery tests | browser WebCrypto already used; test supported devices | BYO browser keys remain a disclosed risk | web push/browser support varies | web privacy notice still required | keep self-management only | current export/backup paths retained and tested | mobile viewport/offline evidence required | service-worker lifecycle | approved baseline |
| Private Capacitor build | not ready; possible later prototype | must prove persistence across upgrades/background eviction and wrapper storage behavior | must prove crypto compatibility and key handling | evaluate native secure storage; do not silently migrate keys | native entitlements/token lifecycle required | private-test disclosure and data inventory | health quarantine remains | file sharing/restore and media completeness required | private build pipeline and signed artifact required | pause/resume/deep-link/update tests | deferred until readiness gates pass |
| Public App Store / Play Store | not ready | production-grade persistence/data deletion required | crypto review and recovery model required | secure credential architecture and support model required | production push permissions/policies | store privacy labels, deletion, retention, support contacts | intended-purpose/legal/clinical review required | user-accessible export, deletion, disaster recovery | reproducible signed builds, device matrix | store updates, migration, backup, crash recovery | blocked |

## Blocking readiness gates

1. Phase 0.5 branch and command evidence complete.
2. Import/export, snapshot, backup, sync, and tombstone roundtrips pass.
3. Plaintext/E2EE boundaries are proven.
4. API key policy is explicitly approved.
5. iPhone/iPad CI evidence is accessible to the mobile-only owner.
6. Offline/service-worker update behavior is stable in PWA.
7. Health intended-purpose statement is approved and diagnostic/treatment features remain quarantined.
8. Feedback/error retention and privacy disclosures are defined.
9. Native lifecycle, storage, WebCrypto, file export, media, and push prototype tests pass with synthetic data.
10. A rollback path to the PWA remains available.

## Architecture constraints

- The PWA remains the implementation core.
- Capacitor must wrap the existing vanilla application; it must not trigger a framework rewrite.
- Native-specific code must be isolated behind adapters and feature detection.
- No app-store submission may occur from an audit or schema PR.
- No native build may contain hard-coded provider keys, passphrases, production personal data, or unrestricted diagnostic upload.

## Required private prototype evidence (future phase)

- cold start, background/foreground, process termination, device restart;
- localStorage and IndexedDB persistence across app update;
- WebCrypto encrypt/decrypt and recovery roundtrip;
- export/import through native file picker/share sheet;
- push permission denial/acceptance/token rotation;
- offline operation and network restoration;
- app update with old cached/data versions;
- data deletion and account/profile deletion;
- crash recovery and backup restore.

## Final readiness status

`PWA_ONLY_APPROVED_AS_CURRENT_BASELINE`

`PRIVATE_CAPACITOR_PROTOTYPE_DEFERRED`

`PUBLIC_NATIVE_RELEASE_BLOCKED`
