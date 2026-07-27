// ─────────────────────────────────────────────────────────────────────────
//  wave1-backup-roundtrip.test.mjs — Wave 1 (issue #148): encrypted portable
//  backup/restore roundtrip fidelity for the new psyLinks/relationshipContexts
//  collections. Uses the SAME production adapter/core as backup-adapter.test.mjs
//  (fakes below are fakes of browser primitives, not of adapter logic).
//  Synthetic data only. Run: node tests/wave1-backup-roundtrip.test.mjs
// ─────────────────────────────────────────────────────────────────────────

import { BackupError, encryptPayload, decryptEnvelope, serializeEnvelope } from '../backup/backup-core.mjs';
import { createBackupAdapter, KEYS } from '../backup/backup-adapter.mjs';
import { restoreBackup } from '../backup/backup-restore.mjs';

let pass = 0, fail = 0; const out = [];
function ok(c, n) { if (c) { pass++; out.push('  ✓ ' + n); } else { fail++; out.push('  ✗ ' + n); } }
async function throwsCode(fn, code, n) {
  try { await fn(); ok(false, n + ' (не бросил, ожидался ' + code + ')'); return null; }
  catch (e) { ok(e instanceof BackupError && e.code === code, n + (e && e.code !== code ? ' (код ' + (e && e.code) + '/' + (e && e.message) + ')' : '')); return e; }
}

function makeStorage(init = {}) {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, String(v)]));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, keys: () => [...m.keys()] };
}
function makeMedia() {
  const m = new Map();
  return { get: async id => (m.has(id) ? m.get(id) : undefined), put: async (id, val) => { m.set(id, val); }, del: async id => { m.delete(id); }, keys: async () => [...m.keys()] };
}
const NOW = '2026-07-27T12:00:00.000Z';

// id — namespaced строки (psyLink:.../relctx:...), как их реально генерирует
// psyUid() в app.js (owner review, PR #149: голый Date.now() id для этих двух
// коллекций рисковал коллизией с raw-id любой другой коллекции в общем
// tombstone-механизме `DB._del`). Числовые id ниже (100/200/300) принадлежат
// НЕЗАТРОНУТЫМ этим фиксом legacy-коллекциям (moments/whys/insights).
const psyLinks = [
  { id: 'psyLink:m1', fromColl: 'moments', fromId: 100, toColl: 'whys', toId: 200, relation: 'moment_to_why', createdAt: NOW, day: '2026-07-27', sv: 3, _u: 1, source: 'user', acceptedAt: NOW, confidenceLabel: null },
  { id: 'psyLink:m2', fromColl: 'whys', fromId: 200, toColl: 'insights', toId: 300, relation: 'why_to_insight', createdAt: NOW, day: '2026-07-27', sv: 3, _u: 2, source: 'user', acceptedAt: NOW, confidenceLabel: null },
  { id: 'psyLink:m3', fromColl: 'insights', fromId: 300, toColl: 'relationshipContexts', toId: 'relctx:m1', relation: 'record_to_relationship', createdAt: NOW, day: '2026-07-27', sv: 3, _u: 3, source: 'user', acceptedAt: NOW, confidenceLabel: 'medium' },
];
const relationshipContexts = [
  { id: 'relctx:m1', label: 'Мама', roleOrRelation: 'родитель', status: 'active', note: '', privacyClass: 'sensitive', createdAt: NOW, day: '2026-07-27', sv: 3, _u: 1 },
];
const psyAiConsent = { on: true, acceptedAt: NOW, version: 'psy-ai-consent-v1', sv: 3, _u: 1 };

function seed() {
  const storage = makeStorage({
    [KEYS.PKEY]: JSON.stringify([{ id: 'pA', name: 'Alice', color: '#1056CC' }]),
    [KEYS.AKEY]: 'pA',
    [KEYS.db('pA')]: JSON.stringify({
      moments: [{ id: 100, valence: 60, activation: 40, createdAt: NOW, day: '2026-07-27' }],
      whys: [{ id: 200, symptom: 'тест', action: 'сделать паузу', createdAt: NOW, day: '2026-07-27' }],
      insights: [{ id: 300, title: 'x', body: 'y', createdAt: NOW, day: '2026-07-27' }],
      psyLinks, relationshipContexts, psyAiConsent,
      __ts: 123,
    }),
    [KEYS.cfg('pA')]: JSON.stringify({ userName: 'Alice', domainLabel: 'Книга', aiModel: 'claude-opus-4-8' }),
  });
  const media = makeMedia();
  return { storage, media };
}

