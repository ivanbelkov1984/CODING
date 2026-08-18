// D-DATE-02 — MUTATION SANITY.
//
// «47 из 47 зелёные» само по себе ничего не значит: сюита может быть зелена
// и на сломанной защите. Здесь ломается РОВНО ОДНА проверка, и обязан
// покраснеть именно тот сценарий astroDateTime.spec.mjs, который её сторожит.
//
// Самый важный мутант — natal-guard-removed: он возвращает тихую подмену дня
// (31 февраля снова считается как 3 марта). Если сюита это переживает, она
// не защищает главное.

import { readFile, writeFile, rm } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';
import { makeRun, redLines, selfTestRetryPolicy } from './mutation-run.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(DIR, '..', 'dist');
const DIST = join(DIST_DIR, 'app.html');
const SPEC = join(DIR, 'astroDateTime.spec.mjs');

const src = await readFile(DIST, 'utf8');

const MUTANTS = [
  {
    // ГЛАВНЫЙ: снят fail-closed на входе в расчёт — возвращается тихая
    // подмена дня, ровно тот дефект, ради которого всё делалось.
    id: 'natal-guard-removed',
    what: 'расчёт карты снова принимает несуществующий день',
    find: `  const utc = astroInstantUTC(birth.date, birth.timeKnown ? birth.time : '12:00', birth.utcOffset);
  if (!utc) throw astroBadInstant();
  const t = A.MakeTime(utc);`,
    replace: `  const timePart = birth.timeKnown ? birth.time : '12:00';
  const utc = new Date(Date.parse(birth.date + 'T' + timePart + ':00Z') - (birth.utcOffset || 0) * 3600e3);
  const t = A.MakeTime(utc);`,
    expectFail: '2026-02-31 НЕ вернул карту 3 марта (тихой подмены дня нет)',
  },
  {
    // Сборка момента перестаёт отказывать и начинает нормализовать —
    // тот же дефект, но спрятанный внутрь общего помощника.
    id: 'instant-normalizes-instead-of-refusing',
    what: 'astroInstantUTC нормализует невозможный день вместо отказа',
    find: '  if (!isRealIsoDay(date)) return null;',
    replace: '  if (!isRealIsoDay(date)) { const ms0 = Date.parse(date + "T12:00:00Z"); return Number.isFinite(ms0) ? new Date(ms0) : null; }',
    expectFail: '2026-02-31 НЕ вернул карту 3 марта (тихой подмены дня нет)',
  },
  {
    // Валидатор данных рождения возвращается к проверке ФОРМЫ строки.
    id: 'birth-date-shape-only',
    what: 'дата рождения снова проверяется только по форме строки',
    find: `  if (!isRealIsoDay(date)) { toast('Дата в формате ГГГГ-ММ-ДД, и такой день должен существовать в календаре', 'warn'); return; }
  const timeKnown = $('ab-time-known')`,
    replace: `  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) { toast('Дата в формате ГГГГ-ММ-ДД, и такой день должен существовать в календаре', 'warn'); return; }
  const timeKnown = $('ab-time-known')`,
    expectFail: '31 февраля (2026-02-31) отклонён и НЕ сохранён',
  },
  {
    // Время рождения возвращается к проверке формы: «25:99» снова проходит.
    id: 'birth-time-shape-only',
    what: 'время рождения снова проверяется только по форме строки',
    find: `  if (timeKnown && !isRealClockTime(time)) { toast('Время в формате ЧЧ:ММ: часы 00–23, минуты 00–59', 'warn'); return; }
  const utcOffset = parseFloat($('ab-utc')`,
    replace: `  if (timeKnown && !/^\\d{2}:\\d{2}$/.test(time)) { toast('Время в формате ЧЧ:ММ: часы 00–23, минуты 00–59', 'warn'); return; }
  const utcOffset = parseFloat($('ab-utc')`,
    expectFail: 'часы и минуты вне шкалы (25:99) отклонён и НЕ сохранён',
  },
  {
    // Час 24 снова считается временем — а он переносит ДАТУ на сутки вперёд.
    id: 'clock-allows-hour-24',
    what: 'часы принимают 24 — время суток молча меняет дату',
    find: '  +s.slice(0, 2) <= 23 && +s.slice(3, 5) <= 59;',
    replace: '  +s.slice(0, 2) <= 24 && +s.slice(3, 5) <= 59;',
    expectFail: 'ISO-маркер конца суток — он переносит ДАТУ на следующий день (24:00) отклонён и НЕ сохранён',
  },
  {
    // Минуты перестают ограничиваться.
    id: 'clock-minutes-unbounded',
    what: 'минуты перестают ограничиваться 59',
    find: '  +s.slice(0, 2) <= 23 && +s.slice(3, 5) <= 59;',
    replace: '  +s.slice(0, 2) <= 23;',
    expectFail: '60-я минута (00:60) отклонён и НЕ сохранён',
  },
  {
    // Собственные данные рождения перестают проверять часовой пояс. После
    // D-DATE-02 расчёт зону не сторожит, значит вся ответственность здесь.
    id: 'birth-timezone-check-removed',
    what: 'данные рождения перестают проверять UTC-офсет',
    find: `  if (!(utcOffset >= -12 && utcOffset <= 14)) {
    toast('UTC-офсет должен быть от −12 до +14 (укажите смещение, действовавшее в дату рождения)', 'warn');
    return;
  }
  const lat = parseFloat($('ab-lat')`,
    replace: `  if (false) {
    toast('x', 'warn');
    return;
  }
  const lat = parseFloat($('ab-lat')`,
    expectFail: 'нереальный UTC-офсет 99 отклонён на входе и НЕ сохранён',
  },
  {
    // Карта партнёра снова принимает несуществующий день.
    id: 'partner-date-shape-only',
    what: 'дата партнёра снова проверяется только по форме строки',
    find: `  if (!isRealIsoDay(date)) { toast('Дата в формате ГГГГ-ММ-ДД, и такой день должен существовать в календаре', 'warn'); return; }
  const timeKnown = $('sp-time-known')`,
    replace: `  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) { toast('Дата в формате ГГГГ-ММ-ДД, и такой день должен существовать в календаре', 'warn'); return; }
  const timeKnown = $('sp-time-known')`,
    expectFail: 'карта партнёра: несуществующий день отклонён',
  },
  {
    // У партнёра снова нет проверки часового пояса (исходный пробел).
    id: 'partner-timezone-check-removed',
    what: 'карта партнёра перестаёт проверять UTC-офсет',
    find: `  const utcOffset = parseFloat($('sp-utc') ? $('sp-utc').value : '0') || 0;
  if (!(utcOffset >= -12 && utcOffset <= 14)) {`,
    replace: `  const utcOffset = parseFloat($('sp-utc') ? $('sp-utc').value : '0') || 0;
  if (false) {`,
    expectFail: 'карта партнёра: UTC-офсет вне реального диапазона отклонён',
  },
  {
    // Проверка «событие после рождения» снова становится fail-open на
    // невозможной дате рождения (NaN <= NaN === false).
    id: 'rectify-bad-birth-guard-removed',
    what: 'ректификация снова сравнивает событие с невозможной датой рождения',
    find: `  if (b && !isRealIsoDay(b.date || '')) { toast('Сначала исправь дату рождения: сохранён несуществующий день', 'warn'); return; }`,
    replace: '',
    expectFail: 'ректификация: при невозможной дате рождения проверка «после рождения» больше не пропускает всё подряд',
  },
  {
    // Транзиты снова молча подставляют другой день вместо несуществующего.
    id: 'transits-silent-substitute',
    what: 'транзиты снова принимают несуществующую дату по форме строки',
    find: '    if (isRealIsoDay(dv)) at = new Date(dv + \'T12:00:00\');',
    replace: '    if (/^\\d{4}-\\d{2}-\\d{2}$/.test(dv)) at = new Date(dv + \'T12:00:00\');',
    expectFail: 'транзиты: несуществующая дата названа человеку, а не посчитана как другой день',
  },
  {
    // Дата события ректификации снова проверяется по форме.
    id: 'rectify-event-shape-only',
    what: 'дата события ректификации снова проверяется только по форме',
    find: `  if (!isRealIsoDay(date)) { toast('Дата события в формате ГГГГ-ММ-ДД, и такой день должен существовать в календаре', 'warn'); return; }`,
    replace: `  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) { toast('Дата события в формате ГГГГ-ММ-ДД, и такой день должен существовать в календаре', 'warn'); return; }`,
    expectFail: 'ректификация: несуществующая дата события отклонена',
  },
];

