# «Архитектор жизни» v2 — единый индекс реализации

## Статус

`ARCHITECTURE_COMPLETE_FOR_REPOSITORY_AUDIT`

`PRODUCTION_IMPLEMENTATION_NOT_STARTED`

`HEALTH_DIAGNOSTIC_AND_TREATMENT_FUNCTIONS_QUARANTINED`

## Назначение

Это глобальный источник правды для продукта. Он объединяет существующий дневник, смысловой движок, метод «Зачем?», здоровье/JITAI, цели и действия, Personal Dynamics and Readiness, документы и лекарства, астрологию, память, LLM, privacy, UX и Claude Code execution.

## Порядок чтения

### Любая задача

1. корневой `CLAUDE.md`;
2. `STUDIO_HANDOFF.md`;
3. `architect/AGENT_BRIEF.md`;
4. этот индекс;
5. только документы, относящиеся к task contract.

### Продукт и UX

- `01-PRODUCT-VISION.md`
- `02-UNIFIED-ARCHITECTURE.md`
- `09-UX-INFORMATION-ARCHITECTURE.md`

### Данные и научная граница

- `03-EPISTEMIC-DATA-CONTRACTS.md`
- `04-MOMENTARY-STATE-AND-PSYCHOLOGY.md`
- `05-PERSONAL-DYNAMICS-AND-READINESS.md`
- `06-PHYSICAL-HEALTH-EVIDENCE.md`
- `07-ASTROLOGY-BOUNDARY.md`
- `08-PRIVACY-REGULATORY-SAFETY.md`

### Реализация

- `10-CLAUDE-CODE-EXECUTION-PLAN.md`
- `11-IMPLEMENTATION-BACKLOG.md`
- `12-DECISION-LEDGER.md`
- `13-EVIDENCE-REGISTER.md`
- `14-MIGRATION-FROM-V1.md`
- `15-RESEARCH-GAP-REGISTER.md`

## Relation to astrology v1

`architect/docs/astrology/` остаётся подсистемным контрактом. При конфликте:

- астрономические расчёты, школа, ректификация: astrology docs;
- глобальная эпистемика, сценарии, health, state, UX, governance: life-architect-v2;
- более строгая safety-граница имеет приоритет.

## Definition of done для документации

- один источник правды;
- принятые, условные, отклонённые решения различимы;
- открытые gaps не маскируются;
- каждая сущность имеет provenance/privacy/correction lifecycle;
- каждый вертикальный slice имеет tests и rollback;
- regulated quarantine выражен в кодовых feature flags до реализации.
