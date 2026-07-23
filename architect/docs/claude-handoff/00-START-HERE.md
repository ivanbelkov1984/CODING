# 00 — START HERE

## Текущий статус

Проект возвращён к безопасной рабочей базе Claude Code.

- Default/production branch: `MAIN`
- Baseline commit: `14db0a911773e3dfa0d9de63ad72ce7fdf9a0d0d`
- Clean Claude handoff branch: `claude/life-architect-clean-restart`
- GPT/Codex PR #40, #63, #64: закрыты без merge.
- Production application: не откатывалось и не изменялось при очистке, потому что Codex-ветки никогда не были слиты в `MAIN`.

## Почему не нужен destructive rollback

`agent/astrology-harness-foundation` является отдельной веткой, основанной на текущем `MAIN` и находящейся поверх него. Она не была merged в `MAIN`. Поэтому «версия до Codex» уже сохранена как `MAIN`; переписывать историю или откатывать production-коммиты нельзя и не требуется.

## Что должно сделать Claude Code

### Этап A — read-only reality audit

1. Проверить `MAIN` и текущую ветку.
2. Прочитать реальный runtime-код.
3. Проверить build/test/deploy.
4. Проверить открытые старые Claude PR.
5. Создать `09-REPOSITORY-AUDIT.md` без изменения runtime.

### Этап B — нормализация Git

После аудита:

- сохранить `MAIN`;
- сохранить `claude/life-architect-clean-restart`;
- не удалять `studio/*` до индивидуальной классификации;
- удалить старые `agent/*` и `codex/*` ветки по `07-CLEANUP-MANIFEST.md`;
- не использовать force-push;
- убедиться, что закрытые Codex PR не восстановлены.

### Этап C — продолжение разработки

Первая функция — encrypted portable backup, реализованная заново по `05-ENCRYPTED-BACKUP-SPEC.md` поверх реального Claude baseline.

## Формат ответа Claude после первого запуска

Claude должен вернуть:

```text
BASELINE_VERIFIED=<SHA>
CURRENT_BRANCH=<branch>
RUNTIME_UNCHANGED=true
AUDIT_DOCUMENT_CREATED=true
OPEN_PR_CLASSIFICATION_COMPLETE=true
CODE_IMPLEMENTATION_NOT_STARTED=true
```

И ссылку на один draft PR либо один commit в этой handoff-ветке. Никаких дополнительных веток без необходимости.

## Что запрещено

- переносить неизвестные Codex patch/bundle;
- пытаться восстановить исчезнувшие временные SHA;
- создавать новый репозиторий;
- переписывать `MAIN`;
- сливать все старые документы/эксперименты в production;
- объявлять тесты пройденными, если браузер не запускался.
