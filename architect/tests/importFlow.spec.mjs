// ИМПОРТ ДАННЫХ — экран из трёх шагов (уровень 2).
//
// Что здесь защищено:
//   1. Регрессия дефекта первого запуска: на ЧИСТОЙ установке выбор файла даёт
//      ВИДИМЫЙ результат и видимую кнопку применения. До этой правки разбор
//      уходил в свёрнутый блок «для продвинутых», и человек не видел ничего.
//   2. Порядок: данные раньше действия — выбор файла в DOM идёт перед главной
//      кнопкой и перед зоной результата.
//   3. Язык: сводка называет разделы приложения, а не имена коллекций.
//   4. Решение не прячется: когда запись требует явного выбора, список
//      раскрыт, а радиокнопки реально видимы.
//   5. Семантика импорта не изменилась: до подтверждения ноль мутаций,
//      повтор не создаёт дублей, «импортировать ещё» ничего не удаляет.
//
// ВСЕ фикстуры синтетические (TEST-IMP-*). Реальные данные владельца в
// репозиторий не попадают ни в каком виде (privacy canary внизу).
//
// Гоняет РЕАЛЬНЫЙ собранный бандл (dist/app.html) в Chromium.

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..');
const FILE = 'file://' + (process.env.IMPORTFLOW_BUNDLE || join(ROOT, 'dist', 'app.html'));
let pass = 0, fail = 0;
const errors = [];
const ok = (cond, msg, detail) => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); if (detail) console.log('      ' + String(detail).split('\n').join('\n      ')); }
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', e => errors.push(e.message));
await page.route('**/*', r => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
await page.goto(FILE);
await page.waitForSelector('#nsh-tabbar', { state: 'attached' });
await page.evaluate(() => {
  const s = document.getElementById('splash'); if (s) s.style.display = 'none';
  document.querySelectorAll('.ov.on').forEach(e => e.classList.remove('on'));
});

const COLLS = ['externalConnections', 'externalWorkSessions', 'insights', 'dreams', 'patterns',
  'whys', 'moments', 'psyFormulations', 'psyGoals', 'psyInterventionEpisodes', 'psyObservations',
  'psyReviews', 'psyLinks', 'relationshipContexts', 'spiritual', 'evolution', 'sphereLogs'];
const reset = () => page.evaluate((colls) => {
  colls.forEach(c => { DB[c] = []; });
  DB._del = {};
  try { resolveRecovery('discarded'); } catch (_) {}
  if (typeof extBridgeCancel === 'function') extBridgeCancel();
  _extConnActive = null;
}, COLLS);

// Синтетический пакет: два сна + один инсайт, чтобы сводка была из двух разделов.
const pkg = (n, over) => ({
  format: 'architect-external-work-v2',
  source: { kind: 'google_drive', label: 'TEST-IMP источник', module: 'TEST-IMP-MODULE' },
  session: { clientRef: 'TEST-IMP-SESSION-' + n, summary: 'синтетическая сессия ' + n, date: '2026-05-0' + ((n % 9) + 1) },
  entities: [
    { clientRef: 'd1', type: 'dream', sourceId: 'TEST-IMP-DREAM-' + n,
      claimClass: 'user_experience', textOrigin: 'structured_summary', sourceDate: '2026-05-01',
      sourceVersion: { sequence: 1 },
      data: { title: 'синтетический сон ' + n, body: 'нарратив сна ' + n, arch: 'трактовка ' + n } },
    { clientRef: 'd2', type: 'dream', sourceId: 'TEST-IMP-DREAM-B-' + n,
      claimClass: 'user_experience', textOrigin: 'structured_summary', sourceDate: '2026-05-02',
      sourceVersion: { sequence: 1 },
      data: { title: 'синтетический сон Б ' + n, body: 'нарратив Б ' + n, arch: 'трактовка Б ' + n } },
    { clientRef: 'i1', type: 'insight', sourceId: 'TEST-IMP-INS-' + n,
      claimClass: 'user_experience', textOrigin: 'user_words', sourceDate: '2026-05-03',
      sourceVersion: { sequence: 1 },
      data: { tag: 'personal', title: 'синтетический инсайт ' + n, body: 'текст инсайта ' + n } },
  ],
  ...(over || {}),
});

const open = () => page.evaluate(() => openExtImport());
const visible = sel => page.evaluate(s => {
  const el = document.querySelector(s);
  return !!el && (el.checkVisibility ? el.checkVisibility() : el.offsetParent !== null);
}, sel);
const step = () => page.evaluate(() => {
  const el = document.querySelector('#ext-steps .ext-step.on');
  return el ? Number(el.getAttribute('data-step')) : null;
});
// Выбор файла через настоящий <input type=file> — ровно путь пользователя.
// Имя файла держим в ASCII: подстановка файлов в Chromium через CDP не
// доставляет файлы с кириллицей в имени (ограничение стенда, не приложения).
const TMP = join(tmpdir(), 'test-imp-feed.json');
const pickFile = async (obj) => {
  writeFileSync(TMP, JSON.stringify(obj));
  await page.setInputFiles('#ext-file', TMP);
  // FileReader асинхронен: ждём, пока разбор реально доедет до экрана.
  await page.waitForFunction(() => {
    const out = document.getElementById('ext-out'), conn = document.getElementById('ext-conn-out');
    return (out && out.innerHTML.trim() && !/Проверяю/.test(out.textContent)) ||
           (conn && conn.innerHTML.trim());
  }, null, { timeout: 5000 });
};

console.log('\nИМПОРТ ДАННЫХ (экран из трёх шагов)\n');

// ── 1. Чистая установка: главный путь виден без раскрытия чего-либо ──
{
  await reset();
  await open();
  const st = await page.evaluate(() => {
    const ov = document.getElementById('ov-ext-import');
    const vis = el => !!el && (el.checkVisibility ? el.checkVisibility() : el.offsetParent !== null);
    const primary = [...ov.querySelectorAll('.btn-p')].filter(vis).map(b => b.textContent.trim());
    return {
      sources: (DB.externalConnections || []).length,
      primary,
      fileVisible: vis(document.getElementById('ext-file')),
      textVisible: vis(document.getElementById('ext-text')),
      note: (document.getElementById('ext-target-note') || {}).textContent || '',
    };
  });
  ok(st.sources === 0, 'сценарий именно первого запуска: источников нет');
  ok(st.fileVisible && st.textVisible, 'выбор файла и поле вставки видны сразу');
  ok(st.primary.length === 1, `на экране ровно одна главная кнопка (${st.primary.length}: ${st.primary.join(' | ')})`);
  ok(/что добавится/i.test(st.primary[0] || ''),
    'главная кнопка названа целью пользователя, а не процедурой', st.primary[0]);
  ok(!/для продвинутых/i.test(st.primary[0] || ''),
    'главная кнопка не помечена «для продвинутых»');
  ok(/не выбран/i.test(st.note) && /дубл/i.test(st.note),
    'сказано, куда попадёт импорт и что дублей не будет', st.note.slice(0, 90));
  ok((await step()) === 1, 'индикатор стоит на шаге 1');
}

// ── 2. Порядок в DOM: данные раньше действия, действие раньше результата ──
{
  const order = await page.evaluate(() => {
    const ov = document.getElementById('ov-ext-import');
    const nodes = [...ov.querySelectorAll('*')];
    const idx = el => nodes.indexOf(el);
    const primary = [...ov.querySelectorAll('.btn-p')].find(b => /что добавится/i.test(b.textContent));
    return {
      file: idx(document.getElementById('ext-file')),
      primary: idx(primary),
      out: idx(document.getElementById('ext-out')),
      actions: idx(document.getElementById('ext-actions')),
      sources: idx(document.getElementById('ext-connections')),
    };
  });
  ok(order.file < order.primary, 'выбор файла стоит ДО главной кнопки');
  ok(order.primary < order.out && order.out < order.actions,
    'зона результата и кнопка применения идут после главного действия');
  ok(order.sources > order.actions,
    'управление источниками уехало вниз и не загораживает первый импорт');
}

// ── 3. РЕГРЕССИЯ ДЕФЕКТА: результат разбора виден без раскрытия блоков ──
{
  await reset();
  await open();
  await pickFile(pkg(1));
  const st = await page.evaluate(() => {
    const out = document.getElementById('ext-out'), act = document.getElementById('ext-actions');
    const vis = el => !!el && (el.checkVisibility ? el.checkVisibility() : el.offsetParent !== null);
    return {
      outVisible: vis(out), actVisible: vis(act),
      outText: (out.textContent || '').trim(),
      applyBtn: [...act.querySelectorAll('button')].filter(vis).map(b => b.textContent.trim()),
      dreams: DB.dreams.length, insights: DB.insights.length,
    };
  });
  ok(st.outVisible, 'выбор файла на чистой установке даёт ВИДИМЫЙ результат разбора');
  ok(st.actVisible && st.applyBtn.length === 1,
    `кнопка применения видна пользователю (${st.applyBtn.join(' | ')})`);
  ok((await step()) === 2, 'индикатор перешёл на шаг 2');
  ok(st.dreams === 0 && st.insights === 0,
    `до подтверждения ничего не создано (${st.dreams}/${st.insights})`);
  ok(/Будет добавлено записей: 3/.test(st.outText),
    'сводка называет общее число записей', st.outText.slice(0, 80));
}

// ── 4. Язык сводки: разделы приложения, а не имена коллекций ─────────
{
  const st = await page.evaluate(() => ({
    out: (document.getElementById('ext-out').textContent || ''),
    summaryOnly: (() => {
      const out = document.getElementById('ext-out');
      const det = out.querySelector('details');
      return det ? (out.textContent || '').replace(det.textContent, '') : (out.textContent || '');
    })(),
    apply: (document.getElementById('ext-actions').textContent || ''),
  }));
  ok(/Сны/.test(st.summaryOnly) && /Инсайты/.test(st.summaryOnly),
    'сводка названа разделами приложения («Сны», «Инсайты»)');
  ok(!/\bdreams\b|\binsights\b/.test(st.summaryOnly),
    'внутренние имена коллекций не вынесены в сводку', st.summaryOnly.slice(0, 120));
  ok(!/sourceId|claimClass|architect-external-work/.test(st.summaryOnly),
    'технические термины остались в раскрывающемся блоке, а не в сводке');
  ok(/Добавить записей: 3/.test(st.apply),
    'кнопка применения называет точное число', st.apply.slice(0, 60));
  // Проверяем ВИДИМОСТЬ, а не наличие в разметке: скрытое обещание
  // безопасности не помогает человеку принять решение.
  const safe = await page.evaluate(() => {
    const el = document.querySelector('#ext-out .ext-safe');
    const vis = e => !!e && (e.checkVisibility ? e.checkVisibility() : e.offsetParent !== null);
    return { present: !!el, visible: vis(el), text: (el || {}).textContent || '' };
  });
  ok(safe.visible && /Ничего не удаляется и не перезаписывается/.test(safe.text),
    'обещание безопасности стоит рядом с решением и реально видно',
    `present=${safe.present} visible=${safe.visible}`);
}

// ── 5. Разбор по записям свёрнут, когда решать нечего ────────────────
{
  const det = await page.evaluate(() => {
    const d = document.getElementById('ext-out').querySelector('details');
    return d ? { open: d.open, summary: d.querySelector('summary').textContent.trim() } : null;
  });
  ok(det && det.open === false, 'подробный список записей по умолчанию свёрнут');
  ok(det && /Разобрать по записям/.test(det.summary), 'блок назван понятно', det && det.summary);
}

// ── 6. Шаг 3: результат виден, есть куда идти дальше ─────────────────
{
  const st = await page.evaluate(() => {
    document.querySelector('#ext-actions button').click();
    const vis = el => !!el && (el.checkVisibility ? el.checkVisibility() : el.offsetParent !== null);
    return {
      out: (document.getElementById('ext-out').textContent || '').trim(),
      outVisible: vis(document.getElementById('ext-out')),
      btns: [...document.querySelectorAll('#ext-actions button')].map(b => b.textContent.trim()),
      dreams: DB.dreams.length, insights: DB.insights.length,
    };
  });
  ok(st.dreams === 2 && st.insights === 1, `импорт применён (${st.dreams} снов, ${st.insights} инсайт)`);
  ok((await step()) === 3, 'индикатор перешёл на шаг 3');
  ok(st.outVisible && /Готово · добавлено записей: 3/.test(st.out),
    'экран результата виден и называет число', st.out.slice(0, 80));
  ok(/Сны/.test(st.out), 'результат разложен по разделам приложения');
  ok(st.btns.some(b => /Открыть Дневник/.test(b)), 'есть переход к добавленным записям');
  ok(st.btns.some(b => /ещё файл/i.test(b)), 'есть путь импортировать следующий файл');
  ok(/дубл/i.test(st.out), 'сказано, что повторная загрузка не создаст дублей');
}

// ── 7. «Импортировать ещё файл» возвращает на шаг 1 и ничего не удаляет ──
{
  const st = await page.evaluate(() => {
    extResetToStep1();
    return {
      out: (document.getElementById('ext-out').textContent || '').trim(),
      text: document.getElementById('ext-text').value,
      dreams: DB.dreams.length, insights: DB.insights.length,
    };
  });
  ok((await step()) === 1, 'экран вернулся на шаг 1');
  ok(st.out === '' && st.text === '', 'поля и результат очищены');
  ok(st.dreams === 2 && st.insights === 1,
    `уже импортированные записи не тронуты (${st.dreams}/${st.insights})`);
}

// ── 8. Повторная загрузка того же файла не создаёт дублей ────────────
{
  await pickFile(pkg(1));
  const st = await page.evaluate(() => ({
    out: (document.getElementById('ext-out').textContent || ''),
    act: (document.getElementById('ext-actions').textContent || ''),
    dreams: DB.dreams.length,
  }));
  ok(st.dreams === 2, 'повторный разбор не создал записей до подтверждения');
  ok(/уже импортирован|Нет новых записей/i.test(st.out + st.act),
    'человеку сказано, что этот пакет уже импортирован', (st.out + st.act).slice(0, 120));
}

// ── 9. Пустой ввод: внятный ответ, ноль мутаций ──────────────────────
{
  await reset();
  await open();
  const st = await page.evaluate(() => {
    extPreviewPrimary();
    const vis = el => !!el && (el.checkVisibility ? el.checkVisibility() : el.offsetParent !== null);
    return {
      out: (document.getElementById('ext-out').textContent || '').trim(),
      outVisible: vis(document.getElementById('ext-out')),
      dreams: DB.dreams.length,
    };
  });
  ok(st.outVisible && /выбери файл|вставь данные/i.test(st.out),
    'при пустом вводе объяснено, что делать', st.out.slice(0, 80));
  ok(st.dreams === 0, 'пустой ввод ничего не создал');
}

// ── 9b. Путь «вставить текст + нажать кнопку» работает без источника ──
{
  await reset();
  await open();
  const st = await page.evaluate((t) => {
    document.getElementById('ext-text').value = t;
    return null;
  }, JSON.stringify(pkg(9)));
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#ov-ext-import .btn-p')].find(x => /что добавится/i.test(x.textContent));
    b.click();
  });
  await page.waitForFunction(() => {
    const o = document.getElementById('ext-out');
    return o && o.innerHTML.trim() && !/Проверяю/.test(o.textContent);
  }, null, { timeout: 5000 }).catch(() => {});
  const res = await page.evaluate(() => ({
    out: (document.getElementById('ext-out').textContent || ''),
    act: (document.getElementById('ext-actions').textContent || ''),
    dreams: DB.dreams.length,
  }));
  ok(/Будет добавлено записей: 3/.test(res.out),
    'вставка текста + главная кнопка дают предпросмотр без всякого источника', res.out.slice(0, 80));
  ok(/Добавить записей: 3/.test(res.act), 'кнопка применения появилась и на этом пути');
  ok(res.dreams === 0, 'предпросмотр по кнопке ничего не создал');
}

