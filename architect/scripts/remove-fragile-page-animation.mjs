import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../styles.css', import.meta.url);
let source = await readFile(file, 'utf8');
const before = `.pg.on{display:block;animation:pgIn var(--dur2) var(--e)}
@keyframes pgIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
/* WebKit safety: never leave an active page on the transparent first animation frame. */
@supports (-webkit-touch-callout:none){.pg.on{animation:none;opacity:1;transform:none}}`;
const after = `.pg.on{display:block;opacity:1;transform:none}`;
if (source.includes(after) && !source.includes('@keyframes pgIn')) {
  console.log('fragile page animation already removed');
  process.exit(0);
}
if (!source.includes(before)) throw new Error('expected page animation block not found');
source = source.replace(before, after);
await writeFile(file, source);
console.log('removed fragile page transition animation');
