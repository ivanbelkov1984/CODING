// Wave 8 (issue #163) — MUTATION SANITY для Adaptive Psychology Engine.
//
// Берётся собранный production-бандл, ломается РОВНО ОДНА защита, и требуется,
// чтобы упал именно тот сценарий, который эту защиту сторожит.

import { readFile, writeFile, rm } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

const DIR = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(DIR, '..', 'dist');
const DIST = join(DIST_DIR, 'app.html');
const SPEC = join(DIR, 'wave8-adaptive-engine.spec.mjs');

const src = await readFile(DIST, 'utf8');

const MUTANTS = [
  {
    id: 'safety-red-ignored',
    what: 'safety red перестаёт останавливать движок',
    find: "  if (safety.level === 'red') {",
    replace: '  if (false) {',
    expectFail: 'движок остановлен',
  },
  {
    id: 'receptivity-ignored',
    what: 'готовность пользователя игнорируется — техника навязывается',
    find: "  if (c.receptivity !== 'yes') {",
    replace: '  if (false) {',
    expectFail: 'нет готовности → ничего не предлагается',
  },
  {
    id: 'missing-arousal-becomes-zero',
    what: 'неизмеренное возбуждение трактуется как 0 в пороговом правиле',
    find: "      if (arousal == null) { matched = false; why.push('arousal не измерен — пороговое правило не применяется'); }",
    replace: '      if (false) { matched = false; }',
    expectFail: 'missing ≠ zero',
  },
  {
    id: 'adverse-priority-removed',
    what: 'нежелательные эффекты перестают быть приоритетнее улучшения',
    find: "  if (st.evaluable > 0 && st.adverse * 2 >= st.evaluable) return 'poorly_tolerated';",
    replace: '',
    expectFail: 'poorly_tolerated несмотря на позитивный исход',
  },
  {
    id: 'not-done-evaluated',
    what: 'невыполненные эпизоды участвуют в оценке исхода',
    find: "      const evaluable = ce.filter(e => e.adherence === 'done' || e.adherence === 'partial');",
    replace: '      const evaluable = ce;',
    expectFail: 'проблема выполнения',
  },
  {
    id: 'one-insight-promoted',
    what: 'один яркий эпизод повышается выше promising',
    find: "  if (st.positives >= 1 && st.negatives === 0) return 'promising';",
    replace: "  if (st.positives >= 1 && st.negatives === 0) return 'probably_helpful';",
    expectFail: 'максимум promising',
  },
  {
    id: 'personal-harm-ignored',
    what: 'counterproductive-опыт перестаёт исключать метод',
    find: "    if (ctxProf && ['counterproductive', 'unsafe_or_out_of_scope', 'poorly_tolerated'].includes(ctxProf.status)) {",
    replace: '    if (false) {',
    expectFail: 'counterproductive-опыт в этом контексте исключает метод',
  },
  {
    id: 'user-pref-ignored',
    what: 'жёсткое «не предлагать снова» игнорируется',
    find: '    if (ex.excluded) {',
    replace: '    if (false) {',
    expectFail: 'жёсткое пользовательское исключение',
  },
  {
    id: 'observational-causal',
    what: 'observational-дизайн получает причинный статус',
    find: "  const causalStatus = (causalCapable && !wasStopped && (exp.baselinePlan || {}).plannedPoints >= 3 && exp.fidelityPlan)\n    ? 'supported_within_design' : 'not_causal';",
    replace: "  const causalStatus = 'supported_within_design';",
    expectFail: 'НИКОГДА не эмитит причинный статус',
  },
  {
    id: 'consent-bypass',
    what: 'эксперимент создаётся без явного согласия',
    find: "  if (!input.consentConfirmed) errors.push('experiment: требуется явное согласие пользователя');",
    replace: '',
    expectFail: 'без явного согласия эксперимент не создаётся',
  },
  {
    id: 'baseline-gate-removed',
    what: 'причинный дизайн без baseline-плотности проходит',
    find: '  if (causalCapable && plannedPoints < 3) {',
    replace: '  if (false) {',
    expectFail: 'без baseline-плотности отклонён',
  },
  {
    id: 'history-rewritten',
    what: 'история эксперимента переписывается вместо дописывания',
    find: '  exp.history = [...(exp.history || []), { at: nowISO(), from: exp.status, to, note: psyStr(note, 500) || null }];',
    replace: '  exp.history = [{ at: nowISO(), from: exp.status, to, note: psyStr(note, 500) || null }];',
    expectFail: 'история дописывается, не переписывается',
  },
  {
    id: 'randomization-nondeterministic',
    what: 'рандомизация перестаёт быть воспроизводимой',
    find: '  const rnd = psyMulberry32(seed);',
    replace: '  const rnd = Math.random;',
    expectFail: 'один seed → одна и та же последовательность',
  },
  // ── Owner review 5238287152: external evidence schema ────────────
  {
    id: 'evidence-review-date-removed',
    what: 'у evidence-элемента исчезают reviewedAt/evidenceVersion',
    find: "      limitations: 'то, что помогает многим, не обязательно поможет именно тебе',\n      note: 'это общие данные, а не твой личный результат',\n      reviewedAt: PSY_EVIDENCE_REVIEWED_AT, evidenceVersion: 2 }] },",
    replace: "      limitations: 'то, что помогает многим, не обязательно поможет именно тебе',\n      note: 'это общие данные, а не твой личный результат' }] },",
    expectFail: 'соответствует схеме',
  },
  {
    id: 'evidence-stale-source',
    what: 'источник BA откатывается на отозванную CG90',
    find: "      ref: 'NICE NG222 — Depression in adults: treatment and management',\n      publisher: 'NICE', identifier: 'NG222', year: 2022,",
    replace: "      ref: 'NICE CG90 (депрессия у взрослых)',\n      publisher: 'NICE', identifier: 'CG90', year: 2009,",
    expectFail: 'NICE NG222',
  },
  {
    id: 'w8-meta-in-event-sources',
    what: 'psyAdaptivePlans добавлена в EVENT_SOURCES (двойной счёт)',
    find: 'const EVENT_SOURCES = {\n  moments:',
    replace: "const EVENT_SOURCES = {\n  psyAdaptivePlans: rec => ({ tags: ['psy:plan'], importance: 1 }),\n  moments:",
    expectFail: 'не входит в EVENT_SOURCES',
  },
  {
    id: 'delete-not-tombstoned',
    what: 'удаление эпизода без надгробия (воскреснет при sync)',
    find: '  const delSnap = JSON.parse(JSON.stringify(DB._del || {}));\n  tomb(id);\n  DB[coll].splice(idx, 1);',
    replace: '  const delSnap = JSON.parse(JSON.stringify(DB._del || {}));\n  DB[coll].splice(idx, 1);',
    expectFail: 'ставит надгробие',
  },
];

const run = (bundle) => new Promise(res => {
  const p = spawn(process.execPath, [SPEC], {
    cwd: join(DIR, '..'),
    env: { ...process.env, WAVE8_BUNDLE: bundle },
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

console.log('\n── Wave 8 mutation sanity: каждая снятая защита обязана уронить свой сценарий ──');

for (const m of MUTANTS) {
  if (!src.includes(m.find)) {
    ok(false, `[${m.id}] якорь мутации найден в собранном бандле`,
      `не найдено:\n${m.find}\nProduction изменился — мутацию нужно обновить, иначе проверка бессмысленна.`);
    continue;
  }
  const file = join(DIST_DIR, `_wave8-mutant-${m.id}.html`);
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

console.log(`\nWave 8 mutation sanity: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
