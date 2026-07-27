// ─────────────────────────────────────────────────────────────────────────
//  wave2-health-backup.test.mjs — Wave 2 (issue #150): encrypted portable
//  backup/restore roundtrip fidelity for labObservations/healthDocuments,
//  including exact media bytes/MIME through the real IndexedDB-media
//  pipeline (planMedia/writeStagedMedia). Uses the SAME production
//  adapter/core/orchestrator as wave1-backup-roundtrip.test.mjs (fakes below
//  are fakes of browser primitives, not of adapter/restore logic).
//  Synthetic data only. Run: node tests/wave2-health-backup.test.mjs
// ─────────────────────────────────────────────────────────────────────────

import { BackupError, decryptEnvelope, serializeEnvelope } from '../backup/backup-core.mjs';
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
function makeMedia(init = {}) {
  const m = new Map(Object.entries(init));
  return { get: async id => (m.has(id) ? m.get(id) : undefined), put: async (id, val) => { m.set(id, val); }, del: async id => { m.delete(id); }, keys: async () => [...m.keys()] };
}
const NOW = '2026-07-27T12:00:00.000Z';

// id — namespaced строки (lab:.../healthDoc:...), как их реально генерирует
// psyUid() в app.js (тот же collision-safety принцип, что и psyLinks/
// relationshipContexts в Wave 1, issue #148/#149).
// 1×1 PNG (валидный base64) — image-вложение; owner review (PR #151, дефект
// 4) также требует доказательство для НЕ-image вложений (application/pdf),
// которые в production идут через blobToDataURL() БЕЗ canvas-реэнкода —
// поэтому второе media-вложение ниже — синтетический PDF (type:'file').
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const PDF_BYTES_B64 = Buffer.from('%PDF-1.4\n%%EOF').toString('base64');
const mediaKey = 'm_lab_scan_1';
const mediaKeyPdf = 'm_lab_scan_2_pdf';
const labObservations = [
  { id: 'lab:m1', testName: 'Гемоглобин', valueText: '145', valueNumber: 145, unit: 'г/л', referenceText: '130-160', collectedAt: '2026-07-20', resultedAt: null, laboratory: 'Инвитро', note: '', media: [mediaKey, mediaKeyPdf], privacyClass: 'sensitive', createdAt: NOW, day: '2026-07-20', sv: 4, _u: 1 },
];
const healthDocuments = [
  { id: 'healthDoc:m1', title: 'Выписка', kind: 'discharge', documentDate: '2026-07-15', provider: 'Поликлиника №1', note: '', media: [mediaKey], privacyClass: 'sensitive', createdAt: NOW, day: '2026-07-15', sv: 4, _u: 1 },
];

function seed() {
  const storage = makeStorage({
    [KEYS.PKEY]: JSON.stringify([{ id: 'pA', name: 'Alice', color: '#1056CC' }]),
    [KEYS.AKEY]: 'pA',
    [KEYS.db('pA')]: JSON.stringify({
      meds: [{ id: 100, name: 'Витамин D', active: true, createdAt: NOW, day: '2026-07-27' }],
      labObservations, healthDocuments,
      __ts: 123,
    }),
    [KEYS.cfg('pA')]: JSON.stringify({ userName: 'Alice', domainLabel: 'Книга', aiModel: 'claude-opus-4-8' }),
  });
  const media = makeMedia({
    [mediaKey]: { data: 'data:image/png;base64,' + PNG_1PX, type: 'image', createdAt: NOW },
    [mediaKeyPdf]: { data: 'data:application/pdf;base64,' + PDF_BYTES_B64, type: 'file', createdAt: NOW },
  });
  return { storage, media };
}

