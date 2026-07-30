// ═══════════════════════════════════════════════════════════════
//  Wave 4.1 (issue #156) — UX EVIDENCE для астрологического источника
//  Pattern Engine.
//
//  Снимает экран «Закономерности» (pg-sys → sysGo('patterns')) в матрице,
//  которую требует контракт Волны 4.1:
//    устройства — iPhone, Android, Desktop;
//    состояния  — Source OFF, Source ON, Unknown Birth Time,
//                 Correlation Detail (открытая панель подробностей).
//
//  Это НЕ гейт качества и он ничего не чинит — он собирает доказательства.
//  Общий baseline-харнесс (tests/ux-evidence.mjs) не трогается: там своя
//  матрица маршрутов, и подмешивание волновых состояний размыло бы её.
//
//  Локально:  PW_CHROMIUM=/opt/pw-browsers/chromium-*/chrome-linux/chrome \
//             node build.mjs --combined dist/app.html && \
//             node tests/wave4-1-astro-evidence.mjs
// ═══════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import { mkdir, writeFile, stat, rm, readFile } from 'fs/promises';
import { bootApp, applyTheme, seedPopulated, INIT_SCRIPT } from './evidence/fixtures.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..');
const DIST = join(ROOT, 'dist');
const APP = join(DIST, 'app.html');
const OUT = join(ROOT, 'evidence-wave4-1');
const SHOTS = join(OUT, 'screenshots');

// Контрактная матрица Волны 4.1.
const DEVICES = [
  { id: 'iphone', label: 'iPhone 13/14 (390×844)', width: 390, height: 844, dsf: 2 },
  { id: 'android', label: 'Android Pixel (412×915)', width: 412, height: 915, dsf: 2 },
  { id: 'desktop', label: 'Desktop (1440×900)', width: 1440, height: 900, dsf: 2 },
];

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

const EXT = /ERR_CONNECTION|ERR_NETWORK|ERR_NAME_NOT_RESOLVED|net::|Failed to load resource|CORS|Access-Control|fonts\.googleapis|gstatic|unpkg|railway\.app|anthropic\.com|openai\.com|googleapis\.com/i;

const log = (...a) => console.log(...a);
const manifest = [];
const problems = [];
const consoleErrors = [];

// ── Открыть «Закономерности» ──
async function openPatterns(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on'));
    document.body.classList.remove('nav-open');
    try { goTo('sys'); } catch (_) {}
    try { sysGo('patterns'); } catch (_) {}
  });
  await page.waitForTimeout(400);
}

// ── Выставить символический источник (напрямую в DB, как делает тумблер) ──
async function setAstroSource(page, on) {
  await page.evaluate((flag) => {
    const cur = DB.correlationSettings || DEFAULT_DB.correlationSettings;
    DB.correlationSettings = { ...cur, useAstro: flag };
    try { resetAstroSourceCache(); } catch (_) {}
    try { if (typeof persist === 'function') persist(); } catch (_) {}
  }, on);
}

// ── Сделать время рождения неизвестным ──
async function setBirthTimeUnknown(page) {
  await page.evaluate(() => {
    if (DB.astroBirth) {
      DB.astroBirth = { ...DB.astroBirth, timeKnown: false, time: '', _u: Date.now() };
      try { resetAstroSourceCache(); } catch (_) {}
      try { if (typeof persist === 'function') persist(); } catch (_) {}
    }
  });
}

