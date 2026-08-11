// FINAL A — MUTATION SANITY для continuous bridge.
//
// Ломается РОВНО ОДНА защита в собранном бандле — обязан упасть именно тот
// сценарий finalA-bridge.spec.mjs, который её сторожит.

import { readFile, writeFile, rm } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

const DIR = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(DIR, '..', 'dist');
const DIST = join(DIST_DIR, 'app.html');
const SPEC = join(DIR, 'finalA-bridge.spec.mjs');

const src = await readFile(DIST, 'utf8');

const MUTANTS = [
  {
    // FINAL contract: cursor-after-commit ordering.
    id: 'cursor-before-commit',
    what: 'чекпойнт двигается ДО commit пакета',
    find: '    const res = extCommitPlan(b.plan, null);\n    if (!res.ok) {',
    replace: "    extConnUpdate(connId, c => { c.checkpoint.committedPackageHashes = [...(c.checkpoint.committedPackageHashes || []), b.hash].slice(-EXT_CONN_MAX_HASHES); });\n    const res = extCommitPlan(b.plan, null);\n    if (!res.ok) {",
    expectFail: 'чекпойнт не двигался',
  },
  {
    // FINAL contract: claim promotion guard.
    id: 'claim-promotion-allowed',
    what: 'слова ассистента можно объявить фактом пользователя',
    find: "    if (e.claimClass === 'user_fact' && e.textOrigin === 'assistant_interpretation') {",
    replace: '    if (false) {',
    expectFail: 'отклонён fail-closed (новое правило A7)',
  },
  {
    id: 'noop-swallows-conflicts',
    what: 'конфликтный пакет проглатывается как no-op с продвижением чекпойнта',
    find: "    const hasProblems = (b.plan.counts.conflict || 0) > 0 || (b.plan.counts.invalid || 0) > 0 ||\n      (b.plan.counts.unsupported || 0) > 0 || (b.plan.unresolvedRefs || []).length > 0;",
    replace: '    const hasProblems = false;',
    expectFail: 'apply останавливается на конфликтном пакете',
  },
  {
    // FINAL contract: sourceId dedup (stale cursor опирается на ledger).
    id: 'ledger-skip-removed',
    what: 'пропуск известных пакетов держится только на чекпойнте (ledger игнорируется)',
    find: '    const skipped = committed.has(plan.packageHash) || plan.alreadyImported;',
    replace: '    const skipped = committed.has(plan.packageHash);',
    expectFail: 'stale/потерянный cursor безопасен',
  },
  {
    id: 'error-hidden-as-connected',
    what: 'ошибка разбора маскируется под «всё в порядке»',
    find: "    extConnUpdate(connId, c => { c.status = 'error_requires_user'; c.checkpoint.lastError = parsed.errors[0]; });",
    replace: "    extConnUpdate(connId, c => { c.status = 'connected'; c.checkpoint.lastError = null; });",
    expectFail: 'ошибка разбора видна статусом',
  },
  {
    // FINAL contract: disappearance != delete.
    id: 'revoke-deletes-canonical',
    what: 'отзыв доступа к источнику удаляет canonical записи',
    find: "function extConnMarkRevoked(id) { return extConnUpdate(id, c => { c.status = 'permission_revoked';",
    replace: "function extConnMarkRevoked(id) { DB.insights = []; return extConnUpdate(id, c => { c.status = 'permission_revoked';",
    expectFail: 'НЕ удаляет canonical записи',
  },
  {
    id: 'forget-deletes-canonical',
    what: '«забыть подключение» стирает импортированные записи',
    find: '  tomb(id);\n  DB.externalConnections.splice(idx, 1);',
    replace: '  tomb(id);\n  DB.externalConnections.splice(idx, 1);\n  DB.insights = []; DB.dreams = [];',
    expectFail: 'forget не тронул canonical записи',
  },
  {
    // FINAL contract: text-dedup prohibition.
    id: 'text-dedup-introduced',
    what: 'записи дедуплицируются по одинаковому тексту',
    find: '    const built = EXT_ADAPTERS[e.type](e, extPickData(e), ctx);',
    replace: "    if ((db.insights || []).some(r => r && r.body === ((extPickData(e) || {}).body || null) && r.body)) { items[eIdx] = { ...base, status: 'existing-by-provenance', reason: 'text-dedup', merge: null }; refToRec.set(prov.clientRef, { coll, id: 'txt' }); continue; }\n    const built = EXT_ADAPTERS[e.type](e, extPickData(e), ctx);",
    expectFail: 'виден как НОВЫЙ',
  },
  {
    // FINAL contract: provenance preservation.
    id: 'provenance-dropped',
    what: 'импортированная запись теряет ext-provenance',
    find: '    built.rec.ext = prov;',
    replace: '',
    expectFail: 'existing-by-provenance, НЕ новая запись',
  },
  {
    // FINAL contract: profile isolation.
    id: 'profile-isolation-broken',
    what: 'все профили читают один ключ хранилища',
    find: "const dbKey   = id => 'arch5_db_'   + id;",
    replace: "const dbKey   = id => 'arch5_db_shared';",
    expectFail: 'не пересекают границу профиля',
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

console.log('\n── FINAL A mutation sanity: каждая снятая защита обязана уронить свой сценарий ──');

for (const m of MUTANTS) {
  if (!src.includes(m.find)) {
    ok(false, `[${m.id}] якорь мутации найден в собранном бандле`,
      `не найдено:\n${m.find}\nProduction изменился — мутацию нужно обновить.`);
    continue;
  }
  const file = join(DIST_DIR, `_finalA-mutant-${m.id}.html`);
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

console.log(`\nFINAL A mutation sanity: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
