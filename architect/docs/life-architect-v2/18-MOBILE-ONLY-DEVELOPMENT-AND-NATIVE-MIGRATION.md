# Mobile-only development and native migration plan

## Status

`ACCEPTED_OWNER_OPERATING_CONSTRAINT`

Ivan develops while travelling and has only:

- iPad Pro 11;
- iPhone 14 Pro Max;
- mobile internet;
- GitHub;
- a Claude/Claude Code mobile client.

The project must therefore be operable without a personally owned Mac, Windows or Linux computer.

This is not treated as a temporary inconvenience. It is a product and engineering constraint that affects development workflow, previews, CI, release evidence and future iOS/Android packaging.

## Architectural decision

Use a three-level cloud toolchain:

```text
Owner control plane
  iPad / iPhone
        ↓
Agent execution plane
  Claude Code cloud
        ↓
Repository and verification plane
  GitHub branches, PRs, Actions, preview URLs and artifacts
```

GitHub is the durable source of truth. A mobile client is only an interface. No essential project state may exist only inside a Claude session or third-party app.

## Toolchain roles

### iPad — primary workstation

Use for:

- starting and steering Claude Code sessions;
- reading architecture documents;
- reviewing large PR diffs in Safari desktop mode;
- testing portrait and landscape layouts;
- testing PWA installation, offline behavior, keyboard and split-screen;
- reviewing CI logs and preview URLs;
- App Store Connect and TestFlight management later.

### iPhone — real-device and continuity client

Use for:

- actual phone UX testing;
- push/notification and safe-area testing later;
- quick approvals and session monitoring;
- TestFlight testing later;
- backup control when the iPad is unavailable.

### Claude Code cloud — default execution environment

Use for:

- repository audit;
- code changes on dedicated branches;
- existing build and test commands;
- documentation and migrations;
- creating pull requests;
- responding to CI/review feedback.

The owner is not asked to type code or run desktop commands.

### GitHub Actions — deterministic verification environment

Use for:

- syntax checks;
- unit/integration/e2e tests;
- production build;
- schema validation;
- migration roundtrip tests;
- screenshot and accessibility checks;
- packaging artifacts;
- later Android and iOS cloud builds.

### GitHub Codespaces — secondary manual environment

Use only when an interactive terminal, browser editor or forwarded live port is necessary. It is especially useful for manually viewing a development server from iPad Safari.

### VPS — last resort

A VPS is not required for the primary workflow. Add it only when tasks require a persistent custom environment that Claude Code cloud/Codespaces cannot provide.

## Branch and PR model

### Architecture baseline

Current architecture branch:

`agent/astrology-harness-foundation`

Current draft PR:

`#40`

### Phase 0 audit

Start Claude Code cloud from the architecture branch. Claude creates a separate branch such as:

`claude/phase0-life-architect-reality-audit`

The Phase 0 PR contains audit documents only.

### After Phase 0 acceptance

1. Accept the reality report.
2. Correct architecture documents if repository reality requires it.
3. Merge PR #40 only after review.
4. Start each implementation vertical slice from current `MAIN`.
5. Use one dedicated branch and one draft PR per slice.
6. Do not stack unrelated changes in one mobile session.

## Mobile task contract

Every implementation task given to Claude must include:

```yaml
owner_workflow: mobile_only
base_branch: MAIN
branch: dedicated_new_branch
primary_review_device: iPad
real_phone_test_device: iPhone_14_Pro_Max
files_owned: []
out_of_scope: []
production_data_allowed: false
secrets_allowed_in_prompt: false
preview_required: true
ci_required: true
rollback_required: true
manual_merge_only: true
```

## Preview contract

No feature is considered reviewable from a mobile-only workflow unless the PR provides a URL or installable artifact accessible from iPad/iPhone.

After Phase 0 determines the existing deployment setup, choose the smallest compatible preview path:

1. reuse the repository's existing preview hosting when present;
2. otherwise add a private GitHub Codespaces forwarded-port workflow for manual development previews;
3. otherwise add a branch preview through the hosting provider already used by the project;
4. do not introduce Vercel, Netlify or Cloudflare solely by assumption.

Each implementation PR must eventually provide:

- build status;
- test status;
- mobile preview URL;
- exact commit SHA;
- data migration status;
- known degraded states;
- screenshots or recordings for changed UI;
- rollback instruction.

## Required mobile viewports

At minimum verify:

- `390 × 844` — compact regression baseline already used by the project;
- `430 × 932` — iPhone 14 Pro Max CSS viewport class;
- `834 × 1194` — iPad Pro 11 portrait class;
- `1194 × 834` — iPad Pro 11 landscape class.

Also test:

- safe-area insets;
- software keyboard open/closed;
- portrait/landscape changes;
- reduced motion;
- light and dark Dual Realm themes;
- touch targets;
- long Russian text;
- offline reload;
- PWA standalone mode;
- split-screen on iPad where practical.

## CI foundation for a mobile owner

After Phase 0, create a repository-grounded CI task. Do not guess package commands before the audit.

The intended CI shape is:

```text
Pull request
  ├─ syntax/static validation
  ├─ unit/integration tests
  ├─ production web build
  ├─ schema and migration tests
  ├─ mobile screenshot/accessibility checks
  ├─ artifact or preview publication
  └─ release-gate summary readable from GitHub mobile
```

CI logs must avoid personal data and secrets. Synthetic fixtures only.

## Development phases through mobile tools

### Phase 0 — repository reality

Execution: Claude Code cloud.

Owner action: select repo/branch, use Plan mode, paste the Phase 0 prompt, review the resulting audit PR.

No production code.

### Phase 1 — metadata and governance foundation

Execution: Claude Code cloud on a dedicated branch.

Review: GitHub PR and CI from iPad.

Required first deliverable: safe migration and roundtrip evidence, not UI.

### Phase 2 — Momentary State

Execution: Claude Code cloud.

Review: preview URL on iPhone and iPad.

Test: 5–10 second check-in, keyboard, correction, offline mode, both themes.

### Phase 3 — Goals and Actions

Review: real touch interactions and long text on both devices.

No arbitrary score or hidden classification.

### Phase 4 — Health Organizer

Use synthetic medical documents and products in development. Real user health data stays in the installed/private application, not in GitHub or cloud test fixtures.

Cloud AI extraction remains opt-in and source-bound.

### Phase 5 — Document extraction

Mobile-first UX is mandatory because the owner will upload/capture files from iPhone/iPad.

Review flows must support:

- Files picker;
- camera/photo import when later available natively;
- page-by-page field verification;
- large touch controls;
- interrupted session recovery.

### Phase 6 — PDRE and LLM synthesis

Run synthetic evals in CI. Human review occurs through structured input/output examples in the PR, not through private diary content.

### Phase 7 — unified navigation

No desktop-first information architecture. iPhone remains the strictest primary layout; iPad gains more space but not a separate product.

### Phase 8 — astrology subsystem

Heavy calculations run in the web worker/WASM design selected after audit. Cloud development remains possible because tests use synthetic birth data.

### Phase 9 — research previews

Remain feature-flagged and off by default.

## PWA-first strategy

The current application remains a web-first offline-capable PWA during feature development.

This is the correct choice for the mobile-only owner because:

- every commit can be tested immediately in Safari;
- no native build/signing cycle is required for routine feature work;
- iPhone, iPad and Android browsers share the same application core;
- the application can be installed to the Home Screen during the test period;
- most architecture, data and UX work can stabilize before store-specific complexity.

PWA readiness requirements:

- valid manifest;
- stable service worker update strategy;
- explicit offline/degraded behavior;
- IndexedDB migration safety;
- safe-area support;
- responsive layouts;
- install and update instructions;
- no dependency on browser extensions;
- exported user backup and recovery path.

## Native migration decision

Use **Capacitor** as the preferred wrapper candidate after the web application stabilizes.

Capacitor can be added to an existing JavaScript/HTML/CSS application and create native iOS and Android containers without rewriting the product in React, Next.js or React Native.

This remains `PROPOSED_UNTIL_NATIVE_READINESS_AUDIT`; Phase 0 must first confirm build output paths, routing, service worker assumptions and backend integration.

## Native adapter boundary to prepare now

Do not call browser/native APIs directly throughout the application. Gradually route capabilities through adapters:

```text
PlatformAdapter
  ├─ notifications
  ├─ secureSecrets
  ├─ biometricLock
  ├─ fileImport
  ├─ cameraCapture
  ├─ shareExport
  ├─ backgroundRefresh
  ├─ networkStatus
  ├─ appLifecycle
  └─ healthDataImport (future gated)
```

Web implementation uses browser APIs. Native implementation later uses Capacitor plugins or small Swift/Kotlin bridges.

This avoids rewriting business logic during packaging.

## Native stages

### Native Stage N0 — readiness audit

Before adding Capacitor, verify:

- production build output directory;
- single-page routing behavior;
- service worker behavior inside a native WebView;
- IndexedDB persistence and backup expectations;
- authentication redirects/deep links;
- CSP and network domains;
- file/blob handling;
- background limitations;
- notification requirements;
- legal privacy disclosures.

### Native Stage N1 — shell spike

Create a separate experimental branch.

Add Capacitor configuration and both platform projects without changing domain logic.

Success criteria:

- web build loads in iOS/Android shells;
- no data migration is lost;
- theme, safe areas and navigation work;
- offline local data survives restart;
- no store submission yet.

### Native Stage N2 — internal device testing

Android:

- cloud CI builds APK/AAB;
- distribute through Google Play internal testing or a controlled artifact.

Apple:

- cloud macOS CI or Xcode Cloud builds the iOS archive;
- distribute with TestFlight;
- manage testers and submissions from App Store Connect on iPad/iPhone.

Apple native builds require Apple Developer Program membership, signing assets and an Xcode project. A physical Mac owned by Ivan is not required if cloud macOS build infrastructure and signing are configured correctly, but initial signing/onboarding may require an audited CI setup and possibly temporary specialist assistance.

### Native Stage N3 — native capabilities

Add capabilities one by one behind feature flags:

- local notifications;
- biometric lock;
- secure key storage;
- camera/document import;
- share sheet;
- background tasks;
- optional Apple Health/Health Connect import only after separate privacy, consent and regulatory review.

### Native Stage N4 — store release

Separate release gates for Apple and Google:

- privacy policy and data-safety forms;
- age rating;
- account deletion/export;
- screenshots and descriptions;
- review notes;
- health claims audit;
- crash monitoring privacy;
- signing and reproducible build evidence;
- staged rollout and rollback.

## Cloud native-build options

### iOS

Preferred candidates:

- Xcode Cloud after the Capacitor Xcode project exists;
- GitHub Actions macOS runner with controlled signing;
- a specialized mobile CI provider only after security and cost review.

The owner controls TestFlight and submissions through App Store Connect web/mobile. Build credentials must be stored in protected CI secrets, never in Claude prompts or repository files.

### Android

GitHub Actions Linux runner can build the Android project after Gradle/SDK configuration. Signing keystore and Play credentials live in protected CI secrets.

## Security boundary for cloud development

Never place the following in Claude Code cloud, Codespaces, GitHub issues or fixtures:

- real diaries;
- real health documents;
- medication history tied to Ivan;
- birth certificates or exact personal birth evidence;
- API keys;
- Apple signing private keys in plaintext;
- Android keystores in the repository;
- production database dumps.

Use synthetic profiles and redacted documents.

## Connectivity and interruption resilience

Because the owner works from a truck and mobile connectivity varies:

- Claude sessions must persist in cloud;
- every meaningful result must be committed/pushed before session completion;
- task prompts require a final handoff file;
- large tasks are split into short vertical slices;
- previews should tolerate reconnection;
- owner review does not rely on a live terminal remaining open;
- no production deployment occurs automatically when the owner disconnects.

## Definition of mobile-ready development

A development phase is mobile-ready only when:

- it can be initiated from iPad/iPhone;
- compute runs in cloud;
- result is stored in GitHub;
- CI status is readable from mobile;
- UI change has a mobile-accessible preview;
- owner is not asked to edit code;
- rollback is documented;
- merge and deploy remain explicit owner actions.

## Final operating model

```text
NOW
PWA + Claude Code cloud + GitHub PRs + mobile previews

AFTER PHASE 0
repository-grounded CI, preview and migration foundation

DURING FEATURE DEVELOPMENT
small vertical slices tested on iPhone and iPad

AFTER WEB STABILITY
Capacitor shell spike

BETA
Android internal testing + iOS TestFlight through cloud builds

RELEASE
separate Apple/Google compliance and release gates
```

## Decision record

```text
MOBILE_ONLY_DEVELOPMENT = ACCEPTED
DESKTOP_OWNERSHIP_REQUIRED = FALSE
OFFICIAL_CLAUDE_CODE_CLOUD = PRIMARY
GITHUB_CODESPACES = SECONDARY
PERSONAL_VPS = LAST_RESORT
PWA_FIRST = ACCEPTED
CAPACITOR_NATIVE_WRAPPER = PROPOSED_AFTER_AUDIT
REACT_NEXT_REWRITE = REJECTED
CLOUD_CI_FOR_IOS_ANDROID = REQUIRED
REAL_PERSONAL_DATA_IN_DEV_CLOUD = PROHIBITED
```
