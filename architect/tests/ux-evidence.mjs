// ═══════════════════════════════════════════════════════════════
//  Архитектор — UX EVIDENCE HARNESS (audit / test-infrastructure).
//
//  Строит воспроизводимый baseline текущего «Архитектора»:
//   • скриншоты всех экранов по матрице устройств × тем × состояний;
//   • accessibility smoke (labels / tap targets / focus / контраст);
//   • полный route inventory (route-inventory.json);
//   • performance baseline (размеры, launch time, метрики Today);
//   • отчёт REPORT.md с найденными UX/a11y-дефектами.
//
//  ВАЖНО: это НЕ гейт качества и он НИЧЕГО НЕ ЧИНИТ. Он собирает
//  доказательства. Найденные дефекты в этом PR не исправляются.
//  Сбор устойчив к ошибкам отдельных экранов: падение рендера одного
//  маршрута фиксируется как дефект, прогон продолжается. Ненулевой код
//  возврата — только при катастрофе (нет сборки / не стартует браузер).
//
//  Локально:  PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
//             node build.mjs --combined dist/app.html && node tests/ux-evidence.mjs
//  В CI:      npm run evidence  (см. .github/workflows/ux-evidence.yml)
// ═══════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import { mkdir, writeFile, stat, rm, readFile } from 'fs/promises';
import { DEVICES, THEMES, ROUTES, KEY_ROUTES, REFERENCE_DEVICE, REFERENCE_THEME } from './evidence/routes.mjs';
import { bootApp, applyTheme, applyLargeText, seedEmpty, seedPopulated, INIT_SCRIPT } from './evidence/fixtures.mjs';
import { runA11y } from './evidence/a11y.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..');
const DIST = join(ROOT, 'dist');
const APP = join(DIST, 'app.html');
const OUT = join(ROOT, 'evidence');
const SHOTS = join(OUT, 'screenshots');

// Приложение обслуживается по HTTP (как реальный PWA на GitHub Pages), а не
// file:// — иначе динамический import lazy-модулей (напр. зашифрованный backup)
// блокируется браузером. FILE устанавливается после старта сервера.
let FILE = null;
const MIME = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
function startServer() {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent((req.url || '/').split('?')[0]);
      if (p === '/' || p === '') p = '/app.html';
      const buf = await readFile(join(DIST, p));
      res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
      res.end(buf);
    } catch { res.writeHead(404); res.end('not found'); }
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

// Внешние сетевые ошибки (CDN/бэкенд/AI) не являются дефектами приложения.
const EXT = /ERR_CONNECTION|ERR_NETWORK|ERR_NAME_NOT_RESOLVED|net::|Failed to load resource|CORS|Access-Control|fonts\.googleapis|gstatic|unpkg|railway\.app|anthropic\.com|openai\.com|googleapis\.com/i;

const log = (...a) => console.log(...a);
const manifest = [];
const captureErrors = [];   // экраны, не отрисовавшиеся корректно
const consoleErrors = [];   // JS-ошибки самого приложения
const a11yRuns = [];        // результаты accessibility-прогона

// ── Навигация к маршруту (в браузере, без eval) ──
async function navigate(page, nav) {
  await page.evaluate((n) => {
    // reset: закрыть оверлеи, drawer и убрать транзиентные тосты
    document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on'));
    document.body.classList.remove('nav-open');
    const toasts = document.getElementById('toasts'); if (toasts) toasts.innerHTML = '';
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const call = (name, args) => { try { if (typeof window[name] === 'function') window[name](...(args || [])); } catch (e) { /* фиксируется скриншотом */ } };
    if (n.tab) call('goTo', [n.tab]);
    if (n.msub) call('msub', [n.msub]);
    if (n.asub) call('asub', [n.asub]);
    if (n.open) call(n.open, []);
    if (n.overlay) call('openOv', [n.overlay]);
    if (n.call) {
      let args = (n.args || []).slice();
      if (n.sphereIdx != null && Array.isArray(DB.spheres) && DB.spheres[n.sphereIdx]) {
        args = [DB.spheres[n.sphereIdx].id, ...args];
      }
      call(n.call, args);
    }
  }, nav);
  await page.waitForTimeout(250);
}