async function main() {
  const { storage, media } = seed();
  const adapter = createBackupAdapter({ storage, media, now: () => NOW });

  // 1) data-only bundle carries labObservations/healthDocuments (metadata),
  //    но БЕЗ media-ссылок (data-only намеренно снимает media refs — только
  //    complete-режим несёт байты вложений).
  const { payload: dataOnlyPayload } = await adapter.buildBundle({ id: 'pA', mode: 'data-only' });
  ok(Array.isArray(dataOnlyPayload.db.labObservations) && dataOnlyPayload.db.labObservations.length === 1, 'data-only bundle carries labObservations');
  ok(Array.isArray(dataOnlyPayload.db.healthDocuments) && dataOnlyPayload.db.healthDocuments.length === 1, 'data-only bundle carries healthDocuments');
  ok(!('media' in dataOnlyPayload.db.labObservations[0]), 'data-only bundle strips media refs from labObservations (по контракту)');

  // 2) complete bundle несёт canonical media bytes/MIME — и для image (PNG),
  //    и для file/PDF (owner review, PR #151, дефект 4: PDF идёт через
  //    blobToDataURL() без canvas-реэнкода, поэтому его bytes ДОЛЖНЫ остаться
  //    точными на всём пути backup/restore).
  const { payload } = await adapter.buildBundle({ id: 'pA', mode: 'complete' });
  ok(Array.isArray(payload.media) && payload.media.length === 2, 'complete bundle carries exactly 2 media items (PNG + PDF)');
  const pngItem = payload.media.find(m => m.id === mediaKey);
  const pdfItem = payload.media.find(m => m.id === mediaKeyPdf);
  ok(pngItem && pngItem.mime === 'image/png', 'complete bundle: PNG media id/MIME сохранены как есть (image/png)');
  ok(pdfItem && pdfItem.mime === 'application/pdf', 'complete bundle: PDF media id/MIME сохранены как есть (application/pdf)');
  ok(payload.db.labObservations[0].media.includes(mediaKey) && payload.db.labObservations[0].media.includes(mediaKeyPdf) && payload.db.healthDocuments[0].media[0] === mediaKey, 'complete bundle: labObservations/healthDocuments сохраняют media-ссылки на те же id');

  // 3) Encrypt → decrypt roundtrip (PBKDF2 600k + AES-GCM-256) сохраняет
  //    новые коллекции и media байты без потерь.
  const password = 'test-passphrase-wave2';
  const { encryptPayload } = await import('../backup/backup-core.mjs');
  const env = await encryptPayload(payload, password);
  const decrypted = await decryptEnvelope(env, password);
  ok(JSON.stringify(decrypted.db.labObservations) === JSON.stringify(payload.db.labObservations), 'encrypted roundtrip: labObservations byte-identical after decrypt');
  ok(JSON.stringify(decrypted.db.healthDocuments) === JSON.stringify(payload.db.healthDocuments), 'encrypted roundtrip: healthDocuments byte-identical after decrypt');
  ok(JSON.stringify(decrypted.media) === JSON.stringify(payload.media), 'encrypted roundtrip: media bytes/MIME byte-identical after decrypt');

  // 4) Wrong password fails closed.
  let wrongPasswordFailed = false;
  try { await decryptEnvelope(env, 'wrong-password'); } catch (e) { wrongPasswordFailed = e && e.code === 'DECRYPT_FAILED'; }
  ok(wrongPasswordFailed, 'wrong password on a bundle containing labObservations/healthDocuments fails closed (DECRYPT_FAILED)');

  // 5) Live DB/media в storage не мутируются построением bundle (read-only export).
  const liveDb = JSON.parse(storage.getItem(KEYS.db('pA')));
  ok(Array.isArray(liveDb.labObservations) && liveDb.labObservations.length === 1, 'buildBundle does not mutate live labObservations in storage');
  const liveMedia = await media.get(mediaKey);
  ok(liveMedia && liveMedia.data === 'data:image/png;base64,' + PNG_1PX, 'buildBundle does not mutate live media blob');

  // 6) Owner-review pattern (Wave 1, PR #149): real production restore
  //    orchestrator (restoreBackup + createBackupAdapter), не только
  //    buildBundle+decrypt. Restore в FRESH назначение ("new" mode) —
  //    labObservations/healthDocuments и их media должны прийти EXACT bytes/MIME.
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
    ok(Array.isArray(restoredDb.labObservations) && restoredDb.labObservations.length === 1 && restoredDb.labObservations[0].id === 'lab:m1', 'production restore: labObservations в восстановленном профиле (string id сохранён)');
    ok(Array.isArray(restoredDb.healthDocuments) && restoredDb.healthDocuments.length === 1 && restoredDb.healthDocuments[0].id === 'healthDoc:m1', 'production restore: healthDocuments в восстановленном профиле (string id сохранён)');
    const restoredPngKey = restoredDb.healthDocuments[0].media[0];
    const restoredPngMedia = await dest.media.get(restoredPngKey);
    ok(!!restoredPngMedia, 'production restore: PNG media blob присутствует в целевом IndexedDB-store');
    ok(restoredPngMedia && restoredPngMedia.data === 'data:image/png;base64,' + PNG_1PX, 'production restore: PNG media bytes точно совпадают с исходником (exact bytes)');
    ok(restoredPngMedia && /^data:image\/png;base64,/.test(restoredPngMedia.data), 'production restore: PNG MIME сохранён (image/png)');
    ok(restoredDb.labObservations[0].media.includes(restoredPngKey), 'production restore: labObservations и healthDocuments после restore по-прежнему ссылаются на ОДНУ и ту же PNG-media (reuse, не дублирование)');
    const restoredPdfKey = restoredDb.labObservations[0].media.find(k => k !== restoredPngKey);
    const restoredPdfMedia = await dest.media.get(restoredPdfKey);
    ok(!!restoredPdfMedia, 'production restore: PDF media blob присутствует в целевом IndexedDB-store');
    ok(restoredPdfMedia && restoredPdfMedia.data === 'data:application/pdf;base64,' + PDF_BYTES_B64, 'production restore: PDF (не-image, type=file) bytes точно совпадают с исходником — без canvas-реэнкода');
    ok(restoredPdfMedia && restoredPdfMedia.type === 'file', 'production restore: PDF сохранён с type="file" (не image/audio)');
    ok(hydrated && hydrated.profileId === 'pNew1' && hydrated.mode === 'new', 'production restore: onActivated-гидратация вызвана с корректным profileId/mode');
  }

  // 7) Restore failure (wrong password) ДО любой мутации — существующий
  //    целевой профиль (со своими labObservations/healthDocuments) остаётся
  //    полностью нетронутым, без orphan-профиля и без частично записанной media.
  {
    const dest = {
      storage: makeStorage({
        [KEYS.PKEY]: JSON.stringify([{ id: 'pOld', name: 'Old', color: '#1056CC' }]),
        [KEYS.AKEY]: 'pOld',
        [KEYS.db('pOld')]: JSON.stringify({ labObservations: [{ id: 'lab:old1', testName: 'untouched', valueText: '1', valueNumber: 1, unit: '', referenceText: '', collectedAt: '2026-01-01', laboratory: '', note: '', media: [], privacyClass: 'sensitive', createdAt: NOW, day: '2026-01-01', sv: 4, _u: 1 }], healthDocuments: [] }),
        [KEYS.cfg('pOld')]: JSON.stringify({ userName: 'Old' }),
      }),
      media: makeMedia(),
    };
    const destAdapter = createBackupAdapter({ storage: dest.storage, media: dest.media, now: () => NOW });
    const beforeDb = dest.storage.getItem(KEYS.db('pOld'));
    const beforeMediaKeys = (await dest.media.keys()).slice().sort();
    const file = { size: 0, text: async () => serializeEnvelope(env) };
    file.size = (await file.text()).length;
    await throwsCode(
      () => restoreBackup({ adapter: destAdapter, file, password: 'WRONG-password', mode: 'new', now: () => NOW }),
      'DECRYPT_FAILED',
      'production restore: неверный пароль — DECRYPT_FAILED до любой мутации',
    );
    const afterDb = dest.storage.getItem(KEYS.db('pOld'));
    ok(beforeDb === afterDb, 'production restore: неудачный restore (wrong password) не изменил существующий профиль pOld (labObservations/healthDocuments нетронуты)');
    const afterMediaKeys = (await dest.media.keys()).slice().sort();
    ok(JSON.stringify(beforeMediaKeys) === JSON.stringify(afterMediaKeys), 'production restore: неудачный restore не создал/не изменил media (никакой частично записанной media)');
    const profiles = JSON.parse(dest.storage.getItem(KEYS.PKEY));
    ok(profiles.length === 1 && profiles[0].id === 'pOld', 'production restore: не создан «осиротевший» новый профиль после ошибки');
  }

  // 8) Повреждённый файл (не JSON/невалидный envelope) — тоже fail closed,
  //    без мутации существующего профиля.
  {
    const dest = {
      storage: makeStorage({
        [KEYS.PKEY]: JSON.stringify([{ id: 'pOld2', name: 'Old2', color: '#1056CC' }]),
        [KEYS.AKEY]: 'pOld2',
        [KEYS.db('pOld2')]: JSON.stringify({ labObservations: [], healthDocuments: [] }),
        [KEYS.cfg('pOld2')]: JSON.stringify({ userName: 'Old2' }),
      }),
      media: makeMedia(),
    };
    const destAdapter = createBackupAdapter({ storage: dest.storage, media: dest.media, now: () => NOW });
    const beforeDb = dest.storage.getItem(KEYS.db('pOld2'));
    const corruptFile = { size: 11, text: async () => 'not-json-{{{' };
    await throwsCode(
      () => restoreBackup({ adapter: destAdapter, file: corruptFile, password: 'anything', mode: 'new', now: () => NOW }),
      'BAD_FILE_JSON',
      'production restore: повреждённый файл (не JSON) — fail closed до любой мутации',
    );
    const afterDb = dest.storage.getItem(KEYS.db('pOld2'));
    ok(beforeDb === afterDb, 'production restore: повреждённый файл не изменил существующий профиль pOld2');
  }

  console.log(out.join('\n'));
  console.log(`\nWave 2 health backup roundtrip: ${pass}/${pass + fail} passed`);
  if (fail) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
