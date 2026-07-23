# 00 — PRODUCT INDEX (единый источник правды)

> **Тип документа:** consolidation, documentation-only. Runtime-код не менялся.
> **Base MAIN:** `2325a8b0130afe72161e9bca50a87185ae76af42` (squash `Encrypted portable backup for Life Architect (#66)`).
> **Задача:** свести реальный MAIN, `CLAUDE.md`, `architect/docs/claude-handoff/`, закрытый PR #40 (`life-architect-v2/`), реально реализованные функции и продуктовую концепцию Ивана в один актуальный owner-readable план.

## 1. Назначение этого набора

`architect/docs/product/` — **единственный действующий продуктовый источник правды**. Он не заменяет и не дублирует `claude-handoff/` (процессные правила) и `SECURITY_MODEL.md` (крипто-контракт), а сводит воедино *что уже есть в коде*, *что описано в концепции* и *что делать дальше*, с указанием происхождения каждого решения.

| Файл | Отвечает на вопрос |
|---|---|
| `00-PRODUCT-INDEX.md` | Где источник правды и как соотносятся старая v2-архитектура и реальность |
| `01-CURRENT-CAPABILITY-MAP.md` | Что реально есть в runtime по каждому домену, что частично, что только на бумаге |
| `02-EPISTEMIC-AND-DATA-MODEL.md` | Как различать факт / гипотезу / вывод и как это ложится на существующее хранилище |
| `03-DOMAIN-BOUNDARIES.md` | Жёсткие границы: психология ≠ диагноз, астрология ≠ предсказатель, health organizer ≠ лечение |
| `04-IMPLEMENTATION-ROADMAP.md` | Реалистичная последовательность небольших вертикальных срезов |
| `05-NEXT-VERTICAL-SLICE-OPTIONS.md` | Сравнение 3 кандидатов на следующий срез + рекомендация |
| `06-MIGRATION-AND-COMPATIBILITY.md` | Как вводить v2-сущности без разрушительной миграции localStorage |
| `07-EVIDENCE-AND-MODEL-KERNEL.md` | **Cross-cutting foundation (главный блокер): обёртка записи, corrections, invalidation/recompute** |
| `08-REGISTRIES.md` | Реестры: consent, purpose, feature-flags, regulatory quarantine, models/rulesets, terminology/licence, migration |
| `09-PRIVACY-AND-AI-SAFETY.md` | Local-at-rest threat model, encrypted blob vault, **универсальный AI validator framework** |
| `10-PREDICTION-CONTRACT.md` | 5 уровней прогноза; `prediction=null` до валидированной модели |
| `11-ASTROLOGY-FEASIBILITY-GATES.md` | Licence/WASM/tzdb/golden gates; ректификация = research preview |
| `12-HEALTH-CONTOUR-SEPARATION.md` | Organizer / Behavioral / Clinical Quarantine; MDCG intended-purpose; FHIR profiling |
| `13-SOURCE-OF-TRUTH-STATUS-REGISTRY.md` | Статусы документов Drive↔GitHub (7 статусов); норма живёт в MAIN |
| `14-AUTONOMY-AND-REVIEW-GATES.md` | Границы автономии Claude, independent review gates, auto-merge limits |
| `PROGRAM_STATUS.md` | **Durable** снимок состояния программы + карта 18 пробелов review |
| `PROPOSAL.md` | **Owner-readable предложение на утро:** что реализуем первым + что ответить |
| `contracts/CONTRACT-B-EVIDENCE-KERNEL.md` | Готовый task-контракт Этапа B (ядро) — READY_FOR_OWNER_GO |
| `contracts/CONTRACT-C-PRIVACY-AI-SAFETY.md` | Готовый task-контракт Этапа C (privacy + AI-safety) |

> **Correction pass (round: independent architectural review).** Документы 07–14 и `PROGRAM_STATUS.md` добавлены по независимому review, закрывая 18 пробелов первой версии PR #67. Ключевой вывод: **сначала общий Evidence and Model Kernel и privacy/AI-safety, и только потом доменные фичи** — не наоборот. Карта пробелов — в `PROGRAM_STATUS.md`.

## 2. Иерархия источников (что чему подчиняется)

