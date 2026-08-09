// Wave 7 (issue #162) — MUTATION SANITY для Psychology Workspace.
//
// Зелёная сюита сама по себе НЕ доказывает, что проверки что-то ловят. Здесь
// берётся собранный production-бандл, ломается РОВНО ОДНА защита, и требуется,
// чтобы упал именно тот сценарий, который эту защиту сторожит.

import { readFile, writeFile, rm } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

const DIR = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(DIR, '..', 'dist');
const DIST = join(DIST_DIR, 'app.html');
const SPEC = join(DIR, 'wave7-psychology-workspace.spec.mjs');

const src = await readFile(DIST, 'utf8');

const MUTANTS = [
  {
    id: 'formulation-versioning',
    what: 'снято версионирование: новая формулировка молча переписывает активную',
    find: "    DB.psyFormulations.forEach(f => {\n      if (f && f.status === 'active' && f.id !== built.rec.id) { f.status = 'superseded'; f._u = Date.now(); }\n    });",
    replace: '    DB.psyFormulations.length = 0;',
    expectFail: 'история версий восстанавливается целиком',
  },
  {
    id: 'fake-numeric-observation',
    what: 'разрешено «измерение» из ai-источника',
    find: "    if (input.source != null && !PSY_OBS_SOURCES.includes(input.source)) {",
    replace: '    if (false) {',
    expectFail: 'источник «ai» для измерения отклонён',
  },
  {
    id: 'missing-becomes-zero',
    what: 'отсутствующее числовое значение превращается в 0',
    find: '      valueNumber: hasNum ? input.valueNumber : null,',
    replace: '      valueNumber: hasNum ? input.valueNumber : 0,',
    expectFail: 'valueNumber = null, а не 0',
  },
  {
    id: 'not-done-equals-not-helpful',
    what: 'снят инвариант not_done ≠ not_helpful',
    find: "    if (adherence === 'not_done' && ['not_helpful', 'probably_helpful', 'helpful_in_context', 'promising'].includes(outcomeClass)) {",
    replace: '    if (false) {',
    expectFail: 'невыполненную технику нельзя объявить бесполезной',
  },
  {
    id: 'hypothesis-promotion',
    what: 'рабочую гипотезу разрешено записать как user_fact',
    find: "      if (cc === 'user_fact') errors.push(`formulation.hypotheses[${i}]: рабочая гипотеза не может быть записана как user_fact`);",
    replace: '      if (false) errors.push(`x`);',
    expectFail: 'тихое повышение статуса невозможно',
  },
  {
    id: 'meta-in-event-sources',
    what: 'мета-коллекция Волны 7 добавлена в EVENT_SOURCES',
    find: 'const EVENT_SOURCES = {\n  moments:',
    replace: "const EVENT_SOURCES = {\n  psyInterventionEpisodes: rec => ({ tags: ['psy:intervention'], importance: 1 }),\n  moments:",
    expectFail: 'не входит в EVENT_SOURCES',
  },
  {
    id: 'v1-backward-compat',
    what: 'v1 молча получает психологические типы (ломается обратная совместимость)',
    find: '  return format === EXT_WORK_FORMAT_V2 ? EXT_TARGETS_V2 : EXT_TARGETS;',
    replace: '  return EXT_TARGETS_V2;',
    expectFail: 'психологический тип в v1-пакете отклонён',
  },
  {
    id: 'importer-bypasses-write-contract',
    what: 'импортер пишет мимо общего валидатора (своя схема)',
    find: "    if (!built.ok) return { reject: built.errors.slice(0, 3).join('; ') };",
    replace: '    if (!built.ok) return { rec: { ...built.rec } };',
    expectFail: 'общий write contract',
  },
  {
    id: 'orphan-refs-allowed',
    what: 'висячие ссылки перестают отклоняться',
    find: "    if (!exists) { errors.push(`${path}[${i}]: запись ${coll}#${r.id} не существует — «висячая» ссылка отклонена`); return; }",
    replace: '    if (!exists) { out.push({ coll, id: r.id }); return; }',
    expectFail: 'отклонена fail-closed',
  },
  {
    id: 'recovery-lock-removed',
    what: 'снята recovery-блокировка ручной записи психологии',
    find: "  if (typeof isWriteLocked === 'function' && isWriteLocked()) {",
    replace: '  if (false) {',
    expectFail: 'recovery lock блокирует и ручную запись',
  },
  {
    id: 'privacy-class-downgrade',
    what: 'privacyClass берётся из payload и может быть понижен',
    find: "    privacyClass: 'sensitive',\n  };\n}",
    replace: "    privacyClass: input.privacyClass || 'sensitive',\n  };\n}",
    expectFail: 'privacyClass всегда sensitive',
  },
  // ── Owner review 5233978523 ──────────────────────────────────────
  {
    id: 'no-two-pass-candidate',
    what: 'собранная запись не попадает в кандидата — внутрипакетные ссылки перестают резолвиться',
    find: '    if (!Array.isArray(db[coll])) db[coll] = [];\n    db[coll].push(built.rec);',
    replace: '    if (!Array.isArray(db[coll])) db[coll] = [];',
    expectFail: 'созданы formulation+goal+2 интервенции+3 наблюдения+review',
  },
  {
    id: 'unresolved-refs-not-fatal',
    what: 'нерезолвящаяся внутрипакетная ссылка перестаёт отклонять пакет целиком',
    find: '  if (Array.isArray(plan.unresolvedRefs) && plan.unresolvedRefs.length) {',
    replace: '  if (false) {',
    expectFail: 'коммит пакета с битой ссылкой отклонён целиком',
  },
  {
    id: 'psy-save-rollback-partial',
    what: 'откат при сбое persist снова «pop() последней записи» — supersede прежней формулировки остаётся',
    find: '    touched.forEach(c => { DB[c] = snapshot[c]; });',
    replace: '    DB[coll].pop();',
    expectFail: 'psyFormulations побайтово идентичны состоянию до попытки',
  },
  {
    id: 'dbcount-ignores-psychology',
    what: 'dbCount перестаёт считать психологические записи',
    find: "   'psyFormulations','psyGoals','psyInterventionEpisodes','psyObservations','psyReviews']",
    replace: '   ]',
    expectFail: 'dbCount() считает психологические записи',
  },
];

