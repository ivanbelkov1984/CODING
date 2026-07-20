import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../tests/mobile-evidence.mjs', import.meta.url);
let source = await readFile(file, 'utf8');
const before = `    const activeContentVisible = await page.locator('#pg-sys.on .card').first().isVisible();
    record(engine, scenario.name, 'active page content is visibly rendered', activeContentVisible);
    await page.screenshot({ path: join(OUT, \`${'${engine}'}-${'${scenario.name}'}.png\`), fullPage: true });
    record(engine, scenario.name, 'screenshot captured after page transition', true);`;
const after = `    const activeContentVisible = await page.locator('#pg-sys.on .card').first().isVisible();
    record(engine, scenario.name, 'active page content is visibly rendered', activeContentVisible);
    const renderState = await page.evaluate(() => {
      const pg = document.querySelector('#pg-sys.on');
      const card = pg && pg.querySelector('.card');
      const splash = document.getElementById('splash');
      const pgStyle = pg ? getComputedStyle(pg) : null;
      const cardStyle = card ? getComputedStyle(card) : null;
      const cardRect = card ? card.getBoundingClientRect() : null;
      const splashStyle = splash ? getComputedStyle(splash) : null;
      return {
        pageOpacity: pgStyle && pgStyle.opacity,
        pageTransform: pgStyle && pgStyle.transform,
        pageVisibility: pgStyle && pgStyle.visibility,
        cardOpacity: cardStyle && cardStyle.opacity,
        cardVisibility: cardStyle && cardStyle.visibility,
        cardDisplay: cardStyle && cardStyle.display,
        cardRect: cardRect && { x: cardRect.x, y: cardRect.y, width: cardRect.width, height: cardRect.height },
        splashDisplay: splashStyle && splashStyle.display,
        splashOpacity: splashStyle && splashStyle.opacity,
      };
    });
    record(engine, scenario.name, 'active page compositing state is stable', renderState.pageOpacity === '1' && renderState.pageTransform === 'none' && renderState.pageVisibility === 'visible', JSON.stringify(renderState));
    record(engine, scenario.name, 'splash is not a blocking layer', renderState.splashDisplay === 'none' || renderState.splashOpacity === '0', \`display=\${renderState.splashDisplay}, opacity=\${renderState.splashOpacity}\`);
    await page.screenshot({ path: join(OUT, \`${'${engine}'}-${'${scenario.name}'}-viewport.png\`), fullPage: false, animations: 'disabled', caret: 'hide' });
    record(engine, scenario.name, 'viewport screenshot captured', true);
    await page.locator('#app').screenshot({ path: join(OUT, \`${'${engine}'}-${'${scenario.name}'}-app.png\`), animations: 'disabled', caret: 'hide' });
    record(engine, scenario.name, 'application element screenshot captured', true);`;
if (source.includes('active page compositing state is stable')) {
  console.log('viewport screenshot evidence already applied');
  process.exit(0);
}
if (!source.includes(before)) throw new Error('expected full-page screenshot block not found');
source = source.replace(before, after);
await writeFile(file, source);
console.log('switched mobile evidence to viewport and app screenshots');
