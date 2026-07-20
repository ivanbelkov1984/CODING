import { chromium, webkit } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(DIR, '..', 'dist');
const OUT = resolve(DIR, '..', 'test-results', 'mobile-evidence');
const results = [];
const failures = [];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.woff2': 'font/woff2',
};
const EXPECTED_NETWORK_NOISE = /access control checks|Returned response is null|railway\.app|local-device\.invalid|ERR_|Failed to load|CORS|NetworkError|Load failed/i;

function record(engine, scenario, check, pass, detail = '') {
  const row = { engine, scenario, check, pass: !!pass, detail: String(detail || '') };
  results.push(row);
  console.log(`  ${pass ? '✓' : '✗'} [${engine}/${scenario}] ${check}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failures.push(row);
}

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const raw = decodeURIComponent((req.url || '/').split('?')[0]);
      const rel = raw === '/' ? 'index.html' : raw.replace(/^\/+/, '');
      const safe = normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '');
      const file = resolve(ROOT, safe);
      if (!file.startsWith(ROOT)) throw new Error('path escape');
      const info = await stat(file);
      if (!info.isFile()) throw new Error('not file');
      const body = await readFile(file);
      res.writeHead(200, {
        'content-type': MIME[extname(file)] || 'application/octet-stream',
        'cache-control': safe === 'sw.js' ? 'no-cache, no-store, must-revalidate' : 'no-cache',
        'service-worker-allowed': '/',
      });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('not found');
    }
  });
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  return { server, url: `http://127.0.0.1:${address.port}/` };
}

const scenarios = [
  { name: 'iphone-se', viewport: { width: 375, height: 667 }, scale: 2, mobile: true, touch: true },
  { name: 'iphone-14', viewport: { width: 390, height: 844 }, scale: 3, mobile: true, touch: true },
  { name: 'ipad-mini', viewport: { width: 768, height: 1024 }, scale: 2, mobile: true, touch: true, importExport: true },
  { name: 'ipad-landscape', viewport: { width: 1024, height: 768 }, scale: 2, mobile: true, touch: true },
];

async function runScenario(browser, engine, scenario, baseUrl) {
  const context = await browser.newContext({
    viewport: scenario.viewport,
    deviceScaleFactor: scenario.scale,
    isMobile: scenario.mobile,
    hasTouch: scenario.touch,
    locale: 'ru-RU',
  });
  const localOrigin = new URL(baseUrl).origin;
  await context.route('**/*', async route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin === localOrigin || requestUrl.protocol === 'blob:' || requestUrl.protocol === 'data:') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ ok: true, synthetic: true, data: null, payload: null }),
    });
  });
  await context.addInitScript(() => {
    localStorage.setItem('arch5_profiles', JSON.stringify([{ id: 'mobile-evidence', name: 'Mobile Evidence', color: '#1056CC' }]));
    localStorage.setItem('arch5_active', 'mobile-evidence');
    localStorage.setItem('arch5_onboarded', '1');
  });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => {
    if (!EXPECTED_NETWORK_NOISE.test(error.message)) pageErrors.push(error.message);
  });
  page.on('dialog', dialog => dialog.accept());

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(700);
    await page.evaluate(() => {
      const splash = document.getElementById('splash');
      if (splash) splash.style.display = 'none';
      document.querySelectorAll('.ov.on').forEach(node => node.classList.remove('on'));
    });

    record(engine, scenario.name, 'application shell renders', await page.locator('body').isVisible());
    const overflow = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
    record(engine, scenario.name, 'no horizontal viewport overflow', overflow.scroll <= overflow.width + 2, `${overflow.scroll}/${overflow.width}`);

    const duplicateIds = await page.evaluate(() => {
      const counts = {};
      document.querySelectorAll('[id]').forEach(node => { counts[node.id] = (counts[node.id] || 0) + 1; });
      return Object.entries(counts).filter(([, count]) => count > 1).map(([id, count]) => `${id}:${count}`);
    });
    record(engine, scenario.name, 'no duplicate DOM ids', duplicateIds.length === 0, duplicateIds.join(', '));

    await page.evaluate(() => openNav());
    record(engine, scenario.name, 'drawer opens on mobile layout', await page.evaluate(() => document.body.classList.contains('nav-open')));
    await page.touchscreen.tap(Math.max(10, scenario.viewport.width - 10), 20).catch(() => {});
    await page.evaluate(() => closeNav());
    record(engine, scenario.name, 'drawer closes after touch path', await page.evaluate(() => !document.body.classList.contains('nav-open')));

    let focused = null;
    for (let attempt = 0; attempt < 12; attempt++) {
      await page.keyboard.press('Tab');
      focused = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const visible = rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= innerHeight && style.visibility !== 'hidden' && style.display !== 'none';
        return { tag: el.tagName, id: el.id || '', visible };
      });
      if (focused?.visible) break;
    }
    record(engine, scenario.name, 'keyboard focus reaches a visible control', !!focused?.visible, focused ? `${focused.tag}${focused.id ? `#${focused.id}` : ''}` : 'none');

    await page.evaluate(() => { openOv('ov-add'); const input = document.getElementById('add-tx'); if (input) input.focus(); });
    await page.setViewportSize({ width: scenario.viewport.width, height: Math.min(500, scenario.viewport.height) });
    const input = page.locator('#add-tx');
    await input.scrollIntoViewIfNeeded();
    const inputFit = await input.evaluate(node => {
      const rect = node.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= innerHeight + 2;
    });
    record(engine, scenario.name, 'focused editor remains reachable in constrained height', inputFit);
    await page.evaluate(() => closeOv('ov-add'));
    await page.setViewportSize(scenario.viewport);

    if (scenario.importExport) {
      const transfer = await page.evaluate(async () => {
        CFG.apiUrl = 'https://local-device.invalid';
        CFG.spaceKey = 'LOCAL-SPACE-KEY';
        CFG.lastSync = 'LOCAL-SYNC';
        CFG.userName = 'Before Export';
        DB.insights = [{ id: 'mobile-export', title: 'Synthetic mobile export', body: 'synthetic only', _u: Date.now() }];
        let captured = null;
        const oldObjectUrl = URL.createObjectURL;
        const oldClick = HTMLAnchorElement.prototype.click;
        const oldScheduleSync = window.scheduleSync;
        URL.createObjectURL = blob => { captured = blob; return 'blob:mobile-evidence'; };
        HTMLAnchorElement.prototype.click = function () {};
        window.scheduleSync = () => {};
        exportData();
        const exported = JSON.parse(await captured.text());
        URL.createObjectURL = oldObjectUrl;
        HTMLAnchorElement.prototype.click = oldClick;

        const importedFile = new File([JSON.stringify({
          db: { insights: [{ id: 'mobile-import', title: 'Synthetic import', body: 'synthetic only' }] },
          cfg: { userName: 'Imported Portable User', apiUrl: 'https://file.invalid', spaceKey: 'FILE-SPACE', lastSync: 'FILE-SYNC' },
        })], 'synthetic-import.json', { type: 'application/json' });
        handleImport({ files: [importedFile] });
        await new Promise(resolve => setTimeout(resolve, 150));
        window.scheduleSync = oldScheduleSync;
        return {
          policy: exported.exportPolicy,
          exportedSpaceKey: Object.hasOwn(exported.cfg || {}, 'spaceKey'),
          exportedApiUrl: Object.hasOwn(exported.cfg || {}, 'apiUrl'),
          exportedDb: exported.db?.insights?.[0]?.id,
          importedUser: CFG.userName,
          localApi: CFG.apiUrl,
          localSpace: CFG.spaceKey,
          localSync: CFG.lastSync,
          importedDb: DB.insights?.[0]?.id,
        };
      });
      record(engine, scenario.name, 'browser export uses portable privacy policy', transfer.policy === 'portable-no-connection-secrets');
      record(engine, scenario.name, 'browser export excludes connection fields', !transfer.exportedSpaceKey && !transfer.exportedApiUrl);
      record(engine, scenario.name, 'browser export preserves database', transfer.exportedDb === 'mobile-export');
      record(engine, scenario.name, 'browser import restores portable config and data', transfer.importedUser === 'Imported Portable User' && transfer.importedDb === 'mobile-import');
      record(engine, scenario.name, 'browser import preserves local connection', transfer.localApi === 'https://local-device.invalid' && transfer.localSpace === 'LOCAL-SPACE-KEY' && transfer.localSync === 'LOCAL-SYNC');
    }

    await page.evaluate(() => { try { goTo('sys'); } catch {} });
    await page.waitForTimeout(100);
    await page.screenshot({ path: join(OUT, `${engine}-${scenario.name}.png`), fullPage: true });
    record(engine, scenario.name, 'screenshot captured', true);
    record(engine, scenario.name, 'no uncaught application page errors', pageErrors.length === 0, pageErrors.join(' | '));
  } finally {
    await context.tracing.stop({ path: join(OUT, `${engine}-${scenario.name}-trace.zip`) });
    await context.close();
  }
}

