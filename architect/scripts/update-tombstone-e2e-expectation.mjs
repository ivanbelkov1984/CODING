import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../tests/e2e.mjs', import.meta.url);
let source = await readFile(file, 'utf8');
const before = "return { removed, left: DB.digests.filter(d => digWk(d) === k).length, tombed: !!(DB._del || {})[999] };";
const after = "return { removed, left: DB.digests.filter(d => digWk(d) === k).length, tombed: !!(DB._del && DB._del.digests && DB._del.digests[999]) };";
if (source.includes(after)) {
  console.log('E2E expectation already updated');
  process.exit(0);
}
if (!source.includes(before)) throw new Error('expected legacy E2E assertion not found');
source = source.replace(before, after);
await writeFile(file, source);
console.log('updated E2E expectation for collection-scoped digest tombstone');
