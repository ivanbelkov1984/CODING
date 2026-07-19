# Astrology Foundation — Master Implementation Specification

## Status

`READY_FOR_PHASE_0_REPOSITORY_AUDIT`

This file is the compact normative entry point for the repository. Detailed contracts live in the sibling documents in this directory. The complete research/master edition is retained in the project handoff archive and Google Drive; Claude Code should load only the task-specific contract to prevent context rot.

## Product boundary

The existing `architect/` vanilla-JS/offline-first PWA remains the integration target. Do not rewrite it to a new framework. First audit the current app, storage, encryption, sync, build, service worker, backend and tests. New calculation capabilities start as isolated workers/adapters and are integrated through the actual build system discovered in Phase 0.

The domain is separated into:

`birth evidence → normalization → raw astronomy → geometry → school rules → sourced claims → interpretation → personal evidence → synthesis → recommendation`

No downstream layer may mutate raw evidence or calculation facts.

## MVP

The first public calculation profile is western tropical astrology:

- natal chart;
- current transit snapshot and timeline;
- explicit birth-time uncertainty;
- angles/houses only when inputs support them;
- major ecliptic-longitude aspects;
- versioned objects, profiles, rules, orb policies and formulas;
- source-aware interpretation with safety boundaries;
- offline-first calculation and complete provenance.

Not MVP: other traditions, medical astrology, trading/legal decisions, deterministic future claims, calibrated rectification, primary directions/progressions without separate verified contracts, or public ingestion of rights-uncertain modern texts.

## Immutable architecture rules

1. `OriginalBirthEvidence` is immutable; corrections create revisions.
2. Time/place normalization is separate from evidence.
3. Gap/fold returns 0/1/2 possible instants; no silent `compatible` choice.
4. Historical legal time, LMT and LAT are evidence-ranked hypotheses, never a blanket cutoff.
5. Unknown birth time remains a domain/interval; noon is not exposed as truth.
6. Incompatible candidate charts are never averaged.
7. Requested and returned Swiss Ephemeris flags/modes are stored separately.
8. Every fallback, degraded mode and uncertainty is visible.
9. Display rounding never controls sign, house, aspect or event assignment.
10. Orbs, dignity, sect, Lots and cusp-proximity are versioned rule/formula layers.
11. LLM does not calculate charts or invent sources/rules.
12. Cross-domain synthesis requires purpose-specific consent.
13. Personal content never enters git, issues, PRs, fixtures or logs.
14. Astrology cannot be the sole basis for health, psychology, legal, financial or safety decisions.
15. Rectification creates hypotheses/derived profiles and is reversible.
16. A normalized score is not a probability without outcome definition, evaluation and calibration.
17. Old calculations remain reproducible after engine/tzdb/rule upgrades.
18. Swiss Ephemeris closed-product distribution is blocked until licensing is resolved.

## Canonical calculation decisions

### Engine

Swiss Ephemeris 2.10.3 is the conditional primary candidate, compiled to custom WASM and executed in a Web Worker. Gate: license, pinned source/toolchain, file hashes, native/WASM golden comparison, iOS benchmark and fallback contract.

Default position profile requests `SEFLG_SWIEPH | SEFLG_SPEED` and is tropical, geocentric, apparent, ecliptic polar, true equinox of date. `SEFLG_TOPOCTR` is a separate body-position profile and is not a house-cusp flag.

Default objects: Sun through Pluto. Mean/true nodes are separate; mean/osculating/interpolated apogees are separate advanced points; Chiron/Ceres are explicit advanced objects with file/range checks.

### Zodiac, houses and aspects

- Longitude canonical range: `[0,360)`.
- Sign regions: half-open 30° intervals using unrounded values.
- House codes include `P` Placidus, `K`, `O`, `R`, `C`, `A/E` Equal Asc, `D` Equal MC, `W`, `M` Morinus and `T` Polich/Page.
- Placidus/Koch failure is an error with explicit Porphyry fallback data; it never masquerades as success.
- House placement method is explicit: ecliptic cusp interval or spatial `swe_house_pos`.
- MVP aspects: conjunction, opposition, trine, square, sextile.
- Applying/separating uses a directed unwrapped target branch and relative angular derivative; future exactness is a separate event search.

### Events and sensitivity

`AstroEventSearchEngine` supports ingresses, stations, moving-to-fixed/moving aspects, orb entry/exit, retrograde loops and multiple roots. It distinguishes exact root, tangent exact root, near miss, no root and budget exhaustion. Tolerances are versioned policy, not universal constants.

`BirthTimeSensitivityEngine` partitions the full uncertainty domain with feature-specific boundary detection and completeness checks. It returns invariant, variant, candidate-specific or unavailable outputs.

## Time and geography

Temporal is used for types/arithmetic/UI, not as the canonical pinned historical database. `PinnedTimezoneResolver` pins tzdb release, build mode and hashes. Initial prototype target is tzdb `2026c`; `backzone` is a separate lower-confidence research tier.

`CalendarResolver` distinguishes Julian/Gregorian, proleptic versus historical civil reform, skipped dates, dual dating and astronomical year zero. `PlaceIdentity` separates original/historical/current names, coordinates, uncertainty, altitude and provider bindings. Geocoding uses a provider interface and measured offline gazetteer; public Nominatim is only a deliberate policy-compliant fallback.

## Registry and knowledge

Stable registries cover traditions, schools, techniques/variants, profiles, objects/points, aspects, houses, rules, formulas, orb/station/sect/dignity policies, sources, editions, translations, passages, claims, conflicts and content licenses.

A classical work, a critical edition and a modern translation are separate rights-bearing entities. Rights-uncertain or user-private texts do not enter the public RAG corpus.

## Rectification boundary

