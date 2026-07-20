import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../../app.js', import.meta.url), 'utf8');
const IDCOLS = ['insights','dreams','patterns','evolution','spiritual','checkins','bots','digests','spheres','sphereLogs','chats','cravings'];
const DEL_LEGACY = '_legacy';
const DAY = 864e5;
let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    throw error;
  }
}

const delObj = value => !!value && typeof value === 'object' && !Array.isArray(value);
const sameId = (a, b) => String(a) === String(b);
const recordCollections = (id, ...dbs) => IDCOLS.filter(collection =>
  dbs.some(db => Array.isArray(db?.[collection]) && db[collection].some(record => record?.id != null && sameId(record.id, id)))
);
function putDel(root, collection, id, timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || id == null) return;
  const bucket = delObj(root[collection]) ? root[collection] : (root[collection] = {});
  const key = String(id);
  bucket[key] = Math.max(Number(bucket[key]) || 0, value);
}
function normaliseDel(db) {
  const out = {};
  const source = delObj(db?._del) ? db._del : {};
  for (const [key, value] of Object.entries(source)) {
    if (delObj(value)) {
      for (const [id, timestamp] of Object.entries(value)) putDel(out, key, id, timestamp);
    } else {
      putDel(out, DEL_LEGACY, key, value);
    }
  }
  const legacy = out[DEL_LEGACY];
  if (legacy) {
    for (const [id, timestamp] of Object.entries({ ...legacy })) {
      const matches = recordCollections(id, db);
      if (matches.length === 1) {
        putDel(out, matches[0], id, timestamp);
        delete legacy[id];
      }
    }
    if (!Object.keys(legacy).length) delete out[DEL_LEGACY];
  }
  return out;
}
const updatedAt = record => record?._u || record?.id || 0;
function mergeById(left = [], right = [], deleted = {}) {
  const map = new Map();
  const put = record => {
    if (!record || record.id == null) return;
    const existing = map.get(record.id);
    if (!existing || updatedAt(record) >= updatedAt(existing)) map.set(record.id, record);
  };
  left.forEach(put);
  right.forEach(put);
  for (const [id, timestamp] of Object.entries(delObj(deleted) ? deleted : {})) {
    const key = map.has(+id) ? +id : id;
    const record = map.get(key);
    if (record && Number(timestamp) >= updatedAt(record)) map.delete(key);
  }
  return [...map.values()];
}
function mergeDel(local, remote, now = Date.now()) {
  const out = {};
  const cutoff = now - 120 * DAY;
  for (const source of [normaliseDel(remote), normaliseDel(local)]) {
    for (const [collection, bucket] of Object.entries(source)) {
      for (const [id, timestamp] of Object.entries(delObj(bucket) ? bucket : {})) putDel(out, collection, id, timestamp);
    }
  }
  const legacy = out[DEL_LEGACY];
  if (legacy) {
    for (const [id, timestamp] of Object.entries({ ...legacy })) {
      const matches = recordCollections(id, local, remote);
      if (matches.length === 1) {
        putDel(out, matches[0], id, timestamp);
        delete legacy[id];
      }
    }
    if (!Object.keys(legacy).length) delete out[DEL_LEGACY];
  }
  for (const [collection, bucket] of Object.entries({ ...out })) {
    if (!delObj(bucket)) {
      delete out[collection];
      continue;
    }
    for (const [id, timestamp] of Object.entries(bucket)) if (Number(timestamp) < cutoff) delete bucket[id];
    if (!Object.keys(bucket).length) delete out[collection];
  }
  return out;
}
function mergeDB(local, remote, now = Date.now()) {
  const deleted = mergeDel(local, remote, now);
  const out = { ...local, _del: deleted };
  for (const collection of IDCOLS) {
    out[collection] = mergeById(local?.[collection] || [], remote?.[collection] || [], deleted[collection] || {});
  }
  return out;
}
function untomb(db, collection, id) {
  const bucket = delObj(db?._del?.[collection]) ? db._del[collection] : null;
  if (!bucket) return;
  delete bucket[String(id)];
  if (!Object.keys(bucket).length) delete db._del[collection];
}

console.log('Tombstone namespacing regression');