// ── 10. Решение по конфликту не прячется ─────────────────────────────
{
  await reset();
  await open();
  // Сначала импортируем, затем правим запись локально и подаём новую версию —
  // получаем changed-conflict, требующий явного решения.
  await pickFile(pkg(2));
  await page.evaluate(() => { document.querySelector('#ext-actions button').click(); });
  await page.evaluate(() => {
    const d = DB.dreams.find(x => x.ext && /TEST-IMP-DREAM-2/.test(x.ext.sourceId));
    d.body = 'локальная правка владельца'; d._u = Date.now(); persist();
  });
  const v2 = pkg(2);
  v2.session.clientRef = 'TEST-IMP-SESSION-2-V2';
  v2.entities[0].sourceVersion = { sequence: 2 };
  v2.entities[0].data.body = 'новая версия нарратива из источника';
  await page.evaluate(() => extResetToStep1());
  await pickFile(v2);
  const st = await page.evaluate(() => {
    const out = document.getElementById('ext-out');
    const det = out.querySelector('details');
    const vis = el => !!el && (el.checkVisibility ? el.checkVisibility() : el.offsetParent !== null);
    const radios = [...out.querySelectorAll('input[type=radio]')];
    return {
      detOpen: det ? det.open : null,
      summary: det ? det.querySelector('summary').textContent.trim() : '',
      needBanner: !!out.querySelector('.ext-need'),
      needText: (out.querySelector('.ext-need') || {}).textContent || '',
      radios: radios.length,
      radiosVisible: radios.filter(vis).length,
      checked: radios.filter(r => r.checked).length,
    };
  });
  ok(st.needBanner && /решение/i.test(st.needText),
    'наверху видно, что нужно решение', st.needText.slice(0, 80));
  ok(st.detOpen === true, 'список записей раскрыт сам, когда без решения импорт не пройдёт');
  ok(/нужно решение/i.test(st.summary), 'заголовок блока говорит, что требуется решение', st.summary);
  ok(st.radios >= 2 && st.radiosVisible === st.radios,
    `варианты решения реально видимы пользователю (${st.radiosVisible}/${st.radios})`);
  ok(st.checked === 0, 'ни один вариант не выбран за пользователя');
}

