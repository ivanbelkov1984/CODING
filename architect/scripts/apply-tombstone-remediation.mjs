import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../app.js', import.meta.url);
let source = await readFile(file, 'utf8');

if (source.includes("const DEL_LEGACY = '_legacy';")) {
  console.log('tombstone remediation already applied');
  process.exit(0);
}

function replaceOnce(before, after, label) {
  const first = source.indexOf(before);
  const last = source.lastIndexOf(before);
  if (first < 0) throw new Error(`missing patch anchor: ${label}`);
  if (first !== last) throw new Error(`non-unique patch anchor: ${label}`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(
  "  _del: {},   // «надгробия» удалённых записей: { id: timestamp }",
  "  _del: {},   // надгробия v3: { collection: { id: timestamp } }; legacy flat keys migrate conservatively",
  'DEFAULT_DB tombstone schema',
);

replaceOnce(
  'function migrateRecords() {\n  let changed = false;',
  'function migrateRecords() {\n  let changed = migrateTombstones(DB);',
  'hydrate migration hook',
);

replaceOnce('  tomb(id);\n  DB[coll].splice(idx, 1);', "  tomb(coll, id);\n  DB[coll].splice(idx, 1);", 'generic undo deletion');
replaceOnce("function deleteSphere(id) {\n  tomb(id);", "function deleteSphere(id) {\n  tomb('spheres', id);", 'sphere deletion');
replaceOnce("DB.sphereLogs.filter(l => l.sphereId === id).forEach(l => tomb(l.id));", "DB.sphereLogs.filter(l => l.sphereId === id).forEach(l => tomb('sphereLogs', l.id));", 'sphere log deletion');
replaceOnce("if (seen[k]) { tomb(d.id); removed++; return false; }", "if (seen[k]) { tomb('digests', d.id); removed++; return false; }", 'digest dedupe deletion');
replaceOnce("(DB.digests || []).filter(d => digWk(d) === wkKey).forEach(d => tomb(d.id));", "(DB.digests || []).filter(d => digWk(d) === wkKey).forEach(d => tomb('digests', d.id));", 'digest replacement deletion');
replaceOnce("while (DB.digests.length > 19) tomb(DB.digests.pop().id);", "while (DB.digests.length > 19) tomb('digests', DB.digests.pop().id);", 'digest retention deletion');

const oldMerge = `// ─── ВЕРСИИ ЗАПИСЕЙ + СЛИЯНИЕ ────────────────────────────────────
// Каждая правка помечает запись меткой времени \`_u\`; удаление кладёт
// «надгробие» в DB._del. Слияние — union по id, где новейшая метка
// побеждает, а надгробие удаляет запись на всех устройствах.
const IDCOLS = ['insights','dreams','patterns','evolution','spiritual','checkins','bots','digests','spheres','sphereLogs','chats','cravings'];
function touch(rec) { if (rec && typeof rec === 'object') rec._u = Date.now(); return rec; }
function tomb(id) { (DB._del || (DB._del = {}))[id] = Date.now(); }
const _ru = r => r._u || r.id || 0;   // «когда обновлено» с откатом на id (id = Date.now())
function mergeById(a = [], b = [], del = {}) {
  const map = new Map();
  const put = r => {
    if (!r || r.id == null) return;
    const ex = map.get(r.id);
    if (!ex || _ru(r) >= _ru(ex)) map.set(r.id, r);
  };
  a.forEach(put); b.forEach(put);
  for (const [id, dt] of Object.entries(del)) {
    const key = map.has(+id) ? +id : id;
    const r = map.get(key);
    if (r && dt >= _ru(r)) map.delete(key);
  }
  return [...map.values()];
}
function mergeDB(local, remote) {
  // объединяем надгробия (максимальная метка), чистим старше 120 дней
  const del = {}, cutoff = Date.now() - 120*864e5;
  for (const src of [remote._del, local._del])
    for (const k in (src || {})) del[k] = Math.max(del[k] || 0, src[k]);
  for (const k in del) if (del[k] < cutoff) delete del[k];
  const out = { ...DEFAULT_DB, ...local, _del: del };
  IDCOLS.forEach(c => { out[c] = mergeById(local[c] || [], remote[c] || [], del); });
  // скалярные поля (состояние/главы/вопросы) — берём из более свежего документа
  const scal = (remote.__ts || 0) > (local.__ts || 0) ? remote : local;
  ['vit','chapters','oq','env'].forEach(k => { if (scal[k] !== undefined) out[k] = scal[k]; });
  out.__ts = Math.max(local.__ts || 0, remote.__ts || 0);
  return out;
}`;

const newMerge = `// ─── ВЕРСИИ ЗАПИСЕЙ + СЛИЯНИЕ ────────────────────────────────────
// Каждая правка помечает запись меткой времени \`_u\`. Надгробия v3
// неймспейсятся по коллекции, поэтому одинаковый id в разных IDCOLS не
// может удалить чужую запись. Старый плоский формат сохраняется в
// _legacy и применяется только когда id однозначно принадлежит одной
// коллекции — при неоднозначности данные сохраняются, а не уничтожаются.
const IDCOLS = ['insights','dreams','patterns','evolution','spiritual','checkins','bots','digests','spheres','sphereLogs','chats','cravings'];
const DEL_LEGACY = '_legacy';
function touch(rec) { if (rec && typeof rec === 'object') rec._u = Date.now(); return rec; }
const _delObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const _sameId = (a, b) => String(a) === String(b);
function _recordCollections(id, ...dbs) {
  return IDCOLS.filter(c => dbs.some(db => Array.isArray(db && db[c]) && db[c].some(r => r && r.id != null && _sameId(r.id, id))));
}
function _putDel(root, coll, id, ts) {
  const n = Number(ts); if (!Number.isFinite(n) || id == null) return;
  const bucket = _delObj(root[coll]) ? root[coll] : (root[coll] = {});
  const key = String(id); bucket[key] = Math.max(Number(bucket[key]) || 0, n);
}
function _normaliseDel(db) {
  const out = {}, src = _delObj(db && db._del) ? db._del : {};
  for (const [key, value] of Object.entries(src)) {
    if (_delObj(value)) {
      for (const [id, ts] of Object.entries(value)) _putDel(out, key, id, ts);
    } else {
      // v2 legacy: { id: timestamp }
      _putDel(out, DEL_LEGACY, key, value);
    }
  }
  const legacy = out[DEL_LEGACY];
  if (legacy) {
    for (const [id, ts] of Object.entries({ ...legacy })) {
      const matches = _recordCollections(id, db);
      if (matches.length === 1) { _putDel(out, matches[0], id, ts); delete legacy[id]; }
    }
    if (!Object.keys(legacy).length) delete out[DEL_LEGACY];
  }
  return out;
}
function migrateTombstones(db) {
  if (!db || typeof db !== 'object') return false;
  const before = JSON.stringify(_delObj(db._del) ? db._del : {});
  const next = _normaliseDel(db); db._del = next;
  return before !== JSON.stringify(next);
}
function tomb(coll, id) {
  // Совместимость с внешним старым вызовом tomb(id): мигрируем только
  // при однозначной коллекции; иначе сохраняем безопасный _legacy.
  if (id === undefined) {
    id = coll;
    const matches = _recordCollections(id, DB);
    coll = matches.length === 1 ? matches[0] : DEL_LEGACY;
  }
  if (coll !== DEL_LEGACY && !IDCOLS.includes(coll)) { log('warn', 'tomb: неизвестная коллекция', coll); return; }
  const root = _delObj(DB._del) ? DB._del : (DB._del = {});
  _putDel(root, coll, id, Date.now());
}
const _ru = r => r._u || r.id || 0;   // «когда обновлено» с откатом на id (id = Date.now())
function mergeById(a = [], b = [], del = {}) {
  const map = new Map();
  const put = r => {
    if (!r || r.id == null) return;
    const ex = map.get(r.id);
    if (!ex || _ru(r) >= _ru(ex)) map.set(r.id, r);
  };
  a.forEach(put); b.forEach(put);
  for (const [id, dt] of Object.entries(_delObj(del) ? del : {})) {
    const key = map.has(+id) ? +id : id;
    const r = map.get(key);
    if (r && Number(dt) >= _ru(r)) map.delete(key);
  }
  return [...map.values()];
}
function _mergeDel(local, remote) {
  const del = {}, cutoff = Date.now() - 120*864e5;
  for (const src of [_normaliseDel(remote), _normaliseDel(local)])
    for (const [coll, bucket] of Object.entries(src))
      for (const [id, ts] of Object.entries(_delObj(bucket) ? bucket : {})) _putDel(del, coll, id, ts);
  const legacy = del[DEL_LEGACY];
  if (legacy) {
    for (const [id, ts] of Object.entries({ ...legacy })) {
      const matches = _recordCollections(id, local, remote);
      if (matches.length === 1) { _putDel(del, matches[0], id, ts); delete legacy[id]; }
    }
    if (!Object.keys(legacy).length) delete del[DEL_LEGACY];
  }
  for (const [coll, bucket] of Object.entries({ ...del })) {
    if (!_delObj(bucket)) { delete del[coll]; continue; }
    for (const [id, ts] of Object.entries(bucket)) if (Number(ts) < cutoff) delete bucket[id];
    if (!Object.keys(bucket).length) delete del[coll];
  }
  return del;
}
function mergeDB(local, remote) {
  const del = _mergeDel(local || {}, remote || {});
  const out = { ...DEFAULT_DB, ...local, _del: del };
  IDCOLS.forEach(c => { out[c] = mergeById((local && local[c]) || [], (remote && remote[c]) || [], del[c] || {}); });
  // скалярные поля (состояние/главы/вопросы) — берём из более свежего документа
  const scal = ((remote && remote.__ts) || 0) > ((local && local.__ts) || 0) ? remote : local;
  ['vit','chapters','oq','env'].forEach(k => { if (scal && scal[k] !== undefined) out[k] = scal[k]; });
  out.__ts = Math.max((local && local.__ts) || 0, (remote && remote.__ts) || 0);
  return out;
}`;

replaceOnce(oldMerge, newMerge, 'tombstone merge engine');

await writeFile(file, source);
console.log('applied collection-scoped tombstone remediation');
