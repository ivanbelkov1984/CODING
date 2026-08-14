// ЕДИНАЯ ПРОЕКЦИЯ ИСПРАВЛЕНИЙ — MUTATION SANITY.
//
// Ломается РОВНО ОДНА защита в собранном бандле — обязан упасть именно тот
// сценарий corrections.spec.mjs, который её сторожит. Смысл: доказать, что
// сюита ловит возврат к небезопасному поведению, а не просто «зелёная».

import { readFile, writeFile, rm } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

const DIR = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(DIR, '..', 'dist');
const DIST = join(DIST_DIR, 'app.html');
const SPEC = join(DIR, 'corrections.spec.mjs');

const src = await readFile(DIST, 'utf8');

const MUTANTS = [
  {
    // §1: возврат молчаливого last-write-wins по времени.
    id: 'lww-restored',
    what: 'молчаливый last-write-wins по времени возвращается вместо цепочки',
    find: `  chains.forEach((ch, f) => {
    if (ch.invalid) { broken.push(f); return; }
    if (ch.heads.length > 1) { conflicts.push(f); return; }
    if (ch.heads.length === 1) { out[f] = ch.heads[0].patch[f]; applied.push(f); headIds.add(String(ch.heads[0].id)); }
  });`,
    replace: `  chains.forEach((ch, f) => {
    const sorted = ch.all.slice().sort((a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0));
    if (sorted.length) { out[f] = sorted[sorted.length - 1].patch[f]; applied.push(f); headIds.add(String(sorted[sorted.length - 1].id)); }
  });`,
    expectFail: 'две неподчинённые головы → действует ОРИГИНАЛ',
  },
  {
    // §1: снят страж явного замещения — конкурентная запись проходит.
    id: 'supersedes-guard-removed',
    what: 'страж явного замещения снят — вторая коррекция пишется без ссылки',
    find: `  if (curHead && supersedes == null) {
    return { ok: false, error: 'это значение уже исправлялось — новое исправление обязано явно заменять прежнее', stale: true, expected: curHead };
  }`,
    replace: '  if (false) { return { ok: false }; }',
    extra: {
      find: `  if (curHead && String(supersedes) !== curHead) {
    return { ok: false, error: 'исправление опирается на устаревшую версию — обнови экран и повтори', stale: true, expected: curHead };
  }`,
      replace: '  if (curHead && supersedes != null && String(supersedes) !== curHead) { return { ok: false, stale: true }; }',
    },
    expectFail: 'второе исправление БЕЗ явной ссылки отклонено',
  },
  {
    // §1: устаревшая ссылка перестаёт ловиться.
    id: 'stale-supersedes-accepted',
    what: 'устаревшая ссылка на замещаемую коррекцию перестаёт отклоняться',
    find: `  if (curHead && String(supersedes) !== curHead) {
    return { ok: false, error: 'исправление опирается на устаревшую версию — обнови экран и повтори', stale: true, expected: curHead };
  }`,
    replace: '  if (false) { return { ok: false }; }',
    expectFail: 'исправление с устаревшей ссылкой отклонено',
  },
  {
    // §2: коррекции удалённой записи снова участвуют в проекции.
    id: 'tombstoned-correction-active',
    what: 'исправления удалённой записи снова применяются к эффективному значению',
    find: '  if (corrParentTombstoned(rec, d)) return rec;      // §2: удалённый родитель',
    replace: '  if (false) return rec;      // §2: удалённый родитель',
    expectFail: 'удалённый родитель → исправления НЕ участвуют в эффективном значении',
  },
  {
    // §6: один derived-движок переключён обратно на сырое чтение.
    id: 'mindbody-back-to-raw',
    what: 'Mind–Body снова читает сырые симптомы вместо исправленных',
    find: "  return projAll('symptoms', db)\n",
    replace: "  return (db.symptoms || [])\n",
    expectFail: 'Mind–Body считает по ИСПРАВЛЕННЫМ симптомам',
  },
  {
    // §6: аналитика чек-инов возвращается на сырое чтение.
    id: 'statescore-back-to-raw',
    what: 'состояние/оси снова считаются по сырым чек-инам',
    find: "  const win = projAll('checkins').filter(c => c.date > dayAgo(14) && c.date);",
    replace: '  const win = DB.checkins.filter(c => c.date > dayAgo(14) && c.date);',
    expectFail: 'паритет: серии, консистентность, оси, состояние',
  },
  {
    // §6: N-of-1 возвращается на сырые наблюдения.
    id: 'nof1-back-to-raw',
    what: 'N-of-1 снова считает по сырым наблюдениям',
    find: "  const obs = projAll('psyObservations', db).filter(o => o && exp.targetOutcomeMetricIds.includes(o.metricId));",
    replace: '  const obs = (db.psyObservations || []).filter(o => o && exp.targetOutcomeMetricIds.includes(o.metricId));',
    expectFail: 'N-of-1 считает по ИСПРАВЛЕННЫМ наблюдениям',
  },
  {
    // §5: Variant B снова слеп к активной коррекции — тихая перезапись.
    id: 'variantb-ignores-correction',
    what: 'Variant B снова считает запись «нетронутой» при активной коррекции',
    find: '  const userUntouched = rawUntouched && !corrFieldsTouched.length && !corrConflicted && !corrBroken;',
    replace: '  const userUntouched = rawUntouched;',
    expectFail: 'более новая ревизия по ИСПРАВЛЕННОМУ полю → changed-conflict',
  },
  {
    // §5: override перестаёт разрешать коррекцию — она сразу же снова
    // накладывается поверх значения источника, «замена» оказывается ложью.
    id: 'override-leaves-correction-active',
    what: 'override перестаёт разрешать коррекцию владельца',
    find: "  if (u.mode === 'override' && (u.corrFieldsTouched || []).length && Array.isArray(d.corrections)) {",
    replace: '  if (false) {',
    expectFail: 'override РАЗРЕШИЛ коррекцию',
  },
  {
    // §7: доменная валидация исправления снята — вне диапазона проходит.
    id: 'correction-validation-removed',
    what: 'доменная проверка исправляемого значения снята',
    find: '    if (n < spec.num[0] || n > spec.num[1]) return { ok: false, error: `«${spec.l}»: допустимо от ${spec.num[0]} до ${spec.num[1]}` };',
    replace: '    if (false) return { ok: false };',
    expectFail: 'исправление вне диапазона отклонено',
  },
  {
    // §7: перечисление перестаёт проверяться.
    id: 'correction-enum-removed',
    what: 'перечисление в исправлении перестаёт проверяться',
    find: '    if (!spec.enums.includes(s)) return { ok: false, error: `«${spec.l}»: допустимо только ${spec.enums.join(\' / \')}` };',
    replace: '    if (false) return { ok: false };',
    expectFail: 'medIntakes.status: чужое значение отклонено',
  },
  {
    // §4: инспектор снова показывает сырое значение вместо эффективного.
    id: 'inspector-shows-raw',
    what: 'инспектор снова показывает оригинал вместо эффективного значения',
    find: '    const t = recFieldText(eff, f);',
    replace: '    const t = recFieldText(rec, f);',
    expectFail: 'инспектор показывает ЭФФЕКТИВНОЕ значение и метку «Исправлено»',
  },
  {
    // §3: универсальная история исчезает.
    id: 'history-hidden',
    what: 'универсальная история исправлений перестаёт показываться',
    find: '  box.innerHTML = rows + prov + histHtml + noteC + noteB + tech;',
    replace: '  box.innerHTML = rows + prov + noteC + noteB + tech;',
    expectFail: 'универсальная история: оригинал, цепочка, причина',
  },
  {
    // §1 БЛОКЕР: снимок «что видел человек» возвращается на момент СОХРАНЕНИЯ.
    // Ровно та дыра, из-за которой владелец молча заместил бы чужую коррекцию,
    // которой не видел.
    id: 'snapshot-back-to-save-time',
    what: 'снимок берётся при сохранении, а не при показе формы',
    find: '  const seen = (_recDet.corrSnap && _recDet.corrSnap.key === recCorrKey(coll, rec.id)) ? _recDet.corrSnap.heads : null;',
    replace: '  const seen = corrViewSnapshot(coll, rec.id, acted);',
    expectFail: 'эффективное значение осталось 7 — чужая коррекция не замещена',
  },
  {
    // §1: сверка со снимком показа снята целиком.
    id: 'stale-view-check-removed',
    what: 'сверка с открытым видом формы снята',
    find: '  const stale = corrViewStale(coll, rec.id, seen, acted);',
    replace: '  const stale = [];',
    expectFail: 'замещение головы, которую человек не видел, отклонено (эффективное осталось 7)',
  },
  {
    // §2: детектор целостности перестаёт влиять на результат — повреждённая
    // цепочка снова даёт «принятое» значение.
    id: 'chain-integrity-off',
    what: 'повреждённая цепочка снова считается рабочей',
    find: `    out.set(f, {
      heads: invalid.length ? [] : heads,
      chain: invalid.length ? [] : chain,
      all: list,
      invalid: invalid.length ? [...new Set(invalid)] : null,
    });`,
    replace: '    out.set(f, { heads, chain, all: list, invalid: null });',
    expectFail: '[висячая ссылка на несуществующее] эффективное значение = ОРИГИНАЛ, поле помечено повреждённым',
  },
  {
    // §2: проекция перестаёт сообщать о поломке потребителям.
    id: 'proj-hides-invalid-chain',
    what: 'проекция перестаёт помечать поле с повреждённой цепочкой',
    find: '    if (ch.invalid) { broken.push(f); return; }',
    replace: '    if (false) { broken.push(f); return; }',
    expectFail: '[цикл A↔B] эффективное значение = ОРИГИНАЛ, поле помечено повреждённым',
  },
  {
    // §2: поверх повреждённой цепочки снова можно писать.
    id: 'write-on-broken-chain',
    what: 'запись исправления поверх повреждённой цепочки снова разрешена',
    find: "    if (invalid) return { ok: false, error: `по полю «${f}» повреждена история исправлений (${invalid.join('; ')}) — запись новых исправлений закрыта`, invalid: INVALID_CORRECTION_CHAIN };",
    replace: '    if (false) return { ok: false };',
    expectFail: '[цикл A↔B] запись новых исправлений закрыта, голова не угадана',
  },
  {
    // §3: явное «нет числового значения» перестаёт работать — ошибочное
    // число снова нечем убрать.
    id: 'nullable-clear-ignored',
    what: 'явная очистка nullable-значения перестаёт срабатывать',
    find: '    const wantNull = !!(nullEl && nullEl.checked);',
    replace: '    const wantNull = false;',
    expectFail: 'явная очистка даёт эффективное значение null',
  },
  {
    // §3: пустой ввод снова переинтерпретируется как null — форма молча
    // обнуляет поле, которого человек не касался.
    id: 'blank-means-null',
    what: 'пустое поле ввода снова означает null, а не «не трогать»',
    find: "    if (!wantNull && String(rawIn).trim() === '') continue;   // пусто = не трогаем",
    replace: "    if (!wantNull && !sp.nullable && String(rawIn).trim() === '') continue;",
    expectFail: 'пустой ввод по-прежнему означает «оставить как есть», а не null',
  },
  {
    // §8: исправление начинает мутировать оригинал — история теряется.
    id: 'correction-mutates-original',
    what: 'исправление начинает переписывать оригинал записи',
    find: '  if (!Array.isArray(DB.corrections)) DB.corrections = [];\n  DB.corrections.push(c);',
    replace: `  if (!Array.isArray(DB.corrections)) DB.corrections = [];
  const _t = (DB[coll] || []).find(r => r && r.id === targetId);
  if (_t) Object.assign(_t, patch);
  DB.corrections.push(c);`,
    expectFail: 'оригинал записи НЕ переписан ни разу',
  },
];

