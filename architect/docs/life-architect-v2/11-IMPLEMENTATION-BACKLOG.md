# Implementation backlog and release gates

## Epic 0 — Repository reality

- audit current DB and UI;
- entity mapping;
- privacy threat map;
- migration plan;
- baseline tests;
- AI routing, prompts, provider payloads and post-processing;
- current Dual Realm token/design baseline.

Gate: no code until owner accepts reality report.

## Epic 1 — Metadata/provenance foundation

- common record metadata;
- correction events;
- invalidation graph;
- consent receipt;
- feature flag registry;
- policy/version/hash registry;
- import/export compatibility.

Gate: roundtrip, rollback, profile isolation, E2EE unchanged.

## Epic 2 — Momentary state

- valence/activation UI;
- optional labels/color;
- longitudinal cards;
- no diagnosis;
- personal pattern thresholds.

Gate: accessibility, Dual Realm themes, missingness honest.

## Epic 3 — Goals/actions

- goal/outcome contract;
- action ontology;
- recovery and adaptation;
- trajectory summary;
- context/barriers.

Gate: missed != avoidance, health context separated.

## Epic 4 — Health organizer

- products/ingredients;
- plans/intake;
- symptoms/vitals;
- source documents;
- visit report;
- encrypted local storage.

Gate: no safety claims; user corrections; source provenance.

## Epic 5 — Extraction

- upload preview;
- local metadata;
- optional AI consent;
- field candidates and verification;
- accepted observations;
- original file preservation.

Gate: draft never appears in graph; deletion and temp cleanup tested.

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
- oracle/fatalist LLM mode or astrology-driven psychological claims.
