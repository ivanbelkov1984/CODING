// VARIANT B — MUTATION SANITY для явной update-семантики.
//
// Ломается РОВНО ОДНА защита в собранном бандле — обязан упасть именно тот
// сценарий updateSemantics.spec.mjs, который её сторожит.

import { readFile, writeFile, rm } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

const DIR = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(DIR, '..', 'dist');
const DIST = join(DIST_DIR, 'app.html');
const SPEC = join(DIR, 'updateSemantics.spec.mjs');

const src = await readFile(DIST, 'utf8');

const MUTANTS = [
  {
    // Раздел 3 owner decision: локальные правки нельзя затирать молча.
    id: 'local-edit-guard-forced-safe',
    what: 'детектор локальных правок снят — любая правка считается «нетронуто», источник затирает её',
    find: '  const userUntouched = rawUntouched && !corrFieldsTouched.length && !corrConflicted && !corrBroken;',
    replace: '  const userUntouched = true;',
    expectFail: 'локальная правка import-owned поля + изменение источника → конфликт',
  },
  {
    // Раздел 5: claim safety on update.
    id: 'claim-escalation-allowed-on-update',
    what: 'эскалация claim-слоя до факта при update разрешена',
    find: '  const escalated = extUpdateClaimEscalation(oldExt, prov);',
    replace: '  const escalated = [];',
    expectFail: 'обновлением ЗАПРЕЩЕНО (update-rejected)',
  },
  {
    // Раздел 9: optimistic concurrency.
    id: 'concurrency-check-removed',
    what: 'commit не сверяет запись с предпросмотром — устаревший apply затирает молча',
    find: '      if (extCanonicalJson(extPickFields(rec, u.expectedFields)) !== extCanonicalJson(u.expectedValues)) {\n        throw new Error(`запись ${u.coll}#${u.id} изменилась после предпросмотра — обнови предпросмотр и подтверди заново`);\n      }',
    replace: '',
    expectFail: 'apply устаревшего предпросмотра НЕ затирает молча',
  },
  {
    // Owner blocker 2: отсутствие выбора НЕ является решением. Мутант
    // объявляет все конфликты «решёнными» — commit перестаёт отклонять
    // пакеты с нерешёнными конфликтами, и NEW протаскивает пакет в журнал.
    id: 'unresolved-treated-as-decided',
    what: 'нерешённый конфликт считается решённым — пакет проходит в журнал без явного выбора',
    find: "  const unresolvedConflicts = conflictItems.filter(x => selConflicts[x.n] !== 'keep' && selConflicts[x.n] !== 'override');",
    replace: '  const unresolvedConflicts = [];',
    expectFail: 'ручной импорт смешанного пакета без решения отклонён',
  },
  {
    // Owner blocker 1: commit-guard update-rejected. Даже при снятом
    // feed-гейте ручной пакет с эскалацией не может попасть в журнал.
    id: 'update-rejected-commit-guard-removed',
    what: 'commit пропускает пакет с update-rejected — отклонённое обновление проглатывается журналом',
    find: "  const rejectedUpdates = plan.items.filter(i => i.status === 'update-rejected');\n  if (rejectedUpdates.length) {",
    replace: "  const rejectedUpdates = plan.items.filter(i => i.status === 'update-rejected');\n  if (false) {",
    expectFail: 'ручной импорт пакета с update-rejected отклонён целиком',
  },
  {
    // Owner blocker 1+2: feed-гейт терминальности моста. Без него
    // conflict-only пакет проходит как noop и чекпойнтится.
    id: 'bridge-terminality-gate-removed',
    what: 'мост применяет подачу с нерешёнными конфликтами/отклонёнными обновлениями',
    find: '  if (blockedRejected || blockedConflicts || blockedStale || blockedOrder || blockedVersion) {',
    replace: '  if (false) {',
    expectFail: 'мост с неразрешённым конфликтом останавливает подачу',
  },
  {
    // Owner blocker 2: terminal resolution provenance. Без записи решения
    // keep-local не терминален и конфликт возвращается вечно.
    id: 'resolution-provenance-dropped',
    what: 'явное keep-local не записывает решение — та же версия источника конфликтует вечно',
    find: '  ext.localResolutions = [...(Array.isArray(ext.localResolutions) ? ext.localResolutions : []), {\n    entityHash: u.newEntityHash, packageHash: u.packageHash, resolvedAt: nowISO(),\n  }].slice(-EXT_REVISIONS_MAX);',
    replace: '  ;',
    expectFail: 'replay после keep-local → existing',
  },
  {
    // Volatile-поля: повторный импорт не сдвигает даты на день импорта.
    id: 'volatile-pin-removed',
    what: 'volatile-поля (date/timestamp) переписываются днём импорта при update без даты в payload',
    find: '  const vol = EXT_VOLATILE_WHEN_ABSENT[type];\n  if (!vol || !curRec) return;',
    replace: '  return;',
    expectFail: 'volatile-поле date сохранено при update',
  },
  {
    // Устранённый дефект: планы feed на независимых клонах.
    id: 'shared-feed-candidate-removed',
    what: 'пакеты feed планируются на независимых клонах — один sourceId в двух пакетах дублируется',
    find: '    const plan = await extBuildPlan(pkgText, { db: sharedDb, provIdx: sharedIdx, feedTouched: sharedTouched });',
    replace: '    const plan = await extBuildPlan(pkgText);',
    expectFail: 'sourceId в двух пакетах одного feed',
  },
  {
    // Раздел 1: содержимое версии — часть entityHash.
    id: 'entity-version-hash-ignores-content',
    what: 'хеш версии игнорирует содержимое — изменение источника невидимо (P3 возвращается)',
    find: '    data: extPickData(e),\n    claimClass: claims.primary,',
    replace: '    data: null,\n    claimClass: claims.primary,',
    expectFail: 'изменённый payload того же sourceId → CHANGED',
  },
  {
    // Раздел 4: revision provenance обязателен.
    id: 'revision-provenance-dropped',
    what: 'обновление не оставляет revision provenance',
    find: '  ext.revisions = [...(Array.isArray(ext.revisions) ? ext.revisions : []), rev].slice(-EXT_REVISIONS_MAX);',
    replace: '',
    expectFail: 'revision provenance: какие поля',
  },
  {
    // Раздел 3: user-owned поля не входят в снимок импорта.
    id: 'user-fields-become-import-owned',
    what: 'user-owned поля (links/media) объявлены import-owned — правка пользователя блокирует update',
    find: "  insight: Object.freeze(['tag', 'title', 'body']),",
    replace: "  insight: Object.freeze(['tag', 'title', 'body', 'links', 'media']),",
    expectFail: 'правка user-owned полей НЕ мешает безопасному update',
  },
];

const run = (bundle) => new Promise(res => {
  const p = spawn(process.execPath, [SPEC], {
    cwd: join(DIR, '..'),
    env: { ...process.env, FINALA_BUNDLE: bundle },
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

console.log('\n── VARIANT B mutation sanity: каждая снятая защита обязана уронить свой сценарий ──');

for (const m of MUTANTS) {
  if (!src.includes(m.find)) {
    ok(false, `[${m.id}] якорь мутации найден в собранном бандле`,
      `не найдено:\n${m.find}\nProduction изменился — мутацию нужно обновить.`);
    continue;
  }
  const file = join(DIST_DIR, `_updsem-mutant-${m.id}.html`);
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

console.log(`\nVARIANT B mutation sanity: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
