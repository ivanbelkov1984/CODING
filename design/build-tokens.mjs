#!/usr/bin/env node
// Механический экспорт дизайн-токенов: architect/styles.css → design/tokens.json (DTCG).
// Наряд студии Белькова #222/#223. Ответственный: МАКС ОРЛОВ.
//
// Зачем: JSON-файла токенов (портативный договор) в репо не было — CSS-переменные
// жили только в styles.css. Этот скрипт — единственный источник синхронизации:
// ЗНАЧЕНИЯ читаются вживую из styles.css (:root — тёмный канон, [data-theme=light] —
// светлая), а СТРУКТУРА/имена/типы заданы явной картой ниже (не эвристикой, чтобы
// экспорт был предсказуем и читабелен). Перезапуск: `node design/build-tokens.mjs`.
//
// Формат — DTCG (Design Tokens Community Group): у каждого токена $value + $type.
// Тёмная тема — канон ($value); светлая — в $extensions.studio.theme.light.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const CSS = join(ROOT, 'architect', 'styles.css');

// --- парсинг блоков CSS-переменных ---------------------------------------
function parseVars(css, selectorRe) {
  const m = css.match(selectorRe);
  if (!m) return {};
  const body = m[1];
  const out = {};
  // --name: value;  (значение может содержать var()/rgba()/функции с запятыми)
  const re = /--([a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let x;
  while ((x = re.exec(body)) !== null) out[x[1].trim()] = x[2].trim();
  return out;
}

// --- нормализация значений ------------------------------------------------
const normColor = (v) => v.replace(/rgba?\(([^)]+)\)/gi, (_, inner) =>
  `rgba(${inner.split(',').map((s) => s.trim()).join(', ')})`);
const remOk = (v) => (/^\.\d/.test(v) ? '0' + v : v);           // .25rem → 0.25rem
const cubic = (v) => {                                          // cubic-bezier(a,b,c,d) → [a,b,c,d]
  const m = v.match(/cubic-bezier\(([^)]+)\)/i);
  return m ? m[1].split(',').map((n) => parseFloat(n.trim())) : v;
};

// --- явная карта: cssVar → [group..., name, $type] ------------------------
// Псевдонимы (var(--x)) сохраняем как DTCG-алиасы "{path.to.token}".
const MAP = [
  // поверхности (лестница глубины)
  ['bg-base', ['color', 'surface', 'base'], 'color'],
  ['bg-panel', ['color', 'surface', 'panel'], 'color'],
  ['bg-surface-2', ['color', 'surface', 's2'], 'color'],
  ['bg-surface-3', ['color', 'surface', 's3'], 'color'],
  ['bg-surface-4', ['color', 'surface', 's4'], 'color'],
  // hairline-границы
  ['border-subtle', ['color', 'border', 'subtle'], 'color'],
  ['border-medium', ['color', 'border', 'medium'], 'color'],
  ['border-strong', ['color', 'border', 'strong'], 'color'],
  // текст, 4 уровня
  ['t1', ['color', 'text', 'primary'], 'color'],
  ['t2', ['color', 'text', 'secondary'], 'color'],
  ['t3', ['color', 'text', 'tertiary'], 'color'],
  ['t4', ['color', 'text', 'quaternary'], 'color'],
  // единственный акцент + hover-оттенки
  ['accent', ['color', 'accent', 'default'], 'color'],
  ['accent-hover', ['color', 'accent', 'hover'], 'color'],
  ['accent-light', ['color', 'accent', 'light'], 'color'],
  ['blue-l', ['color', 'accent', 'soft'], 'color'],
  // статусы — только функционально
  ['green', ['color', 'status', 'success'], 'color'],
  ['green-l', ['color', 'status', 'successSoft'], 'color'],
  ['red', ['color', 'status', 'danger'], 'color'],
  ['red-l', ['color', 'status', 'dangerSoft'], 'color'],
  ['orange', ['color', 'status', 'warning'], 'color'],
  ['orange-l', ['color', 'status', 'warningSoft'], 'color'],
  // рампа тепловой карты (индиго-интенсивность) + пустой день
  ['gold', ['color', 'heatmap', 'high'], 'color'],
  ['rose', ['color', 'heatmap', 'low'], 'color'],
  ['hm0', ['color', 'heatmap', 'empty'], 'color'],
  // граф доменов (монохром + акцент)
  ['c-book', ['color', 'graph', 'book'], 'color'],
  ['c-bot', ['color', 'graph', 'bot'], 'color'],
  ['c-personal', ['color', 'graph', 'personal'], 'color'],
  ['c-project', ['color', 'graph', 'project'], 'color'],
  ['c-vitality', ['color', 'graph', 'vitality'], 'color'],
  ['c-dream', ['color', 'graph', 'dream'], 'color'],
  ['c-pattern', ['color', 'graph', 'pattern'], 'color'],
  ['c-spirit', ['color', 'graph', 'spirit'], 'color'],
  // тени — глубина поверхностями, не тенями (шкала = none)
  ['sh1', ['shadow', 'sm'], 'shadow'],
  ['sh2', ['shadow', 'md'], 'shadow'],
  ['sh3', ['shadow', 'lg'], 'shadow'],
  // типо-шкала Linear 12/13/15/18/24/32
  ['tx2', ['fontSize', 'xs'], 'dimension'],
  ['tx3', ['fontSize', 'sm'], 'dimension'],
  ['tx4', ['fontSize', 'md'], 'dimension'],
  ['tx6', ['fontSize', 'lg'], 'dimension'],
  ['tx7', ['fontSize', 'xl'], 'dimension'],
  ['tx8', ['fontSize', 'xxl'], 'dimension'],
  // пространство (8px-база)
  ['s1', ['space', '1'], 'dimension'],
  ['s2', ['space', '2'], 'dimension'],
  ['s3', ['space', '3'], 'dimension'],
  ['s4', ['space', '4'], 'dimension'],
  ['s5', ['space', '5'], 'dimension'],
  ['s8', ['space', '8'], 'dimension'],
  ['s10', ['space', '10'], 'dimension'],
  // радиусы (форма)
  ['r4', ['radius', 'sm'], 'dimension'],
  ['r8', ['radius', 'md'], 'dimension'],
  ['r20', ['radius', 'lg'], 'dimension'],
  ['rF', ['radius', 'full'], 'dimension'],
  // шрифт
  ['f', ['fontFamily', 'base'], 'fontFamily'],
  // движение
  ['e', ['easing', 'standard'], 'cubicBezier'],
  ['dur1', ['duration', 'fast'], 'duration'],
  ['dur2', ['duration', 'base'], 'duration'],
  ['dur3', ['duration', 'slow'], 'duration'],
];

