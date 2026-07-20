import { readFile, writeFile } from 'node:fs/promises';

// One-time exact patch. The file is removed before the remediation PR is merged.
const file = new URL('../app.js', import.meta.url);
let source = await readFile(file, 'utf8');
if (source.includes('function untomb(coll, id)')) {
  console.log('undo tombstone remediation already applied');
  process.exit(0);
}

const beforeFn = `function tomb(coll, id) {
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
}`;
const afterFn = `${beforeFn}
function untomb(coll, id) {
  const root = _delObj(DB._del) ? DB._del : null;
  const bucket = root && _delObj(root[coll]) ? root[coll] : null;
  if (!bucket) return;
  delete bucket[String(id)];
  if (!Object.keys(bucket).length) delete root[coll];
}`;

function replaceOnce(before, after, label) {
  const first = source.indexOf(before), last = source.lastIndexOf(before);
  if (first < 0) throw new Error(`missing patch anchor: ${label}`);
  if (first !== last) throw new Error(`non-unique patch anchor: ${label}`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(beforeFn, afterFn, 'untomb helper');
replaceOnce('  if (DB._del) delete DB._del[id];', '  untomb(coll, id);', 'undo deletion cleanup');
await writeFile(file, source);
console.log('applied namespaced undo tombstone remediation');
