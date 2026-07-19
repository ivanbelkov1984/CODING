# ADR-0005 — ASCII-коды в JSON-схеме психоконтура вместо кириллических enum

**Статус:** Принято (исправление реального прод-бага)  
**Дата:** 2026-07-18  
**Автор:** Алекс Романов (системный архитектор)

---

## Контекст

Реальный баг в проде: при закрытии диалога падало:
```
Invalid schema: Enum value 'безопасность' does not match declared type
Invalid schema: Enum value 'safety' does not match declared type ['string','null']
```

Два варианта одного класса ошибки:
1. **Вариант A**: Anthropic API не принимает кириллицу в `enum` JSON-схемы
   структурированного вывода (`output_config.format.schema`).
2. **Вариант B**: union-тип `['string', 'null']` вместе с `enum` — Anthropic
   отвергает даже при наличии `null` в значениях enum.

Оба варианта означали, что психоразметка (`psyMarkBatch`, `chatFinish`)
реально не сохранялась в проде при непустых `need`/`ego`.

## Решение

### Схема (одна точка определения — `psyEnumProps()`)

```js
// ДО (сломано):
need: { type: ['string', 'null'], enum: ['безопасность', 'принятие', ..., null] }

// ПОСЛЕ (работает):
need: { type: 'string', enum: ['safety', 'acceptance', 'significance',
        'autonomy', 'meaning', 'closeness', 'control', 'peace', 'novelty', 'none'] }
```

**Сентинел `'none'`** заменяет `null` в схеме. Декодирование на границе:

```js
function psyNeedFromAI(code) {
  if (!code || code === 'none') return null;
  return PSY_NEED_CODE[code] ?? null;  // 'safety' → 'безопасность'
}
```

**Хранение и UI** не менялись — читают русские значения как раньше.

### Единая точка определения

```js
function psyEnumProps() {
  return {
    need: { type: 'string', enum: [...Object.keys(PSY_NEED_CODE), 'none'] },
    ego:  { type: 'string', enum: [...Object.keys(PSY_EGO_CODE),  'none'] },
  };
}
// Используется в psyMarkBatch() и chatFinish() — одна функция, нет расхождений
```

## Последствия

**Плюсы:**
- Психоразметка работает в проде; `need`/`ego` сохраняются.
- Единая точка `psyEnumProps()` — невозможно получить расхождение между
  двумя местами вызова.
- Обратная совместимость: данные с русскими значениями читаются корректно
  (они были записаны вручную или ранними версиями).

**Ограничения:**
- При добавлении новой потребности в таксономию нужно обновить и
  `PSY_NEED_CODE`, и `psyEnumProps()`. Тест `psySchema` в E2E поймает
  несоответствие.

## Правило (общий паттерн)

> **Если в `output_config.format.schema` / `response_format` (Anthropic/OpenAI)
> нужен enum с нелатинскими значениями или nullable-поле:**
> - `type: 'string'` (не `['string','null']`)
> - значения — ASCII-коды
> - сентинел `'none'` вместо `null` в enum
> - декодирование в целевой язык — сразу при разборе ответа API

## Что проверено E2E

```js
ok(psySchema.needType === 'string' && !psySchema.needHasNull,
   'схема need/ego — плоский string без union+null');
ok(psySchema.decodeNone === null && psySchema.decodeSafety === 'безопасность',
   'сентинел none → null; safety → безопасность');
ok(psy.need === 'близость' && psy.ego === 'Ребёнок',
   'ИИ размечает по методу «Зачем?» (потребность, состояние Я)');
```
