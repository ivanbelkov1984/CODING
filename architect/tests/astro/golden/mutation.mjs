// Wave 3 (issue #154) — MUTATION SANITY для слоя golden.
//
// Owner review #4815354882, п.1: «Добавить mutation-sanity: намеренное
// изменение production-коэффициента/ветви должно валить соответствующий тест».
//
// Зелёный golden-прогон сам по себе НЕ доказывает, что проверка что-то ловит —
// ровно на этом и погорели прежние тесты ε и Жребия Фортуны. Здесь мы берём
// собранный production-бандл, вносим в него ОДНУ точечную поломку и требуем,
// чтобы соответствующая golden-проверка упала. Если она осталась зелёной —
// проверка ложная, и этот прогон падает.

import { readFile, writeFile, mkdir, rm } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { bootAstro } from '../helpers/harness.mjs';
import { createReporter } from '../helpers/core.mjs';
import * as C from './checks.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const DIST = join(DIR, '..', '..', '..', 'dist', 'app.html');
// Мутанты кладём ПРЯМО в dist/, а не в подпапку: production грузит движок
// относительным путём ('astronomy.min.js'), и из вложенной директории он не
// резолвится. Файлы удаляются в конце прогона.
const TMP = join(DIR, '..', '..', '..', 'dist');

const src = await readFile(DIST, 'utf8');
await mkdir(TMP, { recursive: true });

// Каждая мутация — минимальная точечная порча ОДНОЙ величины или ветви.
const MUTANTS = [
  {
    id: 'eps-constant',
    what: 'наклон эклиптики 23.4392911 → 23.6',
    find: 'const eps = 23.4392911 * Math.PI / 180;',
    replace: 'const eps = 23.6 * Math.PI / 180;',
    check: C.checkObliquityFromProduction,
    expectFailIn: 'ε, восстановленный из production-MC',
  },
  {
    id: 'fortune-day-night',
    what: 'ветвь день/ночь Жребия Фортуны инвертирована',
    find: 'const pofLon = isDay ?',
    replace: 'const pofLon = !isDay ?',
    check: C.checkFortuneFromProduction,
    expectFailIn: 'Жребий Фортуны из production',
  },
  {
    id: 'aspect-orb-trine',
    what: 'орбис трина 7 → 5',
    find: "{ name: 'трин', angle: 120, orb: 7 }",
    replace: "{ name: 'трин', angle: 120, orb: 5 }",
    check: C.checkAspectsFromProduction,
    expectFailIn: 'аспекты против независимого пересчёта',
  },
  {
    id: 'placidus-fraction',
    what: 'доля трисекции Плацида 1/3 → 0.4',
    find: "c[11] = placidusCusp(1 / 3, false, ctx.ramc, ctx.eps, ctx.phi);",
    replace: "c[11] = placidusCusp(0.4, false, ctx.ramc, ctx.eps, ctx.phi);",
    check: C.checkQuadrantHouses,
    expectFailIn: 'квадрантные системы домов',
  },
];

const R = createReporter('Astro golden mutation-sanity');
console.log('\n── Mutation sanity: каждая поломка production обязана уронить свою проверку ──');

let hardFail = false;
for (const m of MUTANTS) {
  if (!src.includes(m.find)) {
    R.ok(false, `[${m.id}] якорь мутации найден в собранном бандле`,
      `не найдена строка:\n${m.find}\nВероятно production изменился — мутацию нужно обновить, иначе проверка бессмысленна.`);
    hardFail = true;
    continue;
  }
  const file = join(TMP, `_mutant-${m.id}.html`);
  await writeFile(file, src.replace(m.find, m.replace));

  const h = await bootAstro(file);
  // Тихий репортер: нас интересует только сам факт падения проверки.
  let pass = 0, fail = 0;
  const silent = {
    ok: (cond) => { cond ? pass++ : fail++; return !!cond; },
  };
  try {
    await m.check(h, silent, h.meta.engine);
  } catch (e) {
    fail++;   // исключение внутри проверки — тоже обнаружение поломки
  }
  await h.close();

  R.ok(fail > 0,
    `[${m.id}] ${m.what} → проверка «${m.expectFailIn}» упала (${fail} провалов из ${pass + fail})`,
    fail > 0 ? null : `ПРОВЕРКА ЛОЖНОЗЕЛЁНАЯ: production сломан (${m.what}), но все ${pass} проверок прошли.`);
}

for (const m of MUTANTS) await rm(join(TMP, `_mutant-${m.id}.html`), { force: true });
const s = R.summary();
process.exit(s.fail || hardFail ? 1 : 0);