const run = (bundle) => new Promise(res => {
  const p = spawn(process.execPath, [SPEC], {
    cwd: join(DIR, '..'),
    env: { ...process.env, WAVE7_BUNDLE: bundle },
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

console.log('\n── Wave 7 mutation sanity: каждая снятая защита обязана уронить свой сценарий ──');

for (const m of MUTANTS) {
  if (!src.includes(m.find)) {
    ok(false, `[${m.id}] якорь мутации найден в собранном бандле`,
      `не найдено:\n${m.find}\nProduction изменился — мутацию нужно обновить, иначе проверка бессмысленна.`);
    continue;
  }
  const file = join(DIST_DIR, `_wave7-mutant-${m.id}.html`);
  await writeFile(file, src.replace(m.find, m.replace));

  const { code, out } = await run(file);
  await rm(file, { force: true });

  const reds = out.split('\n').filter(l => l.trimStart().startsWith('✗')).map(l => l.trim());
  const hitExpected = reds.some(l => l.includes(m.expectFail));

  ok(code !== 0 && hitExpected,
    `[${m.id}] ${m.what} → сценарий «${m.expectFail}» покраснел (${reds.length} провалов)`,
    code === 0
      ? 'ПРОВЕРКА ЛОЖНОЗЕЛЁНАЯ: защита снята, но вся сюита прошла.'
      : hitExpected ? null
        : `Сюита упала, но НЕ на ожидаемом сценарии. Красные:\n${reds.slice(0, 6).join('\n') || '(нет)'}`);
}

console.log(`\nWave 7 mutation sanity: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
