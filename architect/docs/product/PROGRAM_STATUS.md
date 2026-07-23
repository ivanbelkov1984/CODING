# PROGRAM STATUS — Архитектор жизни (durable)

> **Статус: NORMATIVE_CURRENT.** Пробел 16 из review. Единый durable снимок состояния программы. Обновляется при каждом значимом изменении. Не содержит реальных личных данных.

## Идентичность

- Repository: `ivanbelkov1984/CODING`
- Production branch: `MAIN`
- MAIN HEAD (последний runtime): `2325a8b0130afe72161e9bca50a87185ae76af42` — `Encrypted portable backup for Life Architect (#66)`
- Активная documentation-ветка: `claude/task-product-architecture-consolidation` (PR #67, Draft, documentation-only)

## Реально работает в runtime

Дневник/инсайты/сны/паттерны · сферы и отметки · дневной чек-ин · тяга/триггеры/саморегуляция (частично) · психологические AI-разборы (без общего доказательного валидатора) · AI Anthropic/OpenAI/Gemini + ledger/бюджет + маршрутизация · профили + E2EE-sync (при заданной парольной фразе) · offline PWA · зашифрованный backup/restore (в MAIN).

## Не реализовано (в документах, не в коде)

Медицинские документы/анализы/лекарства · астрологические расчёты · PDRE/readiness · сценарное планирование · валидированное предсказание · единый Evidence and Model Kernel · универсальный AI validator framework · local-at-rest encryption для sensitive данных.

## Критические блокеры (по приоритету)

1. **Evidence and Model Kernel отсутствует** (`product/07`) — главный блокер всех доменов.
2. **Local-at-rest данные в открытом виде** (`product/09`) — блокер для health documents.
3. **AI-слой — транспорт, не доказательный синтезатор**; AI-сигнал подмешивается в risk без лейбла (`product/09` §3).
4. **Prediction не отделён от эвристики** (`product/10`).
5. **Astrology license/WASM/tzdb/golden gates не пройдены** (`product/11`).
6. **Health-контуры не разделены; regulatory quarantine не оформлен реестром** (`product/12`,`08`).

## Гейты (открыты/закрыты)

- LICENSE_REVIEW (Swiss Ephemeris) — **OPEN** (owner).
- REGULATORY_REVIEW (medical intended purpose) — **OPEN** (owner).
- INDEPENDENT_REVIEW для high-risk — **REQUIRED** (не self-check).
- AUTO_MERGE — только low-risk, по явному «go» владельца.

## Дорожная карта (укрупнённо, детали `product/04`)

A. Исправить PR #67 (этот correction pass) → B. Evidence & Model Kernel → C. Privacy + AI Safety framework → D. Низкорисковые фичи (Momentary State, «Зачем?») → E. Health Organizer → F. Astrology technical foundation → G. PDRE/сценарии → H. Prediction research.

## Что сделано / что нет (по 18 пробелам review)

| # | Пробел | Статус |
|---|---|---|
| 1 | consent receipts | оформлено (`08`) |
| 2 | purpose limitation | оформлено (`08`) |
| 3 | feature-flag registry | оформлено (`08`) |
| 4 | regulatory quarantine registry | оформлено (`08`,`12`) |
| 5 | model/calculation/ruleset registry | оформлено (`08`) |
| 6 | terminology/licence registry | оформлено (`08`,`11`) |
| 7 | formal migration registry | оформлено (`08`,`06`) |
| 8 | local-at-rest encryption threat model | оформлено (`09`) |
| 9 | encrypted health blob vault | оформлено (`09`,`12`) |
| 10 | universal AI validator framework | оформлено (`09`) |
| 11 | health organizer vs behavioral JITAI | оформлено (`12`) |
| 12 | prediction research contract | оформлено (`10`) |
| 13 | Swiss Ephemeris licence gate | оформлено (`11`) |
| 14 | WASM/tzdb/golden astrology gates | оформлено (`11`) |
| 15 | Drive↔GitHub status registry | оформлено (`13`) |
| 16 | durable PROGRAM_STATUS.md | этот файл |
| 17 | independent review gates | оформлено (`14`) |
| 18 | auto-merge boundaries | оформлено (`14`) |

> «Оформлено» = зафиксировано как норма/контракт в документах (documentation-only). Runtime-реализация — отдельные будущие срезы по явному решению владельца.

## Готовое предложение (READY_FOR_OWNER_GO)

- `PROPOSAL.md` — owner-readable предложение на утро (что делаем первым, зачем, как проверю, что ответить).
- `contracts/CONTRACT-B-EVIDENCE-KERNEL.md` — полный готовый task-контракт Этапа B (`riskClass=medium`).
- `contracts/CONTRACT-C-PRIVACY-AI-SAFETY.md` — готовый контракт Этапа C (C1 AI-safety + C2 vault, `riskClass=high`).

## Следующее правильное действие

Не сливать PR #67 автоматически и **не начинать runtime без явного «go» Ивана**. Рекомендуемый первый runtime-срез — **Этап B (Evidence & Model Kernel)**, не Momentary State. Контракт готов; ожидается решение владельца (`PROPOSAL.md`). Реализацию Claude ведёт автономно до зелёного CI, **merge — только после independent review + owner-approval** (`product/14`).
