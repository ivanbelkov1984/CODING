# Моментальное состояние и психологический контур

## MVP-поток «Как я сейчас?»

Default flow занимает 5–10 секунд:

1. valence: тяжело ↔ хорошо;
2. activation/energy: истощён ↔ активен;
3. сохранить.

Progressive disclosure:

- необязательные emotion chips, выбранные пользователем;
- необязательный personal color;
- context tags;
- заметка;
- глубокий дневник/диалог «Зачем?».

Affective Slider используется как научный ориентир для двух цифровых измерений pleasure/valence и arousal. Мы не обязаны копировать изображения инструмента; реализуется собственный доступный UI с семантически нейтральными controls и собственным validation plan.

## Цвет

Цвет — `ExploratoryPersonalColorSignal`, не тест Люшера и не диагностика. Универсальной таблицы «цвет означает X» нет. Система обучает только личные ассоциации:

- минимум наблюдений до pattern card;
- связь с прямым self-report;
- contradictions показываются;
- пользователь подтверждает/отклоняет;
- color-blind accessibility и вариант «без цвета» обязательны;
- dark/light UI не должен изменять stimulus palette без versioning.

## Психологическая модель

Существующий метод «Зачем?» сохраняется:

`symptom → function → secondary gain → need → cost → alternative → chosen action`.

Психологическая разметка остаётся гипотезой, если она не была непосредственно сообщена пользователем. Поля: symptom, function, gain, need, ego state, emotion, game, themes, confidence, evidence spans, confirmation.

## COM-B

COM-B используется как таксономия условий конкретного поведения:

- capability: физическая/психологическая способность;
- opportunity: физическая/социальная возможность;
- motivation: reflective/automatic processes.

COM-B не является тестом личности и не превращается в один readiness score.

## Psychological flexibility

Не выбирается один универсальный инструмент. Периодические стандартизированные измерения, momentary self-report, behavior indicators и LLM hypotheses хранятся раздельно. До проверки лицензии и русскоязычной версии тексты CompACT/MPFI/Psy-Flex не встраиваются в продукт.

## Safety

- нет клинического диагноза по дневнику;
- нет attachment style по одной записи;
- crisis signals запускают safety fallback к живому человеку, а не интерпретацию;
- self-report не перезаписывается LLM;
- missing check-in не означает ухудшение;
- система избегает морального языка «слабость», «ленивый», «отговорка».

## Personal validation

Для каждого пользовательского construct система может строить within-person report:

- количество наблюдений;
- контексты;
- повторяемость;
- согласование с direct self-report;
- change over time;
- user confirmation;
- uncertainty.