// ── 11. Источник: блок свёрнут, но его предпросмотр виден ────────────
{
  await reset();
  await open();
  const st = await page.evaluate(() => {
    const det = document.getElementById('ext-src-det');
    const connOut = document.getElementById('ext-conn-out');
    return {
      detOpen: det.open,
      connOutInsideDet: det.contains(connOut),
      connOutInsideConnections: (document.getElementById('ext-connections') || {}).contains
        ? document.getElementById('ext-connections').contains(connOut) : null,
      live: connOut.getAttribute('aria-live'),
    };
  });
  ok(st.detOpen === false, 'управление источниками по умолчанию свёрнуто');
  ok(st.connOutInsideDet === false && st.connOutInsideConnections === false,
    'вывод предпросмотра моста живёт СНАРУЖИ свёрнутого блока — он не может спрятаться');
  ok(st.live === 'polite', 'a11y: результат моста объявляется через aria-live');
}

// ── 12. С выбранным источником главная кнопка ведёт в мост ───────────
{
  await reset();
  await open();
  await page.evaluate(() => {
    const c = extConnCreate('TEST-IMP источник', 'google_drive');
    _extConnActive = c.rec.id; extRenderConnections(); extRenderTargetNote();
  });
  const note = await page.evaluate(() => (document.getElementById('ext-target-note') || {}).textContent || '');
  ok(/TEST-IMP источник/.test(note) && /журнал/i.test(note),
    'человеку сказано, что импорт запишется в выбранный источник', note.slice(0, 100));
  await pickFile(pkg(3));
  const st = await page.evaluate(() => {
    const vis = el => !!el && (el.checkVisibility ? el.checkVisibility() : el.offsetParent !== null);
    return {
      connOut: (document.getElementById('ext-conn-out').textContent || ''),
      connVisible: vis(document.getElementById('ext-conn-out')),
      legacy: (document.getElementById('ext-out').textContent || ''),
    };
  });
  ok(st.connVisible && /Новых записей/.test(st.connOut),
    'при выбранном источнике виден человеческий предпросмотр моста');
  ok(!/статус:|Пакет не принят/.test(st.legacy),
    'разовый технический путь не перехватывает файл, когда выбран источник');
  ok((await step()) === 2, 'индикатор перешёл на шаг 2 и в пути через мост');
}

