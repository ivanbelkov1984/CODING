# Claude Code — проект «Архитектор жизни»

## Главный источник правды

Репозиторий: `ivanbelkov1984/CODING`. Каноническая ветка: `MAIN`. Приложение: `architect/`.

Глобальная архитектура продукта находится в:

`architect/docs/life-architect-v2/00-INDEX.md`

Папка `architect/docs/astrology/` остаётся нормативным подсистемным контрактом для астрологии, ректификации и эфемерид, но больше не является глобальным источником правды для всего приложения.

## Перед любой работой

1. `git fetch origin` и изучи `git log --oneline -20` и незнакомые diff.
2. Прочитай `STUDIO_HANDOFF.md` и `architect/AGENT_BRIEF.md`.
3. Прочитай `architect/docs/life-architect-v2/00-INDEX.md`.
4. Выполни только Phase 0 repository audit из `10-CLAUDE-CODE-EXECUTION-PLAN.md` до production-кода.
5. Создай task contract: scope, owner, files, dependencies, acceptance, privacy, tests, rollback.
6. Для сложной сессии можно выбрать максимальный доступный effort в текущей версии Claude Code; фактическое состояние проверь через `/status`. Не заявляй режим активным без проверки.

## Неподвижные ограничения

- Дополняй существующий vanilla-JS/offline-first PWA; не переписывай его на новый framework без отдельного ADR владельца.
- Реальные дневники, психологические материалы, медицинские документы, даты рождения и жизненные события никогда не попадают в git, issue, PR, logs или fixtures.
- Личные данные остаются local-first и синхронизируются только E2EE; сервер не получает plaintext по умолчанию.
- Самоотчёт, исходный документ, вычисленный признак, гипотеза LLM, астрологическая аннотация, прогноз и причинная оценка — разные классы данных.
- LLM не создаёт медицинский диагноз, не меняет дозировку, не проверяет лекарственные взаимодействия без лицензированного детерминированного источника и отдельного regulatory gate.
- Астрология не влияет на медицинский/психологический риск, readiness score, JITAI decision rule, эмпирический прогноз или causal estimate.
- Вероятность будущего outcome разрешена только после формального outcome contract, независимой оценки и calibration; до этого `ScenarioOutlook` описателен.
- Любые fallback, missingness, uncertainty, licensing block и degraded mode показываются явно.
- Не проси Ивана вручную писать код. Эскалируй только продуктовые, юридические, лицензионные, клинические или необратимые решения.

## Harness

Следуй `.claude/harness-rules.md`. Используй минимальный активный состав агентов, обычно 3–5. Один owner на изменяемый файл. Research, implementation и adversarial verification должны иметь отдельные контексты и доказательные handoff.

## Проверка

```bash
cd architect
node --check app.js
node build.mjs --combined dist/app.html
npm test
```

Для UI: мобильный viewport 390×844, light/dark, accessibility, design tokens и регрессионный screenshot review.

## Release policy

Никакого merge/deploy при красном gate. После завершённого куска: тесты, понятный commit, handoff, список реализованного/экспериментального/заблокированного. Health-релиз требует отдельного intended-purpose review; регулируемые функции остаются выключенными feature flags.