1. **Реальный код на `MAIN`** — высший авторитет о том, что приложение *делает сегодня* (`architect/app.js`, `index.html`, `styles.css`, `sw.js`, `build.mjs`, `backend/`).
2. **`CLAUDE.md`** (корень репозитория) — процессные и архитектурные правила, переопределяют дефолтное поведение агентов.
3. **`architect/docs/claude-handoff/00–09`** — актуальный Claude-ведомый план (vision, constraints, workflow, backup spec, backlog, decision log, **repository audit 09**).
4. **`architect/docs/product/`** (этот набор) — консолидированный продуктовый слой поверх 1–3.
5. **`architect/docs/life-architect-v2/`** из **закрытого PR #40** (ветка `agent/astrology-harness-foundation`) — **reference-only**. Богатый источник детальных спецификаций (эпистемика, JSON-схемы, PDRE, health, LLM safety), но **не действующий production source of truth** и не переносится автоматически.

## 3. Ключевой факт для устранения путаницы

В репозитории существовали **два трека**. Один сменил другой:

- **Старый трек (Codex/ChatGPT-ведомый):** «Life Architect v2» на ветке `agent/astrology-harness-foundation`, главный draft **PR #40**. Его финальный шаг предполагал запуск Codex для Phase 0 audit и создание 7 файлов в `life-architect-v2/`.
- **Актуальный трек (Claude-ведомый, чистый MAIN):** проект **сброшен к чистой базе `MAIN`** после неудачного Codex-эксперимента (`CLAUDE.md` §1–2). PR #40/#63/#64 закрыты без merge (подтверждено: PR #40 `state=closed, merged=false, closed_at 2026-07-23`).

**Следствия (проверено по факту, не по названиям):**

