// ─────────────────────────────────────────────────────────────────────────
//  finalA-backup-roundtrip.test.mjs — FINAL A (universal bridge): роундтрип
//  коллекции externalConnections (подключения + checkpoint c
//  committedPackageHashes) через зашифрованную резервную копию.
//
//  Только синтетические данные. Запуск: node tests/finalA-backup-roundtrip.test.mjs
// ─────────────────────────────────────────────────────────────────────────

import { BackupError, decryptEnvelope, encryptPayload, serializeEnvelope } from '../backup/backup-core.mjs';
import { createBackupAdapter, KEYS } from '../backup/backup-adapter.mjs';
import { restoreBackup } from '../backup/backup-restore.mjs';

let pass = 0, fail = 0; const out = [];
function ok(c, n) { if (c) { pass++; out.push('  ✓ ' + n); } else { fail++; out.push('  ✗ ' + n); } }
async function throwsCode(fn, code, n) {
  try { await fn(); ok(false, n + ' (не бросил)'); }
  catch (e) { ok(e instanceof BackupError && e.code === code, n); }
}
function makeStorage(init = {}) {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, String(v)]));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, keys: () => [...m.keys()] };
}
function makeMedia() {
  const m = new Map();
  return { get: async id => m.get(id), put: async (id, v) => { m.set(id, v); }, del: async id => { m.delete(id); }, keys: async () => [...m.keys()] };
}
const NOW = '2026-08-11T09:00:00.000Z';
const EXT_UPD = { sourceId: 'test-fa-src-1', origin: 'external_import', entityHash: 'aa'.repeat(32), importHash: 'bb'.repeat(32), importedFields: ['tag', 'title', 'body'], importUpdatedAt: '2026-08-05T10:00:00.000Z', revisions: [{ at: '2026-08-05T10:00:00.000Z', packageHash: 'cc'.repeat(32), sessionRef: 'TEST-FA-REV-S1', prevEntityHash: 'dd'.repeat(32), entityHash: 'aa'.repeat(32), updatedFields: ['body'], mode: 'update' }], localResolutions: [{ entityHash: 'ee'.repeat(32), packageHash: 'ff'.repeat(32), resolvedAt: '2026-08-06T10:00:00.000Z' }] };
const CONNS = [
  {
    id: 'extConn:test-fa-backup-1', label: 'TEST-FA-источник-A', kind: 'chatgpt_export',
    status: 'ready', createdAt: '2026-08-01T10:00:00.000Z', day: '2026-08-01', sv: 9, _u: 5,
    privacyClass: 'sensitive',
    checkpoint: { committedPackageHashes: ['aaaa1111', 'bbbb2222'], lastRefreshAt: '2026-08-02T10:00:00.000Z', lastError: null },
    stats: { refreshes: 2, packagesCommitted: 2, recordsCreated: 3 },
    container: { kind: 'chatgpt_export_archive', id: 'TEST-FA-ARCHIVE-1', label: 'TEST-FA-архив' },
    sourceStatusNote: null,
  },
  {
    id: 'extConn:test-fa-backup-2', label: 'TEST-FA-источник-B', kind: 'google_drive_export',
    status: 'error_requires_user', createdAt: '2026-08-03T10:00:00.000Z', day: '2026-08-03', sv: 9, _u: 6,
    privacyClass: 'sensitive',
    checkpoint: { committedPackageHashes: ['cccc3333'], lastRefreshAt: '2026-08-04T10:00:00.000Z', lastError: 'TEST-FA-ошибка разбора' },
    stats: { refreshes: 1, packagesCommitted: 1, recordsCreated: 1 },
    container: { kind: 'google_drive_file', id: 'TEST-FA-CONTAINER-9', label: 'TEST-FA-выгрузка' },
    sourceStatusNote: 'TEST-FA-источник недоступен',
  },
];

