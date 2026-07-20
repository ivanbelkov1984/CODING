import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../styles.css', import.meta.url);
let source = await readFile(file, 'utf8');
const marker = '/* WebKit safety: never leave an active page on the transparent first animation frame. */';
if (source.includes(marker)) {
  console.log('WebKit page transition fallback already applied');
  process.exit(0);
}
const before = '@keyframes pgIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}';
const after = `${before}\n${marker}\n@supports (-webkit-touch-callout:none){.pg.on{animation:none;opacity:1;transform:none}}`;
if (!source.includes(before)) throw new Error('pgIn animation anchor not found');
source = source.replace(before, after);
await writeFile(file, source);
console.log('applied WebKit-safe page transition fallback');