- Задача «запустить Codex → Phase 0 audit → 7 файлов в `life-architect-v2/`» из старого handoff — **устарела**. Её эквивалент уже выполнен как `architect/docs/claude-handoff/09-REPOSITORY-AUDIT.md` (read-only аудит реального MAIN).
- Каталога `life-architect-v2/` на `MAIN` **нет**; он есть только на закрытой ветке — как reference.
- Encrypted portable backup (**PR #66, merged в MAIN**) — это **Priority 1** актуального бэклога, т.е. *первая функция после аудита*, а **не** завершение всего Life Architect v2.

## 4. Reality reconciliation — статусы разделов старой v2-архитектуры

Классификация: **ACCEPT** (сохраняется как есть) · **ACCEPT+CORRECTION** (сохраняется после уточнения) · **ALREADY IMPLEMENTED** · **PARTIALLY IMPLEMENTED** · **NOT IMPLEMENTED** · **SUPERSEDED** · **REJECT** · **DEFER** · **RESEARCH GAP**.

| Раздел v2 / концепции | Статус | Актуальный документ | Старый v2-документ (reference) | Реальный runtime | Комментарий |
|---|---|---|---|---|---|
| Продуктовый цикл «Наблюдение→…→Обучение» | **ACCEPT** | `claude-handoff/02` §1 | `life-architect-v2/01-PRODUCT-VISION` | частично (дневник/инсайты/чек-ин) | Ядро видения, неизменно |
| Информационная архитектура (8 хабов) | **ACCEPT+CORRECTION** | `product/01` | `life-architect-v2/09-UX-IA` | текущая nav ≠ 8 хабов | IA — цель; менять постепенно, не «большим PR» |
| Эпистемические границы (16 классов) | **ACCEPT** | `product/02` | `life-architect-v2/03-EPISTEMIC-DATA-CONTRACTS` | не реализовано | Норматив; вводить аддитивно (см. `product/06`) |
| Correction / invalidation / recompute | **ACCEPT** | `product/02` §4 | `life-architect-v2/03` | не реализовано; есть только `_del`/`_u` merge (`app.js:78,50-51`) | Ввести append-only correction поверх существующих записей |
| PDRE (readiness, многомерно) | **ACCEPT / DEFER** | `product/03`,`04` | `life-architect-v2/05-PDRE` | не реализовано | Норматив принят; реализация — поздний срез |
| Personal Singularity как единый score/экспонента | **REJECT** | `product/03` | (отклонено в v2) | — | Только метафора; запрещён единый inertia score |
| Momentary State (valence+activation) | **ACCEPT** | `product/02`,`05` | `life-architect-v2/04`, `schemas/momentary-state` | частично: чек-ин `saveCI` (`app.js:1946`), `vit` (`app.js:76`) | Ближайший кандидат-срез (см. `product/05`) |
| Метод «Зачем?» | **ACCEPT** | `product/01`,`05` | `life-architect-v2/04` | не оформлен как поток | Личная методика Ивана; аддитивно к инсайтам |
| COM-B как таксономия условий | **ACCEPT+CORRECTION** | `product/03` | `life-architect-v2/04` | не реализовано | Не тест личности, не единый score |
| Physical Health Organizer + Descriptive Record | **ACCEPT / DEFER** | `product/01`,`03` | `life-architect-v2/06`, health-схемы | не реализовано (есть `vit`, `cravings`, `env` — не медицина) | Крупный домен; отдельный контракт, regulatory quarantine |
| FHIR-compatible внутренняя модель | **ACCEPT / DEFER** | `product/02` | `life-architect-v2/06` | не реализовано | Совместимость, не EHR-клон |
| Regulatory quarantine (diagnosis/dosage/interactions) | **ACCEPT** | `product/03` | `life-architect-v2/08` | н/д (функций нет) | Запрет до отдельного owner-approved контракта |
| Астрология (birth→astronomy→…→symbolic) | **ACCEPT / DEFER** | `product/03` | `life-architect-v2/07`, `schemas/scenario-outlook` | отсутствует в коде (grep: пусто) | Отдельный домен, символический, изолирован |
| EvidenceGroundedDirectMentor + tone modes | **ACCEPT** | `product/03` | `life-architect-v2/16-LLM-VOICE-SAFETY` | частично: единая точка `callClaude` (`app.js:4350`), реестр `AI_PROVIDERS` (`app.js:4264`) | Голос принят; validators — вводить на choke-point |
| LLM validators (grounding/astrology-isolation/…) | **ACCEPT / NOT IMPLEMENTED** | `product/03` | `life-architect-v2/16` | нет input/output валидаторов | Один seam в `callClaude`, аддитивно |
| Scenario planning (условия/альтернативы) | **ACCEPT / DEFER** | `product/03` | `life-architect-v2/03`,`07` | не реализовано | После стабильных data-контрактов |
| Mobile-only workflow | **ALREADY ACCEPTED** | `claude-handoff/04`, `product/04` | `life-architect-v2/18` | действует (GitHub→CI→PR) | Подтверждён на PR #65/#66 |
| Native migration (Capacitor) | **DEFER** | `product/04` (Deferred) | `life-architect-v2/18` | PWA-only | Сейчас не добавляется; работаем в web |
| E2EE sync / recovery | **ALREADY IMPLEMENTED** | `SECURITY_MODEL.md`, `claude-handoff/09` §5 | — | реально: `encryptPayload` (`app.js:3800`), PBKDF2 600k + AES-GCM-256 | Не переписывать |
| Encrypted portable backup | **ALREADY IMPLEMENTED** | `claude-handoff/05` | `life-architect-v2/PHASE2_…BACKUP_CONTRACT` | реализовано, PR #66 merged | Priority 1 закрыт |
| Profiles / localStorage-primary / IndexedDB media | **ALREADY IMPLEMENTED** | `claude-handoff/09` §4 | — | реально (`app.js:104,1161` и др.) | База хранилища |

Полный per-домен разбор с task-контрактами — в `01-CURRENT-CAPABILITY-MAP.md`.

## 5. Где мы в дорожной карте

| Приоритет (`claude-handoff/06`) | Статус |
|---|---|
| P0 — read-only аудит MAIN | ✅ `09-REPOSITORY-AUDIT.md` |
| P1 — encrypted portable backup | ✅ PR #66 merged |
| **P2 — консолидация продуктовой документации** | ⏳ **этот PR** |
| P3 — Психо-модуль (Momentary State, «Зачем?») | ⬜ не начато |
| P4 — Модуль здоровья | ⬜ не начато |
| P5 — Астрология | ⬜ не начато |
| P6 — Сценарии/синтез | ⬜ не начато |

## 6. Неподвижные правила (сводка, детали в `03`)

- Один активный implementation-task за раз; `MAIN` меняется только по явному решению Ивана.
- Documentation-only задача не трогает runtime, зависимости, workflow, schema, данные.
- Нет real personal/health/diary data в git/CI/fixtures.
- Крупный домен не начинается без task-контракта, тестов и rollback; один вертикальный срез на PR.
- Каждый PR проверяем с iPad/iPhone.

## 7. Провенанс этого документа

Собран из: реального `architect/app.js@2325a8b` (см. цитаты `file:line`), `CLAUDE.md`, `claude-handoff/01,02,03,06,09`, закрытого PR #40 (`life-architect-v2/00-18`, `schemas/`, reference-only), и полного продуктового handoff Ивана (эпистемика, PDRE, health, astrology, LLM voice/safety).