// Проверка, что экран реально отрисовался (не пустой белый лист).
async function verifyRendered(page, route) {
  return page.evaluate((r) => {
    // Для оверлеев — открыт ли соответствующий оверлей.
    const ov = r.overlay || (r.open === 'openRecords' ? 'ov-records' : r.open === 'openBackups' ? 'ov-backups' : r.open === 'openEncBackup' ? 'ov-backup-enc' : null);
    if (ov) {
      const el = document.getElementById(ov);
      return { ok: !!(el && el.classList.contains('on')), textLen: (el ? el.textContent.trim().length : 0) };
    }
    if (r.tab) {
      const pg = document.getElementById('pg-' + r.tab);
      const on = pg && pg.classList.contains('on');
      return { ok: !!on, textLen: pg ? pg.textContent.trim().length : 0 };
    }
    if (r.call === 'openSphereLog') {
      const el = document.getElementById('ov-sphere-log');
      return { ok: !!(el && el.classList.contains('on')), textLen: el ? el.textContent.trim().length : 0 };
    }
    return { ok: true, textLen: document.body.textContent.trim().length };
  }, { overlay: route.nav.overlay, open: route.nav.open, tab: route.nav.tab, call: route.nav.call });
}

async function shoot(page, device, theme, state, route) {
  const rel = join(device.id, theme, state, route.id + '.png');
  const abs = join(SHOTS, rel);
  await mkdir(dirname(abs), { recursive: true });
  // Отключаем анимации для стабильного кадра.
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}' }).catch(() => {});
  try {
    await navigate(page, route.nav);
    const v = await verifyRendered(page, route);
    await page.screenshot({ path: abs, fullPage: true });
    manifest.push({ device: device.id, theme, state, route: route.id, label: route.label, category: route.category, file: 'screenshots/' + rel.split('\\').join('/'), rendered: v.ok, textLen: v.textLen });
    if (!v.ok || v.textLen < 5) {
      captureErrors.push({ device: device.id, theme, state, route: route.id, label: route.label, reason: v.ok ? 'пустой/почти пустой экран' : 'экран/оверлей не открылся' });
    }
    return v;
  } catch (e) {
    captureErrors.push({ device: device.id, theme, state, route: route.id, label: route.label, reason: 'исключение: ' + (e.message || e).slice(0, 140) });
    return { ok: false, textLen: 0 };
  }
}

function routesForContext(isReference) {
  return isReference ? ROUTES : KEY_ROUTES;
}

