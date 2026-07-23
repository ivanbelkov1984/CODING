// ─────────────────────────────────────────────────────────────────────────
//  backup-adapter.test.mjs — focused regression для production browser adapter.
//  Импортирует ИМЕННО production adapter (createBackupAdapter). Fakes ниже —
//  это fakes браузерных примитивов (localStorage / IndexedDB store), а не логики
//  adapter. Логика не дублируется. Синтетические данные.
//  Запуск: node tests/backup-adapter.test.mjs
// ─────────────────────────────────────────────────────────────────────────

import { BackupError, bytesToBase64, base64ToBytes, sha256Hex } from '../backup/backup-core.mjs';
import { createBackupAdapter, KEYS } from '../backup/backup-adapter.mjs';

let pass = 0, fail = 0; const out = [];
function ok(c, n) { if (c) { pass++; out.push('  ✓ ' + n); } else { fail++; out.push('  ✗ ' + n); } }
async function throwsCode(fn, code, n) {
  try { await fn(); ok(false, n + ' (не бросил, ожидался ' + code + ')'); }
  catch (e) { ok(e instanceof BackupError && e.code === code, n + (e && e.code !== code ? ' (код ' + (e && e.code) + ')' : '')); }
}
const clone = o => JSON.parse(JSON.stringify(o));

// ── Fakes браузерных примитивов ──
function makeStorage(init = {}) {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, String(v)]));
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    keys: () => [...m.keys()],
    _raw: m,
  };
}
function makeMedia(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    get: async id => (m.has(id) ? clone(m.get(id)) : undefined),
    put: async (id, val) => { m.set(id, clone(val)); },
    del: async id => { m.delete(id); },
    keys: async () => [...m.keys()],
    _has: id => m.has(id),
    _get: id => m.get(id),
  };
}

const IMG = 'data:image/jpeg;base64,' + bytesToBase64(new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70]));
const AUD = 'data:audio/webm;codecs=opus;base64,' + bytesToBase64(new Uint8Array([26, 69, 223, 163, 1, 2, 3]));
const IMG2 = 'data:image/jpeg;base64,' + bytesToBase64(new Uint8Array([1, 2, 3, 4, 5, 6]));

function seed() {
  const storage = makeStorage({
    [KEYS.PKEY]: JSON.stringify([{ id: 'pA', name: 'Alice', color: '#1056CC' }]),
    [KEYS.AKEY]: 'pA',
    [KEYS.db('pA')]: JSON.stringify({ insights: [{ id: 1, title: 'x', media: ['m1', 'm2'] }, { id: 2, title: 'y' }], dreams: [], __ts: 123 }),
    [KEYS.cfg('pA')]: JSON.stringify({ userName: 'Alice', domainLabel: 'Книга', aiModel: 'claude-opus-4-8', apiUrl: 'https://srv.example', spaceKey: 'SPACE_SECRET', lastSync: '2026-07-23T00:00:00.000Z', _ts: 999 }),
    [KEYS.pass('pA')]: 'PASSPHRASE_SECRET',
    [KEYS.rec('pA')]: 'RECOVERY_SECRET',
  });
  const media = makeMedia({
    m1: { data: IMG, type: 'image', createdAt: '2026-01-01T00:00:00.000Z' },
    m2: { data: AUD, type: 'audio', createdAt: '2026-01-01T00:00:00.000Z' },
    m9: { data: IMG2, type: 'image', createdAt: '2026-01-01T00:00:00.000Z' }, // не referenced
  });
  return { storage, media };
}
const NOW = '2026-07-23T12:00:00.000Z';

