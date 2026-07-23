# 07 — CLEANUP MANIFEST

## Цель

Вернуть активную разработку к Claude Code и убрать веточную путаницу, не уничтожая историю.

## Уже выполнено

- PR #40 закрыт без merge.
- PR #63 закрыт без merge.
- PR #64 закрыт без merge.
- Создана чистая Claude branch от `MAIN`:
  - `claude/life-architect-clean-restart`
- Создан основной read-only архив опубликованной GPT/Codex истории:
  - `archive/gpt-codex-experiment-2026-07`
  - источник: commit `a85397d6aa3d021e3a2b4eef44f7c38f485909d6`
- Три ранее неохваченные Codex-линии сохранены отдельными архивными refs:
  - `archive/codex-phase0-original-2026-07`
    - источник: `1c5c44d3068c1c6c878d3cb3d88d85a350f53037`
  - `archive/codex-phase0-correction-2026-07`
    - источник: `7a218e4d397cb80c1fefd2a750d5552e20421294`
  - `archive/codex-phase2-backup-original-2026-07`
    - источник: `0bf6770b2d98e791ecd5f18c5af8eeecae5610bf`

Теперь опубликованная история всех перечисленных `agent/*` и `codex/*` кандидатов сохранена либо в основном архиве, либо в одном из трёх точечных архивов. Удаление рабочих экспериментальных refs больше не приведёт к потере их Git-истории.

## Обязательно сохранить

- `MAIN`
- `claude/life-architect-clean-restart`
- `archive/gpt-codex-experiment-2026-07`
- `archive/codex-phase0-original-2026-07`
- `archive/codex-phase0-correction-2026-07`
- `archive/codex-phase2-backup-original-2026-07`

До отдельного аудита сохранить все `studio/*` и `orders/*` ветки Claude Code.

## Кандидаты на удаление

Удалять только если ref существует и associated PR закрыт/merged. Не использовать force update; выполнить обычное remote branch deletion.

### Codex branches

- `codex/-phase-0-life-architect-v2`
- `codex/phase-0-life-architect-v2-correction-pass`
- `codex/-agent/phase-2-encrypted-portable-backup`
- `codex/fix-blocking-issues-in-pr-#63`

### GPT/agent integration and task branches

- `agent/astrology-harness-foundation`
- `agent/phase-0-5-repository-evidence`
- `agent/phase-0-5-data-roundtrip-evidence`
- `agent/phase-0-5-privacy-e2ee-evidence`
- `agent/phase-0-5-mobile-ci-preview-evidence`
- `agent/tombstone-namespacing-remediation`
- `agent/export-privacy-remediation`
- `agent/phase-0-5-mobile-ci-evidence`
- `agent/phase-0-5-exit-decision`
- `agent/phase-1-additive-schema-metadata`
- `agent/phase-1-ai-policy-validators`
- `agent/phase-1-privacy-feedback-boundaries`
- `agent/phase-1-exit-decision`
- `agent/phase-2-encrypted-portable-backup-contract`
- `agent/phase-2-encrypted-portable-backup`

## Архивное покрытие

Перед удалением сверять соответствие:

- `codex/-phase-0-life-architect-v2` → `archive/codex-phase0-original-2026-07`
- `codex/phase-0-life-architect-v2-correction-pass` → `archive/codex-phase0-correction-2026-07`
- `codex/-agent/phase-2-encrypted-portable-backup` → `archive/codex-phase2-backup-original-2026-07`
- `codex/fix-blocking-issues-in-pr-#63` и перечисленные `agent/*` → `archive/gpt-codex-experiment-2026-07`

## Claude Code cleanup procedure

Claude Code must execute this only after confirming GitHub auth and branch existence.

1. Fetch/prune:

```bash
git fetch origin --prune
git ls-remote --heads origin
```

2. Verify protected branches and all archives:

```bash
git rev-parse origin/MAIN
git rev-parse origin/claude/life-architect-clean-restart
git rev-parse origin/archive/gpt-codex-experiment-2026-07
git rev-parse origin/archive/codex-phase0-original-2026-07
git rev-parse origin/archive/codex-phase0-correction-2026-07
git rev-parse origin/archive/codex-phase2-backup-original-2026-07
```

3. Confirm PR #40/#63/#64 are closed and unmerged.

4. For every candidate branch, verify its tip is reachable from the corresponding archive ref, then delete only that exact ref:

```bash
git merge-base --is-ancestor origin/<candidate> origin/<corresponding-archive>
git push origin --delete <exact-branch-name>
```

5. Fetch/prune again and produce final list:

```bash
git fetch origin --prune
git ls-remote --heads origin
```

## Stop conditions

Do not delete any branch if:

- it is default/protected;
- an open PR uses it;
- its tip is not reachable from the corresponding archive ref;
- its identity differs from this manifest;
- remote authentication is uncertain.

## Expected active structure after cleanup

```text
MAIN                                  production
claude/life-architect-clean-restart   Claude integration/handoff
archive/*                             frozen historical records
studio/*                              temporarily retained pending audit
orders/*                              temporarily retained pending audit
```

После аудита старых Claude PR лишние `studio/*` также удаляются по отдельному owner-approved списку.

## Текущий технический блокер удаления

Claude Code подтвердил, что Git-прокси этого окружения возвращает HTTP 403 при удалении remote refs, а доступный MCP/GitHub connector не предоставляет отдельную операцию delete-branch.

Поэтому:

- история уже полностью заархивирована;
- кандидаты безопасно определены;
- фактическое удаление веток остаётся заблокированным инфраструктурой;
- пользователь не должен выполнять команды вручную с телефона;
- удаление выполняется позже из первого разрешённого GitHub/Claude окружения, строго по этому манифесту.