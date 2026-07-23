# 08 — DECISION LOG

## 2026-07-23 — Stop GPT Codex development

### Decision

Прекратить использование GPT Codex для реализации «Архитектора жизни» и вернуть активную разработку в Claude Code.

### Причина

- временные Codex workspaces не сохраняли общий git context;
- commit SHA и artifacts исчезали между задачами;
- push handoff оказался ненадёжным;
- production и test implementations неоднократно расходились;
- процесс создавал чрезмерную ручную работу и веточную путаницу.

### Последствия

- PR #40, #63, #64 закрыты без merge;
- `MAIN` признан чистой production-базой;
- destructive rollback `MAIN` не выполнялся;
- создана clean Claude branch;
- опубликованный GPT/Codex материал сохранён в одной archive branch;
- дальнейшие задачи выполняются Claude Code по low-branch workflow.

## 2026-07-23 — Preserve Claude production baseline

### Decision

Сохранить `MAIN@14db0a911773e3dfa0d9de63ad72ce7fdf9a0d0d` как точку продолжения.

### Evidence

Сравнение показало, что `agent/astrology-harness-foundation` основана на `MAIN`, находится поверх неё и не была merged обратно. Поэтому Codex-код не требовал отката production.

## 2026-07-23 — One archive instead of many experimental branches

### Decision

Создать `archive/gpt-codex-experiment-2026-07` на последнем опубликованном commit `a85397d6aa3d021e3a2b4eef44f7c38f485909d6`.

### Rationale

- история не теряется;
- активные `agent/*`/`codex/*` refs можно удалить;
- Claude может при необходимости посмотреть старые требования, не используя их как production source.

## 2026-07-23 — Rebuild encrypted backup in Claude Code

### Decision

Не переносить исчезнувший/непроверенный Codex implementation. Сохранить требования как новый clean contract и реализовать после reality audit реального `MAIN`.

### Acceptance

Требуются focused tests, existing E2E, Chromium mobile, WebKit mobile, offline reload и independent diff review.

## Pending decisions

1. Классификация и закрытие старых open `studio/*` PR.
2. Нужен ли постоянный orders inbox PR #16 в новом Claude workflow.
3. Какие product documents из archive заслуживают переноса после repository audit.
4. Срок и границы backup implementation.
5. Следующий домен после backup: психика, здоровье или астрология.