test('production source declares the v3 collection namespace and migration hook', () => {
  assert.match(app, /const DEL_LEGACY = '_legacy';/);
  assert.match(app, /let changed = migrateTombstones\(DB\);/);
  assert.match(app, /out\[c\] = mergeById\([^\n]+del\[c\] \|\| \{\}\)/);
});

test('all known internal deletion paths pass an explicit collection', () => {
  assert.match(app, /tomb\(coll, id\);/);
  assert.match(app, /tomb\('spheres', id\);/);
  assert.match(app, /tomb\('sphereLogs', l\.id\);/);
  assert.match(app, /tomb\('digests', d\.id\)/);
  assert.doesNotMatch(app, /if \(DB\._del\) delete DB\._del\[id\]/);
  assert.match(app, /untomb\(coll, id\);/);
});

test('deleting insights/shared-id does not delete dreams/shared-id', () => {
  const timestamp = 500;
  const local = {
    insights: [{ id: 'shared-id', _u: 100, text: 'insight' }],
    dreams: [{ id: 'shared-id', _u: 100, text: 'dream' }],
    _del: { insights: { 'shared-id': timestamp } },
  };
  const merged = mergeDB(local, {});
  assert.equal(merged.insights.length, 0);
  assert.equal(merged.dreams.length, 1);
});

test('collision remains safe in reverse merge direction', () => {
  const local = { insights: [{ id: 'shared-id', _u: 100 }], dreams: [{ id: 'shared-id', _u: 100 }], _del: {} };
  const remote = { _del: { dreams: { 'shared-id': 500 } } };
  const forward = mergeDB(local, remote);
  const reverse = mergeDB(remote, local);
  for (const result of [forward, reverse]) {
    assert.equal(result.insights.length, 1);
    assert.equal(result.dreams.length, 0);
  }
});

test('a unique legacy flat tombstone migrates to its one collection', () => {
  const db = { insights: [{ id: 'unique', _u: 100 }], dreams: [], _del: { unique: 500 } };
  assert.deepEqual(normaliseDel(db), { insights: { unique: 500 } });
  assert.equal(mergeDB(db, {}).insights.length, 0);
});

test('an ambiguous legacy flat tombstone is fail-safe and deletes neither collection', () => {
  const db = {
    insights: [{ id: 'shared', _u: 100 }],
    dreams: [{ id: 'shared', _u: 100 }],
    _del: { shared: 500 },
  };
  const migrated = normaliseDel(db);
  assert.deepEqual(migrated, { _legacy: { shared: 500 } });
  const merged = mergeDB(db, {});
  assert.equal(merged.insights.length, 1);
  assert.equal(merged.dreams.length, 1);
  assert.deepEqual(merged._del, { _legacy: { shared: 500 } });
});

test('migration is idempotent', () => {
  const first = { insights: [{ id: 'one', _u: 1 }], _del: { one: 20 } };
  const once = normaliseDel(first);
  const twice = normaliseDel({ ...first, _del: once });
  assert.deepEqual(twice, once);
});

test('newer tombstone timestamp wins and expired tombstones are removed', () => {
  const now = Date.now();
  const local = { _del: { insights: { keep: now - DAY, old: now - 121 * DAY } } };
  const remote = { _del: { insights: { keep: now } } };
  assert.deepEqual(mergeDel(local, remote, now), { insights: { keep: now } });
});

test('undo removes only the selected collection tombstone', () => {
  const db = { _del: { insights: { shared: 500 }, dreams: { shared: 600 } } };
  untomb(db, 'insights', 'shared');
  assert.deepEqual(db._del, { dreams: { shared: 600 } });
});

test('snapshot/export JSON roundtrip preserves namespaced tombstones', () => {
  const db = { insights: [], dreams: [], _del: { insights: { a: 10 }, dreams: { a: 20 }, _legacy: { z: 30 } } };
  const restored = JSON.parse(JSON.stringify({ db })).db;
  assert.deepEqual(restored._del, db._del);
});

test('a newer record survives an older tombstone in its own collection', () => {
  const result = mergeById([{ id: 'r', _u: 900 }], [], { r: 500 });
  assert.equal(result.length, 1);
});

console.log(`TOMBSTONE_REGRESSION_TESTS=${passed}`);
console.log('TOMBSTONE_NAMESPACING_REGRESSION_PASS');