async function main() {
  // A. data-only: refs сняты в копии, живой DB не тронут, секреты/connection отсутствуют
  {
    const { storage, media } = seed();
    const a = createBackupAdapter({ storage, media, now: () => NOW });
    const { payload, warnings } = await a.buildBundle({ id: 'pA', mode: 'data-only' });
    ok(payload.mode === 'data-only' && payload.media.length === 0, 'data-only: media пуст');
    ok(!('media' in payload.db.insights[0]), 'data-only: media-ссылки сняты в копии');
    ok(!('__ts' in payload.db), 'data-only: внутренний __ts снят');
    ok(payload.cfg.userName === 'Alice' && !('apiUrl' in payload.cfg) && !('spaceKey' in payload.cfg) && !('lastSync' in payload.cfg) && !('_ts' in payload.cfg), 'data-only: connection/секреты сняты, userName сохранён');
    ok(warnings.length === 0, 'data-only: без warnings');
    // живой DB не изменился
    const liveDb = JSON.parse(storage.getItem(KEYS.db('pA')));
    ok(Array.isArray(liveDb.insights[0].media) && liveDb.insights[0].media.join() === 'm1,m2', 'data-only: живой DB не изменён (media-ссылки на месте)');
    const text = JSON.stringify(payload);
    ok(!text.includes('PASSPHRASE_SECRET') && !text.includes('RECOVERY_SECRET') && !text.includes('SPACE_SECRET'), 'data-only: секретов нет в bundle');
  }

  // B. complete: только referenced media, canonical bytes/MIME (вкл. codecs), sha верна, unused не входит
  {
    const { storage, media } = seed();
    const a = createBackupAdapter({ storage, media, now: () => NOW });
    const { payload, warnings } = await a.buildBundle({ id: 'pA', mode: 'complete' });
    ok(payload.media.length === 2, 'complete: собраны только 2 referenced media (m9 не включён)');
    ok(!payload.media.some(m => m.id === 'm9'), 'complete: неиспользуемое media m9 исключено');
    const im = payload.media.find(m => m.id === 'm1'); const au = payload.media.find(m => m.id === 'm2');
    ok(im.mime === 'image/jpeg', 'complete: MIME изображения сохранён');
    ok(au.mime === 'audio/webm;codecs=opus', 'complete: MIME аудио с параметрами (;codecs=opus) сохранён');
    const recomputed = await sha256Hex(base64ToBytes(im.bytes));
    ok(recomputed === im.sha256, 'complete: sha256 media совпадает с canonical bytes');
    ok(payload.db.insights[0].media.join() === 'm1,m2', 'complete: media-ссылки сохранены в копии');
    ok(warnings.length === 0, 'complete: без warnings');
  }

  // A2. реальная форма DB: строковый массив (oq), объекты (vit/env/_del), скаляр (__ts)
  {
    const storage = makeStorage({
      [KEYS.PKEY]: JSON.stringify([{ id: 'pR', name: 'Real', color: '#1056CC' }]),
      [KEYS.AKEY]: 'pR',
      [KEYS.db('pR')]: JSON.stringify({
        insights: [{ id: 1, title: 'x', media: ['m1'] }],
        oq: ['Что важно?', 'Что мешает?'],
        vit: { sl: 7, note: '' }, env: { ritual: false }, _del: { 5: 123 }, __ts: 999,
      }),
      [KEYS.cfg('pR')]: JSON.stringify({ userName: 'Real' }),
    });
    const media = makeMedia({ m1: { data: IMG, type: 'image', createdAt: '2026-01-01T00:00:00.000Z' } });
    const a = createBackupAdapter({ storage, media, now: () => NOW });
    const dataOnly = await a.buildBundle({ id: 'pR', mode: 'data-only' });
    ok(dataOnly.payload.db.oq.length === 2 && dataOnly.payload.db.vit.sl === 7 && dataOnly.payload.db._del['5'] === 123, 'реальная DB: строки/объекты/скаляры сохранены (data-only не падает на oq-строках)');
    ok(!('__ts' in dataOnly.payload.db) && !('media' in dataOnly.payload.db.insights[0]), 'реальная DB: __ts снят, media-ссылка снята в копии');
    const complete = await a.buildBundle({ id: 'pR', mode: 'complete' });
    ok(complete.payload.media.length === 1 && complete.payload.db.oq.length === 2, 'реальная DB: complete собирает media и сохраняет oq/объекты');
  }

  // B2. complete с недоступной media → MISSING_MEDIA (не молчаливый неполный
  //     файл): живой DB не мутирован; data-only при этом продолжает работать.
  {
    const { storage, media } = seed();
    await media.del('m2');
    const dbBefore = storage.getItem(KEYS.db('pA'));
    const a = createBackupAdapter({ storage, media, now: () => NOW });
    await throwsCode(() => a.buildBundle({ id: 'pA', mode: 'complete' }), 'MISSING_MEDIA', 'complete: недоступная media → MISSING_MEDIA (без неполного файла)');
    ok(storage.getItem(KEYS.db('pA')) === dbBefore, 'complete MISSING_MEDIA: живой DB не изменён');
    const dataOnly = await a.buildBundle({ id: 'pA', mode: 'data-only' });
    ok(dataOnly.payload.media.length === 0 && !('media' in dataOnly.payload.db.insights[0]), 'data-only работает даже при недоступной media');
  }

  // C. identical-media reuse без перезаписи
  {
    const { storage, media } = seed();
    const a = createBackupAdapter({ storage, media, now: () => NOW });
    const before = media._get('m1');
    const item = { id: 'm1', mime: 'image/jpeg', sha256: await sha256Hex((await import('../backup/backup-core.mjs')).canonicalMediaBytes(IMG).bytes), bytes: bytesToBase64((await import('../backup/backup-core.mjs')).canonicalMediaBytes(IMG).bytes) };
    const plan = await a.planMedia([item]);
    ok(plan.reuses.join() === 'm1' && plan.writes.length === 0, 'reuse: identical media переиспользован без записи');
    ok(media._get('m1') === before, 'reuse: существующая media-запись не перезаписана');
    ok(Object.keys(plan.remaps).length === 0, 'reuse: remap не нужен');
  }

  // D. media-ID collision remap (тот же id, другие bytes) → новый id + remap
  {
    const { storage, media } = seed();
    let n = 0;
    const a = createBackupAdapter({ storage, media, now: () => NOW, genMediaId: () => 'mgen' + (n++) });
    const before = media._get('m1');
    const diff = (await import('../backup/backup-core.mjs')).canonicalMediaBytes(IMG2);
    const item = { id: 'm1', mime: 'image/jpeg', sha256: await sha256Hex(diff.bytes), bytes: bytesToBase64(diff.bytes) };
    const plan = await a.planMedia([item]);
    ok(plan.writes.length === 1 && plan.writes[0].id === 'mgen0', 'collision: новый id для конфликтующего media');
    ok(plan.remaps.m1 === 'mgen0', 'collision: remap m1→mgen0 записан');
    ok(media._get('m1') === before, 'collision: чужая media m1 не повреждена');
  }

  // E. свободный id → пишем под ним же
  {
    const { storage, media } = seed();
    const a = createBackupAdapter({ storage, media, now: () => NOW });
    const d = (await import('../backup/backup-core.mjs')).canonicalMediaBytes(IMG2);
    const item = { id: 'mX', mime: 'image/jpeg', sha256: await sha256Hex(d.bytes), bytes: bytesToBase64(d.bytes) };
    const plan = await a.planMedia([item]);
    ok(plan.writes.length === 1 && plan.writes[0].id === 'mX' && Object.keys(plan.remaps).length === 0, 'free id: media пишется под своим id без remap');
  }

  // F. rewriteRefs по карте remap
  {
    const { storage, media } = seed();
    const a = createBackupAdapter({ storage, media });
    const db = { insights: [{ id: 1, media: ['m1', 'm2'] }, { id: 2 }] };
    const rw = a.rewriteRefs(db, { m1: 'mZ' });
    ok(rw.insights[0].media.join() === 'mZ,m2', 'rewriteRefs: ссылки переписаны по remap');
    ok(db.insights[0].media.join() === 'm1,m2', 'rewriteRefs: исходный db не мутирован');
  }

  // G. snapshot + exact rollback (вкл. удаление новых keys/media ids)
  {
    const { storage, media } = seed();
    const a = createBackupAdapter({ storage, media, now: () => NOW });
    const origDb = storage.getItem(KEYS.db('pA'));
    const origM1 = media._get('m1');
    const snap = await a.snapshot({ storageKeys: [KEYS.db('pA'), KEYS.db('pNew')], mediaIds: ['m1', 'mNew'] });
    // мутации транзакции
    storage.setItem(KEYS.db('pA'), '{"insights":[]}');
    storage.setItem(KEYS.db('pNew'), '{"x":1}');
    await media.put('m1', { data: 'data:image/png;base64,AA==', type: 'image', createdAt: NOW });
    await media.put('mNew', { data: 'data:image/png;base64,AA==', type: 'image', createdAt: NOW });
    await a.rollback(snap);
    ok(storage.getItem(KEYS.db('pA')) === origDb, 'rollback: существовавший db_pA восстановлен точно');
    ok(storage.getItem(KEYS.db('pNew')) === null, 'rollback: новый db_pNew удалён');
    ok(JSON.stringify(media._get('m1')) === JSON.stringify(origM1), 'rollback: существовавшая media m1 восстановлена');
    ok(!media._has('mNew'), 'rollback: новый media mNew удалён (без orphan)');
  }

  // H. rollback failure surfacing (не скрывается)
  {
    const { storage, media } = seed();
    const throwing = {
      getItem: storage.getItem, removeItem: storage.removeItem, keys: storage.keys,
      setItem: (k, v) => { if (k === KEYS.db('pA')) throw new Error('disk full'); storage.setItem(k, v); },
    };
    const a = createBackupAdapter({ storage: throwing, media, now: () => NOW });
    const snap = await a.snapshot({ storageKeys: [KEYS.db('pA')], mediaIds: [] });
    storage.setItem(KEYS.db('pA'), '{"insights":[]}');
    await throwsCode(() => a.rollback(snap), 'ROLLBACK_FAILED', 'rollback failure явно surfaced (ROLLBACK_FAILED)');
  }

  // I. connection preservation
  {
    const { storage, media } = seed();
    const a = createBackupAdapter({ storage, media });
    const bundleCfg = { userName: 'Alice', apiUrl: '', spaceKey: '', lastSync: '' };
    const repl = a.buildRestoreCfg({ bundleCfg, targetId: 'pA', replace: true });
    ok(repl.apiUrl === 'https://srv.example' && repl.spaceKey === 'SPACE_SECRET' && repl.lastSync === '2026-07-23T00:00:00.000Z', 'replace: connection существующего профиля сохранены');
    const fresh = a.buildRestoreCfg({ bundleCfg, targetId: 'pNew', replace: false });
    ok(fresh.apiUrl === '' && fresh.spaceKey === '' && fresh.lastSync === '', 'new profile: connection пустые/default');
  }

  // J. writeStagedProfile → verify (DB/CFG/bak/registry/profile) → activate
  {
    const { storage, media } = seed();
    const a = createBackupAdapter({ storage, media });
    const db = { insights: [{ id: 9, title: 'z' }], dreams: [] };
    const cfg = { userName: 'Bob', apiUrl: '', spaceKey: '', lastSync: '' };
    a.writeStagedProfile({ id: 'pNew', profile: { name: 'Bob', color: '#1A7F3C' }, db, cfg });
    ok(a.verifyProfile({ id: 'pNew', db, cfg, profile: { name: 'Bob' } }) === true, 'verify: перечитанное состояние совпадает (вкл. bak/profile)');
    ok(storage.getItem(KEYS.bak('pNew')) === JSON.stringify(db), 'bak-слот записан и точно равен восстановленному DB');
    a.activate('pNew');
    ok(a.getActiveId() === 'pNew', 'activate: активный профиль переключён');
    ok(a.listProfiles().some(p => p.id === 'pNew') && a.listProfiles().some(p => p.id === 'pA'), 'registry: новый профиль добавлен, старый сохранён');
    await throwsCode(() => a.activate('pGhost'), 'NO_PROFILE', 'activate несуществующего → NO_PROFILE');
  }

  // J2. verify: bak, содержащий СТАРЫЙ DB заменяемого профиля, отвергается.
  {
    const { storage, media } = seed();
    const a = createBackupAdapter({ storage, media });
    const db = { insights: [{ id: 1, title: 'restored' }] }; const cfg = { userName: 'x' };
    a.writeStagedProfile({ id: 'pA', profile: { name: 'Alice' }, db, cfg });
    storage.setItem(KEYS.bak('pA'), JSON.stringify({ insights: [{ id: 99, title: 'OLD' }] })); // подмена старым bak
    await throwsCode(() => a.verifyProfile({ id: 'pA', db, cfg, profile: { name: 'Alice' } }), 'VERIFY_BAK', 'verify: bak со старым DB заменяемого профиля → VERIFY_BAK');
  }

  // J3. verify: несовпадение записи профиля (имя) → VERIFY_PROFILE.
  {
    const { storage, media } = seed();
    const a = createBackupAdapter({ storage, media });
    const db = { insights: [] }; const cfg = { userName: 'x' };
    a.writeStagedProfile({ id: 'pN', profile: { name: 'Correct' }, db, cfg });
    await throwsCode(() => a.verifyProfile({ id: 'pN', db, cfg, profile: { name: 'WRONG' } }), 'VERIFY_PROFILE', 'verify: имя профиля не совпало → VERIFY_PROFILE');
  }

  // J3b. verify ТОЧНОЙ записи: правильное имя, но неверный color/id → VERIFY_PROFILE.
  {
    const { storage, media } = seed();
    const a = createBackupAdapter({ storage, media });
    const db = { insights: [] }; const cfg = { userName: 'x' };
    a.writeStagedProfile({ id: 'pN', profile: { name: 'Correct', color: '#1A7F3C' }, db, cfg });
    await throwsCode(() => a.verifyProfile({ id: 'pN', db, cfg, profile: { name: 'Correct', color: '#FF0000' } }), 'VERIFY_PROFILE', 'verify: имя верное, но color не совпал → VERIFY_PROFILE');
    ok(a.verifyProfile({ id: 'pN', db, cfg, profile: { name: 'Correct', color: '#1A7F3C' } }) === true, 'verify: точная запись профиля (name+color) совпадает');
    await throwsCode(() => a.verifyProfile({ id: 'pN', db, cfg, profile: { name: 'Correct', color: '#1A7F3C', extra: 'X' } }), 'VERIFY_PROFILE', 'verify: лишнее ожидаемое поле профиля не совпало → VERIFY_PROFILE');
  }

  // K. planMedia: детерминированный remap — сгенерированный id НЕ крадёт оригинал
  //    другой ВХОДЯЩЕЙ media. Вход [m1(collision), m2(collision)]; genMediaId
  //    сперва выдаёт 'm2' (оригинал следующей входящей) — планнер обязан отклонить
  //    кандидата и запросить следующий id; обе записи сохраняются отдельно.
  {
    const { storage, media } = seed();   // существуют m1(IMG), m2(AUD)
    const core = await import('../backup/backup-core.mjs');
    const d = core.canonicalMediaBytes(IMG2);
    const items = [
      { id: 'm1', mime: 'image/jpeg', sha256: await sha256Hex(d.bytes), bytes: bytesToBase64(d.bytes) },
      { id: 'm2', mime: 'image/jpeg', sha256: await sha256Hex(d.bytes), bytes: bytesToBase64(d.bytes) },
    ];
    const seq = ['m2', 'mNew1', 'mNew2']; let i = 0;
    const a = createBackupAdapter({ storage, media, now: () => NOW, genMediaId: () => seq[i++] });
    const plan = await a.planMedia(items);
    ok(plan.remaps.m1 && plan.remaps.m1 !== 'm2' && plan.remaps.m1 !== 'm1', 'remap: id для m1 не равен оригиналу другой входящей (m2) и своему');
    ok(plan.writes.length === 2, 'remap: обе конфликтующие media записаны отдельно');
    const ids = plan.writes.map(w => w.id);
    ok(new Set(ids).size === 2 && !ids.includes('m1') && !ids.includes('m2'), 'remap: target id уникальны и не перезаписывают существующие m1/m2');
  }

  console.log(out.join('\n'));
  console.log('\nBackup adapter (Slice 2): ' + pass + '/' + (pass + fail) + ' passed');
  if (fail > 0) process.exit(1);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
