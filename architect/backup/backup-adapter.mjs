// ─────────────────────────────────────────────────────────────────────────
//  backup-adapter.mjs — production browser adapter зашифрованного backup.
//
//  Slice 2: сборка переносимого bundle (DB/CFG со снятием device-local полей и
//  секретов), реальные production-форматы localStorage + IndexedDB, data-only
//  stripping media references только в копии, complete media collection с
//  canonical bytes/MIME, identical-media reuse без перезаписи, media-ID collision
//  remap, переписывание DB references, snapshot, rollback primitives, connection
//  preservation.
//
//  Storage-примитивы (localStorage / IndexedDB) инъектируются как зависимости,
//  поэтому Node-тесты запускают ИМЕННО этот production adapter (fake — это fake
//  браузерного примитива, а не логики adapter). Логика здесь не дублируется в mock.
//
//  Вне слайса: UI, app.js integration, build.mjs, sw.js, полная оркестрация
//  transactional restore (Slice 3).
// ─────────────────────────────────────────────────────────────────────────

'use strict';

import {
  SCHEMA, LIMITS, BackupError,
  bytesToBase64, canonicalMediaBytes, sha256Hex, validatePayload,
} from './backup-core.mjs';

const fail = (code, msg) => { throw new BackupError(code, msg); };

// ── Неймспейс ключей localStorage (точно как в app.js) ──────────────────────
export const KEYS = Object.freeze({
  PKEY: 'arch5_profiles',
  AKEY: 'arch5_active',
  db:   id => 'arch5_db_'   + id,
  cfg:  id => 'arch5_cfg_'  + id,
  pass: id => 'arch5_pass_' + id,
  bak:  id => 'arch5_bak_'  + id,
  rec:  id => 'arch5_rec_'  + id,
  snapPrefix: id => 'arch5_snap_' + id + '_',
});

// Device-local поля CFG, которые НЕ входят в переносимую копию.
export const CONNECTION_FIELDS = Object.freeze(['apiUrl', 'spaceKey', 'lastSync']);
// Внутренние sync-маркеры (не пользовательские данные).
const DB_INTERNAL = ['__ts'];
const CFG_INTERNAL = ['_ts'];

const clone = o => JSON.parse(JSON.stringify(o));

// ── Чистые helpers ──────────────────────────────────────────────────────────

// Снятие device-local connection полей и внутренних маркеров с КОПИИ CFG.
export function stripConnection(cfg) {
  const out = clone(cfg || {});
  for (const f of CONNECTION_FIELDS) delete out[f];
  for (const f of CFG_INTERNAL) delete out[f];
  return out;
}

// Все media id, на которые ссылается любая запись (record.media: string[]).
export function collectMediaRefs(db) {
  const ids = new Set();
  for (const c of Object.keys(db || {})) {
    const arr = db[c];
    if (!Array.isArray(arr)) continue;
    for (const rec of arr) {
      if (rec && Array.isArray(rec.media)) for (const m of rec.media) if (typeof m === 'string') ids.add(m);
    }
  }
  return ids;
}

// Переписать media-ссылки в КОПИИ db по карте remap {oldId:newId}.
export function rewriteRefs(db, remaps) {
  const out = clone(db);
  for (const c of Object.keys(out)) {
    const arr = out[c];
    if (!Array.isArray(arr)) continue;
    for (const rec of arr) {
      if (rec && Array.isArray(rec.media)) rec.media = rec.media.map(m => (remaps && remaps[m]) ? remaps[m] : m);
    }
  }
  return out;
}

// Убрать media-ссылки из КОПИИ db (data-only). Живой DB не меняется.
function stripMediaRefs(db) {
  const out = clone(db);
  for (const c of Object.keys(out)) {
    const arr = out[c];
    if (!Array.isArray(arr)) continue;
    for (const rec of arr) { if (rec && 'media' in rec) delete rec.media; }
  }
  return out;
}

function stripDbInternal(db) {
  const out = clone(db);
  for (const f of DB_INTERNAL) delete out[f];
  return out;
}

