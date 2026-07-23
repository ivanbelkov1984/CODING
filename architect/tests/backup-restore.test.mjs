// ─────────────────────────────────────────────────────────────────────────
//  backup-restore.test.mjs — focused regression для transactional restore
//  orchestrator (Slice 3). Гоняет ИМЕННО production restoreBackup + production
//  adapter. Fault injection — через подмену production-зависимостей (storage/
//  media примитивы или методы adapter), без альтернативного mock-алгоритма.
//  Синтетические данные. Запуск: node tests/backup-restore.test.mjs
// ─────────────────────────────────────────────────────────────────────────

import {
  BackupError, bytesToBase64, canonicalMediaBytes, sha256Hex,
  encryptPayload, serializeEnvelope,
} from '../backup/backup-core.mjs';
import { createBackupAdapter, KEYS } from '../backup/backup-adapter.mjs';
import { restoreBackup } from '../backup/backup-restore.mjs';

let pass = 0, fail = 0; const out = [];
function ok(c, n) { if (c) { pass++; out.push('  ✓ ' + n); } else { fail++; out.push('  ✗ ' + n); } }
async function throwsCode(fn, code, n) {
  try { await fn(); ok(false, n + ' (не бросил, ожидался ' + code + ')'); return null; }
  catch (e) { ok(e instanceof BackupError && e.code === code, n + (e && e.code !== code ? ' (код ' + (e && e.code) + '/' + (e && e.message) + ')' : '')); return e; }
}
async function throwsAny(fn, n) {
  try { await fn(); ok(false, n + ' (не бросил)'); return null; }
  catch (e) { ok(true, n); return e; }
}
const clone = o => JSON.parse(JSON.stringify(o));

// ── fakes браузерных примитивов ──
function makeStorage(init = {}) {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, String(v)]));
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    keys: () => [...m.keys()],
    _dump: () => JSON.stringify([...m.entries()].sort()),
  };
}
function makeMedia(init = {}) {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, clone(v)]));
  return {
    get: async id => (m.has(id) ? clone(m.get(id)) : undefined),
    put: async (id, val) => { m.set(id, clone(val)); },
    del: async id => { m.delete(id); },
    keys: async () => [...m.keys()],
    _dump: () => JSON.stringify([...m.entries()].map(([k, v]) => [k, JSON.stringify(v)]).sort()),
    _has: id => m.has(id),
    _get: id => JSON.stringify(m.get(id)),
  };
}
const state = (s, md) => s._dump() + '||' + md._dump();

const IMG = 'data:image/jpeg;base64,' + bytesToBase64(new Uint8Array([255, 216, 255, 224, 9, 9, 74, 70]));
const IMG_DIFF = 'data:image/jpeg;base64,' + bytesToBase64(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));

async function mediaItem(id, url, hashBad) {
  const { mime, bytes } = canonicalMediaBytes(url);
  return { id, mime, sha256: hashBad ? '0'.repeat(64) : await sha256Hex(bytes), bytes: bytesToBase64(bytes) };
}
async function mkPayload(mode = 'complete', opts = {}) {
  let media = [];
  const db = { insights: [{ id: 1, title: 'привет' }], dreams: [] };
  if (mode === 'complete') {
    media = [await mediaItem('m1', IMG, opts.hashBad)];
    db.insights[0].media = [opts.refBad ? 'mZ' : 'm1'];
  }
  return { payloadVersion: 1, app: 'architect', mode, createdAt: '2026-07-23T00:00:00.000Z', profileName: 'Restored', db, cfg: { userName: 'R', domainLabel: 'Книга' }, media };
}
const mkFile = async (payload, pw) => serializeEnvelope(await encryptPayload(payload, pw));

// Forge: файл с ПРОИЗВОЛЬНЫМ (в т.ч. схемно невалидным) payload — для теста
// "invalid payload — zero mutation" (обходит validatePayload на записи).
async function forgeFile(obj, pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj))));
  return JSON.stringify({ format: 'arch-backup', envelopeVersion: 1, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 600000, salt: bytesToBase64(salt) }, cipher: { name: 'AES-GCM', length: 256, iv: bytesToBase64(iv) }, ciphertext: bytesToBase64(ct) });
}

