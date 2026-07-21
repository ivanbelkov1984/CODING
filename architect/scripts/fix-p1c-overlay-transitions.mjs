import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '..');
const file = resolve(root, 'styles.css');
let source = await readFile(file, 'utf8');

function replaceOnce(before, after, label) {
  const first = source.indexOf(before);
  const last = source.lastIndexOf(before);
  if (first < 0) throw new Error(`missing anchor: ${label}`);
  if (first !== last) throw new Error(`non-unique anchor: ${label}`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(
  `.ov{position:fixed;inset:0;background:rgba(0,0,0,.42);z-index:100;display:flex;align-items:flex-end;opacity:0;pointer-events:none;transition:opacity var(--dur2) var(--e)}`,
  `.ov{position:fixed;inset:0;background:rgba(0,0,0,.42);z-index:100;display:flex;align-items:flex-end;opacity:0;pointer-events:none;transition:none}`,
  'overlay opacity transition',
);
replaceOnce(
  `.sheet{background:var(--sf);border-radius:var(--r20) var(--r20) 0 0;width:100%;max-height:90dvh;overflow-y:auto;padding-bottom:max(env(safe-area-inset-bottom),20px);border-top:1px solid var(--bd);box-shadow:none;transform:translateY(100%);transition:transform var(--dur3) var(--e)}`,
  `.sheet{background:var(--sf);border-radius:var(--r20) var(--r20) 0 0;width:100%;max-height:90dvh;overflow-y:auto;padding-bottom:max(env(safe-area-inset-bottom),20px);border-top:1px solid var(--bd);box-shadow:none;transform:none;transition:none}`,
  'sheet transform transition',
);

await writeFile(file, source);
console.log('P1C_OVERLAY_TRANSITIONS_REMOVED');
