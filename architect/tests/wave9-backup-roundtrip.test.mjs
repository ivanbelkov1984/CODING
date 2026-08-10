// ─────────────────────────────────────────────────────────────────────────
//  wave9-backup-roundtrip.test.mjs — Wave 9 (issue #164): роундтрип
//  скаляра mindBodySettings (единственное персистентное состояние слоя —
//  сами ассоциации derived и не хранятся).
//
//  Только синтетические данные. Запуск: node tests/wave9-backup-roundtrip.test.mjs
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
const NOW = '2026-08-10T14:00:00.000Z';
const SETTINGS = {
  hiddenAssociations: ['mb:uncertainty|TEST-W9-симптом'],
  mutedThemes: ['loss'],
  _u: 3,
};

async function main() {
  const storage = makeStorage({
    [KEYS.PKEY]: JSON.stringify([{ id: 'pA', name: 'Alice', color: '#1056CC' }]),
    [KEYS.AKEY]: 'pA',
    [KEYS.db('pA')]: JSON.stringify({ mindBodySettings: SETTINGS, symptoms: [{ id: 1, name: 'TEST-W9-симптом', day: '2026-03-01' }], __ts: 42 }),
    [KEYS.cfg('pA')]: JSON.stringify({ userName: 'Alice' }),
  });
  const adapter = createBackupAdapter({ storage, media: makeMedia(), now: () => NOW });

  const { payload } = await adapter.buildBundle({ id: 'pA', mode: 'data-only' });
  ok(JSON.stringify(payload.db.mindBodySettings) === JSON.stringify(SETTINGS),
    'data-only bundle: mindBodySettings включён byte-identical');

  const password = 'test-passphrase-wave9';
  const env = await encryptPayload(payload, password);
  const dec = await decryptEnvelope(env, password);
  ok(JSON.stringify(dec.db.mindBodySettings) === JSON.stringify(SETTINGS),
    'encrypted roundtrip: скрытые ассоциации и отключённые темы byte-identical');

  const serialized = serializeEnvelope(env);
  ok(!serialized.includes('TEST-W9-симптом') && !serialized.includes('uncertainty'),
    'в файле копии нет содержимого настроек в открытом виде');

  const dest = { storage: makeStorage({ [KEYS.PKEY]: '[]', [KEYS.AKEY]: '' }), media: makeMedia() };
  const destAdapter = createBackupAdapter({ storage: dest.storage, media: dest.media, now: () => NOW });
  const file = { size: serialized.length, text: async () => serialized };
  const result = await restoreBackup({ adapter: destAdapter, file, password, mode: 'new', genProfileId: () => 'pNew1', now: () => NOW });
  const db = JSON.parse(dest.storage.getItem(KEYS.db('pNew1')));
  ok(result.ok && JSON.stringify(db.mindBodySettings) === JSON.stringify(SETTINGS),
    'production restore: настройки восстановлены точно');

  const dest2 = { storage: makeStorage({ [KEYS.PKEY]: '[]', [KEYS.AKEY]: '' }), media: makeMedia() };
  const destAdapter2 = createBackupAdapter({ storage: dest2.storage, media: dest2.media, now: () => NOW });
  const before = JSON.stringify(dest2.storage.keys().sort());
  await throwsCode(() => restoreBackup({ adapter: destAdapter2, file, password: 'WRONG', mode: 'new', now: () => NOW }),
    'DECRYPT_FAILED', 'неверный пароль — DECRYPT_FAILED до мутации');
  ok(before === JSON.stringify(dest2.storage.keys().sort()), 'неудачный restore не создал ключей');

  console.log(out.join('\n'));
  console.log(`\nWave 9 backup roundtrip: ${pass}/${pass + fail} passed`);
  if (fail) process.exit(1);
}
main().catch(e => { console.error(e); process.exit(1); });