function freshDest() { return { storage: makeStorage(), media: makeMedia() }; }
function replaceDest() {
  return {
    storage: makeStorage({
      [KEYS.PKEY]: JSON.stringify([{ id: 'pOld', name: 'Old', color: '#1056CC' }]),
      [KEYS.AKEY]: 'pOld',
      [KEYS.db('pOld')]: JSON.stringify({ insights: [{ id: 99, title: 'old-data' }] }),
      [KEYS.cfg('pOld')]: JSON.stringify({ userName: 'Old', apiUrl: 'https://keep.example', spaceKey: 'KEEP_SPACE', lastSync: '2026-07-01T00:00:00.000Z' }),
      [KEYS.pass('pOld')]: 'OLD_PASSPHRASE',
    }),
    media: makeMedia(),
  };
}
const NOW = '2026-07-23T12:00:00.000Z';
const PW = 'correct horse battery staple';
const passthru = (s, md, over = {}) => { const a = createBackupAdapter({ storage: s, media: md, now: () => NOW, genMediaId: () => 'mgen0' }); return { ...a, ...over }; };

async function main() {
  // 1. successful restore as new profile
  {
    const { storage, media } = freshDest();
    const a = createBackupAdapter({ storage, media, now: () => NOW });
    const file = await mkFile(await mkPayload('complete'), PW);
    const r = await restoreBackup({ adapter: a, fileText: file, password: PW, mode: 'new', genProfileId: () => 'pNew', now: () => NOW });
    ok(r.ok && r.mode === 'new' && r.profileId === 'pNew' && r.activated, 'new: успех, профиль активирован');
    ok(a.getActiveId() === 'pNew', 'new: active = новый профиль');
    ok(a.listProfiles().some(p => p.id === 'pNew'), 'new: профиль в реестре');
    ok(media._has('m1') && a.readDB('pNew').insights[0].media.join() === 'm1', 'new: media записана и ссылка на месте');
    const cfg = a.readCFG('pNew');
    ok(cfg.apiUrl === '' && cfg.spaceKey === '' && cfg.lastSync === '', 'new: connection пустые/default (не унаследованы)');
    ok(storage.getItem(KEYS.pass('pNew')) === null && storage.getItem(KEYS.rec('pNew')) === null, 'new: секретные ключи из backup НЕ записаны');
  }
  // 2. successful replacement + connection preservation
  {
    const { storage, media } = replaceDest();
    const a = createBackupAdapter({ storage, media, now: () => NOW });
    const file = await mkFile(await mkPayload('data-only'), PW);
    const r = await restoreBackup({ adapter: a, fileText: file, password: PW, mode: 'replace', targetId: 'pOld', now: () => NOW });
    ok(r.ok && r.mode === 'replace' && r.profileId === 'pOld', 'replace: успех на выбранном профиле');
    ok(a.readDB('pOld').insights[0].title === 'привет', 'replace: данные заменены из backup');
    const cfg = a.readCFG('pOld');
    ok(cfg.apiUrl === 'https://keep.example' && cfg.spaceKey === 'KEEP_SPACE' && cfg.lastSync === '2026-07-01T00:00:00.000Z', 'replace: connection settings сохранены');
    ok(storage.getItem(KEYS.pass('pOld')) === 'OLD_PASSPHRASE', 'replace: локальный секрет не тронут');
    ok(a.listProfiles().length === 1 && a.listProfiles()[0].name === 'Old', 'replace: идентичность слота (name) сохранена, дублей нет');
  }
  // 3. wrong password — zero mutation
  {
    const { storage, media } = replaceDest();
    const a = createBackupAdapter({ storage, media, now: () => NOW });
    const file = await mkFile(await mkPayload('complete'), PW);
    const before = state(storage, media);
    await throwsCode(() => restoreBackup({ adapter: a, fileText: file, password: 'WRONG', mode: 'replace', targetId: 'pOld' }), 'DECRYPT_FAILED', 'wrong password → DECRYPT_FAILED');
    ok(state(storage, media) === before, 'wrong password: ноль мутаций');
  }
  // 4. corrupted ciphertext — zero mutation
  {
    const { storage, media } = freshDest();
    const a = createBackupAdapter({ storage, media, now: () => NOW });
    const env = JSON.parse(await mkFile(await mkPayload('complete'), PW));
    env.ciphertext = env.ciphertext.slice(0, 5) + (env.ciphertext[5] === 'A' ? 'B' : 'A') + env.ciphertext.slice(6);
    const before = state(storage, media);
    await throwsCode(() => restoreBackup({ adapter: a, fileText: JSON.stringify(env), password: PW, mode: 'new' }), 'DECRYPT_FAILED', 'corrupted ciphertext → DECRYPT_FAILED');
    ok(state(storage, media) === before, 'corrupted ciphertext: ноль мутаций');
  }
  // 5. invalid payload — zero mutation
  {
    const { storage, media } = freshDest();
    const a = createBackupAdapter({ storage, media, now: () => NOW });
    const file = await forgeFile({ payloadVersion: 1, app: 'architect', mode: 'data-only', createdAt: '2026-07-23T00:00:00.000Z', profileName: 'X', db: {}, cfg: {}, media: [], EVIL: 1 }, PW);
    const before = state(storage, media);
    await throwsCode(() => restoreBackup({ adapter: a, fileText: file, password: PW, mode: 'new' }), 'UNEXPECTED_FIELD', 'invalid payload → UNEXPECTED_FIELD');
    ok(state(storage, media) === before, 'invalid payload: ноль мутаций');
  }
  // 5b. manifest mismatch — zero mutation
  {
    const { storage, media } = freshDest();
    const a = createBackupAdapter({ storage, media, now: () => NOW });
    const file = await mkFile(await mkPayload('complete', { refBad: true }), PW);
    const before = state(storage, media);
    await throwsCode(() => restoreBackup({ adapter: a, fileText: file, password: PW, mode: 'new' }), 'MANIFEST_MISMATCH', 'битый manifest → MANIFEST_MISMATCH');
    ok(state(storage, media) === before, 'manifest mismatch: ноль мутаций');
  }
  // 6. invalid media hash — zero mutation
  {
    const { storage, media } = freshDest();
    const a = createBackupAdapter({ storage, media, now: () => NOW });
    const file = await mkFile(await mkPayload('complete', { hashBad: true }), PW);
    const before = state(storage, media);
    await throwsCode(() => restoreBackup({ adapter: a, fileText: file, password: PW, mode: 'new' }), 'MEDIA_HASH_MISMATCH', 'битый media hash → MEDIA_HASH_MISMATCH');
    ok(state(storage, media) === before, 'invalid media hash: ноль мутаций');
  }

  // ── Fault injection после первой мутации → exact rollback ──
  // Прогон restore-new с инъекцией; проверяем ПОЛНЫЙ откат до исходного состояния.
  async function faultRun(label, buildAdapter, opts = {}) {
    const { storage, media } = freshDest();
    const a = buildAdapter(storage, media);
    const file = await mkFile(await mkPayload('complete'), PW);
    const before = state(storage, media);
    const run = () => restoreBackup({ adapter: a, fileText: file, password: PW, mode: 'new', genProfileId: () => 'pNew', now: () => NOW });
    const e = opts.code ? await throwsCode(run, opts.code, label) : await throwsAny(run, label);
    ok(state(storage, media) === before, label + ': exact rollback (состояние идентично исходному)');
    ok(storage.getItem(KEYS.db('pNew')) === null && storage.getItem(KEYS.cfg('pNew')) === null, label + ': новые DB/CFG keys удалены');
    ok(!a.listProfiles().some(p => p.id === 'pNew'), label + ': профиль не остался в реестре');
    ok(!media._has('m1') && !media._has('mgen0'), label + ': новые/remapped media удалены (без orphan)');
    ok(a.getActiveId() === '', label + ': active не изменён');
    if (e) ok(e.rolledBack === true, label + ': ошибка помечена rolledBack');
    return { storage, media, file, before };
  }

  // 7. failure during media write (media.put бросает)
  await faultRun('media write fail', (s, md) => passthru(s, { ...md, put: async () => { throw new Error('media disk full'); } }));
  // 8. failure during DB write (setItem по db-ключу бросает)
  await faultRun('DB write fail', (s, md) => passthru(wrapSetFail(s, KEYS.db('pNew')), md));
  // 9. failure during CFG write
  await faultRun('CFG write fail', (s, md) => passthru(wrapSetFail(s, KEYS.cfg('pNew')), md));
  // 10. failure during registry write
  await faultRun('registry write fail', (s, md) => passthru(wrapSetFail(s, KEYS.PKEY), md));
  // 11. failure during reread verification
  await faultRun('verify fail', (s, md) => passthru(s, md, { verifyProfile: () => { throw new BackupError('VERIFY_DB', 'verify injected'); } }), { code: 'VERIFY_DB' });
  // 12. failure during activation
  await faultRun('activation fail', (s, md) => passthru(s, md, { activate: () => { throw new BackupError('ACT_FAIL', 'activate injected'); } }), { code: 'ACT_FAIL' });

  // 13. deletion of newly remapped media IDs (collision) + чужая media не тронута
  {
    const { storage, media } = freshDest();
    await media.put('m1', { data: IMG_DIFF, type: 'image', createdAt: '2026-01-01T00:00:00.000Z' }); // тот же id, другие bytes
    const otherBefore = media._get('m1');
    const a = passthru(storage, media, { activate: () => { throw new BackupError('ACT_FAIL', 'x'); } });
    const file = await mkFile(await mkPayload('complete'), PW);
    await throwsCode(() => restoreBackup({ adapter: a, fileText: file, password: PW, mode: 'new', genProfileId: () => 'pNew', now: () => NOW }), 'ACT_FAIL', 'collision+fail: бросок');
    ok(!media._has('mgen0'), 'rollback: новый remapped media id удалён');
    ok(media._get('m1') === otherBefore, 'rollback: чужая media (m1) не повреждена');
  }

  // 14. identical-media reuse remains untouched (успех)
  {
    const { storage, media } = freshDest();
    await media.put('m1', { data: IMG, type: 'image', createdAt: '2026-01-01T00:00:00.000Z' }); // identical bytes
    const before = media._get('m1');
    const a = createBackupAdapter({ storage, media, now: () => NOW });
    const file = await mkFile(await mkPayload('complete'), PW);
    const r = await restoreBackup({ adapter: a, fileText: file, password: PW, mode: 'new', genProfileId: () => 'pNew', now: () => NOW });
    ok(r.mediaReused === 1 && r.mediaWritten === 0, 'reuse: identical media переиспользован, без записи');
    ok(media._get('m1') === before, 'reuse: существующая media не перезаписана');
    ok(a.readDB('pNew').insights[0].media.join() === 'm1', 'reuse: ссылка указывает на переиспользованный id');
  }

  // 15. rollback failure surfaced explicitly (не скрывается исходной ошибкой)
  {
    const { storage, media } = freshDest();
    const a = passthru(storage, media, {
      activate: () => { throw new BackupError('ACT_FAIL', 'boom'); },
      rollback: async () => { throw new Error('rollback disk error'); },
    });
    const file = await mkFile(await mkPayload('complete'), PW);
    const e = await throwsCode(() => restoreBackup({ adapter: a, fileText: file, password: PW, mode: 'new', genProfileId: () => 'pNew', now: () => NOW }), 'ROLLBACK_FAILED', 'rollback failure → ROLLBACK_FAILED (surfaced)');
    ok(e && e.originalError && e.originalError.code === 'ACT_FAIL', 'ROLLBACK_FAILED несёт originalError');
    ok(e && e.rollbackError instanceof Error, 'ROLLBACK_FAILED несёт rollbackError');
  }

  // 16. retry after failed restore succeeds cleanly
  {
    const { storage, media } = freshDest();
    const file = await mkFile(await mkPayload('complete'), PW);
    // Попытка 1: media.put бросает → rollback.
    const a1 = passthru(storage, { ...media, put: async () => { throw new Error('transient'); } });
    await throwsAny(() => restoreBackup({ adapter: a1, fileText: file, password: PW, mode: 'new', genProfileId: () => 'pNew', now: () => NOW }), 'retry: первая попытка падает');
    ok(!media._has('m1') && storage.getItem(KEYS.db('pNew')) === null, 'retry: после отката нет orphan');
    // Попытка 2: без инъекции → чистый успех.
    const a2 = createBackupAdapter({ storage, media, now: () => NOW });
    const r = await restoreBackup({ adapter: a2, fileText: file, password: PW, mode: 'new', genProfileId: () => 'pNew', now: () => NOW });
    ok(r.ok && media._has('m1') && a2.listProfiles().filter(p => p.id === 'pNew').length === 1, 'retry: вторая попытка успешна и чиста');
  }

  // 17. режим по умолчанию = new (никакого случайного replacement)
  {
    const { storage, media } = replaceDest();
    const a = createBackupAdapter({ storage, media, now: () => NOW });
    const file = await mkFile(await mkPayload('data-only'), PW);
    const r = await restoreBackup({ adapter: a, fileText: file, password: PW, genProfileId: () => 'pNew2', now: () => NOW }); // mode не задан
    ok(r.mode === 'new' && a.readDB('pOld').insights[0].title === 'old-data', 'default mode=new: существующий профиль pOld НЕ изменён');
    await throwsCode(() => restoreBackup({ adapter: a, fileText: file, password: PW, mode: 'replace' }), 'BAD_TARGET', 'replace без targetId → BAD_TARGET');
  }

  // 18. Item 4 — complete: ЛИШНЯЯ непривязанная media в payload → MANIFEST_MISMATCH,
  //     ноль мутаций (DB ссылается только на m1, payload несёт m1+m2).
  {
    const { storage, media } = freshDest();
    const a = createBackupAdapter({ storage, media, now: () => NOW });
    const m1 = await mediaItem('m1', IMG);
    const m2 = await mediaItem('m2', IMG_DIFF);
    const payload = { payloadVersion: 1, app: 'architect', mode: 'complete', createdAt: NOW, profileName: 'X', db: { insights: [{ id: 1, title: 't', media: ['m1'] }], dreams: [] }, cfg: { userName: 'x' }, media: [m1, m2] };
    const file = await mkFile(payload, PW);
    const before = state(storage, media);
    await throwsCode(() => restoreBackup({ adapter: a, fileText: file, password: PW, mode: 'new', genProfileId: () => 'pN', now: () => NOW }), 'MANIFEST_MISMATCH', 'item4: лишняя непривязанная media → MANIFEST_MISMATCH');
    ok(state(storage, media) === before, 'item4: ноль мутаций при MANIFEST_MISMATCH');
  }

  // 19. Item 1 — onActivated вызывается ПОСЛЕ активации (профиль уже активен),
  //     с {profileId, mode}.
  {
    const { storage, media } = freshDest();
    const a = createBackupAdapter({ storage, media, now: () => NOW });
    const file = await mkFile(await mkPayload('complete'), PW);
    let seen = null, activeAtCall = null;
    const r = await restoreBackup({ adapter: a, fileText: file, password: PW, mode: 'new', genProfileId: () => 'pH', now: () => NOW,
      onActivated: async ({ profileId, mode }) => { seen = { profileId, mode }; activeAtCall = a.getActiveId(); } });
    ok(r.ok && seen && seen.profileId === 'pH' && seen.mode === 'new', 'item1: onActivated получил {profileId, mode}');
    ok(activeAtCall === 'pH', 'item1: на момент onActivated профиль уже активирован');
  }

  // 20. Item 9 — reread media: верная data, но неверный type → VERIFY_MEDIA → rollback.
  {
    const { storage, media } = freshDest();
    const file = await mkFile(await mkPayload('complete'), PW);
    const before = state(storage, media);
    const a = passthru(storage, media, { readMedia: async (id) => { const r = await media.get(id); if (r) r.type = 'WRONG'; return r; } });
    await throwsCode(() => restoreBackup({ adapter: a, fileText: file, password: PW, mode: 'new', genProfileId: () => 'pN', now: () => NOW }), 'VERIFY_MEDIA', 'item9: неверный type при reread → VERIFY_MEDIA');
    ok(state(storage, media) === before, 'item9: откат после VERIFY_MEDIA(type) — ноль мутаций');
  }
  // 20b. Item 9 — reread media: верная data, но неверный createdAt → VERIFY_MEDIA.
  {
    const { storage, media } = freshDest();
    const file = await mkFile(await mkPayload('complete'), PW);
    const before = state(storage, media);
    const a = passthru(storage, media, { readMedia: async (id) => { const r = await media.get(id); if (r) r.createdAt = '1999-01-01T00:00:00.000Z'; return r; } });
    await throwsCode(() => restoreBackup({ adapter: a, fileText: file, password: PW, mode: 'new', genProfileId: () => 'pN', now: () => NOW }), 'VERIFY_MEDIA', 'item9: неверный createdAt при reread → VERIFY_MEDIA');
    ok(state(storage, media) === before, 'item9: откат после VERIFY_MEDIA(createdAt)');
  }

  // 21. Item 2 — bak в транзакции. Заменяемый профиль имеет СТАРЫЙ bak; восстановление
  //     профиля с пустым (zero-count) DB → после успеха bak = восстановленный DB
  //     (НЕ старый), recovery не подменит восстановленные данные.
  {
    const { storage, media } = replaceDest();
    storage.setItem(KEYS.bak('pOld'), JSON.stringify({ insights: [{ id: 99, title: 'OLD-BAK' }] }));
    const a = createBackupAdapter({ storage, media, now: () => NOW });
    const emptyPayload = { payloadVersion: 1, app: 'architect', mode: 'data-only', createdAt: NOW, profileName: 'Empty', db: { insights: [], dreams: [] }, cfg: { userName: 'E' }, media: [] };
    const file = await mkFile(emptyPayload, PW);
    const r = await restoreBackup({ adapter: a, fileText: file, password: PW, mode: 'replace', targetId: 'pOld', now: () => NOW });
    ok(r.ok, 'item2: replace пустым DB успешен');
    ok(JSON.parse(storage.getItem(KEYS.bak('pOld'))).insights.length === 0, 'item2: bak = восстановленный (пустой) DB');
    ok(!storage.getItem(KEYS.bak('pOld')).includes('OLD-BAK'), 'item2: bak НЕ содержит старый DB заменённого профиля');
  }
  // 21b. Item 2 — инъекция сбоя ПОСЛЕ мутации: старый bak восстановлен ТОЧНО.
  {
    const { storage, media } = replaceDest();
    const OLDBAK = JSON.stringify({ insights: [{ id: 99, title: 'OLD-BAK' }] });
    storage.setItem(KEYS.bak('pOld'), OLDBAK);
    const before = storage.getItem(KEYS.bak('pOld'));
    const file = await mkFile(await mkPayload('data-only'), PW);
    const a = passthru(storage, media, { verifyProfile: () => { throw new BackupError('VERIFY_DB', 'inject'); } });
    await throwsAny(() => restoreBackup({ adapter: a, fileText: file, password: PW, mode: 'replace', targetId: 'pOld', now: () => NOW }), 'item2: сбой verify после мутации');
    ok(storage.getItem(KEYS.bak('pOld')) === before, 'item2: старый bak восстановлен точно после отката');
  }

  // 22. Round2 — сбой onActivated (hydration) ПОСЛЕ commit: restore НЕ считается
  //     провалившимся, данные восстановлены, откат не выполнялся, честный warning.
  {
    const { storage, media } = freshDest();
    const a = createBackupAdapter({ storage, media, now: () => NOW });
    const file = await mkFile(await mkPayload('complete'), PW);
    let called = false;
    const r = await restoreBackup({ adapter: a, fileText: file, password: PW, mode: 'new', genProfileId: () => 'pH', now: () => NOW,
      onActivated: async () => { called = true; throw new Error('render blew up'); } });
    ok(called && r.ok === true && r.committed === true && r.activated === true, 'round2/hydration: restore зафиксирован несмотря на сбой callback');
    ok(r.hydration && r.hydration.ok === false && r.hydration.code === 'RESTORE_COMMITTED_RELOAD_REQUIRED', 'round2/hydration: честный warning RESTORE_COMMITTED_RELOAD_REQUIRED (не rollback)');
    ok(a.getActiveId() === 'pH' && a.readDB('pH').insights[0].title === 'привет', 'round2/hydration: данные восстановлены и профиль активен (никакого отката)');
  }

  // 23. Round2 — exact profile entry: verify возвращает верный DB/CFG/имя, но
  //     реестр содержит неверный color → VERIFY_PROFILE → exact rollback, zero mutation.
  {
    const { storage, media } = replaceDest();
    const before = state(storage, media);
    const file = await mkFile(await mkPayload('data-only'), PW);
    // Инъекция: writeStagedProfile пишет как обычно, но с «испорченным» color в
    // реестре (правильные DB/CFG/имя), чтобы verifyProfile поймал точное поле.
    const real = createBackupAdapter({ storage, media, now: () => NOW });
    const a = passthru(storage, media, {
      writeStagedProfile: (args) => {
        real.writeStagedProfile(args);
        const list = real.listProfiles();
        const i = list.findIndex(p => p && p.id === args.id);
        if (i >= 0) { list[i] = { ...list[i], color: '#DEADBE' }; storage.setItem(KEYS.PKEY, JSON.stringify(list)); }
      },
    });
    await throwsCode(() => restoreBackup({ adapter: a, fileText: file, password: PW, mode: 'replace', targetId: 'pOld', now: () => NOW }), 'VERIFY_PROFILE', 'round2/exact-entry: неверный color в реестре → VERIFY_PROFILE');
    ok(state(storage, media) === before, 'round2/exact-entry: exact rollback после VERIFY_PROFILE (zero mutation)');
  }

  console.log(out.join('\n'));
  console.log('\nBackup restore (Slice 3): ' + pass + '/' + (pass + fail) + ' passed');
  if (fail > 0) process.exit(1);

  function wrapSetFail(s, failKey) {
    return { getItem: s.getItem, removeItem: s.removeItem, keys: s.keys, _dump: s._dump, setItem: (k, v) => { if (k === failKey) throw new Error('setItem fail ' + k); s.setItem(k, v); } };
  }
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
