// FINAL A — MUTATION SANITY для universal external sources bridge.
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
    // BLOCKER 2: атомарность previewed feed — сбой пакета перестаёт прерывать
    // feed, применяется «всё остальное» + swap кандидата (partial import).
    id: 'feed-rollback-removed',
    what: 'при ошибке пакета feed не прерывается — кандидат применяется частично (partial import)',
    find: '      return { ok: false, rolledBack: true, errors: [`пакет ${b.pkgIndex + 1}: ${res.error} — feed откатен целиком, canonical не изменён`], results };',
    replace: '      continue;',
    expectFail: 'byte-identical после сбоя',
  },
  {
    // BLOCKER 2: ошибка commit пакета игнорируется — feed «проходит».
    id: 'commit-failure-ignored',
    what: 'сбой commit пакета замалчивается, feed отчитывается успехом',
    find: '    const res = extCommitPlan(b.plan, null, { db: candidate, deferPersist: true, provIdx: commitIdx });\n    if (!res.ok) {',
    replace: '    const res = extCommitPlan(b.plan, null, { db: candidate, deferPersist: true, provIdx: commitIdx });\n    if (false) {',
    expectFail: 'apply останавливается на конфликтном пакете',
  },
  {
    // FINAL contract: cursor-after-commit ordering.
    id: 'cursor-advanced-on-failed-feed',
    what: 'чекпойнт продвигается за ошибочный пакет (cursor до успешного commit)',
    find: '      extConnUpdate(connId, c => { c.status = \'error_requires_user\'; c.checkpoint.lastError = `пакет ${b.pkgIndex + 1}: ${res.error} — feed откатен целиком, canonical не изменён`; });',
    replace: '      extConnUpdate(connId, c => { c.status = \'error_requires_user\'; c.checkpoint.lastError = `пакет ${b.pkgIndex + 1}: ${res.error} — feed откатен целиком, canonical не изменён`; c.checkpoint.committedPackageHashes = [...(c.checkpoint.committedPackageHashes || []), b.hash].slice(-EXT_CONN_MAX_HASHES); });',
    expectFail: 'чекпойнт НЕ продвинут за ошибочный пакет',
  },
  {
    // BLOCKER 4: результат сохранения чекпойнта игнорируется.
    id: 'checkpoint-persist-ignored',
    what: 'сбой сохранения чекпойнта замалчивается как full success',
    find: '  if (!ck.ok) {',
    replace: '  if (false && !ck.ok) {',
    expectFail: 'canonical применён, checkpoint не сохранён (degraded)',
  },
  {
    // BLOCKER 3 + FINAL contract: claim promotion guard (полное снятие).
    id: 'claim-promotion-allowed',
    what: 'слова ассистента можно объявить фактом (guard снят целиком)',
    find: "    if (e.textOrigin === 'assistant_interpretation') {",
    replace: '    if (false) {',
    expectFail: 'отклонён fail-closed (новое правило A7)',
  },
  {
    // BLOCKER 3: guard откатывается к проверке только primary claimClass.
    id: 'claim-promotion-primary-only',
    what: 'guard проверяет только primary — фактический слой проходит в claimClasses[]',
    find: '      const claimLayers = [e.claimClass, ...(Array.isArray(e.claimClasses) ? e.claimClasses : [])].filter(Boolean);',
    replace: '      const claimLayers = [e.claimClass].filter(Boolean);',
    expectFail: 'full-set guard, не только primary',
  },
  {
    id: 'noop-swallows-conflicts',
    what: 'конфликтный пакет проглатывается как no-op с продвижением чекпойнта',
    find: "    const hasProblems = (counts.conflict || 0) > 0 || (counts.invalid || 0) > 0 ||\n      (counts.unsupported || 0) > 0 || (counts['update-rejected'] || 0) > 0 ||\n      (b.plan.unresolvedRefs || []).length > 0;",
    replace: '    const hasProblems = false;',
    expectFail: 'apply останавливается на конфликтном пакете',
  },
  {
    // FINAL contract: sourceId dedup (stale cursor опирается на ledger).
    id: 'ledger-skip-removed',
    what: 'пропуск известных пакетов держится только на чекпойнте (ledger игнорируется)',
    find: '    const inLedger = (DB.externalWorkSessions || []).some(s => s && s.contentHash === hash);',
    replace: '    const inLedger = false;',
    expectFail: 'stale/потерянный cursor безопасен',
  },
  {
    // BLOCKER 4: checkpoint recovery — догон по ledger снят.
    id: 'checkpoint-catchup-removed',
    what: 'apply не догоняет потерянный чекпойнт по ledger',
    find: '      if (!b.inCheckpoint) doneHashes.push(b.hash);',
    replace: '      ;',
    expectFail: 'checkpoint recovery',
  },
  {
    id: 'error-hidden-as-ready',
    what: 'ошибка чтения маскируется под «всё в порядке»',
    find: "    extConnUpdate(connId, c => { c.status = 'error_requires_user'; c.checkpoint.lastError = parsed.errors[0]; });",
    replace: "    extConnUpdate(connId, c => { c.status = 'ready'; c.checkpoint.lastError = null; });",
    expectFail: 'ошибка разбора видна статусом',
  },
  {
    // FINAL contract: disappearance != delete.
    id: 'unavailable-deletes-canonical',
    what: 'недоступность источника удаляет canonical записи',
    find: "function extConnMarkUnavailable(id, note) {\n  return extConnUpdate(id, c => {",
    replace: "function extConnMarkUnavailable(id, note) {\n  DB.insights = [];\n  return extConnUpdate(id, c => {",
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
    expectFail: 'same sourceId из другой сессии',
  },
  {
    // Universal bridge: канал/контейнер НЕ могут подменить семантическую
    // идентичность записи.
    id: 'channel-identity-override',
    what: 'канал/модуль источника подмешивается в identity (та же запись из другого канала становится новой)',
    find: '      .map(r => ({ ref: r, key: extProvenanceKey(coll, r.sourceId) }))',
    replace: "      .map(r => ({ ref: r, key: extProvenanceKey(coll, r.sourceId + '|' + ((pkg.source || {}).module || '')) }))",
    // Красный сценарий — уже на preview: «тот же sourceId другим каналом»
    // становится «новой записью». Commit-время дополнительно ловит дубль
    // fail-closed (re-check против живого provenance-индекса).
    expectFail: 'тот же sourceId другим каналом',
  },
  {
    // Universal bridge: контейнер источника (файл Drive/архив) — provenance.
    id: 'container-becomes-identity',
    what: 'контейнер источника (файл/архив) работает как identity — записи из одного файла склеиваются',
    find: '    const built = EXT_ADAPTERS[e.type](e, extPickData(e), ctx);',
    replace: "    if ((db[coll] || []).some(r => r && r.ext && r.ext.sourceLabel && r.ext.sourceLabel === ctx.srcLabel)) { items[eIdx] = { ...base, status: 'existing-by-provenance', reason: 'container-dedup', merge: null }; refToRec.set(prov.clientRef, { coll, id: 'cont' }); continue; }\n    const built = EXT_ADAPTERS[e.type](e, extPickData(e), ctx);",
    expectFail: 'ДВЕ canonical записи',
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