const run = (bundle) => new Promise(res => {
  const p = spawn(process.execPath, [SPEC], {
    cwd: join(DIR, '..'),
    env: { ...process.env, CORRECTIONS_BUNDLE: bundle },
  });
  let out = '';
  p.stdout.on('data', d => { out += d; });
  p.stderr.on('data', d => { out += d; });
  p.on('close', code => res({ code, out }));
});

let pass = 0, fail = 0;
const ok = (cond, msg, detail) => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); if (detail) console.log('      ' + String(detail).split('\n').join('\n      ')); }
};

console.log('\n── ИСПРАВЛЕНИЯ mutation sanity: каждая снятая защита обязана уронить свой сценарий ──');

for (const m of MUTANTS) {
  if (!src.includes(m.find)) {
    ok(false, `[${m.id}] якорь мутации найден в собранном бандле`,
      `не найдено:\n${m.find}\nProduction изменился — мутацию нужно обновить.`);
    continue;
  }
  const file = join(DIST_DIR, `_corr-mutant-${m.id}.html`);
  let mutated = src.replace(m.find, m.replace);
  // Некоторым мутациям нужны две согласованные правки: снять один страж
  // мало, если рядом стоит второй — иначе мутант нейтрализован.
  if (m.extra) {
    if (!mutated.includes(m.extra.find)) {
      ok(false, `[${m.id}] второй якорь мутации найден в бандле`, `не найдено:\n${m.extra.find}`);
      continue;
    }
    mutated = mutated.replace(m.extra.find, m.extra.replace);
  }
  await writeFile(file, mutated);
  const { code, out } = await run(file);
  await rm(file, { force: true });
  const reds = out.split('\n').filter(l => l.trimStart().startsWith('✗')).map(l => l.trim());
  const hitExpected = reds.some(l => l.includes(m.expectFail));
  ok(code !== 0 && hitExpected,
    `[${m.id}] ${m.what} → сценарий «${m.expectFail}» покраснел (${reds.length} провалов)`,
    code === 0 ? 'ПРОВЕРКА ЛОЖНОЗЕЛЁНАЯ: защита снята, но вся сюита прошла.'
      : hitExpected ? null
        : `Сюита упала, но НЕ на ожидаемом сценарии. Красные:\n${reds.slice(0, 6).join('\n') || '(нет)'}`);
}

console.log(`\nИСПРАВЛЕНИЯ mutation sanity: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