// ── 13. a11y и мобильная вёрстка экрана ──────────────────────────────
{
  // Проверяем в детерминированном состоянии: чистый экран + предпросмотр.
  // Иначе результат зависел бы от того, что оставил предыдущий сценарий.
  await reset();
  await open();
  await pickFile(pkg(4));
  const ui = await page.evaluate(() => {
    const ov = document.getElementById('ov-ext-import');
    const vis = el => !!el && (el.checkVisibility ? el.checkVisibility() : el.offsetParent !== null);
    const btns = [...ov.querySelectorAll('button')].filter(vis);
    return {
      small: btns.filter(b => b.getBoundingClientRect().height < 44).length,
      unnamed: btns.filter(b => !(b.textContent || '').trim() && !b.getAttribute('aria-label')).length,
      overflow: btns.filter(b => { const r = b.getBoundingClientRect(); return r.left < 0 || r.right > window.innerWidth + 1; }).length,
      divClick: ov.querySelectorAll('div[onclick]').length,
      liveOut: document.getElementById('ext-out').getAttribute('aria-live'),
      labels: ['ext-file', 'ext-text'].every(id => !!ov.querySelector(`label[for="${id}"]`)),
    };
  });
  ok(ui.small === 0 && ui.unnamed === 0 && ui.divClick === 0,
    `a11y: тап-цели ≥44px, кнопки именованы, интерактивных div нет (${ui.small}/${ui.unnamed}/${ui.divClick})`);
  ok(ui.overflow === 0, 'элементы не выходят за границы экрана iPhone');
  ok(ui.liveOut === 'polite', 'a11y: результат разбора объявляется через aria-live');
  ok(ui.labels, 'a11y: у поля файла и поля вставки есть подписи');
}

