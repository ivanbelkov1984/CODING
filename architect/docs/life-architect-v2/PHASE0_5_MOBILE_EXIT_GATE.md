# Phase 0.5 Mobile Exit Gate

Status: `MOBILE_EXIT_GATE_PENDING_CI_EVIDENCE`

## Purpose

This gate completes the executable requirements of Contract P0.5-D. Earlier Phase 0.5 work documented that the repository had only one Chromium viewport and published no mobile evidence. This task adds the missing non-production evidence path without changing deployment or application behavior.

## Dedicated workflow

`.github/workflows/mobile-evidence.yml` runs on pull requests that change `architect/**` or the workflow itself. It may also be started manually.

The workflow:

1. checks out the pull request;
2. uses Node 22;
3. installs repository dependencies;
4. installs Playwright Chromium and WebKit with system dependencies;
5. creates a deterministic static build using `node build.mjs mobile-evidence-v1`;
6. runs `npm run test:mobile-evidence`;
7. publishes screenshots, traces and machine-readable reports as `phase-0-5-mobile-evidence`;
8. publishes the complete static build as `phase-0-5-static-preview`.

Artifacts are retained for 30 days. The workflow reads no production secret and does not deploy, write to a backend or use real user data.

## Browser and viewport matrix

The evidence harness runs all four layouts in Chromium and WebKit:

| Scenario | Viewport | Purpose |
|---|---:|---|
| iPhone SE | 375 × 667 | narrow and short phone layout |
| iPhone 14 | 390 × 844 | current phone-sized layout |
| iPad Mini portrait | 768 × 1024 | tablet layout and browser import/export smoke |
| iPad landscape | 1024 × 768 | tablet landscape and responsive transition |

This is browser-engine evidence, not proof from physical Apple hardware. WebKit is the closest repeatable CI proxy for Safari behavior.

## Automated checks

For each engine and viewport the harness verifies:

- application shell renders;
- document width does not overflow the viewport;
- the rendered DOM contains no duplicate IDs;
- drawer navigation opens and closes through the mobile path;
- keyboard focus reaches a visible interactive control;
- the entry editor remains reachable under a constrained viewport height representing an open software keyboard;
- a full-page screenshot is produced;
- no uncaught page error occurs;
- a Playwright trace with screenshots, snapshots and source references is produced.

The iPad Mini scenario additionally executes a synthetic browser-level JSON export/import flow and verifies:

- export policy is `portable-no-connection-secrets`;
- connection fields are absent from the exported configuration;
- database content remains in the export;
- portable configuration and database content are restored;
- local `apiUrl`, `spaceKey` and `lastSync` survive import unchanged.

## Offline and update checks

A separate Chromium mobile context verifies:

- the service worker activates under an HTTP origin;
- a navigation reload succeeds while the browser context is offline;
- replacing the deterministic service-worker build marker and calling `registration.update()` installs a new cache version.

The server used by the harness is local to the CI job and serves only the synthetic static build.

## Evidence outputs

`phase-0-5-mobile-evidence` contains:

- one full-page PNG per engine and viewport;
- one Playwright trace ZIP per engine and viewport;
- `mobile-evidence-report.json`;
- `mobile-evidence-report.md`.

`phase-0-5-static-preview` contains the complete `architect/dist/` build, including HTML, service worker, manifest, icons, fonts and self-hosted icon runtime. It is an artifact for local inspection, not a public preview deployment.

## Privacy and data boundary

All records used by the harness are visibly synthetic. It uses no real diary, dream, relationship, health, identity, API-key, passphrase or sync credential.

The browser export/import smoke uses sentinel connection values solely to prove that they are excluded or preserved locally. It does not call a real backend.

## Accessibility scope

This gate contains a basic keyboard-focus and DOM-integrity smoke test. It does not replace a full WCAG audit, screen-reader study or physical-device usability session. Those remain separate quality activities rather than blockers for the additive Phase 1 schema slice.

## Acceptance criteria

The mobile exit gate is complete only when:

- the existing repository CI is green;
- the dedicated mobile evidence workflow is green;
- both expected artifacts exist;
- the report contains zero failed checks;
- screenshots and traces exist for all eight engine/viewport combinations;
- the final pull request changes only the workflow, package command, evidence harness and this document unless a concrete mobile defect requires a separately documented fix.

## Rollback

Remove the dedicated workflow, package command, evidence harness and this report. No production data, runtime state, deployment or backend behavior is affected.

## Phase gate

Phase 1 remains blocked until the successful workflow run and artifacts are independently verified and this pull request is merged.

`PHASE_1_NOT_STARTED`
