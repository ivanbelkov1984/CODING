// SOURCE REVISION ORDERING (§19) — MUTATION SANITY.
//
// Ломается РОВНО ОДНА защита в собранном бандле — обязан упасть именно тот
// сценарий revisionOrdering.spec.mjs, который её сторожит.

import { readFile, writeFile, rm } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

const DIR = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(DIR, '..', 'dist');
const DIST = join(DIST_DIR, 'app.html');
const SPEC = join(DIR, 'revisionOrdering.spec.mjs');

const src = await readFile(DIST, 'utf8');

const MUTANTS = [
  {
    // §3: known-old-hash защита снята — повтор старого экспорта становится
    // «обновлением» и откатывает canonical.
    id: 'known-old-guard-removed',
    what: 'известный исторический hash не распознаётся — старый экспорт откатывает запись',
    find: '    if (extKnownHistoricalHashes(oldExt).has(newEntityHash)) {',
    replace: '    if (false) {',
    expectFail: 'повтор старого экспорта → STALE_SOURCE_VERSION по known-old-hash',
  },
  {
    // §5/§6.C: меньший sequence принимается как более новый.
    id: 'older-revision-accepted',
    what: 'ревизия с меньшим sequence принимается (порядок игнорируется)',
    find: "    if (n.sequence < c.sequence) return 'older';",
    replace: "    if (n.sequence < c.sequence) return 'newer';",
    expectFail: 'ревизия с меньшим sequence → STALE',
  },
  {
    // §7: unknown order трактуется как безопасный CHANGED.
    id: 'unknown-order-accepted-as-changed',
    what: 'недоказуемый порядок версий применяется как обычный CHANGED',
    find: "  if (cmp !== 'newer') {\n    return {\n      ...base, status: 'order-unknown', update, merge: mergeInfo,",
    replace: "  if (false) {\n    return {\n      ...base, status: 'order-unknown', update, merge: mergeInfo,",
    expectFail: 'existing changed + нет ordering metadata → ORDER_UNKNOWN',
  },
  {
    // §6.E: одна ревизия — разное содержимое, конфликт игнорируется.
    id: 'revision-token-conflict-ignored',
    what: 'same revision + different hash проходит как обычное обновление',
    find: "  if (cmp === 'same') {",
    replace: '  if (false) {',
    expectFail: 'та же ревизия источника + другое содержимое → SOURCE_VERSION_CONFLICT',
  },
  {
    // §11: package array order объявляется временной истиной — stale из
    // ДРУГОЙ подачи «заменяется» как в-feed superseded и проглатывается.
    id: 'array-order-as-freshness',
    what: 'порядок пакетов используется как скрытая temporal truth (stale проглатывается как superseded)',
    find: '  const supersededHere = ctx.feedTouched && ctx.feedTouched.has(String(prov.sourceId));',
    replace: '  const supersededHere = true;',
    expectFail: 'stale-подача остановлена',
  },
  {
    // §10: различие нормализатора снято — смена парсера маскируется под
    // изменение источника (source-version-conflict вместо normalization).
    id: 'normalizer-distinction-removed',
    what: 'смена версии нормализатора выдаётся за изменение источника',
    find: '    if (oldNorm != null && oldNorm !== EXT_NORMALIZER_VERSION) {',
    replace: '    if (false) {',
    expectFail: 'та же ревизия + другой hash + другой normalizerVersion → NORMALIZATION_CHANGE',
  },
  {
    // §15: stale-пакет чекпойнтится (гейт терминальности игнорирует stale).
    id: 'stale-package-checkpointed',
    what: 'подача со stale-версиями проходит гейт и чекпойнтится',
    find: "  const blockedStale = cntOf('stale-source-version');",
    replace: '  const blockedStale = 0;',
    expectFail: 'stale-подача остановлена',
  },
  {
    // Commit-guard stale: даже мимо гейта stale не попадает в журнал.
    id: 'stale-commit-guard-removed',
    what: 'commit применяет stale-версию при явном выборе',
    find: "  const staleItems = plan.items.filter(i => i.status === 'stale-source-version');\n  if (staleItems.length) {",
    replace: "  const staleItems = plan.items.filter(i => i.status === 'stale-source-version');\n  if (false) {",
    expectFail: 'STALE полностью non-applicable',
  },
  {
    // §26: cross-profile ordering leak.
    id: 'cross-profile-revision-leak',
    what: 'все профили читают один ключ хранилища (ordering-состояние протекает)',
    find: "const dbKey   = id => 'arch5_db_'   + id;",
    replace: "const dbKey   = id => 'arch5_db_shared';",
    expectFail: 'не пересекает границу профиля',
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

console.log('\n── REVISION ORDERING mutation sanity ──');

for (const m of MUTANTS) {
  if (!src.includes(m.find)) {
    ok(false, `[${m.id}] якорь мутации найден в собранном бандле`,
      `не найдено:\n${m.find}\nProduction изменился — мутацию нужно обновить.`);
    continue;
  }
  const file = join(DIST_DIR, `_revord-mutant-${m.id}.html`);
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

console.log(`\nREVISION ORDERING mutation sanity: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
