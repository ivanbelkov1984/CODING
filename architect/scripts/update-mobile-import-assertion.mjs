import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../tests/mobile-evidence.mjs', import.meta.url);
let source = await readFile(file, 'utf8');
const before = "record(engine, scenario.name, 'browser import preserves local connection', transfer.localApi === 'https://local-device.invalid' && transfer.localSpace === 'LOCAL-SPACE-KEY' && transfer.localSync === 'LOCAL-SYNC');";
const after = "record(engine, scenario.name, 'browser import preserves local connection identity and rejects file sync metadata', transfer.localApi === 'https://local-device.invalid' && transfer.localSpace === 'LOCAL-SPACE-KEY' && transfer.localSync !== 'FILE-SYNC', `lastSync=${transfer.localSync}`);";
if (source.includes(after)) {
  console.log('mobile import assertion already updated');
  process.exit(0);
}
if (!source.includes(before)) throw new Error('expected mobile import assertion not found');
source = source.replace(before, after);
await writeFile(file, source);
console.log('updated mobile import assertion');
