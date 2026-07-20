# «Архитектор жизни» v2 — единый индекс реализации

## Статус

`ARCHITECTURE_COMPLETE_FOR_REPOSITORY_AUDIT`

`PRODUCTION_IMPLEMENTATION_NOT_STARTED`

`HEALTH_DIAGNOSTIC_AND_TREATMENT_FUNCTIONS_QUARANTINED`

`DUAL_REALM_DESIGN_BASELINE_MERGED_IN_MAIN`

`LLM_VOICE_AND_SAFETY_CONTRACT_READY`

`MOBILE_ONLY_CLOUD_WORKFLOW_READY`

## Назначение

Это глобальный источник правды для продукта. Он объединяет существующий дневник, смысловой движок, метод «Зачем?», здоровье/JITAI, цели и действия, Personal Dynamics and Readiness, документы и лекарства, астрологию, память, LLM, privacy, UX, мобильный cloud-only workflow и Claude Code execution.

## Владелец и рабочая среда

Владелец работает только с iPad Pro 11 и iPhone 14 Pro Max. Локальный Mac/Windows/Linux не предполагается.

Основной execution path:

`Claude Code cloud → GitHub branch/PR → CI → mobile preview → owner review on iPad/iPhone`.

GitHub Codespaces является вторичным ручным cloud environment. Личный VPS — только последний резерв.

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
- актуальный `architect/design_guide.md`
- актуальный `design/tokens.json`

Dual Realm (`Deep Space` / `Ethereal Light`) уже реализован в `MAIN` через существующий CSS token layer. Его нельзя повторно реализовывать через Tailwind/shadcn или новый UI framework.

### Данные, научная и safety-граница

- `03-EPISTEMIC-DATA-CONTRACTS.md`
- `04-MOMENTARY-STATE-AND-PSYCHOLOGY.md`
- `05-PERSONAL-DYNAMICS-AND-READINESS.md`
- `06-PHYSICAL-HEALTH-EVIDENCE.md`
- `07-ASTROLOGY-BOUNDARY.md`
- `08-PRIVACY-REGULATORY-SAFETY.md`
- `16-LLM-SYNTHESIS-VOICE-AND-SAFETY.md`

### Реализация и рабочая среда

- `10-CLAUDE-CODE-EXECUTION-PLAN.md`
- `11-IMPLEMENTATION-BACKLOG.md`
- `12-DECISION-LEDGER.md`
- `13-EVIDENCE-REGISTER.md`
- `14-MIGRATION-FROM-V1.md`
- `15-RESEARCH-GAP-REGISTER.md`
- `17-CLAUDE-CODE-INSTALLATION-AND-PHASE0-START.md`
- `18-MOBILE-ONLY-DEVELOPMENT-AND-NATIVE-MIGRATION.md`

`17` is the exact mobile launch guide. `18` is the durable mobile-only development, preview, CI, PWA-first and future Capacitor/native migration contract.

### Schemas

JSON Schemas находятся в `schemas/`. Они являются концептуальными межслойными контрактами. Реальное mapping на текущую базу и файлы выбирается только после Phase 0 repository audit.

`schemas/llm-synthesis.schema.json` задаёт input/output boundary для доказательного LLM-синтеза.

## Relation to astrology v1

`architect/docs/astrology/` остаётся подсистемным контрактом. При конфликте:

- астрономические расчёты, школа, ректификация: astrology docs;
- глобальная эпистемика, сценарии, health, state, LLM synthesis, UX, governance: life-architect-v2;
- более строгая safety-граница имеет приоритет.

## Definition of done для документации

- один источник правды;
- принятые, условные, отклонённые решения различимы;
- открытые gaps не маскируются;
- каждая сущность имеет provenance/privacy/correction lifecycle;
- LLM-вывод имеет input references, adaptive tone, validators and evals;
- Claude Code Phase 0 can be started without a local computer;
- each code PR can produce CI evidence and a mobile-accessible preview;
- PWA remains the implementation core before native packaging;
- Capacitor/native work begins only after readiness audit;
- каждый вертикальный slice имеет tests и rollback;
- regulated quarantine выражен в кодовых feature flags до реализации.
