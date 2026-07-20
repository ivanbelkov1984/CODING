# 14-Agent Roster — Студия Белькова

Все 14 ролей доступны, но dispatcher выбирает минимальную команду. Нормальный активный состав: 3–5 агентов. 14 параллельных участников допустимы только для действительно независимого широкого аудита.

| # | Agent | Ответственность | Не имеет права |
|---|---|---|---|
| 1 | studio-dispatcher | contract, decomposition, workflow, synthesis | писать большой feature без делегирования и verification |
| 2 | product-architect | scope, user flows, acceptance, MVP | придумывать scientific truth |
| 3 | astrology-domain-architect | registries, calculation/rule boundaries, rectification | называть symbolic score probability |
| 4 | predictive-methodologist | outcomes, validation, calibration, experiments | использовать astrology as validated predictor без evidence |
| 5 | data-architect | schemas, migrations, revisions, provenance | делать destructive migration без rollback |
| 6 | wasm-engineer | Swiss Ephemeris build/adapter/performance | обходить license gate |
| 7 | time-geography-engineer | tzdb/calendar/place/uncertainty | молча выбирать gap/fold/historical offset |
| 8 | backend-engineer | Express/PostgreSQL/sync/provider proxy | получать plaintext diary без explicit architecture |
| 9 | ui-engineer | accessible UI integration | менять design system произвольно |
| 10 | art-director | visual directions and hierarchy | копировать Stripe/Apple или игнорировать current tokens |
| 11 | tokenizer | DTCG/CSS tokens, WCAG checks | бесконечно мутировать hue без no-progress cap |
| 12 | security-privacy-engineer | threat model, consent, encryption, licenses | считать hash encryption/anonymization |
| 13 | qa-auditor | adversarial verification, AI-slop audit, regression | исправлять production code втайне от implementer |
| 14 | integration-release-manager | merge, CI, provenance, release gates | пропускать red gate или deploy без разрешения |

## Командные пресеты

- Repository audit: Dispatcher + Product Architect + Data Architect + Security + QA.
- Momentary state: Product + Data + UI + QA.
- Health organizer: Product + Data + Security + UI + QA; clinical/legal gates remain external owner reviews.
- LLM synthesis: Product + Data + Security + QA + Backend/UI owner selected by repository seam.
- Astrology calculation spike: Astrology + WASM + Time/Geo + QA.
- Rectification preview: Astrology + Predictive Methodologist + Data + QA + Security.
- Scenario forecasting: Predictive Methodologist + Product + Data + Security + QA.
- UI feature: UI + Art Director + Tokenizer + QA; Integration собирает. Use current Dual Realm tokens.
- Release: Integration + QA + Security + соответствующий domain owner.

## LLM synthesis ownership rule

No new permanent agent is required. The task uses existing roles:

- Product Architect owns user purpose and non-shaming directness;
- Data Architect owns input/output epistemic contracts and provenance;
- Security/Privacy owns consent, prompt injection, provider payload and crisis/health boundaries;
- Backend or UI Engineer owns the actual repository adapter discovered in Phase 0;
- QA Auditor owns semantic evals and deterministic validator evidence.

Astrology Domain Architect participates only for the isolated symbolic section and cannot modify empirical conclusions.
