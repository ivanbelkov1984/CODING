// Wave 9 (issue #164) — MUTATION SANITY для Mind–Body Context Layer.
//
// Ломается РОВНО ОДНА защита в собранном бандле — обязан упасть именно тот
// сценарий, который её сторожит.

import { readFile, writeFile, rm } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

const DIR = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(DIR, '..', 'dist');
const DIST = join(DIST_DIR, 'app.html');
const SPEC = join(DIR, 'wave9-mind-body.spec.mjs');

const src = await readFile(DIST, 'utf8');

const MUTANTS = [
  {
    id: 'causal-wording-returns',
    what: 'текст ассоциации становится причинным («вызвано»)',
    find: "        safeReflectionText: `В ${best.n} из ${nEligible} эпизодов с темой «${th.ru}» (${best.ru}) также отмечалось: «${key}». Это повторяющееся совпадение в ваших записях; причинность не установлена.`,",
    replace: "        safeReflectionText: `Симптом «${key}» вызван темой «${th.ru}».`,",
    expectFail: 'язык совпадения, не причинности',
  },
  {
    id: 'fake-numeric-confidence',
    what: 'у ассоциации появляется произвольный confidence 0..1',
    find: '        engineVersion: MIND_BODY_ENGINE_VERSION,\n      });',
    replace: '        engineVersion: MIND_BODY_ENGINE_VERSION,\n        confidence: Math.min(1, best.n / Math.max(1, nEligible)),\n      });',
    expectFail: 'никакого произвольного confidence',
  },
  {
    id: 'ace-style-multiplier',
    what: 'исторический «риск-множитель» усиливает evidenceState (ACE-паттерн)',
    find: "      let evidenceState = 'insufficient';\n      if (best.n >= 3 && nEligible >= 4 && best.n * 2 >= nEligible) evidenceState = 'repeated_association';\n      else if (best.n === 2) evidenceState = 'candidate';",
    replace: "      let evidenceState = 'insufficient';\n      if (best.n >= 1) evidenceState = 'repeated_association';",
    expectFail: 'insufficient',
  },
  {
    // Скаляр физически не может стать EVENT_SOURCE (движок упал бы на нём) —
    // реальный риск из issue #164: коллекция-ИСТОЧНИК ассоциаций начинает
    // сама генерировать события → двойное evidence одного смысла.
    id: 'mb-source-as-event-source',
    what: 'психологический источник ассоциаций добавлен в EVENT_SOURCES (двойное evidence)',
    find: 'const EVENT_SOURCES = {\n  moments:',
    replace: "const EVENT_SOURCES = {\n  psyObservations: rec => ({ tags: ['psy:obs'], importance: 1 }),\n  moments:",
    expectFail: 'двойного счёта нет',
  },
  {
    id: 'red-flag-gate-removed',
    what: 'медицинские red-flag симптомы попадают в психологические ассоциации',
    find: '  const usable = health.filter(h => !h.redFlag);',
    replace: '  const usable = health;',
    expectFail: 'red-flag симптом НЕ участвует',
  },
  {
    id: 'symptoms-merged-by-text',
    what: 'разные симптомы сливаются по началу текста',
    find: "function mbSymptomKey(name) { return String(name || '').trim().toLowerCase(); }",
    replace: "function mbSymptomKey(name) { return String(name || '').trim().toLowerCase().slice(0, 6); }",
    expectFail: 'РАЗДЕЛЬНО',
  },
  {
    id: 'lag-direction-collapsed',
    what: 'направление лага перестаёт различаться',
    find: "      const lagDirection = best.n === 0 ? 'mixed'\n        : others.some(w => w.n === best.n)\n          ? 'mixed'\n          : best.id === 'same_day' ? 'concurrent' : best.id;",
    replace: "      const lagDirection = 'concurrent';",
    expectFail: 'психика → тело различается',
  },
  {
    id: 'confounders-dropped',
    what: 'confounder-флаги перестают сохраняться',
    find: "      confounders.push('сон, нагрузка и внешние события не контролировались');",
    replace: '      confounders.length = 0;',
    expectFail: 'confounder-флаги',
  },
  {
    id: 'hidden-ignored',
    what: 'скрытые пользователем ассоциации снова показываются',
    find: "  const visible = res.associations.filter(a =>\n    (a.evidenceState === 'repeated_association' || a.evidenceState === 'context_dependent') &&\n    !hidden.includes(a.associationId));",
    replace: "  const visible = res.associations.filter(a =>\n    (a.evidenceState === 'repeated_association' || a.evidenceState === 'context_dependent'));",
    expectFail: 'скрыть конкретную ассоциацию',
  },
  {
    id: 'muted-theme-ignored',
    what: 'запрещённая тема продолжает отслеживаться',
    find: '    if (muted.includes(th.theme)) return;',
    replace: '    if (false) return;',
    expectFail: 'не отслеживается вовсе',
  },
];

const run = (bundle) => new Promise(res => {
  const p = spawn(process.execPath, [SPEC], {
    cwd: join(DIR, '..'),
    env: { ...process.env, WAVE9_BUNDLE: bundle },
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

console.log('\n── Wave 9 mutation sanity: каждая снятая защита обязана уронить свой сценарий ──');

for (const m of MUTANTS) {
  if (!src.includes(m.find)) {
    ok(false, `[${m.id}] якорь мутации найден в собранном бандле`,
      `не найдено:\n${m.find}\nProduction изменился — мутацию нужно обновить.`);
    continue;
  }
  const file = join(DIST_DIR, `_wave9-mutant-${m.id}.html`);
  await writeFile(file, src.replace(m.find, m.replace));
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

console.log(`\nWave 9 mutation sanity: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
