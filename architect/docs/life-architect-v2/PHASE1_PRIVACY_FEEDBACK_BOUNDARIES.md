# Phase 1 Privacy-Safe Feedback and Diagnostics

Status: `PHASE_1_P1_C_IMPLEMENTATION_COMPLETE`

Approved prerequisites:

- `PHASE0_5_EXIT_DECISION.md`;
- `PHASE1_ADDITIVE_SCHEMA_METADATA.md`;
- `PHASE1_AI_POLICY_VALIDATORS.md`;
- `architect/FEEDBACK_SPEC.md`, marked ready without clarification.

## Scope

This task implements only Contract P1-C for the existing feedback channel and local diagnostic buffer.

It does not implement:

- feedback screenshot/photo upload;
- automatic feedback nudges;
- AI triage, deduplication, digest or autofix;
- analytics or automatic telemetry;
- AI-provider consent redesign;
- sync encryption redesign;
- deletion of server feedback;
- unrelated UI or backend features.

## Approved policy

Feedback is a voluntary channel separate from the encrypted diary.

Only these classes of information may enter a feedback request:

1. text explicitly entered into the feedback form;
2. optional, visibly disclosed technical context;
3. optional, separately enabled last three redacted local error records.

The application must never attach `DB`, `CFG`, insights, check-ins, dreams, patterns, chats, cravings, sync keys, AI keys, passphrases or recovery material.

## Consent controls

The form exposes three independent choices:

- contact masking, enabled by default;
- technical context, enabled by default;
- local error attachment, disabled by default.

API-key, Bearer-token, UUID and secret query-parameter redaction is mandatory and cannot be disabled. Contact masking may be disabled because the user may intentionally include an email or phone for follow-up.

The disclosure lists the exact technical categories and updates before submission.

## Client privacy adapter

`architect/privacy-feedback.js` exposes the frozen `ARCH_FEEDBACK_PRIVACY` API.

It is responsible for:

- contact and credential redaction;
- error normalization without stacks or full paths;
- context allowlisting;
- forbidden-key rejection;
- payload preparation with explicit privacy metadata;
- bounded local error, outbox and sent-ID storage;
- immediate local clear actions.

Local keys:

- `arch5_errbuf` — maximum 10 redacted errors;
- `arch5_fb_outbox` — maximum 10 prepared feedback payloads;
- `arch5_fb_sent` — maximum 20 deduplicated server IDs.

These keys are not part of JSON or Markdown diary exports.

## Error handling

Window errors and unhandled rejections are normalized to:

- redacted message;
- source basename only;
- line and column when available;
- ISO timestamp.

No stack, full URL, query string, local file path or diary object is stored. Errors remain local until the user enables their separate checkbox and submits the form.

The user may clear diagnostics and the failed-send outbox independently at any time.

## Failed submission policy

Only retryable conditions enter the outbox:

- offline state;
- network failure;
- HTTP 408, 425, 429 or 5xx response.

A 4xx validation/privacy rejection is shown to the user and is not queued indefinitely. The form text remains available for correction.

Successful outbox delivery records the returned feedback ID for status-loop closure.

## Server boundary

`architect/backend/feedback-privacy.js` repeats minimization and redaction server-side. The browser is not trusted as the only privacy control.

The backend:

- accepts only text, allowlisted context and standardized privacy choices;
- rejects screenshots and space identifiers in this contract;
- repeats secret redaction regardless of client choice;
- applies contact masking according to the explicit form choice;
- stores only the sanitized text, context and privacy metadata;
- uses a dedicated limit of five feedback writes per hour per IP;
- never returns raw database/internal exception messages.

The existing status endpoint remains read-only and returns only feedback status fields.

## Retention and access disclosure

Current server behavior is append-only and has no automatic expiry. The UI states this plainly as **stored without automatic deletion**.

Raw feedback access is limited operationally to the project owner through the existing Postgres/GitHub maintenance workflow. The UI states that the project owner can access the submitted text and selected technical context.

