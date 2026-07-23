# 07 — CLEANUP MANIFEST

## Цель

Вернуть активную разработку к Claude Code и убрать веточную путаницу, не уничтожая историю.

## Уже выполнено

- PR #40 закрыт без merge.
- PR #63 закрыт без merge.
- PR #64 закрыт без merge.
- Создана чистая Claude branch от `MAIN`:
  - `claude/life-architect-clean-restart`
- Создана одна read-only archive branch:
  - `archive/gpt-codex-experiment-2026-07`
  - источник: commit `a85397d6aa3d021e3a2b4eef44f7c38f485909d6`

Архив сохраняет опубликованную GPT/Codex историю и позволяет удалять рабочие экспериментальные refs без потери материала.

## Обязательно сохранить

- `MAIN`
- `claude/life-architect-clean-restart`
- `archive/gpt-codex-experiment-2026-07`

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

## Claude Code cleanup procedure

Claude Code must execute this only after confirming GitHub auth and branch existence.

1. Fetch/prune:

```bash
git fetch origin --prune
git ls-remote --heads origin
```

2. Verify protected branches and archive:

```bash
git rev-parse origin/MAIN
git rev-parse origin/claude/life-architect-clean-restart
git rev-parse origin/archive/gpt-codex-experiment-2026-07
```

3. Confirm PR #40/#63/#64 are closed and unmerged.

4. For every candidate branch, check existence and delete only that exact ref:

```bash
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
- it contains commits not reachable from the archive branch and those commits may be owner-approved;
- its identity differs from this manifest;
- remote authentication is uncertain.

## Expected active structure after cleanup

```text
MAIN                                  production
claude/life-architect-clean-restart   Claude integration/handoff
archive/gpt-codex-experiment-2026-07  frozen historical archive
studio/*                              temporarily retained pending audit
orders/*                              temporarily retained pending audit
```

После аудита старых Claude PR лишние `studio/*` также удаляются по отдельному owner-approved списку.

## Почему удаление не выполнено этим ChatGPT-коннектором

Доступный GitHub connector умеет закрывать PR и создавать refs, но не предоставляет операцию удаления branch refs. Поэтому ветки должны быть удалены Claude Code через authenticated GitHub git/CLI. Пользователь не должен выполнять эти команды вручную.
