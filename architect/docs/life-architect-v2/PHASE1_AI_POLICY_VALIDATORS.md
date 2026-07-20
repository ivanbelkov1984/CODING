# Phase 1 Governed AI Policy and Validators

Status: `PHASE_1_P1_B_IMPLEMENTATION_COMPLETE`

Approved prerequisites:

- `PHASE0_5_EXIT_DECISION.md`;
- `PHASE1_ADDITIVE_SCHEMA_METADATA.md`.

## Scope

This task implements only Contract P1-B. It places an independently testable policy and validation seam behind the existing `callClaude()` boundary.

It does not:

- change feature triggers;
- change selected providers or models;
- move keys or requests through the project backend;
- add autonomous tools;
- add diagnosis, treatment or new health claims;
- add fields to provider payloads other than the standard abort signal used by `fetch`;
- add real diary, health or relationship fixtures;
- change the AI consent or retention UI.

## Existing boundary retained

The application continues to use:

- the current `AI_PROVIDERS` adapters for Anthropic, OpenAI and Gemini;
- the current model-routing and budget ledger;
- the current `callClaude()` function name and all 12 existing call sites;
- the current system/user/messages/schema content;
- the current local per-provider key storage.

`architect/ai-policy.js` is loaded before `app.js` and exposes a frozen classic-script global `ARCH_AI_POLICY`.

## Request policy

Before provider execution, `prepareRequest()` verifies:

- the task belongs to the current governed vocabulary;
- the request contains user text or a valid user/assistant message list;
- message roles cannot inject a new system message;
- token limits stay within a documented cap for the existing task;
- JSON Schema, when present, is an object;
- reasoning is normalized without changing the selected model or provider.

The current task vocabulary is:

- `react`;
- `deeper`;
- `prompts`;
- `digest`;
- `map`;
- `analysis`;
- `chat`;
- `psy`;
- `other`.

The caps are above or equal to every current call-site value. Tasks that historically relied on the `callClaude()` default remain compatible with the existing 1024-token default; real feature call sites keep their current lower explicit limits.

## Provider execution policy

`runProvider()` creates one `AbortController`, passes its signal into the existing provider adapter and enforces a 60-second timeout.

This closes the previous inconsistency where Anthropic had an explicit timeout but OpenAI and Gemini could wait indefinitely. Provider errors retain their original status and message. Timeout errors are classified with `code=timeout` and `timeout=true`.

No-key and monthly-budget checks remain in `callClaude()` and execute before any provider call.

## Structured-output validation

When a call includes JSON Schema, `validateResponse()`:

1. requires valid JSON;
2. validates the parsed value against the existing schema;
3. supports the subset already used by the application: object, array, string, integer, number, boolean, null, required, properties, `additionalProperties:false`, enum, anyOf, min/max items, min/max length and numeric bounds;
4. rejects malformed, missing, extra, out-of-enum or out-of-range values;
5. returns canonical JSON only after successful validation.

Invalid structured output fails closed before the success ledger, persistence or downstream parser. Existing local fallbacks remain responsible for user-visible recovery where they already exist.

## Text-output validation

Plain text must be a non-empty string and remain below the global output-size ceiling.

A narrow high-confidence output filter rejects:

- active script/iframe/object/embed/SVG markup;
- JavaScript URLs and inline event handlers;
- explicit instructions to ignore previous instructions and reveal system/developer prompts;
- credential-shaped Anthropic/OpenAI/Google/Bearer tokens.

The filter operates on both plain text and every nested string in structured output. It does not inspect or rewrite the user input and does not add user content to any new destination.

## Privacy boundary

This seam does not add provider payload fields, telemetry, remote logging or server transit. Tests use synthetic strings only.

Policy errors contain a code and generic description. Credential-shaped synthetic output is rejected without copying the credential into the error object.

## Behavior compatibility

For valid current requests and valid provider responses:

- provider selection is unchanged;
- model selection is unchanged;
- prompt text is unchanged;
- max-token values at real feature call sites are unchanged;
- response text is unchanged except surrounding whitespace is trimmed for unstructured output;
- structured JSON is parsed, validated and reserialized before the existing downstream `JSON.parse`.

The intentional behavior change is fail-closed handling of invalid or unsafe output and consistent timeout enforcement across all three providers.

## Tests

`architect/tests/evidence/ai_policy_validators_regression.mjs` covers:

- task and token preflight;
- user/assistant message roles;
- valid current request preservation;
- valid JSON Schema output;
- malformed JSON;
- missing and unexpected fields;
- anyOf, enum and numeric bounds;
- benign Russian text;
- empty output;
- prompt-leak and instruction-override corpus;
- active HTML/JavaScript corpus;
- credential-shaped output;
- unsafe nested structured output;
- normal provider completion;
- timeout classification;
- provider error preservation;
- no-key and budget ordering;
- abort signal delivery to all providers;
- validation before success ledger/persistence;
- deterministic load/build order;
- inclusion in ordinary CI.

The existing E2E synthetic fixtures were made schema-valid for the already-existing chat-summary and psychological-markup contracts. Production prompts and schemas were not weakened.

The existing tombstone, export privacy, metadata, build, Playwright and mobile evidence gates remain mandatory.

## Validation evidence

Final validated head before this documentation-only status update: `402798e91412d8cc235e677dbf6eaa38236cf1aa`.

The implementation passed:

- 23 focused AI policy and validator assertions;
- all existing data/privacy/metadata regressions;
- deterministic combined build;
- full Chromium E2E: 162 of 162 checks;
- ordinary repository CI;
- mobile evidence: 117 of 117 checks with zero failures;
- Chromium and WebKit across iPhone SE, iPhone 14, iPad Mini portrait and iPad landscape;
- 16 visually inspected PNG artifacts and 8 Playwright traces;
- offline reload, service-worker update and browser import/export privacy smoke.

Visual inspection found no layout or rendering regression across the eight engine/viewport combinations.

Validated artifact digests:

- mobile evidence: `sha256:e09f7e5e7f1efaa622a71abe2a799b360f2718d6d19221b49b4cd44d7700ea90`;
- static preview: `sha256:6b485ada9f66eba88e4a81ef667b84130b3133b03b5c166e395361011b25346e`;
- successful full npm-test diagnostic: `sha256:e51ab9fb210b4b70c28f1ee1b9853356ec77ecd776ac63e067e684a2e1e12837`.

## Rollback

1. Stop loading and inlining `ai-policy.js`.
2. Restore the previous provider fetch timeout code and `callClaude()` body.
3. Remove the focused test from `test:data`.
4. Leave all feature call sites unchanged.

No data migration or record rewrite is involved.

## Stop conditions

Do not merge if:

- a valid current feature changes provider/model routing;
- new user data enters a provider payload;
- a real credential or personal fixture appears;
- structured invalid output can reach persistence;
- no-key or budget gates move after provider execution;
- provider errors lose their status;
- ordinary or mobile CI fails;
- a visual regression appears.

## Final markers

`PHASE_1_AI_POLICY_SEAM_COMPLETE`

`VALID_STRUCTURED_OUTPUT_REQUIRED`

`PROVIDER_ROUTING_UNCHANGED`

`SYNTHETIC_FIXTURES_SCHEMA_VALID`

`PHASE_1_P1_C_NOT_STARTED`
