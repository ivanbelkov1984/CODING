// ─────────────────────────────────────────────────────────────────────────
//  wave1-backup-roundtrip.test.mjs — Wave 1 (issue #148): encrypted portable
//  backup/restore roundtrip fidelity for the new psyLinks/relationshipContexts
//  collections. Uses the SAME production adapter/core as backup-adapter.test.mjs
//  (fakes below are fakes of browser primitives, not of adapter logic).
//  Synthetic data only. Run: node tests/wave1-backup-roundtrip.test.mjs
// ─────────────────────────────────────────────────────────────────────────

import { encryptPayload, decryptEnvelope } from '../backup/backup-core.mjs';
import { createBackupAdapter, KEYS } from '../backup/backup-adapter.mjs';

let pass = 0, fail = 0; const out = [];
function ok(c, n) { if (c) { pass++; out.push('  ✓ ' + n); } else { fail++; out.push('  ✗ ' + n); } }

function makeStorage(init = {}) {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, String(v)]));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, keys: () => [...m.keys()] };
}
function makeMedia() {
  const m = new Map();
  return { get: async id => (m.has(id) ? m.get(id) : undefined), put: async (id, val) => { m.set(id, val); }, del: async id => { m.delete(id); }, keys: async () => [...m.keys()] };
}
const NOW = '2026-07-27T12:00:00.000Z';

const psyLinks = [
  { id: 1, fromColl: 'moments', fromId: 100, toColl: 'whys', toId: 200, relation: 'moment_to_why', createdAt: NOW, day: '2026-07-27', sv: 3, _u: 1, source: 'user', acceptedAt: NOW, confidenceLabel: null },
  { id: 2, fromColl: 'whys', fromId: 200, toColl: 'insights', toId: 300, relation: 'why_to_insight', createdAt: NOW, day: '2026-07-27', sv: 3, _u: 2, source: 'user', acceptedAt: NOW, confidenceLabel: null },
  { id: 3, fromColl: 'insights', fromId: 300, toColl: 'relationshipContexts', toId: 400, relation: 'record_to_relationship', createdAt: NOW, day: '2026-07-27', sv: 3, _u: 3, source: 'user', acceptedAt: NOW, confidenceLabel: 'medium' },
];
const relationshipContexts = [
  { id: 400, label: 'Мама', roleOrRelation: 'родитель', status: 'active', note: '', privacyClass: 'sensitive', createdAt: NOW, day: '2026-07-27', sv: 3, _u: 1 },
];

function seed() {
  const storage = makeStorage({
    [KEYS.PKEY]: JSON.stringify([{ id: 'pA', name: 'Alice', color: '#1056CC' }]),
    [KEYS.AKEY]: 'pA',
    [KEYS.db('pA')]: JSON.stringify({
      moments: [{ id: 100, valence: 60, activation: 40, createdAt: NOW, day: '2026-07-27' }],
      whys: [{ id: 200, symptom: 'тест', action: 'сделать паузу', createdAt: NOW, day: '2026-07-27' }],
      insights: [{ id: 300, title: 'x', body: 'y', createdAt: NOW, day: '2026-07-27' }],
      psyLinks, relationshipContexts,
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

  console.log(out.join('\n'));
  console.log(`\nWave 1 backup roundtrip: ${pass}/${pass + fail} passed`);
  if (fail) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
