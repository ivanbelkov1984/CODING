# Phase 0.5-D Mobile CI, Viewport, Preview and Artifact Evidence

Status: `PHASE_0_5_D_EVIDENCE_ONLY`

## Scope

Evidence-only review of current mobile-oriented test coverage, GitHub CI behavior, preview availability, and artifact publication. No runtime, workflow, deployment, schema, native, or production behavior is changed.

## Observed CI reality

- Pull requests touching `architect/**` trigger `CI — Архитектор`.
- The runner uses Ubuntu and Node 22.
- Dependencies are installed with `npm install`.
- Playwright Chromium is installed with system dependencies.
- CI runs `npm test` from `architect/`.
- No artifact upload step is configured.
- No screenshot, trace, HTML report, or video publication step is configured.
- No per-PR preview deployment is configured.

## Observed viewport reality

The current Playwright E2E test creates one Chromium page with:

- viewport: 390 × 900;
- device scale factor: 2.

This is a useful narrow mobile-sized viewport but it is not an actual iPhone or iPad device profile. The current suite does not prove:

- Safari/WebKit behavior;
- iPhone safe-area behavior;
- iPad/tablet layout;
- landscape orientation;
- small Android widths;
- desktop regression;
- touch-only interaction fidelity;
- virtual keyboard behavior;
- installability or standalone PWA behavior;
- offline service-worker upgrade behavior.

## Static evidence harness

`architect/tests/evidence/phase0_5_mobile_ci_preview_evidence.mjs` asserts:

1. PR path trigger exists;
2. Node 22 is used;
3. Chromium is installed;
4. `npm test` is executed;
5. Playwright launches Chromium;
6. 390 × 900 viewport is present;
7. device scale factor 2 is present;
8. no named iPhone/iPad device profile is configured;
9. no CI artifact upload exists;
10. no preview deployment exists;
11. no viewport matrix exists.

## Verdicts

### Mobile CI

`PARTIAL_EVIDENCE`

Current CI proves that the combined app builds and runs its configured Chromium E2E path at one mobile-sized viewport.

### Real-device coverage

`NOT_PROVEN`

No WebKit, iPhone, iPad, Android device profile, orientation matrix, or native-shell run is present.

### Preview

`NOT_AVAILABLE`

There is no per-PR preview or deployment evidence in the current CI workflow.

### Artifacts

`NOT_PUBLISHED`

Screenshots, traces, reports, videos, and logs are not published as retained CI artifacts.

### Native readiness

`NOT_PROVEN`

No Capacitor/native build, signing, emulator, permission, secure-storage, file-system, deep-link, notification, or app-store evidence exists.

## Risks

- A passing Chromium run can hide WebKit-specific failures.
- One viewport can hide tablet, landscape, keyboard, safe-area, and overflow defects.
- Without screenshots or traces, visual regressions are difficult to audit after a run.
- Without a preview URL, product review depends on local builds or merged deployment.
- File-origin E2E does not fully prove deployed-origin service worker and caching behavior.

## Recommended future CI contract

Before Phase 1 release readiness, add a separate reviewed CI task with:

- Chromium mobile 390 × 844;
- WebKit iPhone-like viewport;
- tablet/iPad-like viewport;
- one desktop viewport;
- portrait and selected landscape coverage;
- screenshots on failure;
- Playwright trace on failure;
- retained HTML report artifact;
- service-worker/offline update test on an HTTP origin;
- optional per-PR preview with no secrets or production data.

This report does not modify CI because Phase 0.5-D is evidence-only.

## Phase gate

Phase 0.5 evidence is substantially complete, but Phase 1 remains blocked by:

1. confirmed cross-collection tombstone collision;
2. unresolved `CFG.spaceKey` export/privacy classification;
3. missing remediation contracts for both issues.

Mobile preview/artifact gaps are release-readiness risks rather than the immediate data-integrity blocker.

## Rollback

Revert the two evidence-only files. Production behavior is unaffected.

## Final markers

`PHASE_0_5_MOBILE_CI_EVIDENCE_COMPLETE`

`SINGLE_MOBILE_CHROMIUM_VIEWPORT_PROVEN`

`WEBKIT_TABLET_PREVIEW_ARTIFACTS_NOT_PROVEN`

`PRODUCTION_BEHAVIOR_UNCHANGED`

`PHASE_1_NOT_STARTED`