// Тип media-записи по MIME (формат production: {data, type, createdAt}).
function mediaTypeFor(mime) { return /^image\//.test(mime) ? 'image' : (/^audio\//.test(mime) ? 'audio' : 'file'); }
function dataUrlOf(mime, base64) { return 'data:' + mime + ';base64,' + base64; }

// ── Фабрика адаптера ────────────────────────────────────────────────────────
// deps:
//   storage — localStorage-подобный: getItem/setItem/removeItem (+ keys() ИЛИ length/key(i))
//   media   — async KV IndexedDB-store 'media': get(id)/put(id,val)/del(id)/keys()
//   now     — () => ISO-строка (для детерминизма в тестах)
//   genMediaId — () => новый media id (по умолчанию 'm'+time+rand, матчит mediaIdPattern)
export function createBackupAdapter(deps) {
  const storage = deps && deps.storage;
  const media = deps && deps.media;
  if (!storage || typeof storage.getItem !== 'function') fail('ADAPTER_DEPS', 'нужен storage (localStorage-like)');
  if (!media || typeof media.get !== 'function') fail('ADAPTER_DEPS', 'нужен media (IndexedDB-like)');
  const now = (deps && deps.now) || (() => new Date().toISOString());
  let _idc = 0;
  const genMediaId = (deps && deps.genMediaId) || (() => 'm' + Date.now().toString(36) + (_idc++).toString(36) + Math.random().toString(36).slice(2, 8));

  function storageKeys() {
    if (typeof storage.keys === 'function') return storage.keys();
    const out = [];
    for (let i = 0; i < storage.length; i++) out.push(storage.key(i));
    return out;
  }
  const readJSON = k => { const v = storage.getItem(k); if (v == null) return null; try { return JSON.parse(v); } catch (e) { fail('STORAGE_CORRUPT', 'повреждён ключ ' + k); } };

  // ── Чтение текущего состояния ──
  function listProfiles() { const v = readJSON(KEYS.PKEY); return Array.isArray(v) ? v : []; }
  function getActiveId() { return storage.getItem(KEYS.AKEY) || ''; }
  function getProfile(id) { return listProfiles().find(p => p && p.id === id) || null; }
  function readDB(id) { return readJSON(KEYS.db(id)); }
  function readCFG(id) { return readJSON(KEYS.cfg(id)); }
  function readConnectionSettings(id) {
    const cfg = readCFG(id) || {};
    const out = {};
    for (const f of CONNECTION_FIELDS) out[f] = cfg[f] !== undefined ? cfg[f] : '';
    return out;
  }

  // ── Сборка переносимого bundle (payload по схеме core) ──
  async function buildBundle({ id, mode }) {
    if (!SCHEMA.MODES.includes(mode)) fail('BAD_MODE', 'неизвестный режим backup');
    const profile = getProfile(id);
    if (!profile) fail('NO_PROFILE', 'профиль не найден');
    const rawDb = readDB(id);
    if (rawDb === null || typeof rawDb !== 'object') fail('NO_DB', 'нет данных профиля');
    const rawCfg = readCFG(id) || {};
    const warnings = [];

    let db, mediaItems = [];
    if (mode === 'data-only') {
      db = stripMediaRefs(stripDbInternal(rawDb));
    } else {
      db = stripDbInternal(rawDb);
      const refs = collectMediaRefs(db);
      const keep = new Set();
      for (const mid of refs) {
        const rec = await media.get(mid);
        if (!rec || typeof rec.data !== 'string') { warnings.push('missing_media:' + mid); continue; }
        const { mime, bytes } = canonicalMediaBytes(rec.data); // canonical bytes + MIME (вкл. параметры)
        mediaItems.push({ id: mid, mime, sha256: await sha256Hex(bytes), bytes: bytesToBase64(bytes) });
        keep.add(mid);
      }
      // Отброшенные (missing) ссылки убираем из копии, чтобы не осталось битых ref.
      if (keep.size !== refs.size) {
        const drop = {}; for (const r of refs) if (!keep.has(r)) drop[r] = null;
        db = (function pruneMissing(d) {
          const out = clone(d);
          for (const c of Object.keys(out)) { const a = out[c]; if (!Array.isArray(a)) continue; for (const rec of a) if (rec && Array.isArray(rec.media)) rec.media = rec.media.filter(m => !(m in drop)); }
          return out;
        })(db);
      }
    }

    const payload = {
      payloadVersion: SCHEMA.PAYLOAD_VERSION,
      app: SCHEMA.APP,
      mode,
      createdAt: now(),
      profileName: (profile.name || 'Профиль').slice(0, 200),
      db,
      cfg: stripConnection(rawCfg),
      media: mediaItems,
    };
    validatePayload(payload);     // fail-closed до отдачи наружу
    return { payload, warnings };
  }

  // ── План media: reuse без перезаписи / collision remap / writes ──
  // Возвращает { writes:[{id,record}], reuses:[id], remaps:{old:new} }.
  async function planMedia(bundleMedia) {
    const writes = [], reuses = [], remaps = {};
    const targetTaken = new Set();
    for (const item of bundleMedia) {
      const existing = await media.get(item.id);
      if (existing && typeof existing.data === 'string') {
        // Тот же id уже есть — сравниваем canonical bytes + MIME.
        let same = false;
        try {
          const { mime, bytes } = canonicalMediaBytes(existing.data);
          same = (mime === item.mime) && (await sha256Hex(bytes)) === item.sha256;
        } catch (e) { same = false; }
        if (same) { reuses.push(item.id); continue; }          // identical → reuse, НЕ перезаписываем
        // collision: тот же id, но другие bytes/MIME → новый id.
        let nid; do { nid = genMediaId(); } while (targetTaken.has(nid) || await media.get(nid));
        targetTaken.add(nid); remaps[item.id] = nid;
        writes.push({ id: nid, record: { data: dataUrlOf(item.mime, item.bytes), type: mediaTypeFor(item.mime), createdAt: now() } });
      } else {
        // id свободен → пишем под ним же.
        targetTaken.add(item.id);
        writes.push({ id: item.id, record: { data: dataUrlOf(item.mime, item.bytes), type: mediaTypeFor(item.mime), createdAt: now() } });
      }
    }
    return { writes, reuses, remaps };
  }

  async function writeStagedMedia(writes) {
    for (const w of writes) await media.put(w.id, w.record);
  }

  // ── Snapshot: точные прежние значения всех затрагиваемых ключей и media ──
  // spec: registry, active, все relevant DB/CFG/bak/rec/snap keys, media records,
  // и список НОВЫХ создаваемых keys/mediaIds (чтобы rollback их удалил).
  async function snapshot({ storageKeys: keysToCapture = [], mediaIds = [] }) {
    const ls = {};
    // Всегда фиксируем registry и active.
    for (const k of [KEYS.PKEY, KEYS.AKEY, ...keysToCapture]) {
      if (k in ls) continue;
      const v = storage.getItem(k);
      ls[k] = (v == null) ? { existed: false } : { existed: true, value: v };
    }
    const md = {};
    for (const id of mediaIds) {
      if (id in md) continue;
      const rec = await media.get(id);
      md[id] = (rec === undefined || rec === null) ? { existed: false } : { existed: true, value: clone(rec) };
    }
    return { ls, md, ts: now() };
  }

  // ── Rollback: точное восстановление. Ошибку rollback НЕ скрываем. ──
  async function rollback(snap) {
    if (!snap || !snap.ls || !snap.md) fail('BAD_SNAPSHOT', 'некорректный snapshot');
    const errors = [];
    for (const k of Object.keys(snap.ls)) {
      const s = snap.ls[k];
      try { if (s.existed) storage.setItem(k, s.value); else storage.removeItem(k); }
      catch (e) { errors.push('ls:' + k); }
    }
    for (const id of Object.keys(snap.md)) {
      const s = snap.md[id];
      try { if (s.existed) await media.put(id, s.value); else await media.del(id); }
      catch (e) { errors.push('media:' + id); }
    }
    if (errors.length) fail('ROLLBACK_FAILED', 'откат не полностью выполнен: ' + errors.join(','));
    return true;
  }

  // ── Staged write профиля (DB/CFG + upsert в registry). Без активации. ──
  function writeStagedProfile({ id, profile, db, cfg }) {
    storage.setItem(KEYS.db(id), JSON.stringify(db));
    storage.setItem(KEYS.cfg(id), JSON.stringify(cfg));
    const list = listProfiles();
    const i = list.findIndex(p => p && p.id === id);
    if (i >= 0) list[i] = { ...list[i], ...profile, id };
    else list.push({ id, name: (profile && profile.name) || 'Профиль', color: (profile && profile.color) || '#1056CC' });
    storage.setItem(KEYS.PKEY, JSON.stringify(list));
  }

  // ── Verify: перечитать из хранилища и сравнить с ожидаемым. ──
  function verifyProfile({ id, db, cfg }) {
    const gotDb = readDB(id), gotCfg = readCFG(id);
    if (JSON.stringify(gotDb) !== JSON.stringify(db)) fail('VERIFY_DB', 'проверка DB не прошла');
    if (JSON.stringify(gotCfg) !== JSON.stringify(cfg)) fail('VERIFY_CFG', 'проверка CFG не прошла');
    const inReg = listProfiles().some(p => p && p.id === id);
    if (!inReg) fail('VERIFY_REGISTRY', 'профиль отсутствует в реестре');
    return true;
  }

  // ── Activate: только после успешной проверки. ──
  function activate(id) {
    if (!getProfile(id)) fail('NO_PROFILE', 'нельзя активировать несуществующий профиль');
    storage.setItem(KEYS.AKEY, id);
    return true;
  }

  // ── Connection preservation: CFG нового/заменяемого профиля. ──
  // replace: подставить connection существующего профиля; new: пустые/default.
  function buildRestoreCfg({ bundleCfg, targetId, replace }) {
    const base = { ...(bundleCfg || {}) };
    for (const f of CONNECTION_FIELDS) base[f] = '';       // новый профиль — пусто/default
    if (replace) {
      const existing = readConnectionSettings(targetId);
      for (const f of CONNECTION_FIELDS) base[f] = existing[f];
    }
    return base;
  }

  return {
    KEYS, CONNECTION_FIELDS,
    listProfiles, getActiveId, getProfile, readDB, readCFG, readConnectionSettings,
    buildBundle, planMedia, writeStagedMedia,
    collectMediaRefs, rewriteRefs, stripConnection,
    snapshot, rollback, writeStagedProfile, verifyProfile, activate, buildRestoreCfg,
    _storageKeys: storageKeys,
  };
}
