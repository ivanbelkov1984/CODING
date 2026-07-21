import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '..');

async function edit(path, transform) {
  const file = resolve(root, path);
  const before = await readFile(file, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`no change produced for ${path}`);
  await writeFile(file, after);
  console.log(`updated ${path}`);
}

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  const last = source.lastIndexOf(before);
  if (first < 0) throw new Error(`missing anchor: ${label}`);
  if (first !== last) throw new Error(`non-unique anchor: ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

await edit('styles.css', source => {
  source = replaceOnce(
    source,
    `.ov{position:fixed;inset:0;background:rgba(0,0,0,.42);z-index:100;display:flex;align-items:flex-end;opacity:0;pointer-events:none;transition:opacity var(--dur2) var(--e)}`,
    `.ov{position:fixed;inset:0;background:rgba(0,0,0,.42);z-index:100;display:flex;align-items:flex-end;opacity:0;pointer-events:none;transition:none}`,
    'overlay opacity transition',
  );
  source = replaceOnce(
    source,
    `.sheet{background:var(--sf);border-radius:var(--r20) var(--r20) 0 0;width:100%;max-height:90dvh;overflow-y:auto;padding-bottom:max(env(safe-area-inset-bottom),20px);border-top:1px solid var(--bd);box-shadow:none;transform:translateY(100%);transition:transform var(--dur3) var(--e)}`,
    `.sheet{background:var(--sf);border-radius:var(--r20) var(--r20) 0 0;width:100%;max-height:90dvh;overflow-y:auto;padding-bottom:max(env(safe-area-inset-bottom),20px);border-top:1px solid var(--bd);box-shadow:none;transform:none;transition:none}`,
    'sheet transform transition',
  );
  return source;
});

await edit('tests/evidence/privacy_feedback_regression.mjs', source => replaceOnce(
  source,
  `  assert.match(stylesSource, /\\.ov\\.on \\.sheet,\\.ov\\.on \\.onboard-sheet\\{animation:none;opacity:1;transform:none\\}/);
  assert.doesNotMatch(stylesSource, /@keyframes ovIn/);`,
  `  assert.match(stylesSource, /\\.ov\\{[^}]*transition:none\\}/);
  assert.match(stylesSource, /\\.sheet\\{[^}]*transform:none;transition:none\\}/);
  assert.match(stylesSource, /\\.ov\\.on \\.sheet,\\.ov\\.on \\.onboard-sheet\\{animation:none;opacity:1;transform:none\\}/);
  assert.doesNotMatch(stylesSource, /@keyframes ovIn/);`,
  'deterministic overlay focused assertions',
));

console.log('P1C_OVERLAY_TRANSITIONS_REMOVED');