// Факты рендера, которые важно зафиксировать вместе с картинкой.
async function readFacts(page) {
  return page.evaluate(() => {
    const out = document.getElementById('sys-patterns-out');
    const tog = document.getElementById('syn-astro-tog');
    const rows = out ? out.querySelectorAll('.si-row').length : 0;
    const badges = out ? out.querySelectorAll('.si-src-astro').length : 0;
    let astroEvents = null, birthTimeKnown = null, conf = null, houseTags = null;
    try {
      const ev = _synLastAstroEvents || [];
      astroEvents = ev.length;
      // Распределение уверенности — доказательство понижения до `low`,
      // а не заявление о нём.
      conf = {};
      for (const e of ev) conf[e.confidence || '—'] = (conf[e.confidence || '—'] || 0) + 1;
      // События, зависящие от домов/углов, — их не должно быть вовсе.
      houseTags = ev.filter(e => (e.tags || []).some(t => /house|asc|mc|angle/i.test(t))).length;
    } catch (_) {}
    try { birthTimeKnown = DB.astroBirth ? !!DB.astroBirth.timeKnown : null; } catch (_) {}
    const detail = document.getElementById('ov-syn-astro');
    return {
      rendered: !!(out && out.textContent.trim().length > 20),
      textLen: out ? out.textContent.trim().length : 0,
      togglePresent: !!tog,
      toggleAriaChecked: tog ? tog.getAttribute('aria-checked') : null,
      toggleRole: tog ? tog.getAttribute('role') : null,
      correlationRows: rows,
      astroBadges: badges,
      astroEventsInRender: astroEvents,
      astroConfidence: conf,
      astroHouseAngleEvents: houseTags,
      birthTimeKnown,
      detailOverlayOpen: !!(detail && detail.classList.contains('on')),
    };
  });
}

async function shoot(page, device, state, facts) {
  const rel = join(device.id, state + '.png');
  const abs = join(SHOTS, rel);
  await mkdir(dirname(abs), { recursive: true });
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}' }).catch(() => {});
  await page.screenshot({ path: abs, fullPage: true });
  manifest.push({ device: device.id, deviceLabel: device.label, state, file: 'screenshots/' + rel.split('\\').join('/'), ...facts });
  if (!facts.rendered) problems.push({ device: device.id, state, reason: 'экран «Закономерности» пуст или не отрисовался' });
}

// Открыть панель подробностей первой пары с астрологией.
async function openAstroDetail(page) {
  return page.evaluate(() => {
    let idx = -1;
    try {
      for (let i = 0; i < _synLastPairs.length; i++) {
        if (typeof pairHasAstro === 'function' && pairHasAstro(_synLastPairs[i])) { idx = i; break; }
      }
    } catch (_) {}
    if (idx < 0) return { opened: false, reason: 'в текущем окне нет подтверждённой пары с астрологическим тегом' };
    try { synAstroDetailAt(idx); } catch (e) { return { opened: false, reason: 'исключение: ' + (e.message || e) }; }
    const el = document.getElementById('ov-syn-astro');
    const body = document.getElementById('syn-astro-detail');
    return {
      opened: !!(el && el.classList.contains('on')),
      pairIndex: idx,
      detailText: body ? body.textContent.trim().slice(0, 400) : '',
    };
  });
}