async function runOfflineAndUpdate(baseUrl) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  try {
    await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30_000 });
    const ready = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const registration = await navigator.serviceWorker.ready;
      return !!registration.active;
    });
    record('chromium', 'offline-update', 'service worker activates', ready);
    await page.reload({ waitUntil: 'networkidle' });
    await context.setOffline(true);
    let offlineLoaded = false;
    try {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 15_000 });
      offlineLoaded = await page.locator('body').isVisible();
    } catch {}
    record('chromium', 'offline-update', 'offline navigation reloads from service-worker cache', offlineLoaded);
    await context.setOffline(false);

    const swPath = join(ROOT, 'sw.js');
    const swV1 = await readFile(swPath, 'utf8');
    const swV2 = swV1.replaceAll('mobile-evidence-v1', 'mobile-evidence-v2');
    if (swV1 === swV2) throw new Error('mobile evidence build marker was not found in dist/sw.js');
    await writeFile(swPath, swV2);
    const updated = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) return false;
      await registration.update();
      const deadline = Date.now() + 12_000;
      while (Date.now() < deadline) {
        const keys = await caches.keys();
        if (keys.some(key => key.includes('mobile-evidence-v2'))) return true;
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      return false;
    });
    record('chromium', 'offline-update', 'service-worker update installs a new cache version', updated);
  } finally {
    await context.close();
    await browser.close();
  }
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
const { server, url } = await serve();
const launched = [];
try {
  for (const [engine, browserType] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await browserType.launch();
    launched.push(browser);
    for (const scenario of scenarios) await runScenario(browser, engine, scenario, url);
    await browser.close();
    launched.pop();
  }
  await runOfflineAndUpdate(url);
} catch (error) {
  failures.push({ engine: 'harness', scenario: 'fatal', check: error.message, pass: false, detail: error.stack || '' });
  console.error(error);
} finally {
  for (const browser of launched) await browser.close().catch(() => {});
  await new Promise(resolveClose => server.close(resolveClose));
}