This task does not invent an unsupported deletion promise or retention period.

## Export boundary

Feedback localStorage keys, error buffers, outbox contents and sent IDs are not members of `DB` or safe portable `CFG`, so ordinary JSON and Markdown exports exclude them.

Focused tests freeze this boundary.

## Cross-engine rendering hardening

Mobile evidence found a real compositor race in the existing modal-sheet presentation. The feedback overlay could be present while the sheet remained on an intermediate transparent or translated frame in WebKit and some tablet runs.

The non-essential overlay and sheet transitions were removed. Closed overlays still use `opacity:0` and `pointer-events:none`; opened overlays and sheets switch immediately to their deterministic final state.

The mobile harness now verifies the computed feedback-sheet state before taking evidence:

- overlay opacity is `1`;
- sheet opacity is `1`;
- sheet transform is `none`;
- sheet visibility is `visible`;
- the sheet has non-zero dimensions.

This change affects only modal presentation timing. Feedback content, data, sync, AI, health and backend semantics are unchanged.

## Mobile evidence

The permanent mobile evidence harness opens the feedback form on every Chromium/WebKit and phone/tablet scenario and verifies:

- disclosure and consent controls are visible;
- contact masking defaults on;
- technical context is a visible choice;
- error attachment defaults off;
- diary and key exclusion is disclosed;
- retention and owner access are disclosed;
- local diagnostic clear controls are reachable;
- compositor state is stable;
- a dedicated feedback screenshot is produced for every engine/viewport combination.

No real feedback request is made in mobile evidence.

## Validation evidence

Final validated implementation head before this documentation-only status update: `20cd04906b83a9e6d1fcbf260aa9196eedbcf033`.

The implementation passed:

- 25 focused privacy/feedback assertions;
- all existing tombstone, export-privacy, additive-metadata and AI-policy regressions;
- deterministic combined build;
- full Chromium E2E: 170 of 170 checks;
- ordinary PR merge-ref CI;
- mobile evidence: 181 of 181 checks with zero failures;
- Chromium and WebKit across iPhone SE, iPhone 14, iPad Mini portrait and iPad landscape;
- 24 PNG artifacts: viewport, application and feedback-consent evidence for all eight engine/viewport combinations;
- 8 Playwright traces;
- offline reload, service-worker update and browser import/export privacy smoke.

All eight final feedback screenshots were visually inspected. The form, disclosure, checkboxes and local clear controls are fully rendered and readable in both browser engines on phone and tablet layouts.

Validated artifact digests:

- mobile evidence: `sha256:1a50f640e89e602b7d531a21cf2b0456dced2c7168884302994732b3623a0417`;
- static preview: `sha256:8968da4996aa201ddd8fbe10fba36d858fbcfeb97add47ad0a986560d762ebd8`.

## Rollback

1. Disable the feedback launcher and submission function.
2. Keep the local diagnostic/outbox clear functions available.
3. Restore the previous feedback backend handler if required.
4. Remove privacy-module build wiring and focused tests.
5. Existing local feedback keys may be cleared without touching diary or sync data.

No diary record or sync migration is involved.

## Stop conditions verified

The final implementation does not:

- attach diary or configuration content implicitly;
- enable error attachment by default;
- permit credential-redaction opt-out;
- queue rejected 4xx payloads indefinitely;
- accept arbitrary server context fields;
- return internal backend exceptions;
- hide or misrepresent retention/access;
- leave modal sheets in an intermediate compositor state.

## Final markers

`PHASE_1_PRIVACY_BOUNDARIES_COMPLETE`

`DIARY_NEVER_ATTACHED`

`ERROR_ATTACHMENT_EXPLICIT_OPT_IN`

`SERVER_MINIMIZATION_ENFORCED`

`NO_AUTOMATIC_RETENTION_PROMISE`

`CROSS_ENGINE_FEEDBACK_EVIDENCE_COMPLETE`

`PHASE_1_NEXT_CONTRACT_NOT_STARTED`
