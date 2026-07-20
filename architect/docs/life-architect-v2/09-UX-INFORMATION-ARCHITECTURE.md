# UX и информационная архитектура

## Главное меню

### Сегодня

Текущее состояние, главное действие, medicines due, незакрытая обратная связь, актуальный barrier/risk, необязательный symbolic context.

### Я

Состояния, потребности, психологические паттерны, ценности, метод «Зачем?», подтверждённые выводы и гипотезы.

### Путь

Направления, цели, проекты, actions, decisions, experiments, recovery, trajectory.

### Сферы

Карта жизни и cross-domain relationships: ресурсы, конфликты, влияние здоровья/работы/отношений.

### Здоровье

Внутри одного хаба:

- Обзор;
- Препараты;
- Показатели;
- Документы;
- К врачу.

### Время

Календарный план, observed dynamics, scenario outlook и отдельный astrology context.

### Итоги

Что помогало/мешало, какие hypotheses подтвердились или опроверглись, change over week/month/year.

### Библиотека

Дневник, сны, documents, saved analyses, sources. Это архив/поиск, не основной workflow.

## Progressive disclosure

Карточка первого уровня содержит:

- наблюдение;
- confidence/data quality;
- одно следующее действие;
- кнопки «Почему?» и «Исправить».

Evidence drawer показывает source records, method, window, alternatives, version, consent and limitations.

## LLM insight card

Пользовательский голос — «Отрезвляющий наставник», внутренний контракт — `EvidenceGroundedDirectMentor`.

Первый уровень:

- короткий headline;
- что действительно видно;
- что это может означать;
- один реалистичный следующий шаг;
- при необходимости важная граница вывода.

Кнопка «Почему?» открывает input records, epistemic classes, alternatives, uncertainty, model/prompt policy versions and validator status.

Астрологический текст всегда находится в отдельной подписанной секции **«Символический контекст»**. Он не смешивается с наблюдаемыми данными и медицинским/психологическим объяснением.

Тон адаптивен: direct-supportive для обычной работы, neutral-analytical для неоднозначных данных, gentle-stabilizing при истощении/боли/утрате/сильной тревоге, отдельный crisis-safe режим.

## Dual Realm design baseline

Текущий принятый визуальный контракт уже реализован в `MAIN` через существующий token layer:

- Dark: `Deep Space`;
- Light: `Ethereal Light`.

Новые экраны и карточки используют актуальные `architect/styles.css`, `architect/design_guide.md` и `design/tokens.json`.

Запрещено создавать параллельную Tailwind/shadcn тему или заново переносить приложение на React ради дизайна. Визуальные изменения выполняются через существующие CSS variables/components и проверяются в обеих темах.

## Не перегружать

- один primary action на экран;
- advanced fields по запросу;
- periodic questionnaires не в ежедневном check-in;
- color optional;
- health document extraction — review wizard, не background magic;
- no dashboard of dozens of scores;
- compassionate recovery, no hard streak reset;
- основной LLM-текст короткий, evidence находится в drawer;
- не повторять один и тот же вывод в эмпирической и астрологической секции.

## Accessibility

- keyboard/assistive semantics;
- color is never sole carrier;
- text alternatives;
- contrast in both themes;
- controls large enough for mobile;
- explicit units and dates;
- readable source links;
- uncertainty expressed in words and icon/text, not color alone;
- prefers-reduced-motion respected;
- direct tone remains readable and non-coercive.

## Empty/degraded states

Every state explains:

- what is missing;
- why it matters;
- smallest next step;
- what functionality remains available;
- whether cloud/service/license is required;
- whether LLM output was blocked by a safety/grounding validator.
