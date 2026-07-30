// ─────────────────────────────────────────────────────────────────────────
//  wave4-backup-roundtrip.test.mjs — Wave 4 (issue #152): encrypted portable
//  backup/restore roundtrip fidelity for DB.correlationSettings, the ONLY
//  persistent Wave 4 state (settings + dismissed-signature list — the
//  computed correlations/patterns themselves are never persisted, only
//  recomputed on demand from existing collections). Uses the SAME
//  production adapter/core/restore orchestrator as wave1-backup-roundtrip
//  and wave2-health-backup (fakes below are fakes of browser primitives,
//  not of adapter/restore logic). correlationSettings is a plain scalar
//  object (like DB.env/DB.vit) — no media, no id-collection collision
//  surface, so this file is deliberately narrower than Wave 2's.
//  Synthetic data only. Run: node tests/wave4-backup-roundtrip.test.mjs
// ─────────────────────────────────────────────────────────────────────────

import { BackupError, decryptEnvelope, encryptPayload, serializeEnvelope } from '../backup/backup-core.mjs';
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

const correlationSettings = { minSamples: 4, lagDays: 5, dismissed: ['emo:злость→symptom:напряжение в шее', 'sphere:работа:done→emo:усталость'] };

function seed() {
  const storage = makeStorage({
    [KEYS.PKEY]: JSON.stringify([{ id: 'pA', name: 'Alice', color: '#1056CC' }]),
    [KEYS.AKEY]: 'pA',
    [KEYS.db('pA')]: JSON.stringify({
      moments: [{ id: 1, valence: 20, activation: 70, emo: 'злость', createdAt: NOW, day: '2026-07-27' }],
      correlationSettings,
      __ts: 123,
    }),
    [KEYS.cfg('pA')]: JSON.stringify({ userName: 'Alice', domainLabel: 'Книга', aiModel: 'claude-opus-4-8' }),
  });
  return { storage, media: makeMedia() };
}

async function main() {
  const { storage, media } = seed();
  const adapter = createBackupAdapter({ storage, media, now: () => NOW });

  // 1) data-only bundle carries correlationSettings as-is (plain scalar, no
  //    media refs to strip — unlike Wave 2's array-collection records).
  const { payload: dataOnlyPayload } = await adapter.buildBundle({ id: 'pA', mode: 'data-only' });
  ok(JSON.stringify(dataOnlyPayload.db.correlationSettings) === JSON.stringify(correlationSettings), 'data-only bundle carries correlationSettings byte-identical');

  // 2) complete bundle also carries it unchanged (no media involved at all).
  const { payload } = await adapter.buildBundle({ id: 'pA', mode: 'complete' });
  ok(JSON.stringify(payload.db.correlationSettings) === JSON.stringify(correlationSettings), 'complete bundle carries correlationSettings byte-identical');
  ok(Array.isArray(payload.media) && payload.media.length === 0, 'complete bundle: no media items (correlationSettings has none)');

  // 3) Encrypt → decrypt roundtrip (PBKDF2 600k + AES-GCM-256) preserves
  //    correlationSettings without loss.
  const password = 'test-passphrase-wave4';
  const env = await encryptPayload(payload, password);
  const decrypted = await decryptEnvelope(env, password);
  ok(JSON.stringify(decrypted.db.correlationSettings) === JSON.stringify(payload.db.correlationSettings), 'encrypted roundtrip: correlationSettings byte-identical after decrypt');

  // 4) Wrong password fails closed.
  let wrongPasswordFailed = false;
  try { await decryptEnvelope(env, 'wrong-password'); } catch (e) { wrongPasswordFailed = e && e.code === 'DECRYPT_FAILED'; }
  ok(wrongPasswordFailed, 'wrong password on a bundle containing correlationSettings fails closed (DECRYPT_FAILED)');

  // 5) Live DB в storage не мутируется построением bundle (read-only export).
  const liveDb = JSON.parse(storage.getItem(KEYS.db('pA')));
  ok(JSON.stringify(liveDb.correlationSettings) === JSON.stringify(correlationSettings), 'buildBundle does not mutate live correlationSettings in storage');

  // 6) Production restore orchestrator (restoreBackup + createBackupAdapter),
  //    mode="new" (fresh profile) — correlationSettings, включая dismissed,
  //    должен прийти byte-identical (последний писатель по __ts — тот же
  //    scalar-merge паттерн, что и DB.env/DB.vit/psyAiConsent).
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
    ok(JSON.stringify(restoredDb.correlationSettings) === JSON.stringify(correlationSettings), 'production restore: correlationSettings (включая dismissed) в восстановленном профиле byte-identical');
    ok(hydrated && hydrated.profileId === 'pNew1' && hydrated.mode === 'new', 'production restore: onActivated-гидратация вызвана с корректным profileId/mode');
  }

  // 7) Restore failure (wrong password) ДО любой мутации — существующий
  //    целевой профиль (со своими correlationSettings) остаётся нетронутым.
  {
    const dest = {
      storage: makeStorage({
        [KEYS.PKEY]: JSON.stringify([{ id: 'pOld', name: 'Old', color: '#1056CC' }]),
        [KEYS.AKEY]: 'pOld',
        [KEYS.db('pOld')]: JSON.stringify({ correlationSettings: { minSamples: 3, lagDays: 7, dismissed: [] } }),
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
    ok(beforeDb === afterDb, 'production restore: неудачный restore (wrong password) не изменил существующий профиль pOld (correlationSettings нетронут)');
    const profiles = JSON.parse(dest.storage.getItem(KEYS.PKEY));
    ok(profiles.length === 1 && profiles[0].id === 'pOld', 'production restore: не создан «осиротевший» новый профиль после ошибки');
  }

  console.log(out.join('\n'));
  console.log(`\nWave 4 backup roundtrip: ${pass}/${pass + fail} passed`);
  if (fail) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
