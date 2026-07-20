import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../tests/mobile-evidence.mjs', import.meta.url);
let source = await readFile(file, 'utf8');
const before = `    await page.evaluate(() => { try { goTo('sys'); } catch {} });
    await page.waitForTimeout(100);
    await page.screenshot({ path: join(OUT, \`${'${engine}'}-${'${scenario.name}'}.png\`), fullPage: true });
    record(engine, scenario.name, 'screenshot captured', true);`;
const after = `    await page.evaluate(() => { try { goTo('sys'); } catch {} });
    await page.locator('#pg-sys.on').waitFor({ state: 'visible', timeout: 5_000 });
    await page.waitForTimeout(300);
    const activeContentVisible = await page.locator('#pg-sys.on .card').first().isVisible();
    record(engine, scenario.name, 'active page content is visibly rendered', activeContentVisible);
    await page.screenshot({ path: join(OUT, \`${'${engine}'}-${'${scenario.name}'}.png\`), fullPage: true });
    record(engine, scenario.name, 'screenshot captured after page transition', true);`;
if (source.includes("active page content is visibly rendered")) {
  console.log('mobile screenshot stabilization already applied');
  process.exit(0);
}
if (!source.includes(before)) throw new Error('expected screenshot timing block not found');
source = source.replace(before, after);
await writeFile(file, source);
console.log('stabilized mobile screenshot timing and visibility assertion');