// ── 14. «Откуда взять файл» — инструкция есть на экране ──────────────
{
  const st = await page.evaluate(() => {
    const ov = document.getElementById('ov-ext-import');
    const det = [...ov.querySelectorAll('details')].find(d => /Откуда взять файл/.test(d.querySelector('summary').textContent));
    return det ? { open: det.open, text: det.textContent } : null;
  });
  ok(!!st, 'на экране есть блок «Откуда взять файл»');
  ok(st && /ChatGPT/.test(st.text) && /Google Drive/.test(st.text) && /Архитектор/.test(st.text),
    'перечислены все три поддерживаемых пути с шагами');
  ok(st && st.open === false, 'инструкция свёрнута и не мешает тем, у кого файл уже есть');
}

ok(errors.length === 0, `JS-ошибок нет за весь прогон (${errors.length})`, errors.slice(0, 3).join('\n'));

// ── Privacy canary ──────────────────────────────────────────────────
{
  const src = readFileSync(join(DIR, 'importFlow.spec.mjs'), 'utf8');
  const bundle = readFileSync(join(ROOT, 'dist', 'app.html'), 'utf8');
  // Маркеры собраны по кускам, чтобы сам файл не содержал искомую строку.
  const marks = [['GDRI', 'VE:'], ['LIFE-2', '02'], ['DREAM-2', '02'], ['PARA-2', '02'], ['INT-2', '02']]
    .map(p => new RegExp(p.join('')));
  const inSpec = marks.filter(r => r.test(src)).length;
  const inBundle = marks.filter(r => r.test(bundle)).length;
  ok(inSpec === 0 && inBundle === 0,
    `privacy canary: приватных маркеров нет ни в тесте, ни в бандле (${inSpec}/${inBundle})`);
  ok(/TEST-IMP-/.test(src), 'все фикстуры несут синтетический префикс TEST-IMP-*');
}

try { unlinkSync(TMP); } catch (_) {}
await browser.close();
console.log(`\nИМПОРТ ДАННЫХ: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
