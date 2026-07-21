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

await edit('styles.css', source => replaceOnce(
  source,
  `.ov.on .sheet,.ov.on .onboard-sheet{animation:ovIn 100ms var(--e)}
@keyframes ovIn{from{opacity:0;transform:scale(.98) translateY(4px)}to{opacity:1;transform:none}}`,
  `/* Cross-engine safety: active sheets are deterministic, not left on a transparent compositor frame. */
.ov.on .sheet,.ov.on .onboard-sheet{animation:none;opacity:1;transform:none}`,
  'fragile sheet animation',
));

await edit('tests/mobile-evidence.mjs', source => replaceOnce(
  source,
  `    await page.locator('#ov-feedback.on').waitFor({ state: 'visible', timeout: 5_000 });
    record(engine, scenario.name, 'feedback contact redaction defaults on', feedbackPrivacy.redactChecked);`,
  `    await page.locator('#ov-feedback.on').waitFor({ state: 'visible', timeout: 5_000 });
    await page.waitForTimeout(150);
    const feedbackRender = await page.evaluate(() => {
      const overlay = document.querySelector('#ov-feedback.on');
      const sheet = overlay && overlay.querySelector('.sheet');
      const overlayStyle = overlay ? getComputedStyle(overlay) : null;
      const sheetStyle = sheet ? getComputedStyle(sheet) : null;
      const rect = sheet ? sheet.getBoundingClientRect() : null;
      return {
        overlayOpacity: overlayStyle && overlayStyle.opacity,
        sheetOpacity: sheetStyle && sheetStyle.opacity,
        sheetTransform: sheetStyle && sheetStyle.transform,
        sheetVisibility: sheetStyle && sheetStyle.visibility,
        rect: rect && { width: rect.width, height: rect.height, top: rect.top, bottom: rect.bottom },
      };
    });
    record(engine, scenario.name, 'feedback sheet compositing state is stable',
      feedbackRender.overlayOpacity === '1' && feedbackRender.sheetOpacity === '1'
      && feedbackRender.sheetTransform === 'none' && feedbackRender.sheetVisibility === 'visible'
      && feedbackRender.rect?.width > 0 && feedbackRender.rect?.height > 0,
      JSON.stringify(feedbackRender));
    record(engine, scenario.name, 'feedback contact redaction defaults on', feedbackPrivacy.redactChecked);`,
  'feedback compositor assertion',
));

await edit('tests/evidence/privacy_feedback_regression.mjs', source => {
  source = replaceOnce(
    source,
    `const backendSource = await readFile(new URL('../../backend/feedback.js', import.meta.url), 'utf8');`,
    `const backendSource = await readFile(new URL('../../backend/feedback.js', import.meta.url), 'utf8');
const stylesSource = await readFile(new URL('../../styles.css', import.meta.url), 'utf8');`,
    'styles fixture read',
  );
  source = replaceOnce(
    source,
    `await test('focused privacy regression is part of ordinary data CI', () => {`,
    `await test('active feedback sheets have deterministic cross-engine compositor state', async () => {
  assert.match(stylesSource, /\.ov\.on \.sheet,\.ov\.on \.onboard-sheet\{animation:none;opacity:1;transform:none\}/);
  assert.doesNotMatch(stylesSource, /@keyframes ovIn/);
  assert.match(await readFile(new URL('../mobile-evidence.mjs', import.meta.url), 'utf8'), /feedback sheet compositing state is stable/);
});

await test('focused privacy regression is part of ordinary data CI', () => {`,
    'compositor focused test insertion',
  );
  return source;
});

console.log('P1C_WEBKIT_SHEET_HARDENING_APPLIED');
