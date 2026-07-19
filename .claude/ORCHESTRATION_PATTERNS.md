# Six Orchestration Patterns

## 1. Adversarial Verification

**Связка:** `ui-engineer` → `qa-auditor`.

UI Engineer создаёт компонент и evidence. QA Auditor действует как прокурор: ищет регрессии, accessibility failures, AI slop, дефолтные тени/градиенты, несоответствие Linear-токенам, фальшивые empty states и скрытую неопределённость. Приёмка требует закрытых замечаний и зелёных тестов, а не только субъективного согласия.

## 2. Tournament

**Связка:** `art-director` + `tokenizer` + `qa-auditor`.

До CSS Art Director создаёт три независимых направления токенов/композиции. Tokenizer механически проверяет их против `architect/design_guide.md`, `design/tokens.json`, WCAG и текущих компонентов. QA оценивает task fit. Один победитель фиксируется в коротком Design Decision. Stripe/Apple служат только общими benchmarks ясности, но не копируемыми эталонами.

## 3. Loop Until Done

**Владелец:** `tokenizer` для контраста; любой implementer для bounded debugging.

Цикл: изменить → измерить → сохранить evidence → повторить. Контраст проверяется механически. Нельзя бесконечно менять HUE: после двух итераций без улучшения агент меняет стратегию (lightness/chroma/token role); после лимита сообщает blocker с лучшим кандидатом и измерениями.

## 4. Fan Out and Synthesize

**Владелец:** `studio-dispatcher`, synthesis — `integration-release-manager`.

Независимые области получают чистые контексты. Пример страницы: Header/Sidebar/Widget только если у них разделены files/contracts. Shared state/`app.js` сначала проектируется одним owner. Результаты возвращаются структурированными handoff и синтезируются одним агентом.

## 5. Gated Sequential Pipeline

`product-architect → domain owner → data-architect → implementer → qa-auditor → integration-release-manager`.

Следующий этап начинается только после артефакта и gate предыдущего. Подходит для migrations, calculation engine, consent и release.

## 6. Competing Hypotheses / Root-Cause Tournament

При сложном баге 2–4 read-only агента получают одинаковое наблюдение и независимо предлагают root cause + falsification test. QA пытается опровергнуть. Dispatcher выбирает гипотезу по evidence, затем один implementer исправляет. Используется вместо бесконечного trial-and-error.
