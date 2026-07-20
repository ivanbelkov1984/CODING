# Implementation backlog and release gates

## Epic 0 — Repository reality

- audit current DB and UI;
- entity mapping;
- privacy threat map;
- migration plan;
- baseline tests;
- AI routing, prompts, provider payloads and post-processing;
- current Dual Realm token/design baseline;
- current deploy/preview path;
- mobile-only development constraints;
- native-readiness findings for later Capacitor packaging.

Gate: no code until owner accepts reality report. Audit runs in Claude Code cloud from iPad/iPhone and returns a documentation-only draft PR.

## Epic 0.5 — Mobile cloud development foundation

After the reality report is accepted:

- confirm Claude Code cloud branch/PR workflow;
- define GitHub Actions checks readable from mobile;
- define mobile preview mechanism using existing repository/deploy reality;
- add screenshot/accessibility matrices for 390×844, 430×932, 834×1194 and 1194×834;
- define synthetic fixture policy;
- define protected secret boundaries;
- define Codespaces fallback and private forwarded-port procedure;
- define final handoff and interruption-resilience policy.

Gate: owner can start a task, review CI, open a preview and approve/reject a PR using only iPad/iPhone. No auto-merge or auto-deploy.

## Epic 1 — Metadata/provenance foundation

- common record metadata;
- correction events;
- invalidation graph;
- consent receipt;
- feature flag registry;
- policy/version/hash registry;
- import/export compatibility.

Gate: roundtrip, rollback, profile isolation, E2EE unchanged, mobile-readable CI evidence.

## Epic 2 — Momentary state

- valence/activation UI;
- optional labels/color;
- longitudinal cards;
- no diagnosis;
- personal pattern thresholds.

Gate: accessibility, Dual Realm themes, missingness honest, preview tested on iPhone and iPad.

## Epic 3 — Goals/actions

- goal/outcome contract;
- action ontology;
- recovery and adaptation;
- trajectory summary;
- context/barriers.

Gate: missed != avoidance, health context separated, touch/keyboard/long-Russian-text QA.

## Epic 4 — Health organizer

- products/ingredients;
- plans/intake;
- symptoms/vitals;
- source documents;
- visit report;
- encrypted local storage.

Gate: no safety claims; user corrections; source provenance; synthetic health fixtures only in cloud development.

## Epic 5 — Extraction

- mobile file picker flow;
- upload preview;
- local metadata;
- optional AI consent;
- field candidates and verification;
- accepted observations;
- original file preservation;
- interrupted mobile review recovery.

Gate: draft never appears in graph; deletion and temp cleanup tested; real medical documents absent from git/CI.

## Epic 6 — PDRE

- dimensions;
- data quality;
- simple dynamics;
- scenario outlook;
- user correction flow.

Gate: prediction null, no arbitrary composite score.

## Epic 7 — LLM synthesis and voice

- repository-grounded input adapter;
- output JSON Schema;
- versioned prompt-policy blocks;
- adaptive tone modes;
- input-reference and claim-class validators;
- astrology-isolation validator;
- health/tone/numeric/temporal validators;
- synthetic eval fixtures and mock provider;
- low-risk `pattern_explanation` pilot;
- user feedback and audit trail.

Gate: direct but non-shaming; every substantial claim grounded; astrology separate; no medical/psychological diagnosis; high-severity violations blocked; cloud calls consented and auditable.

## Epic 8 — Unified IA

- navigation restructuring without deleting functionality;
- Today orchestration;
- deep evidence drawer;
- Reviews;
- Library;
- extend existing Dual Realm tokens to new screens.

Gate: mobile usability, both themes, reduced motion, no function orphaned and no parallel Tailwind/shadcn design system.

## Epic 9 — Astrology subsystem

- calculation adapter;
- school registry;
- rectification preview;
- symbolic context card;
- LLM symbolic section adapter.

Gate: no empirical/medical dependency; empirical output unchanged when symbolic context is removed.

## Epic 10 — Advanced research previews

- changepoint candidates;
- JITAI learning;
- approved prediction-model work only after separate gates.

Gate: research flags, minimum-data thresholds, evaluation and rollback.

# Native migration backlog — begins after web stability

## Native N0 — Readiness audit

- production web build output;
- SPA routing and deep links;
- service worker versus native WebView policy;
- IndexedDB persistence and migration;
- CSP/network/auth redirects;
- blobs/files/camera needs;
- background and notification needs;
- privacy/store claims.

Gate: explicit ADR confirms whether Capacitor is appropriate and lists blockers.

## Native N1 — Capacitor shell spike

- add Capacitor to the existing web app on an experimental branch;
- create iOS and Android shells;
- keep domain logic and data contracts unchanged;
- create PlatformAdapter boundary;
- run cloud builds only.

Gate: application loads, offline data persists, navigation/themes/safe areas work, no data loss, no store release.

## Native N2 — Cloud CI and internal distribution

- Android APK/AAB on Linux CI;
- iOS archive on macOS CI or Xcode Cloud;
- protected signing credentials;
- Google Play internal testing;
- TestFlight distribution;
- App Store Connect/Play Console mobile review workflow.

Gate: reproducible signed builds, internal testers, crash/rollback evidence.

## Native N3 — Native capabilities

Add individually behind feature flags:

- local notifications;
- biometric lock;
- secure key storage;
- camera/document import;
- share/export;
- background tasks;
- optional Apple Health/Health Connect import after separate privacy/regulatory review.

Gate: each capability has web fallback, consent, tests and store disclosure.

## Native N4 — Store release

- privacy policy/data safety;
- account deletion/export;
- age rating;
- screenshots/descriptions;
- health-claims audit;
- signing and review notes;
- staged rollout and rollback.

Gate: Apple and Google release gates pass separately.

## Quarantine epics

Not implementable for public release without additional gates:

- medication interactions/contraindications/dose checking;
- clinical critical-value policy;
- diagnosis/prognosis/therapy;
- causal JITAI optimization;
- future-event probabilities;
- astrology incremental predictive model;
- broad SNOMED distribution;
- embedded copyrighted questionnaire translations;
- oracle/fatalist LLM mode or astrology-driven psychological claims;
- Apple Health/Health Connect clinical interpretation;
- native release with unreviewed signing, privacy or store declarations.
