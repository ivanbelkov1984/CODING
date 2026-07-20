# Phase 0 Mobile CI and Preview Plan

Status: `DOCUMENTATION_ONLY`

## Current reality

| Area | Current repository evidence | Classification |
|---|---|---|
| CI trigger | `.github/workflows/ci.yml`; repository/PR-triggered workflow for architect changes | observed repository fact |
| Install/test path | dependency install, Chromium install, repository test command | observed repository fact |
| Browser coverage | Chromium job proven; no committed iPhone/iPad engine matrix proven by Phase 0 | observed repository fact |
| Build | build is exercised in the successful `Build + E2E` CI step, but exact standalone command evidence must be recorded in Phase 0.5 | evidence gap |
| Screenshots | no reliable per-PR mobile screenshot artifact contract identified | observed repository fact |
| Preview | no isolated, durable, mobile-accessible per-PR preview contract identified | observed repository fact |
| Deploy | `.github/workflows/deploy.yml` deploys separately and must not be used as a substitute for PR review | observed repository fact |

## Required Phase 0.5 mobile evidence

Minimum viewports:

- iPhone compact portrait;
- iPhone large portrait;
- iPad portrait;
- iPad landscape;
- desktop regression viewport.

Minimum flows:

1. first load and hydration;
2. navigation through core sections;
3. create/edit/delete a synthetic record;
4. modal and keyboard interaction;
5. export/import using synthetic fixtures;
6. offline reload after service-worker installation;
7. service-worker update from an older cache version;
8. theme switching for both existing realms;
9. no horizontal overflow and acceptable touch targets;
10. accessibility smoke checks for labels, focus, contrast, and reduced motion where applicable.

## Artifact contract

Each feature PR that affects UI, storage, service worker, import/export, or navigation should produce:

- build artifact;
- test report;
- screenshots for the supported viewport matrix;
- concise machine-readable pass/fail summary;
- artifact retention long enough for owner review;
- no API keys, passphrases, production data, or personal fixtures.

## Preview strategy

Recommended minimum-safe order:

1. **CI artifact preview** containing static built assets and synthetic data only.
2. If artifact viewing is insufficient on iPad/iPhone, use an authenticated or unguessable temporary preview with no secrets and no production backend writes.
3. Public previews are allowed only when they contain synthetic data, no provider keys, no feedback credentials, no real sync space, and clear non-production labelling.
4. Production deployment is never the PR preview mechanism.

## Mobile-only owner workflow

`Codex/agent branch → Draft PR → CI → mobile screenshots/artifact or safe preview → owner review on iPad/iPhone → independent architecture review → merge decision`.

No local computer or terminal is required from the owner. Failed or inaccessible artifacts are a blocking evidence gap, not a reason to review on production.

## Security implications

- Static previews can reveal embedded configuration and source maps.
- Public URLs can be indexed or shared.
- Browser-side keys must never be injected into preview builds.
- Feedback and sync endpoints must use synthetic/non-production targets or remain disabled.
- Preview teardown and artifact retention must be documented.

## Acceptance criteria for Phase 0.5

- CI commands and triggers are documented from actual workflow files.
- At least the defined iPhone/iPad viewport evidence is produced.
- Offline reload and update behavior are tested.
- Owner can open evidence from iPad/iPhone without a desktop.
- Preview/artifact contains only synthetic content and no secrets.
- Deploy workflow remains unchanged unless separately approved.

`MOBILE_CI_PREVIEW_EVIDENCE_REQUIRED_BEFORE_PHASE_1_UI_WORK`
