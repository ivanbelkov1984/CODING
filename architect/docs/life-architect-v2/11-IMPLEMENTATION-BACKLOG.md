# Implementation backlog and release gates

## Epic 0 — Repository reality

- audit current DB and UI;
- entity mapping;
- privacy threat map;
- migration plan;
- baseline tests.

Gate: no code until owner accepts reality report.

## Epic 1 — Metadata/provenance foundation

- common record metadata;
- correction events;
- invalidation graph;
- consent receipt;
- feature flag registry;
- import/export compatibility.

Gate: roundtrip, rollback, profile isolation, E2EE unchanged.

## Epic 2 — Momentary state

- valence/activation UI;
- optional labels/color;
- longitudinal cards;
- no diagnosis;
- personal pattern thresholds.

Gate: accessibility, both themes, missingness honest.

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

## Epic 7 — Unified IA

- navigation restructuring without deleting functionality;
- Today orchestration;
- deep evidence drawer;
- Reviews;
- Library.

Gate: mobile usability and no function orphaned.

## Epic 8 — Astrology subsystem

- calculation adapter;
- school registry;
- rectification preview;
- symbolic context card.

Gate: no empirical/medical dependency.

## Quarantine epics

Not implementable for public release without additional gates:

- medication interactions/contraindications/dose checking;
- clinical critical-value policy;
- diagnosis/prognosis/therapy;
- causal JITAI optimization;
- future-event probabilities;
- astrology incremental predictive model;
- broad SNOMED distribution;
- embedded copyrighted questionnaire translations.