// ── Performance baseline ──
async function perfBaseline(browser) {
  const sizeOf = async (p) => { try { return (await stat(join(ROOT, p))).size; } catch { return null; } };
  const files = {
    'index.html': await sizeOf('index.html'),
    'app.js': await sizeOf('app.js'),
    'styles.css': await sizeOf('styles.css'),
    'sw.js': await sizeOf('sw.js'),
    'combined dist/app.html': await sizeOf('dist/app.html'),
  };
  const vendors = {
    'lucide.js': await sizeOf('lucide.js'),
    'astronomy.min.js': await sizeOf('astronomy.min.js'),
    'astro_rules.js': await sizeOf('astro_rules.js'),
    'astro_texts_natal.js': await sizeOf('astro_texts_natal.js'),
    'astro_texts_transit.js': await sizeOf('astro_texts_transit.js'),
    'astro_texts_synastry.js': await sizeOf('astro_texts_synastry.js'),
    'astro_texts_jyotish.js': await sizeOf('astro_texts_jyotish.js'),
    'astro_texts_extra.js': await sizeOf('astro_texts_extra.js'),
  };
  const vendorTotal = Object.values(vendors).reduce((s, v) => s + (v || 0), 0);

  // Число глобальных render-функций и общее число функций (сложность UI).
  let renderFns = null, totalFns = null;
  try {
    const src = await readFile(join(ROOT, 'app.js'), 'utf8');
    renderFns = (src.match(/^function r[A-Z]\w*\s*\(/gm) || []).length;
    totalFns = (src.match(/^function \w+\s*\(/gm) || []).length;
  } catch { /* ignore */ }

  // Cold launch timing (std iPhone, тёмная тема, референс).
  const dev = DEVICES.find(d => d.id === REFERENCE_DEVICE);
  const ctx = await browser.newContext({ viewport: { width: dev.width, height: dev.height }, deviceScaleFactor: dev.dsf });
  const page = await ctx.newPage();
  await page.addInitScript(INIT_SCRIPT);
  await page.goto(FILE);
  await page.waitForTimeout(600);
  const timing = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const paints = performance.getEntriesByType('paint') || [];
    const fp = (paints.find(p => p.name === 'first-paint') || {}).startTime;
    const fcp = (paints.find(p => p.name === 'first-contentful-paint') || {}).startTime;
    return {
      domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd || 0),
      loadEventEndMs: Math.round(nav.loadEventEnd || 0),
      domInteractiveMs: Math.round(nav.domInteractive || 0),
      firstPaintMs: fp != null ? Math.round(fp) : null,
      firstContentfulPaintMs: fcp != null ? Math.round(fcp) : null,
    };
  });

  // Метрики Today (заполнено) на iPhone standard: высота первого экрана,
  // число CTA в первом вьюпорте, число top-level направлений.
  await bootApp(page, FILE);
  await applyTheme(page, 'dark');
  await seedPopulated(page);
  await page.evaluate(() => { try { goTo('home'); } catch (_) {} document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on')); });
  await page.waitForTimeout(250);
  const today = await page.evaluate((vh) => {
    const pg = document.getElementById('pg-home');
    const scrollH = pg ? pg.scrollHeight : document.body.scrollHeight;
    // CTA в первом вьюпорте: видимые кнопки/тапаемые действия выше линии сгиба.
    const clickable = Array.from(document.querySelectorAll('#pg-home button, #pg-home .qa, #pg-home [onclick]'));
    const aboveFold = clickable.filter(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.top < vh && r.width > 1 && r.height > 1; });
    const nav = document.querySelectorAll('#sidebar .navlink[data-tab]').length;
    return { todayScrollHeight: scrollH, viewportHeight: vh, screensToScroll: +(scrollH / vh).toFixed(1), ctaAboveFold: aboveFold.length, topLevelDestinations: nav };
  }, dev.height);
  await ctx.close();

  return {
    fixedClock: '2026-03-15T08:00:00Z',
    referenceDevice: REFERENCE_DEVICE,
    fileSizesBytes: files,
    vendorSizesBytes: vendors,
    vendorTotalBytes: vendorTotal,
    jsComplexity: { globalRenderFunctions: renderFns, globalFunctions: totalFns, appJsBytes: files['app.js'] },
    coldLaunchTimingMs: timing,
    todayScreen: today,
  };
}