async function main() {
  const { storage, media } = seed();
  const adapter = createBackupAdapter({ storage, media, now: () => NOW });

  // 1) data-only bundle carries psyLinks/relationshipContexts through generically
  //    (backup-core/backup-adapter treat DB collections opaquely — no allowlist
  //    of collection names to update).
  const { payload } = await adapter.buildBundle({ id: 'pA', mode: 'data-only' });
  ok(Array.isArray(payload.db.psyLinks) && payload.db.psyLinks.length === 3, 'data-only bundle carries all 3 psyLinks');
  ok(Array.isArray(payload.db.relationshipContexts) && payload.db.relationshipContexts.length === 1, 'data-only bundle carries relationshipContexts');
  ok(payload.db.psyLinks[2].relation === 'record_to_relationship', 'record_to_relationship link intact in bundle');

  // 2) Encrypt → decrypt roundtrip (PBKDF2 600k + AES-GCM-256) preserves the
  //    new collections byte-for-byte.
  const password = 'test-passphrase-wave1';
  const env = await encryptPayload(payload, password);
  const decrypted = await decryptEnvelope(env, password);
  ok(JSON.stringify(decrypted.db.psyLinks) === JSON.stringify(payload.db.psyLinks), 'encrypted roundtrip: psyLinks byte-identical after decrypt');
  ok(JSON.stringify(decrypted.db.relationshipContexts) === JSON.stringify(payload.db.relationshipContexts), 'encrypted roundtrip: relationshipContexts byte-identical after decrypt');

  // 3) Wrong password fails closed (does not silently return corrupted/partial data).
  let wrongPasswordFailed = false;
  try { await decryptEnvelope(env, 'wrong-password'); } catch (e) { wrongPasswordFailed = e && e.code === 'DECRYPT_FAILED'; }
  ok(wrongPasswordFailed, 'wrong password on a bundle containing psyLinks fails closed (DECRYPT_FAILED)');

  // 4) Live DB in storage is untouched by building a bundle (read-only export).
  const liveDb = JSON.parse(storage.getItem(KEYS.db('pA')));
  ok(Array.isArray(liveDb.psyLinks) && liveDb.psyLinks.length === 3, 'buildBundle does not mutate live psyLinks in storage');

  // 5) No secrets leak into the bundle even though psyLinks/relationshipContexts
  //    are sensitive collections.
  const text = JSON.stringify(payload);
  ok(!text.includes('apiUrl') && !text.includes('spaceKey'), 'bundle with psyLinks/relationshipContexts excludes device-local connection fields');

  // 6) Owner review (PR #149, point 4): real production restore orchestrator
  //    (restoreBackup + createBackupAdapter), not just buildBundle+decrypt.
  //    Restore into a FRESH destination ("new" mode) — psyLinks/
  //    relationshipContexts/psyAiConsent must land intact in the newly
  //    activated profile, without touching whatever else exists at the
  //    destination.
  {
    const dest = { storage: makeStorage({ [KEYS.PKEY]: '[]', [KEYS.AKEY]: '' }), media: makeMedia() };
    const destAdapter = createBackupAdapter({ storage: dest.storage, media: dest.media, now: () => NOW });
    const file = { size: 0, text: async () => serializeEnvelope(env) };
    file.size = (await file.text()).length;
    let hydrated = null;
    const result = await restoreBackup({
      adapter: destAdapter, file, password, mode: 'new',
      genProfileId: () => 'pNew1', now: () => NOW,
      onActivated: async ({ profileId, mode: m }) => { hydrated = { profileId, mode: m }; },
    });
    ok(result.ok && result.activated && result.committed, 'restoreBackup (production adapter, mode=new): commit успешен');
    const restoredDb = JSON.parse(dest.storage.getItem(KEYS.db('pNew1')));
    ok(Array.isArray(restoredDb.psyLinks) && restoredDb.psyLinks.length === 3, 'production restore: psyLinks (3) в восстановленном профиле');
    ok(Array.isArray(restoredDb.relationshipContexts) && restoredDb.relationshipContexts.length === 1 && restoredDb.relationshipContexts[0].id === 'relctx:m1', 'production restore: relationshipContexts в восстановленном профиле');
    ok(restoredDb.psyAiConsent && restoredDb.psyAiConsent.on === true, 'production restore: psyAiConsent (скаляр) в восстановленном профиле');
    ok(hydrated && hydrated.profileId === 'pNew1' && hydrated.mode === 'new', 'production restore: onActivated-гидратация вызвана с корректным profileId/mode');
  }

  // 7) Restore failure (wrong password) BEFORE any mutation — leaves any
  //    existing target profile completely untouched (no partial/corrupted
  //    profile with half-restored Wave 1 data).
  {
    const dest = {
      storage: makeStorage({
        [KEYS.PKEY]: JSON.stringify([{ id: 'pOld', name: 'Old', color: '#1056CC' }]),
        [KEYS.AKEY]: 'pOld',
        [KEYS.db('pOld')]: JSON.stringify({ insights: [{ id: 999, title: 'untouched' }], psyLinks: [], relationshipContexts: [] }),
        [KEYS.cfg('pOld')]: JSON.stringify({ userName: 'Old' }),
      }),
      media: makeMedia(),
    };
    const destAdapter = createBackupAdapter({ storage: dest.storage, media: dest.media, now: () => NOW });
    const beforeDb = dest.storage.getItem(KEYS.db('pOld'));
    const file = { size: 0, text: async () => serializeEnvelope(env) };
    file.size = (await file.text()).length;
    await throwsCode(
      () => restoreBackup({ adapter: destAdapter, file, password: 'WRONG-password', mode: 'new', now: () => NOW }),
      'DECRYPT_FAILED',
      'production restore: неверный пароль — DECRYPT_FAILED до любой мутации',
    );
    const afterDb = dest.storage.getItem(KEYS.db('pOld'));
    ok(beforeDb === afterDb, 'production restore: неудачный restore (wrong password) не изменил существующий профиль pOld (без частично восстановленных psyLinks)');
    const profiles = JSON.parse(dest.storage.getItem(KEYS.PKEY));
    ok(profiles.length === 1 && profiles[0].id === 'pOld', 'production restore: не создан «осиротевший» новый профиль после ошибки');
  }

  console.log(out.join('\n'));
  console.log(`\nWave 1 backup roundtrip: ${pass}/${pass + fail} passed`);
  if (fail) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