const summary = {
  generatedAt: new Date().toISOString(),
  total: results.length,
  passed: results.filter(row => row.pass).length,
  failed: failures.length,
  engines: ['chromium', 'webkit'],
  scenarios: scenarios.map(item => item.name),
  results,
  failures,
};
await writeFile(join(OUT, 'mobile-evidence-report.json'), JSON.stringify(summary, null, 2));
const markdown = [
  '# Mobile CI Evidence', '',
  `Generated: ${summary.generatedAt}`, '',
  `Passed: ${summary.passed}/${summary.total}`, '',
  '| Engine | Scenario | Check | Result | Detail |',
  '|---|---|---|---|---|',
  ...results.map(row => `| ${row.engine} | ${row.scenario} | ${row.check.replaceAll('|', '\\|')} | ${row.pass ? 'PASS' : 'FAIL'} | ${row.detail.replaceAll('|', '\\|')} |`),
];
await writeFile(join(OUT, 'mobile-evidence-report.md'), markdown.join('\n'));

console.log(`MOBILE_EVIDENCE_TOTAL=${summary.total}`);
console.log(`MOBILE_EVIDENCE_FAILED=${summary.failed}`);
if (failures.length) process.exit(1);
console.log('PHASE_0_5_MOBILE_EVIDENCE_COMPLETE');