function toValue(raw, type) {
  if (type === 'color') return normColor(raw);
  if (type === 'dimension' || type === 'duration') return remOk(raw);
  if (type === 'cubicBezier') return cubic(raw);
  if (type === 'shadow') return raw;            // 'none'
  return raw;                                    // fontFamily
}

function setPath(obj, path, node) {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) cur = (cur[path[i]] ??= {});
  cur[path[path.length - 1]] = node;
}

// --- сборка ---------------------------------------------------------------
const css = readFileSync(CSS, 'utf8');
const dark = parseVars(css, /:root\s*\{([\s\S]*?)\}/);
const light = parseVars(css, /\[data-theme="light"\]\s*\{([\s\S]*?)\}/);

const tokens = {
  $description:
    'Дизайн-токены Архитектора (Linear-канон): механический экспорт из ' +
    'architect/styles.css. Тёмная тема — канон ($value); светлая — в ' +
    '$extensions.studio.theme.light. Регенерация: node design/build-tokens.mjs.',
};

const lightOverrides = {};
const unmapped = [];
const mappedVars = new Set(MAP.map(([v]) => v));

for (const [cssVar, path, type] of MAP) {
  if (!(cssVar in dark)) { unmapped.push(`(нет в :root) --${cssVar}`); continue; }
  setPath(tokens, path, {
    $value: toValue(dark[cssVar], type),
    $type: type,
    $extensions: { 'studio.cssVar': `--${cssVar}` },
  });
  if (cssVar in light) lightOverrides[path.join('.')] = toValue(light[cssVar], type);
}

// вары, которых нет в карте (напр. чистые var()-псевдонимы --bg/--sf/--blue) —
// фиксируем в отчёте, а не роняем: экспорт остаётся предсказуемым.
for (const v of Object.keys(dark)) {
  if (!mappedVars.has(v) && !/^(bg|sf|sf2|bg2|bg3|bd|bd2|blue|blue-t|blue-btn|purple|purple-l|teal|teal-l|gold-l|tx5|s6|r12|r16|e-in)$/.test(v)) {
    unmapped.push(`--${v}`);
  }
}

tokens.$extensions = {
  'studio.source': 'architect/styles.css (:root + [data-theme="light"])',
  'studio.order': '#222 / #223',
  'studio.theme.light': lightOverrides,
};

mkdirSync(HERE, { recursive: true });
writeFileSync(join(HERE, 'tokens.json'), JSON.stringify(tokens, null, 2) + '\n');

const nColors = Object.keys(dark).length;
console.log(`tokens.json: ${MAP.length} токенов из ${nColors} CSS-переменных; ` +
  `${Object.keys(lightOverrides).length} светлых оверрайдов.`);
if (unmapped.length) console.log('Незамапленные (не псевдонимы) — проверь при изменении системы:\n  ' + unmapped.join('\n  '));
