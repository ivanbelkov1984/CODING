# Claude Code — проект «Архитектор жизни»

## Главный источник правды

Репозиторий: `ivanbelkov1984/CODING`. Каноническая ветка: `MAIN`. Приложение: `architect/`.

Глобальная архитектура продукта находится в:

`architect/docs/life-architect-v2/00-INDEX.md`

Папка `architect/docs/astrology/` остаётся нормативным подсистемным контрактом для астрологии, ректификации и эфемерид, но больше не является глобальным источником правды для всего приложения.

## Рабочая среда владельца

Иван работает только с iPad Pro 11 и iPhone 14 Pro Max. Не требуй физический Mac/Windows/Linux, локальный clone, desktop IDE, ручной terminal workflow или написание кода владельцем.

Default execution path:

`Claude Code cloud → dedicated GitHub branch/PR → CI → mobile-accessible preview → owner review on iPad/iPhone`.

Read:

- `architect/docs/life-architect-v2/17-CLAUDE-CODE-INSTALLATION-AND-PHASE0-START.md`;
- `architect/docs/life-architect-v2/18-MOBILE-ONLY-DEVELOPMENT-AND-NATIVE-MIGRATION.md`.

GitHub Codespaces is a secondary browser environment. A personal VPS is last resort only.

## Перед любой работой

1. Изучи текущую base branch, `git log --oneline -20` и незнакомые diff.
2. Прочитай `STUDIO_HANDOFF.md` и `architect/AGENT_BRIEF.md`.
3. Прочитай `architect/docs/life-architect-v2/00-INDEX.md`.
4. До production-кода выполни только Phase 0 repository audit из `10-CLAUDE-CODE-EXECUTION-PLAN.md`.
5. Создай task contract: scope, owner, files, dependencies, acceptance, privacy, tests, rollback, mobile preview.
6. Используй dedicated branch. Merge and deploy remain explicit owner actions.

## Неподвижные ограничения

- Дополняй существующий vanilla-JS/offline-first PWA; не переписывай его на новый framework без отдельного ADR владельца.
- Не создавай второй проект в пустой папке и не вводи Next.js/React/TypeScript/Tailwind/shadcn/RxDB только потому, что это предложил внешний манифест.
- Dual Realm (`Deep Space` / `Ethereal Light`) уже реализован через текущие CSS variables и `design/tokens.json`; расширяй эту систему, не создавай параллельную тему.
- Реальные дневники, психологические материалы, медицинские документы, даты рождения и жизненные события никогда не попадают в git, issue, PR, logs, cloud prompts or fixtures.
- Личные данные остаются local-first и синхронизируются только E2EE; сервер не получает plaintext по умолчанию.
- Самоотчёт, исходный документ, вычисленный признак, гипотеза LLM, астрологическая аннотация, прогноз и причинная оценка — разные классы данных.
- LLM не создаёт медицинский диагноз, не меняет дозировку, не проверяет лекарственные взаимодействия без лицензированного детерминированного источника и отдельного regulatory gate.
- LLM-голос следует `16-LLM-SYNTHESIS-VOICE-AND-SAFETY.md`: direct but adaptive, evidence-grounded, non-shaming, with deterministic validators and evals. Роль «оракула» запрещена.
- Астрология не влияет на медицинский/психологический риск, readiness score, JITAI decision rule, эмпирический прогноз или causal estimate.
- Вероятность будущего outcome разрешена только после формального outcome contract, независимой оценки и calibration; до этого `ScenarioOutlook` описателен.
- PWA остаётся core implementation. Capacitor является proposed wrapper after native-readiness audit, not a rewrite.
- Любые fallback, missingness, uncertainty, licensing block и degraded mode показываются явно.
- Не проси Ивана вручную писать код или запускать desktop commands. Эскалируй только продуктовые, юридические, лицензионные, клинические или необратимые решения.

## Harness

Следуй `.claude/harness-rules.md`. Используй минимальный активный состав агентов, обычно 3–5. Один owner на изменяемый файл. Research, implementation и adversarial verification должны иметь отдельные контексты и доказательные handoff.

## Проверка

Use existing repository commands discovered by Phase 0. Current known baseline:

```bash
cd architect
node --check app.js
node build.mjs --combined dist/app.html
npm test
```

For UI, verify:

- 390×844 regression baseline;
- 430×932 iPhone 14 Pro Max class;
- 834×1194 and 1194×834 iPad Pro 11 classes;
- both Dual Realm themes;
- safe areas, software keyboard, accessibility, reduced motion;
- offline reload and PWA standalone behavior;
- mobile-accessible preview URL or artifact.

Для LLM: JSON Schema, input references, claim-class rules, astrology isolation, health/tone/numeric/temporal validators, synthetic evals and safe degraded responses.

## Release policy

Никакого merge/deploy при красном gate. После завершённого куска: тесты, понятный commit, handoff, mobile preview, rollback и список реализованного/экспериментального/заблокированного. Health-релиз требует отдельного intended-purpose review; регулируемые функции остаются выключенными feature flags.