async function main() {
  try { await stat(APP); } catch {
    console.error('НЕТ dist/app.html — сначала `node build.mjs --combined dist/app.html`');
    process.exit(2);
  }
  await rm(OUT, { recursive: true, force: true });
  await mkdir(SHOTS, { recursive: true });

  const { server, port } = await startServer();
  FILE = `http://127.0.0.1:${port}/app.html`;
  log(`▸ Статик-сервер: ${FILE}`);

  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
  } catch (e) {
    console.error('НЕ СТАРТУЕТ Chromium:', e.message);
    server.close();
    process.exit(3);
  }

  let detailEvidence = null;

  for (const device of DEVICES) {
    log(`▸ ${device.label}`);
    const ctx = await browser.newContext({ viewport: { width: device.width, height: device.height }, deviceScaleFactor: device.dsf, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    page.on('pageerror', e => { if (!EXT.test(e.message)) consoleErrors.push({ device: device.id, msg: 'pageerror: ' + e.message.slice(0, 160) }); });
    page.on('console', m => { if (m.type() === 'error' && !EXT.test(m.text())) consoleErrors.push({ device: device.id, msg: 'console: ' + m.text().slice(0, 160) }); });

    await bootApp(page, FILE);
    await applyTheme(page, 'dark');
    await seedPopulated(page);

    // ── 1. Source OFF (состояние по умолчанию) ──
    await setAstroSource(page, false);
    await openPatterns(page);
    const off = await readFacts(page);
    await shoot(page, device, 'source-off', off);
    if (off.astroBadges > 0) problems.push({ device: device.id, state: 'source-off', reason: 'при выключенном источнике показан астробейдж' });
    if (off.astroEventsInRender) problems.push({ device: device.id, state: 'source-off', reason: 'при выключенном источнике в рендер попали астрособытия' });

    // ── 2. Source ON ──
    await setAstroSource(page, true);
    await openPatterns(page);
    const on = await readFacts(page);
    await shoot(page, device, 'source-on', on);
    if (!on.astroEventsInRender) problems.push({ device: device.id, state: 'source-on', reason: 'при включённом источнике астрособытий в рендере нет' });

    // ── 3. Correlation Detail (панель подробностей) ──
    const det = await openAstroDetail(page);
    if (det.opened) {
      await page.waitForTimeout(250);
      const f = await readFacts(page);
      await shoot(page, device, 'correlation-detail', { ...f, detailPairIndex: det.pairIndex, detailText: det.detailText });
      if (device.id === 'iphone') detailEvidence = det;
    } else {
      // Панель нельзя открыть, если ни одна пара с астротегом не прошла
      // enrichment-гейт. Это не дефект интеграции, а свойство данных —
      // фиксируем честно вместо подделки скриншота.
      manifest.push({ device: device.id, deviceLabel: device.label, state: 'correlation-detail', file: null, skipped: true, reason: det.reason });
      log(`  correlation-detail пропущен: ${det.reason}`);
    }

    // ── 4. Unknown Birth Time (источник включён) ──
    await page.evaluate(() => { document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on')); });
    await setBirthTimeUnknown(page);
    await openPatterns(page);
    const unk = await readFacts(page);
    await shoot(page, device, 'unknown-birth-time', unk);
    if (unk.birthTimeKnown !== false) problems.push({ device: device.id, state: 'unknown-birth-time', reason: 'фикстура не выставила timeKnown=false' });
    const confKeys = Object.keys(unk.astroConfidence || {});
    if (!(confKeys.length === 1 && confKeys[0] === 'low')) problems.push({ device: device.id, state: 'unknown-birth-time', reason: 'уверенность не понижена до low для всех событий: ' + confKeys.join(', ') });
    if (unk.astroHouseAngleEvents) problems.push({ device: device.id, state: 'unknown-birth-time', reason: 'произведены события, зависящие от домов/углов' });

    await ctx.close();
  }

  await browser.close();
  server.close();

  await writeFile(join(OUT, 'manifest.json'), JSON.stringify({ totalScreenshots: manifest.filter(m => m.file).length, entries: manifest }, null, 2));
  await writeFile(join(OUT, 'REPORT.md'), buildReport(detailEvidence));

  log('');
  log('════════════════════════════════════════════');
  log(`  Скриншотов:       ${manifest.filter(m => m.file).length}`);
  log(`  Устройств:        ${DEVICES.length}`);
  log(`  Проблем:          ${problems.length}`);
  log(`  JS-ошибок (app):  ${consoleErrors.length}`);
  log(`  Артефакты →       evidence-wave4-1/`);
  log('════════════════════════════════════════════');
  process.exit(0);
}

function buildReport(detailEvidence) {
  const L = [];
  L.push('# Wave 4.1 — UX Evidence: астрология как источник Pattern Engine');
  L.push('');
  L.push('Статус: **EVIDENCE_ONLY**. Собрано харнессом `tests/wave4-1-astro-evidence.mjs`. Часы заморожены на `2026-03-15T08:00:00Z`, данные — синтетические фикстуры, никаких личных записей.');
  L.push('');
  L.push('## 1. Матрица');
  L.push('');
  L.push('| Устройство | Разрешение |');
  L.push('| --- | --- |');
  for (const d of DEVICES) L.push(`| ${d.label} | ${d.width}×${d.height} |`);
  L.push('');
  L.push('Состояния: **Source OFF**, **Source ON**, **Correlation Detail**, **Unknown Birth Time**.');
  L.push('');
  L.push('## 2. Снимки и зафиксированные факты');
  L.push('');
  const confStr = (c) => c && Object.keys(c).length ? Object.entries(c).map(([k, v]) => `${k}: ${v}`).join(', ') : '—';
  L.push('| Устройство | Состояние | Отрисовано | Тумблер (aria-checked) | Строк совпадений | Астробейджей | Астрособытий | Уверенность | События домов/углов | Время рождения известно |');
  L.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const m of manifest) {
    if (m.skipped) { L.push(`| ${m.device} | ${m.state} | — | — | — | — | — | — | — | пропущено: ${m.reason} |`); continue; }
    L.push(`| ${m.device} | ${m.state} | ${m.rendered ? 'да' : '**нет**'} | ${m.toggleAriaChecked ?? '—'} | ${m.correlationRows} | ${m.astroBadges} | ${m.astroEventsInRender ?? '—'} | ${confStr(m.astroConfidence)} | ${m.astroHouseAngleEvents ?? '—'} | ${m.birthTimeKnown === null ? '—' : (m.birthTimeKnown ? 'да' : 'нет')} |`);
  }
  L.push('');
  L.push('## 3. Что доказывают снимки');
  L.push('');
  L.push('- **Source OFF** — состояние по умолчанию: тумблер `aria-checked="false"`, астрособытий в потоке нет, бейджей нет. Экран «Закономерности» выглядит ровно так же, как до Волны 4.1.');
  L.push('- **Source ON** — астрособытия попадают в тот же поток; совпадения с их участием несут бейдж «✦ Астрология» и кнопку «Подробности».');
  L.push('- **Correlation Detail** — панель показывает только факты расчёта: методология, движок, дата пика, орбис, уверенность, признак «известно ли время рождения». Трактовок нет.');
  L.push('- **Unknown Birth Time** — при `timeKnown === false` уверенность всех астрособытий падает до `low` (колонка «Уверенность»), экран остаётся рабочим. Число событий при этом не меняется — и это ожидаемо: проекция Волны 3 вообще не производит событий, зависящих от домов и углов (ограничение **L-ASTRO-NO-HOUSES**), поэтому терять при неизвестном времени нечего. Колонка «События домов/углов» равна нулю в обоих состояниях — это и есть доказательство.');
  L.push('');
  if (detailEvidence && detailEvidence.opened) {
    L.push('Текст панели подробностей (iPhone, как её видит пользователь):');
    L.push('');
    L.push('```');
    L.push(detailEvidence.detailText);
    L.push('```');
    L.push('');
  }
  L.push('## 4. Проблемы');
  L.push('');
  if (!problems.length) L.push('Не обнаружено.');
  else for (const p of problems) L.push(`- **${p.device} / ${p.state}** — ${p.reason}`);
  L.push('');
  L.push('## 5. JS-ошибки приложения при обходе');
  L.push('');
  if (!consoleErrors.length) L.push('Ошибок самого приложения не зафиксировано (внешние сетевые ошибки отфильтрованы).');
  else { const seen = new Set(); for (const e of consoleErrors) { if (seen.has(e.msg)) continue; seen.add(e.msg); L.push(`- ${e.msg} (${e.device})`); } }
  L.push('');
  L.push('## 6. Ограничения проверки');
  L.push('');
  L.push('- Снимки сняты в headless Chromium, а не на реальных iOS Safari / Android Chrome: safe-area insets и системные шрифты не воспроизводятся точно.');
  L.push('- «Android» и «Desktop» здесь — это вьюпорты соответствующих размеров в том же движке, а не другие браузерные движки.');
  L.push('- Панель `correlation-detail` снимается только если хотя бы одна пара с астротегом прошла enrichment-гейт на синтетических данных. Если не прошла — это фиксируется как пропуск с причиной, а не подделывается.');
  L.push('- Service worker нейтрализован — иначе его кэш давал бы недетерминизм между прогонами.');
  L.push('');
  L.push('## 7. Как воспроизвести');
  L.push('');
  L.push('```bash');
  L.push('cd architect');
  L.push('npm ci');
  L.push('node build.mjs --combined dist/app.html');
  L.push('PW_CHROMIUM=/path/to/chromium node tests/wave4-1-astro-evidence.mjs   # артефакты в evidence-wave4-1/');
  L.push('```');
  L.push('');
  return L.join('\n');
}

main().catch(e => { console.error('WAVE 4.1 EVIDENCE FATAL:', e); process.exit(1); });