async function main() {
  // Катастрофа — если нет сборки.
  try { await stat(APP); } catch {
    console.error('НЕТ dist/app.html — сначала `node build.mjs --combined dist/app.html`');
    process.exit(2);
  }
  await rm(OUT, { recursive: true, force: true });
  await mkdir(SHOTS, { recursive: true });

  // Локальный статик-сервер поверх dist/.
  const { server, port } = await startServer();
  FILE = `http://127.0.0.1:${port}/app.html`;
  log(`▸ Статик-сервер: ${FILE}`);

  const exe = process.env.PW_CHROMIUM || undefined;
  let browser;
  try {
    browser = await chromium.launch({ executablePath: exe });
  } catch (e) {
    console.error('НЕ СТАРТУЕТ Chromium:', e.message);
    server.close();
    process.exit(3);
  }

  log('▸ Performance baseline…');
  let perf = null;
  try { perf = await perfBaseline(browser); } catch (e) { log('  perf baseline error:', e.message); }

  let shots = 0;
  for (const device of DEVICES) {
    for (const theme of THEMES) {
      const isReference = device.id === REFERENCE_DEVICE && theme === REFERENCE_THEME;
      const routes = routesForContext(isReference);
      const isA11yCtx = device.id === REFERENCE_DEVICE; // a11y на std iPhone, обе темы
      log(`▸ ${device.id} · ${theme}${isReference ? ' · [reference: полный каталог]' : ''} — ${routes.length} маршрутов`);

      const ctx = await browser.newContext({ viewport: { width: device.width, height: device.height }, deviceScaleFactor: device.dsf, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      page.on('pageerror', e => { if (!EXT.test(e.message)) consoleErrors.push({ device: device.id, theme, msg: 'pageerror: ' + e.message.slice(0, 160) }); });
      page.on('console', m => { if (m.type() === 'error' && !EXT.test(m.text())) consoleErrors.push({ device: device.id, theme, msg: 'console: ' + m.text().slice(0, 160) }); });

      await bootApp(page, FILE);
      await applyTheme(page, theme);

      // ── POPULATED / LONGTEXT ──
      await seedPopulated(page);
      for (const route of routes) {
        if (route.states.includes('populated')) {
          const v = await shoot(page, device, theme, 'populated', route); shots++;
          // a11y — по ключевым экранам на std iPhone (обе темы), в populated
          if (isA11yCtx && route.key && v && v.ok) {
            try { const r = await runA11y(page, `${device.id}/${theme}/${route.id}`); a11yRuns.push({ device: device.id, theme, route: route.id, label: route.label, ...r }); } catch { /* skip */ }
          }
        }
      }
      // Длиннотекстовый стресс-кейс — только на референсе.
      if (isReference) {
        await seedPopulated(page, { longText: true });
        for (const route of routes) {
          if (route.states.includes('longtext')) { await shoot(page, device, theme, 'longtext', route); shots++; }
        }
      }

      // ── EMPTY ──
      await seedEmpty(page);
      for (const route of routes) {
        if (route.states.includes('empty')) { await shoot(page, device, theme, 'empty', route); shots++; }
      }

      await ctx.close();
    }
  }

  // ── Dynamic Type (увеличенный текст) — отдельный небольшой прогон ──
  log('▸ Увеличенный системный текст (Dynamic Type, приближённо)…');
  const dev = DEVICES.find(d => d.id === REFERENCE_DEVICE);
  const bigRoutes = ROUTES.filter(r => ['today', 'capture-checkin'].includes(r.id));
  for (const theme of THEMES) {
    const ctx = await browser.newContext({ viewport: { width: dev.width, height: dev.height }, deviceScaleFactor: dev.dsf, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await bootApp(page, FILE);
    await applyTheme(page, theme);
    await seedPopulated(page);
    await applyLargeText(page, true);
    for (const route of bigRoutes) { await shoot(page, dev, theme, 'largetext', route); shots++; }
    await ctx.close();
  }

  await browser.close();
  server.close();

  // ── Артефакты ──
  const inventory = ROUTES.map(r => ({ id: r.id, label: r.label, category: r.category, nav: r.nav, states: r.states, key: !!r.key }));
  await writeFile(join(OUT, 'route-inventory.json'), JSON.stringify({
    generatedFixedClock: '2026-03-15T08:00:00Z',
    devices: DEVICES, themes: THEMES,
    referenceDevice: REFERENCE_DEVICE, referenceTheme: REFERENCE_THEME,
    totalRoutes: ROUTES.length, keyRoutes: KEY_ROUTES.length,
    routes: inventory,
  }, null, 2));

  await writeFile(join(OUT, 'perf-baseline.json'), JSON.stringify(perf, null, 2));
  await writeFile(join(OUT, 'a11y-report.json'), JSON.stringify(aggregateA11y(), null, 2));
  await writeFile(join(OUT, 'manifest.json'), JSON.stringify({ totalScreenshots: manifest.length, screenshots: manifest }, null, 2));
  await writeFile(join(OUT, 'REPORT.md'), buildReport(perf));

  log('');
  log('════════════════════════════════════════════');
  log(`  Скриншотов:        ${shots} (manifest: ${manifest.length})`);
  log(`  Маршрутов:         ${ROUTES.length} (ключевых: ${KEY_ROUTES.length})`);
  log(`  A11y-прогонов:     ${a11yRuns.length}`);
  log(`  Capture-дефектов:  ${captureErrors.length}`);
  log(`  JS-ошибок (app):   ${consoleErrors.length}`);
  log(`  Артефакты →        evidence/`);
  log('════════════════════════════════════════════');
  // Сбор доказательств завершён успешно, даже если найдены дефекты.
  process.exit(0);
}

function aggregateA11y() {
  const totals = { 'icon-name': 0, 'tap-size': 0, focusable: 0, affordance: 0, contrast: 0 };
  // Уникальные дефекты по (класс, элемент) — чтобы один и тот же элемент,
  // попавший на нескольких экранах, не раздувал счётчик.
  const uniq = { 'icon-name': new Map(), 'tap-size': new Map(), focusable: new Map(), affordance: new Map(), contrast: new Map() };
  for (const run of a11yRuns) {
    for (const cls of Object.keys(totals)) {
      for (const f of (run.findings[cls] || [])) {
        totals[cls]++;
        const key = f.el + '|' + f.where;
        if (!uniq[cls].has(key)) uniq[cls].set(key, { ...f, seenOn: [] });
        uniq[cls].get(key).seenOn.push(run.route);
      }
    }
  }
  const unique = {};
  for (const cls of Object.keys(uniq)) unique[cls] = Array.from(uniq[cls].values()).sort((a, b) => b.seenOn.length - a.seenOn.length);
  return { runs: a11yRuns.length, totalsAcrossScreens: totals, uniqueDefects: unique };
}

function buildReport(perf) {
  const a = aggregateA11y();
  const byCat = {};
  for (const m of manifest) { byCat[m.category] = (byCat[m.category] || 0) + 1; }
  const p = perf || {};
  const fmtKB = (b) => b == null ? '—' : (b / 1024).toFixed(1) + ' KB';
  const t = p.coldLaunchTimingMs || {};
  const today = p.todayScreen || {};

  const overloadedNote = today.screensToScroll != null
    ? `Экран «Сегодня» (заполнено, iPhone standard) занимает **~${today.screensToScroll}× высоты вьюпорта** и содержит **${today.ctaAboveFold} тапаемых действий выше линии сгиба** — прямое подтверждение диагноза «Today перегружен» из 01-CURRENT-UX-AUDIT.`
    : '';

  const lines = [];
  lines.push('# Архитектор — UX Evidence Baseline (Этап 0)');
  lines.push('');
  lines.push('Статус: **AUDIT_ONLY**. Сгенерировано харнессом `tests/ux-evidence.mjs`. Production UI/тексты/расчёты/storage/sync/crypto НЕ менялись. Найденные дефекты в этом PR НЕ исправляются — это baseline для последующих задач.');
  lines.push('');
  lines.push(`Часы заморожены на \`${p.fixedClock || '2026-03-15T08:00:00Z'}\` → скриншоты детерминированы и не зависят от даты, сети и личных данных.`);
  lines.push('');
  lines.push('## 1. Покрытие');
  lines.push('');
  lines.push(`- Маршрутов в инвентаре: **${ROUTES.length}** (ключевых: **${KEY_ROUTES.length}**).`);
  lines.push(`- Скриншотов: **${manifest.length}**.`);
  lines.push('- Матрица устройств: ' + DEVICES.map(d => `${d.label} (${d.width}×${d.height})`).join('; ') + '.');
  lines.push('- Темы: тёмная и светлая. Состояния: пустое, заполненное, длинный текст, увеличенный текст.');
  lines.push('- Полный каталог экранов снят на референсе (' + REFERENCE_DEVICE + ' · ' + REFERENCE_THEME + '); ключевые экраны — по всей матрице.');
  lines.push('');
  lines.push('Скриншотов по категориям экранов:');
  lines.push('');
  for (const [c, n] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) lines.push(`- ${c}: ${n}`);
  lines.push('');
  lines.push('## 2. Performance baseline');
  lines.push('');
  if (p.fileSizesBytes) {
    lines.push('| Файл | Размер |');
    lines.push('| --- | --- |');
    for (const [k, v] of Object.entries(p.fileSizesBytes)) lines.push(`| ${k} | ${fmtKB(v)} |`);
    lines.push(`| **vendor JS всего** (lucide+astronomy+astro_texts) | **${fmtKB(p.vendorTotalBytes)}** |`);
    lines.push('');
  }
  if (p.jsComplexity) {
    lines.push(`- \`app.js\`: **${fmtKB(p.jsComplexity.appJsBytes)}**, глобальных функций: **${p.jsComplexity.globalFunctions}**, из них render-функций (\`function r*\`): **${p.jsComplexity.globalRenderFunctions}** — подтверждает риск «растущий монолит UI/logic».`);
  }
  lines.push(`- Cold launch (${REFERENCE_DEVICE}): DOMContentLoaded **${t.domContentLoadedMs} ms**, first-contentful-paint **${t.firstContentfulPaintMs ?? '—'} ms**, load **${t.loadEventEndMs} ms**.`);
  lines.push(`- Top-level направлений: **${today.topLevelDestinations ?? '—'}** (цель роадмапа на iPhone — 4).`);
  lines.push('');
  if (overloadedNote) { lines.push('## 3. Перегруженные экраны'); lines.push(''); lines.push(overloadedNote); lines.push(''); }
  lines.push('## 4. Accessibility smoke');
  lines.push('');
  lines.push(`Прогонов (ключевые экраны × темы): **${a.runs}**. Уникальных дефектов по классам:`);
  lines.push('');
  lines.push('| Класс | Уникальных | Что значит |');
  lines.push('| --- | --- | --- |');
  const meaning = {
    'icon-name': 'иконка-кнопка без доступного имени (screen reader читает «кнопка»)',
    'tap-size': 'тап-цель меньше 44×44 px',
    focusable: 'клик на div/span без tabindex/role — недостижим с клавиатуры',
    affordance: 'onclick на элементе без cursor:pointer — тапаемость не видна',
    contrast: 'контраст текста ниже WCAG AA',
  };
  for (const cls of Object.keys(meaning)) lines.push(`| ${cls} | ${a.uniqueDefects[cls].length} | ${meaning[cls]} |`);
  lines.push('');
  for (const cls of Object.keys(meaning)) {
    const list = a.uniqueDefects[cls];
    if (!list.length) continue;
    lines.push(`### ${cls} (${list.length})`);
    lines.push('');
    for (const f of list.slice(0, 15)) lines.push(`- \`${f.el}\` — ${f.detail} · где: ${f.where} · экранов: ${f.seenOn.length}`);
    if (list.length > 15) lines.push(`- …ещё ${list.length - 15}`);
    lines.push('');
  }
  lines.push('## 5. Недоступные / не отрисовавшиеся экраны');
  lines.push('');
  if (!captureErrors.length) { lines.push('Не обнаружено — все маршруты отрисовались.'); } else {
    lines.push('Экраны, которые не открылись или отрисовались пустыми (кандидаты в дефекты доступности функций):');
    lines.push('');
    const seen = new Set();
    for (const e of captureErrors) {
      const k = e.route + '|' + e.reason;
      if (seen.has(k)) continue; seen.add(k);
      lines.push(`- **${e.label}** (\`${e.route}\`, ${e.device}/${e.theme}/${e.state}) — ${e.reason}`);
    }
  }
  lines.push('');
  lines.push('## 6. JS-ошибки приложения при обходе');
  lines.push('');
  if (!consoleErrors.length) { lines.push('Ошибок самого приложения не зафиксировано (внешние сетевые ошибки отфильтрованы).'); } else {
    const seen = new Set();
    for (const e of consoleErrors) { if (seen.has(e.msg)) continue; seen.add(e.msg); lines.push(`- ${e.msg} (${e.device}/${e.theme})`); }
  }
  lines.push('');
  lines.push('## 7. Ограничения проверки');
  lines.push('');
  lines.push('- Скриншоты сняты в headless Chromium (в CI — ревизия Playwright; локально можно указать `PW_CHROMIUM`), а не на реальном iOS Safari; safe-area insets и системный шрифт iOS не воспроизводятся точно.');
  lines.push('- `deviceScaleFactor=2` для всех устройств (реальный Pro Max — @3); это влияет на резкость, не на раскладку.');
  lines.push('- Dynamic Type эмулируется увеличением корневого `font-size` (20px), а не системным Text Size iOS — это приближение.');
  lines.push('- Контраст оценивается по вычисленным цветам без учёта фоновых изображений/градиентов — трактовать как «зону внимания», не строгий вердикт.');
  lines.push('- Accessibility smoke не заменяет ручную проверку VoiceOver/клавиатуры и полноценный WCAG-аудит.');
  lines.push('- Приложение обслуживается локальным HTTP-сервером поверх `dist/` (как реальный PWA на GitHub Pages), чтобы работал динамический import lazy-модулей (в т.ч. зашифрованный backup). Service worker при этом нейтрализуется — иначе его кэш давал бы недетерминизм между прогонами.');
  lines.push('');
  lines.push('## 8. Как воспроизвести');
  lines.push('');
  lines.push('```bash');
  lines.push('cd architect');
  lines.push('npm ci');
  lines.push('node build.mjs --combined dist/app.html');
  lines.push('PW_CHROMIUM=/path/to/chromium node tests/ux-evidence.mjs   # артефакты в evidence/');
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

main().catch(e => { console.error('EVIDENCE HARNESS FATAL:', e); process.exit(1); });