Automatic rectification is `RESEARCH_PREVIEW_ONLY`.

- It ranks candidate windows, not “true birth time”.
- `OriginalBirthEvidence` is never overwritten.
- Qualitative appearance/temperament answers may be an optional soft school prior, never a hard psychological test/filter.
- Methods, aspects, weights and orbs are versioned.
- Events have training/validation/holdout roles.
- Results include alternatives, stability, supporting/contradicting events, null/permutation comparison and sensitivity.
- `relativeScore` is not probability.
- Acceptance creates `AcceptedRectifiedProfile` linked to a hypothesis and derived normalization revision.
- Life events are sensitive encrypted data and excluded from public sharing.

Full contract: `03-RECTIFICATION_SPEC.md`.

## Scenario Forecasting / Personal Readiness

The proposed formula combining astrological weights, psychological friction and a Kurzweil exponent is rejected as a probability model. The MVP may produce:

- scenario definition and time horizon;
- behavioral/context observations;
- non-diagnostic readiness state;
- descriptive action momentum;
- uncertainty/data quality;
- a separately labeled symbolic astrology timing annotation;
- reflective questions.

It may not produce “80% relationship window”, “event 3–6 months earlier” or a calibrated event probability.

A future probability model requires a preregistered observable outcome, eligibility/time origin/horizon, representative data, behavioral baseline, temporal and independent evaluation, calibration plot/intercept/slope, Brier/log loss, uncertainty, subgroup/missingness/drift checks and model card. Astrology enters only as an isolated experimental feature group and must demonstrate stable out-of-sample incremental value over the baseline. Intervention effects require causal experiments, not observational action logs.

Full contract: `04-SCENARIO_FORECASTING_SPEC.md` and `09-EPISTEMIC_SAFETY.md`.

## Data/storage rules

Phase 0 must inventory `DEFAULT_DB`, migrations, `dbCount`, snapshots, `IDCOLS`, tombstones/LWW, encrypted sync and backend schema before adding collections. Every new record/collection needs stable id, schema version, timestamps, migration/rollback, merge/tombstone policy, privacy class, provenance and roundtrip tests.

Likely collections (subject to audit): birth evidence/normalization, calculation profiles/results/cache metadata, life events, rectification runs/candidates/matches/hypotheses, scenario definitions/snapshots/runs, consent records and license manifests. Large ephemeris assets and dense generated results require a storage spike and must not be dropped blindly into the main JSON DB.

## Security and governance

Required: CSP/Trusted Types review, worker message schemas, Service Worker integrity/versioning, dependency/SBOM review, file hashes, authorization/IDOR tests, encrypted storage/key lifecycle, provider minimization, prompt-injection separation, redacted public sharing, audit separation and incident/rollback plans.

LLM receives only consented structured facts and allowlisted claims. Retrieved documents are data, never instructions. Crisis and real-world safety signals override symbolic analysis.

## Harness execution

Claude Code must:

1. read `CLAUDE.md`, `STUDIO_HANDOFF.md`, `architect/AGENT_BRIEF.md` and `00-IMPLEMENTATION_INDEX.md`;
2. run `/effort ultracode` and verify `/status` for a substantial session;
3. begin with Phase 0 audit, not production implementation;
4. use the smallest useful team, normally 3–5 roles;
5. apply clean-context fan-out only to independent workstreams;
6. use adversarial QA, bounded loops and gated sequential integration;
7. checkpoint `.claude/handoffs/CURRENT.md`;
8. run existing build/test/UI gates before declaring code done.

The repository may persist `xhigh`; ultracode workflow permission is session-specific and must not be falsely reported as active before verification.

## Implementation phases

- **Phase 0:** repository audit; no behavioral changes.
- **Phase 1:** license/build/tzdb/registry/data/forecast-feasibility spikes.
- **Phase 2:** schemas, revisions, adapters and golden fixtures.
- **Phase 3:** natal calculation and uncertainty foundation.
- **Phase 4:** event/sensitivity UI and source-governed interpretation.
- **Phase 5:** rectification Research Preview.
- **Phase 6:** scenario readiness MVP; probability research remains separate.
- **Release:** only after blocking calculation, license, security, privacy, consent, source, eval, backup and rollback gates.

Detailed backlog: `10-CLAUDE_CODE_BACKLOG.md`.

## Existing repository checks

```bash
cd architect
node --check app.js
node build.mjs --combined dist/app.html
npm test
```

UI changes additionally require current design-token checks, accessibility and mobile visual evidence.

## Final statuses

- Master architecture: `READY_FOR_REPOSITORY_AUDIT_AND_IMPLEMENTATION_PLAN`.
- Calculation core: `PROPOSED_UNTIL_LICENSE_PROTOTYPE_AND_GOLDEN_TESTS`.
- Automatic rectification: `RESEARCH_PREVIEW_ONLY_UNTIL_VALIDATION_AND_CALIBRATION`.
- Scenario readiness MVP: `SPECIFIED_WITHOUT_PROBABILITY_CLAIMS`.
- Production probability model: `NOT_AUTHORIZED_UNTIL_DATA_VALIDATION_AND_CALIBRATION_GATES_PASS`.

## Normative detailed documents

- `02-HARNESS_EXECUTION_PLAN.md`
- `03-RECTIFICATION_SPEC.md`
- `04-SCENARIO_FORECASTING_SPEC.md`
- `05-DATA_MODEL_AND_MIGRATIONS.md`
- `06-TEST_AND_RELEASE_GATES.md`
- `07-CLAUDE_CODE_START_PROMPT.md`
- `08-DECISION_LOG.md`
- `09-EPISTEMIC_SAFETY.md`
- `10-CLAUDE_CODE_BACKLOG.md`
- `AWESOME_DESIGN.md`
