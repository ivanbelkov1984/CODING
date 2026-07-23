# 13 — SOURCE-OF-TRUTH STATUS REGISTRY (Drive ↔ GitHub)

> **Статус: NORMATIVE_CURRENT.** Пробел 15 из review. Устраняет конфликт источников правды. **Действующий нормативный минимум живёт в MAIN (GitHub). Google Drive — исследовательский архив и источник исходных спецификаций.**

## Статусы

- **NORMATIVE_CURRENT** — действующая норма, живёт в MAIN, обязательна к соблюдению.
- **IMPLEMENTATION_CONTRACT** — контракт на будущую реализацию (что и как строить).
- **REFERENCE_RESEARCH** — глубокий источник, но не действующая норма; сверять, не переносить автоматически.
- **RESEARCH_PREVIEW_ONLY** — идея/прототип, не в MVP.
- **SUPERSEDED** — устарело, заменено новым.
- **LICENSE_REVIEW_REQUIRED** — требует лицензионного решения владельца.
- **REGULATORY_REVIEW_REQUIRED** — требует регуляторного/медицинского review.

## Реестр (GitHub)

| Документ | Статус |
|---|---|
| `MAIN` runtime (`app.js`,`index.html`,`styles.css`,`sw.js`,`build.mjs`,`backend/`) | **NORMATIVE_CURRENT** (что приложение делает) |
| `CLAUDE.md` | **NORMATIVE_CURRENT** (процесс/архитектура) |
| `SECURITY_MODEL.md` | **NORMATIVE_CURRENT** (крипто/sync) |
| `architect/docs/claude-handoff/00–09` | **NORMATIVE_CURRENT** (vision/constraints/workflow/audit/backup spec) |
| `architect/docs/product/00–06` | **NORMATIVE_CURRENT** (продуктовый слой) |
| `architect/docs/product/07` Evidence Kernel | **NORMATIVE_CURRENT** (блокер) |
| `architect/docs/product/08` Registries | **NORMATIVE_CURRENT** |
| `architect/docs/product/09` Privacy/AI Safety | **NORMATIVE_CURRENT** |
| `architect/docs/product/10` Prediction | **RESEARCH_PREVIEW_ONLY** (ур.4–5) / IMPLEMENTATION_CONTRACT (ур.1–3) |
| `architect/docs/product/11` Astrology gates | **IMPLEMENTATION_CONTRACT + LICENSE_REVIEW_REQUIRED** |
| `architect/docs/product/12` Health contours | **IMPLEMENTATION_CONTRACT + REGULATORY_REVIEW_REQUIRED** |
| `architect/docs/product/13` (этот) | **NORMATIVE_CURRENT** |
| `architect/docs/product/14` Autonomy/gates | **NORMATIVE_CURRENT** |
| `architect/docs/product/PROGRAM_STATUS.md` | **NORMATIVE_CURRENT** (durable статус) |
| `PR #40` / ветка `agent/astrology-harness-foundation` / `life-architect-v2/*` | **SUPERSEDED → REFERENCE_RESEARCH** (reference-only, не переносить автоматически) |
| `PR #67` | активный correction (documentation-only), станет NORMATIVE_CURRENT после review Ивана |

## Реестр (Google Drive) — классификация по описанию review

> Прямое чтение файлов Drive — вне независимой проверки этого агента в данной сессии; статусы присвоены по содержанию, изложенному в independent review. Перед любой реализацией конкретный Drive-документ сверяется с MAIN и первоисточниками.

| Drive-материал (по описанию) | Статус |
|---|---|
| Старый Drive index (PR #40 и `agent/*` как главные, статусы Phase 0) | **SUPERSEDED** (PR #40 закрыт; Phase 0 сделан как `09-REPOSITORY-AUDIT`) |
| Астрология — мастер-спецификация архитектуры и ректификации v1.0 | **REFERENCE_RESEARCH** (+ректификация RESEARCH_PREVIEW_ONLY) |
| Physical Health Evidence and Medication Intelligence | **REFERENCE_RESEARCH** (+REGULATORY_REVIEW_REQUIRED для clinical) |
| «Курцвейл предсказание» | **RESEARCH_PREVIEW_ONLY** (нет модели/датасета/контракта — см. `product/10`) |
| 03 — Claude Code Execution, Migration and Backlog v2.0 | **REFERENCE_RESEARCH** (принципы автономии учтены в `product/14`) |
| LLM Synthesis Voice & Safety (Drive/`life-architect-v2/16`) | **REFERENCE_RESEARCH** (норма голоса — в `product/03`§8, framework — `product/09`) |
| Старые health-доки с React/TypeScript/Supabase/Postgres | **SUPERSEDED** (нарушают stack-ограничение `CLAUDE.md`/`03`§B) |

## Правило

1. Норма → всегда в MAIN. Drive не является действующей нормой.
2. Любой Drive-документ перед реализацией получает статус из списка и сверяется с реальным MAIN + первоисточниками (лицензии/регуляторика/стандарты).
3. Конфликт «Drive говорит X, MAIN говорит Y» → выигрывает MAIN; расхождение фиксируется здесь и в decision log.