async function main() {
  const storage = makeStorage({
    [KEYS.PKEY]: JSON.stringify([{ id: 'pA', name: 'Alice', color: '#1056CC' }]),
    [KEYS.AKEY]: 'pA',
    [KEYS.db('pA')]: JSON.stringify({
      externalConnections: CONNS,
      // Variant B: снимки версии/импорта и revision provenance обязаны пережить
      // зашифрованный роундтрип byte-identical — иначе replay после restore
      // не даст NEW 0 / CHANGED 0.
      insights: [{ id: 7101, body: 'TEST-FA-импортированная-запись', day: '2026-08-01', ext: EXT_UPD }],
      __ts: 42,
    }),
    [KEYS.cfg('pA')]: JSON.stringify({ userName: 'Alice' }),
  });
  const adapter = createBackupAdapter({ storage, media: makeMedia(), now: () => NOW });

  // 1. data-only bundle несёт подключения + checkpoint byte-identical.
  const { payload } = await adapter.buildBundle({ id: 'pA', mode: 'data-only' });
  ok(JSON.stringify(payload.db.externalConnections) === JSON.stringify(CONNS),
    'data-only bundle: externalConnections (checkpoint, статусы, hashes) byte-identical');
  ok(JSON.stringify(payload.db.insights[0].ext) === JSON.stringify(EXT_UPD),
    'data-only bundle: ext-provenance + снимки версии/импорта + revisions сохранены');

  // 2. Encrypted roundtrip.
  const password = 'test-passphrase-finalA';
  const env = await encryptPayload(payload, password);
  const dec = await decryptEnvelope(env, password);
  ok(JSON.stringify(dec.db.externalConnections) === JSON.stringify(CONNS),
    'encrypted roundtrip: подключения и checkpoint byte-identical');

  // 3. В сериализованном файле нет открытого содержимого.
  const serialized = serializeEnvelope(env);
  ok(!serialized.includes('TEST-FA-источник') && !serialized.includes('aaaa1111')
    && !serialized.includes('test-fa-src-1') && !serialized.includes('TEST-FA-ошибка')
    && !serialized.includes('TEST-FA-CONTAINER-9') && !serialized.includes('TEST-FA-ARCHIVE-1'),
    'в файле копии нет названий источников, hashes чекпойнта, sourceId, контейнеров и ошибок в открытом виде');

  // 4. Production restore восстанавливает подключения точно.
  const dest = { storage: makeStorage({ [KEYS.PKEY]: '[]', [KEYS.AKEY]: '' }), media: makeMedia() };
  const destAdapter = createBackupAdapter({ storage: dest.storage, media: dest.media, now: () => NOW });
  const file = { size: serialized.length, text: async () => serialized };
  const result = await restoreBackup({ adapter: destAdapter, file, password, mode: 'new', genProfileId: () => 'pNew1', now: () => NOW });
  const db = JSON.parse(dest.storage.getItem(KEYS.db('pNew1')));
  ok(result.ok && JSON.stringify(db.externalConnections) === JSON.stringify(CONNS),
    'production restore: источники, checkpoint, контейнеры и статус error_requires_user восстановлены точно');
  ok(JSON.stringify(db.insights[0].ext) === JSON.stringify(EXT_UPD),
    'production restore: ext-provenance, entityHash/importHash/importedFields и revisions пережили роундтрип byte-identical');

  // 5. Неверный пароль — DECRYPT_FAILED, ноль мутаций.
  const dest2 = { storage: makeStorage({ [KEYS.PKEY]: '[]', [KEYS.AKEY]: '' }), media: makeMedia() };
  const destAdapter2 = createBackupAdapter({ storage: dest2.storage, media: dest2.media, now: () => NOW });
  const before = JSON.stringify(dest2.storage.keys().sort());
  await throwsCode(() => restoreBackup({ adapter: destAdapter2, file, password: 'WRONG', mode: 'new', now: () => NOW }),
    'DECRYPT_FAILED', 'неверный пароль — DECRYPT_FAILED до мутации');
  ok(before === JSON.stringify(dest2.storage.keys().sort()), 'неудачный restore не создал ключей');

  // 6. Повреждённый файл — ноль мутаций.
  const corrupt = serialized.slice(0, Math.floor(serialized.length / 2)) + '#corrupt';
  const badFile = { size: corrupt.length, text: async () => corrupt };
  const before2 = JSON.stringify(dest2.storage.keys().sort());
  let threw = false;
  try { await restoreBackup({ adapter: destAdapter2, file: badFile, password, mode: 'new', now: () => NOW }); }
  catch (e) { threw = e instanceof BackupError; }
  ok(threw, 'повреждённый файл — BackupError fail-closed');
  ok(before2 === JSON.stringify(dest2.storage.keys().sort()), 'повреждённый restore не создал ключей');

  console.log(out.join('\n'));
  console.log(`\nFINAL A backup roundtrip: ${pass}/${pass + fail} passed`);
  if (fail) process.exit(1);
}
main().catch(e => { console.error(e); process.exit(1); });