// Политика повтора — общая и доказанная (см. mutation-run.mjs). Прогон с
// code 0 и нулём красных строк — это ВЫЖИВШИЙ мутант, а не сорванный прогон,
// и повтора он не получает.
const runOnce = (bundle) => new Promise(res => {
  const p = spawn(process.execPath, [SPEC], {
    cwd: join(DIR, '..'),
    env: { ...process.env, ASTRO_BUNDLE: bundle },
  });
  let out = '';
  p.stdout.on('data', d => { out += d; });
  p.stderr.on('data', d => { out += d; });
  p.on('close', code => res({ code, out }));
});
const run = makeRun(runOnce);

let pass = 0, fail = 0;
const ok = (cond, msg, detail) => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); if (detail) console.log('      ' + String(detail).split('\n').join('\n      ')); }
};

console.log('\n── D-DATE-02 mutation sanity: снятая проверка обязана уронить свой сценарий ──');

await selfTestRetryPolicy(ok);

for (const m of MUTANTS) {
  if (!src.includes(m.find)) {
    ok(false, `[${m.id}] якорь мутации найден в собранном бандле`,
      `не найдено:\n${m.find}\nProduction изменился — мутацию нужно обновить.`);
    continue;
  }
  const file = join(DIST_DIR, `_astro-mutant-${m.id}.html`);
  await writeFile(file, src.replace(m.find, m.replace));
  const { code, out } = await run(file);
  await rm(file, { force: true });
  const reds = redLines(out);
  const hit = reds.some(l => l.includes(m.expectFail));
  ok(code !== 0 && hit,
    `[${m.id}] ${m.what} → сценарий «${m.expectFail}» покраснел (${reds.length} провалов)`,
    code === 0 ? 'ПРОВЕРКА ЛОЖНОЗЕЛЁНАЯ: защита снята, но сюита прошла.'
      : hit ? null
        : `Упало не на ожидаемом сценарии. Красные:\n${reds.slice(0, 6).join('\n') || '(нет)'}\nХвост вывода:\n${out.split('\n').slice(-12).join('\n')}`);
}

console.log(`\nD-DATE-02 mutation sanity: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
