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

function replaceBetween(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`missing range: ${label}`);
  if (source.indexOf(startMarker, start + 1) >= 0) throw new Error(`non-unique start: ${label}`);
  return source.slice(0, start) + replacement + '\n\n' + source.slice(end);
}

const feedbackBlock = `// ═══ ОБРАТНАЯ СВЯЗЬ · PRIVACY BOUNDARY (P1-C) ═════════════════════
function feedbackPrivacy() {
  const privacy = typeof globalThis !== 'undefined' ? globalThis.ARCH_FEEDBACK_PRIVACY : null;
  if (!privacy) throw new Error('Feedback privacy module не загружен');
  return privacy;
}

function pushErr(error) {
  try { feedbackPrivacy().pushError(localStorage, error); updateFeedbackLocalStatus(); } catch (_) {}
}
window.addEventListener('error', event => pushErr({
  message: event.message || 'error', source: event.filename || '', line: event.lineno || 0, col: event.colno || 0, ts: nowISO(),
}));
window.addEventListener('unhandledrejection', event => pushErr({
  message: 'promise: ' + ((event.reason && event.reason.message) || event.reason || 'rejection'), ts: nowISO(),
}));

function feedbackRawContext({ includeErrors = false, appVersion = '' } = {}) {
  let screen = '';
  try { screen = (document.querySelector('.ov.on') || document.querySelector('.pg.on') || {}).id || ''; } catch (_) {}
  const privacy = feedbackPrivacy();
  return {
    appVersion,
    screen,
    lang: navigator.language,
    online: navigator.onLine,
    ua: navigator.userAgent.slice(0, 200),
    viewport: innerWidth + 'x' + innerHeight,
    ts: nowISO(),
    lastErrors: includeErrors ? privacy.getErrors(localStorage).slice(-3) : [],
  };
}

function updateFeedbackLocalStatus() {
  try {
    const privacy = feedbackPrivacy();
    const state = privacy.localState(localStorage);
    const status = $('fb-local-status');
    if (status) status.textContent = 'Локально: ошибок ' + state.errors + ' · в очереди ' + state.queued;
    const errors = $('fb-errors-count');
    if (errors) errors.textContent = state.errors ? 'Доступно: ' + Math.min(3, state.errors) + ' из ' + state.errors : 'Ошибок нет';
    const clearErrors = $('fb-clear-errors');
    if (clearErrors) clearErrors.disabled = state.errors === 0;
    const clearOutbox = $('fb-clear-outbox');
    if (clearOutbox) clearOutbox.disabled = state.queued === 0;
  } catch (_) {}
}

function renderFeedbackDisclosure() {
  const includeContext = !$('fb-ctx') || $('fb-ctx').checked;
  const includeErrors = includeContext && !!$('fb-errors')?.checked;
  const redactContacts = !$('fb-redact') || $('fb-redact').checked;
  const el = $('fb-disclosure');
  if (el) {
    const items = ['текст формы'];
    if (includeContext) items.push('версия, экран, устройство, язык, размер экрана и состояние сети');
    if (includeErrors) items.push('до 3 последних очищенных ошибок без stack и полного пути');
    el.innerHTML = '<b>Будет отправлено:</b> ' + items.join('; ') + '.<br><b>Не отправляется:</b> дневник, записи, ключи и конфигурация.<br>'
      + (redactContacts ? 'Email и телефоны будут скрыты. ' : 'Email и телефоны останутся в тексте по твоему выбору. ')
      + 'API-ключи и токены скрываются всегда.';
  }
  updateFeedbackLocalStatus();
}

function openFeedback() {
  try { closeNav(); } catch (_) {}
  renderFeedbackDisclosure();
  openOv('ov-feedback');
  setTimeout(() => $('fb-text')?.focus(), 80);
}

function clearFeedbackDiagnostics() {
  feedbackPrivacy().clearErrors(localStorage);
  updateFeedbackLocalStatus();
  toast('Локальные ошибки очищены', 'ok');
}

function clearFeedbackOutbox() {
  feedbackPrivacy().clearOutbox(localStorage);
  updateFeedbackLocalStatus();
  toast('Очередь обратной связи очищена', 'ok');
}

function feedbackRetryable(status) {
  return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;
}

async function feedbackPost(base, payload) {
  const response = await fetch(base + '/api/feedback', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || ('HTTP ' + response.status));
    error.status = response.status;
    error.code = data.code || 'feedback_http_error';
    throw error;
  }
  return data;
}

async function sendFeedback() {
  const privacy = feedbackPrivacy();
  const field = $('fb-text');
  const originalText = (field && field.value) || '';
  if (originalText.trim().length < 3) { toast('Напиши хотя бы пару слов', 'warn'); return; }
  const includeContext = !$('fb-ctx') || $('fb-ctx').checked;
  const includeErrors = includeContext && !!$('fb-errors')?.checked;
  const redactContacts = !$('fb-redact') || $('fb-redact').checked;
  let appVersion = '';
  try { appVersion = ((await caches.keys()) || []).find(key => key.startsWith('arch-')) || ''; } catch (_) {}
  let payload;
  try {
    payload = privacy.preparePayload({
      text: originalText,
      rawContext: feedbackRawContext({ includeErrors, appVersion }),
      includeContext,
      includeErrors,
      redactContacts,
    });
  } catch (error) {
    toast(error.message || 'Проверь текст обратной связи', 'warn');
    return;
  }
  const base = (typeof apiBase === 'function' && apiBase()) || window.ARCHITECT_API || '';
  try {
    if (!navigator.onLine) { const offline = new Error('offline'); offline.status = 0; throw offline; }
    const data = await feedbackPost(base, payload);
    privacy.addSentId(localStorage, data.id);
    field.value = '';
    closeOv('ov-feedback');
    if (typeof hptMed === 'function') hptMed();
    updateFeedbackLocalStatus();
    toast('Спасибо! Мы читаем каждое сообщение', 'ok');
  } catch (error) {
    const status = Number(error.status || 0);
    if (feedbackRetryable(status)) {
      privacy.enqueueOutbox(localStorage, payload);
      field.value = '';
      closeOv('ov-feedback');
      updateFeedbackLocalStatus();
      toast('Сохранено локально — отправлю при подключении', 'ok');
    } else {
      toast(error.message || 'Сообщение отклонено — проверь текст', 'warn');
      renderFeedbackDisclosure();
    }
  }
}

async function flushFeedbackOutbox() {
  try {
    const privacy = feedbackPrivacy();
    const queued = privacy.getOutbox(localStorage);
    if (!queued.length || !navigator.onLine) { updateFeedbackLocalStatus(); return; }
    const base = (typeof apiBase === 'function' && apiBase()) || window.ARCHITECT_API || '';
    const retry = [];
    for (const payload of queued) {
      try {
        privacy.assertNoForbiddenKeys(payload);
        const data = await feedbackPost(base, payload);
        privacy.addSentId(localStorage, data.id);
      } catch (error) {
        if (feedbackRetryable(Number(error.status || 0))) retry.push(payload);
      }
    }
    privacy.setOutbox(localStorage, retry);
    updateFeedbackLocalStatus();
  } catch (_) {}
}
window.addEventListener('online', flushFeedbackOutbox);
setTimeout(flushFeedbackOutbox, 4000);
setTimeout(updateFeedbackLocalStatus, 1200);

// Замыкание цикла: fixed → благодарность и удаление id из ожидания.
async function checkFeedbackStatus() {
  try {
    if (!navigator.onLine) return;
    const privacy = feedbackPrivacy();
    const sent = privacy.getSentIds(localStorage);
    if (!sent.length) return;
    const base = (typeof apiBase === 'function' && apiBase()) || window.ARCHITECT_API || '';
    const response = await fetch(base + '/api/feedback/status?ids=' + sent.join(','));
    if (!response.ok) return;
    const data = await response.json();
    const fixedIds = (data.items || []).filter(item => item.status === 'fixed').map(item => +item.id);
    if (fixedIds.length) {
      toast('Твой отзыв учтён — уже исправлено ✓', 'ok');
      privacy.setSentIds(localStorage, sent.filter(id => !fixedIds.includes(+id)));
      updateFeedbackLocalStatus();
    }
  } catch (_) {}
}
setTimeout(checkFeedbackStatus, 6000);`;

await edit('app.js', source => replaceBetween(
  source,
  '// ═══ ОБРАТНАЯ СВЯЗЬ (см. FEEDBACK_SPEC.md) ═══════════════════════',
  '// ═══ ЖИВОЙ ОТКЛИК ════════════════════════════════════════════════',
  feedbackBlock,
  'feedback runtime block',
));

await edit('index.html', source => {
  source = replaceOnce(
    source,
    `<button class="navlink" onclick="closeNav();openOv('ov-feedback')"><i data-lucide="message-square"></i>Обратная связь</button>`,
    `<button class="navlink" onclick="openFeedback()"><i data-lucide="message-square"></i>Обратная связь</button>`,
    'sidebar feedback launcher',
  );

  source = replaceOnce(
    source,
    `  <div class="sec-lbl">Команды</div>`,
    `  <div class="sec-lbl">Поддержка и приватность</div>
  <div class="card mx">
    <div class="srow" onclick="openFeedback()"><div class="sic" style="background:var(--blue-l)"><i data-lucide="message-square" style="color:var(--blue-t)"></i></div><span class="sl2">Обратная связь</span><span class="sv2" id="fb-local-status">Локальные данные: —</span></div>
    <div class="srow" onclick="openOv('ov-privacy')"><div class="sic" style="background:var(--green-l)"><i data-lucide="shield" style="color:var(--green)"></i></div><span class="sl2">Приватность</span><span class="sv2">Что и куда уходит</span></div>
  </div>
  <div class="sec-lbl">Команды</div>`,
    'settings privacy section',
  );

  const oldOverlay = `<div class="ov" id="ov-feedback" onclick="if(event.target===this)closeOv('ov-feedback')">
  <div class="sheet">
    <div class="sh-pull"></div>
    <div class="sh-title">Обратная связь</div>
    <div class="sh-form">
      <div class="f-lbl">Что расскажешь?</div>
      <textarea class="field" id="fb-text" rows="4" placeholder="Похвала, идея, жалоба или ошибка — своими словами"></textarea>
      <label class="fb-ctx-row"><input type="checkbox" id="fb-ctx" checked>Приложить тех-контекст: версия, экран, устройство</label>
      <button class="btn btn-p btn-full" onclick="sendFeedback()">Отправить</button>
      <button class="btn btn-s btn-full" onclick="closeOv('ov-feedback')">Позже</button>
    </div>
  </div>
</div>`;
  const newOverlay = `<div class="ov" id="ov-feedback" onclick="if(event.target===this)closeOv('ov-feedback')">
  <div class="sheet">
    <div class="sh-pull"></div>
    <div class="sh-title">Обратная связь</div>
    <div class="sh-form">
      <div class="fb-notice"><b>Добровольный отдельный канал.</b> Дневник и записи никогда не прикрепляются автоматически.</div>
      <div class="f-lbl">Что расскажешь?</div>
      <textarea class="field" id="fb-text" rows="4" maxlength="4000" placeholder="Похвала, идея, жалоба или ошибка — своими словами"></textarea>
      <label class="fb-choice"><input type="checkbox" id="fb-redact" checked onchange="renderFeedbackDisclosure()"><span><b>Скрыть email и телефоны</b><small>API-ключи и токены скрываются всегда</small></span></label>
      <label class="fb-choice"><input type="checkbox" id="fb-ctx" checked onchange="renderFeedbackDisclosure()"><span><b>Приложить тех-контекст</b><small>Версия, экран, устройство, язык, размер и сеть</small></span></label>
      <label class="fb-choice"><input type="checkbox" id="fb-errors" onchange="renderFeedbackDisclosure()"><span><b>Приложить последние ошибки</b><small id="fb-errors-count">Ошибок нет</small></span></label>
      <div class="fb-disclosure" id="fb-disclosure"></div>
      <div class="fb-retention">После отправки текст и выбранный контекст хранятся <b>без автоматического удаления</b>. Доступ к сырому сообщению имеет владелец проекта. Дневник, check-in, сны и ключи не прикрепляются.</div>
      <div class="fb-local-actions">
        <button class="btn btn-s btn-sm" id="fb-clear-errors" onclick="clearFeedbackDiagnostics()">Очистить ошибки</button>
        <button class="btn btn-s btn-sm" id="fb-clear-outbox" onclick="clearFeedbackOutbox()">Очистить очередь</button>
      </div>
      <button class="btn btn-p btn-full" onclick="sendFeedback()">Отправить</button>
      <button class="btn btn-s btn-full" onclick="closeOv('ov-feedback')">Позже</button>
    </div>
  </div>
</div>`;
  source = replaceOnce(source, oldOverlay, newOverlay, 'feedback overlay');

  source = replaceOnce(
    source,
    `      <button class="btn btn-p btn-full" onclick="closeOv('ov-privacy')">Понятно</button>`,
    `      <div class="card mx" style="padding:1rem;margin-bottom:.6rem">
        <div class="si-text" style="font-weight:700;margin-bottom:.35rem">💬 Обратная связь — отдельный канал</div>
        <div class="si-text">Отправляется только текст формы и выбранный тобой тех-контекст. Дневник, check-in, сны, конфигурация и ключи не прикрепляются. Последние ошибки добавляются только отдельной галочкой. Сообщение хранится без автоматического удаления; доступ к сырому сообщению имеет владелец проекта.</div>
      </div>
      <button class="btn btn-p btn-full" onclick="closeOv('ov-privacy')">Понятно</button>`,
    'privacy feedback disclosure',
  );

  source = replaceOnce(
    source,
    `<script src="data-metadata.js"></script>
<script src="ai-policy.js"></script>
<script src="app.js"></script>`,
    `<script src="data-metadata.js"></script>
<script src="ai-policy.js"></script>
<script src="privacy-feedback.js"></script>
<script src="app.js"></script>`,
    'privacy script order',
  );
  return source;
});

await edit('styles.css', source => {
  const marker = '/* P1-C · privacy-safe feedback controls */';
  if (source.includes(marker)) throw new Error('feedback styles already present');
  return source.trimEnd() + `\n\n${marker}
.fb-notice,.fb-disclosure,.fb-retention{font-size:var(--tx2);line-height:1.55;color:var(--t2);background:var(--bg2);border:1px solid var(--bd);border-radius:8px;padding:var(--s3)}
.fb-notice b,.fb-disclosure b,.fb-retention b{color:var(--t1);font-weight:510}
.fb-choice{display:flex;align-items:flex-start;gap:var(--s3);padding:var(--s3);border:1px solid var(--bd);border-radius:8px;background:var(--sf);cursor:pointer}
.fb-choice input{margin-top:3px;accent-color:var(--accent);flex-shrink:0}
.fb-choice span{display:flex;flex-direction:column;gap:2px;font-size:var(--tx3);color:var(--t1)}
.fb-choice small{font-size:var(--tx2);line-height:1.4;color:var(--t3)}
.fb-local-actions{display:flex;gap:var(--s2);flex-wrap:wrap}
.fb-local-actions .btn{flex:1;min-width:130px}
`;
});

await edit('build.mjs', source => {
  source = replaceOnce(
    source,
    "for (const f of ['index.html', 'styles.css', 'data-metadata.js', 'ai-policy.js', 'app.js', 'sw.js', 'lucide.js', 'inter-latin.woff2', 'inter-cyrillic.woff2'])",
    "for (const f of ['index.html', 'styles.css', 'data-metadata.js', 'ai-policy.js', 'privacy-feedback.js', 'app.js', 'sw.js', 'lucide.js', 'inter-latin.woff2', 'inter-cyrillic.woff2'])",
    'content hash inputs',
  );
  source = replaceOnce(
    source,
    "  const aiPolicy = await readFile(join(DIR, 'ai-policy.js'), 'utf8');\n  const js  = await readFile(join(DIR, 'app.js'), 'utf8');",
    "  const aiPolicy = await readFile(join(DIR, 'ai-policy.js'), 'utf8');\n  const feedbackPrivacy = await readFile(join(DIR, 'privacy-feedback.js'), 'utf8');\n  const js  = await readFile(join(DIR, 'app.js'), 'utf8');",
    'privacy build read',
  );
  source = replaceOnce(
    source,
    "  html = html.replace('<script src=\"ai-policy.js\"></script>', () => '<script>\\n' + aiPolicy + '\\n</script>');\n  html = html.replace('<script src=\"app.js\"></script>', () => '<script>\\n' + js + '\\n</script>');\n  if (/href=\"styles\\.css\"|src=\"data-metadata\\.js\"|src=\"ai-policy\\.js\"|src=\"app\\.js\"/.test(html)) throw new Error('не удалось заинлайнить (осталась ссылка)');\n  if (!html.includes(metadata.slice(0, 80)) || !html.includes(aiPolicy.slice(0, 80)) || !html.includes(js.slice(0, 80))) throw new Error('JS не вставился дословно');",
    "  html = html.replace('<script src=\"ai-policy.js\"></script>', () => '<script>\\n' + aiPolicy + '\\n</script>');\n  html = html.replace('<script src=\"privacy-feedback.js\"></script>', () => '<script>\\n' + feedbackPrivacy + '\\n</script>');\n  html = html.replace('<script src=\"app.js\"></script>', () => '<script>\\n' + js + '\\n</script>');\n  if (/href=\"styles\\.css\"|src=\"data-metadata\\.js\"|src=\"ai-policy\\.js\"|src=\"privacy-feedback\\.js\"|src=\"app\\.js\"/.test(html)) throw new Error('не удалось заинлайнить (осталась ссылка)');\n  if (!html.includes(metadata.slice(0, 80)) || !html.includes(aiPolicy.slice(0, 80)) || !html.includes(feedbackPrivacy.slice(0, 80)) || !html.includes(js.slice(0, 80))) throw new Error('JS не вставился дословно');",
    'privacy build inline order',
  );
  return source;
});

await edit('package.json', source => {
  const pkg = JSON.parse(source);
  const command = 'node tests/evidence/privacy_feedback_regression.mjs';
  if (String(pkg.scripts?.['test:data'] || '').includes(command)) throw new Error('privacy regression already present');
  pkg.scripts['test:data'] = `${pkg.scripts['test:data']} && ${command}`;
  return JSON.stringify(pkg, null, 2) + '\n';
});

await edit('tests/e2e.mjs', source => {
  const start = '// ── Обратная связь: форма → отправка (мок API) → id сохранён ──';
  const end = '// ── Lagged-паттерн сферы: эффект «на следующий день» (Bearable) ──';
  const replacement = `// ── Privacy-safe feedback: explicit consent, redaction, retry and clear ──
const feedbackSent = await page.evaluate(async () => {
  localStorage.removeItem('arch5_errbuf'); localStorage.removeItem('arch5_fb_outbox'); localStorage.removeItem('arch5_fb_sent');
  ARCH_FEEDBACK_PRIVACY.pushError(localStorage, {
    message: 'Synthetic failure for owner@example.com with sk-ant-abcdefghijklmnop123456',
    filename: 'https://example.test/private/app.js?token=secret', lineno: 12, colno: 3,
  });
  window.__feedbackPayload = null;
  window.fetch = (url, options) => String(url).includes('/api/feedback')
    ? (window.__feedbackPayload = JSON.parse(options.body), Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 7, retention: 'no-automatic-expiry', access: 'project-owner' }) }))
    : Promise.reject(new Error('offline'));
  openFeedback();
  $('fb-text').value = 'Напишите owner@example.com, ключ sk-ant-abcdefghijklmnop123456 не отправлять';
  $('fb-errors').checked = true; renderFeedbackDisclosure();
  await sendFeedback();
  return {
    payload: window.__feedbackPayload,
    sent: ARCH_FEEDBACK_PRIVACY.getSentIds(localStorage),
    closed: !document.querySelector('#ov-feedback.on'),
  };
});
ok(feedbackSent.sent.includes(7), 'фидбэк отправлен, id сохранён для замыкания цикла');
ok(feedbackSent.closed, 'форма фидбэка закрывается после отправки');
ok(feedbackSent.payload.text.includes('[email]') && feedbackSent.payload.text.includes('[secret]'), 'контакты и API-ключи очищены до отправки');
ok(feedbackSent.payload.privacy.contextIncluded && feedbackSent.payload.privacy.errorsIncluded && feedbackSent.payload.privacy.retention === 'no-automatic-expiry', 'отправлены только явно выбранные категории и честная retention-политика');
ok(feedbackSent.payload.context.lastErrors.length === 1 && feedbackSent.payload.context.lastErrors[0].source === 'app.js', 'ошибка приложена только после opt-in, без полного пути');
ok(!/(?:insights|checkins|dreams|spaceKey|apiKey)/.test(JSON.stringify(feedbackSent.payload)), 'дневник, конфигурация и ключи не попадают в feedback payload');

const feedbackQueued = await page.evaluate(async () => {
  window.fetch = () => Promise.reject(new Error('offline'));
  openFeedback(); $('fb-text').value = 'Синтетический офлайн-отзыв';
  $('fb-ctx').checked = false; $('fb-errors').checked = false; renderFeedbackDisclosure();
  await sendFeedback();
  const queued = ARCH_FEEDBACK_PRIVACY.getOutbox(localStorage);
  return { queued, closed: !document.querySelector('#ov-feedback.on') };
});
ok(feedbackQueued.closed && feedbackQueued.queued.length === 1, 'сетевой сбой сохраняет очищенный payload в локальную очередь');
ok(Object.keys(feedbackQueued.queued[0].context).length === 1 && !!feedbackQueued.queued[0].context.ts, 'opt-out техконтекста оставляет только timestamp');

const rejectedNotQueued = await page.evaluate(async () => {
  const before = ARCH_FEEDBACK_PRIVACY.getOutbox(localStorage).length;
  window.fetch = () => Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({ error: 'Некорректный текст', code: 'invalid_text' }) });
  openFeedback(); $('fb-text').value = 'Исправь меня';
  await sendFeedback();
  return {
    before, after: ARCH_FEEDBACK_PRIVACY.getOutbox(localStorage).length,
    open: !!document.querySelector('#ov-feedback.on'), value: $('fb-text').value,
  };
});
ok(rejectedNotQueued.after === rejectedNotQueued.before && rejectedNotQueued.open && rejectedNotQueued.value === 'Исправь меня', '4xx не зацикливается в outbox и оставляет текст для исправления');

const clearedFeedbackLocal = await page.evaluate(() => {
  clearFeedbackDiagnostics(); clearFeedbackOutbox();
  return ARCH_FEEDBACK_PRIVACY.localState(localStorage);
});
ok(clearedFeedbackLocal.errors === 0 && clearedFeedbackLocal.queued === 0, 'пользователь может очистить ошибки и очередь локально');
await page.evaluate(() => closeOv('ov-feedback'));

// ── Замыкание цикла: статус fixed чистит список ожидания ──
await page.evaluate(async () => {
  ARCH_FEEDBACK_PRIVACY.setSentIds(localStorage, [7]);
  window.fetch = url => String(url).includes('/api/feedback/status')
    ? Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [{ id: 7, status: 'fixed', type: 'bug' }] }) })
    : Promise.reject(new Error('offline'));
  await checkFeedbackStatus();
});
ok(await page.evaluate(() => !ARCH_FEEDBACK_PRIVACY.getSentIds(localStorage).includes(7)), 'замыкание цикла: fixed убирает id из ожидания');`;
  return replaceBetween(source, start, end, replacement, 'feedback E2E block');
});

await edit('tests/mobile-evidence.mjs', source => {
  const before = `    await page.locator('#app').screenshot({ path: join(OUT, \`${'${engine}'}-${'${scenario.name}'}-app.png\`), animations: 'disabled', caret: 'hide' });
    record(engine, scenario.name, 'application element screenshot captured', true);
    record(engine, scenario.name, 'no uncaught application page errors', pageErrors.length === 0, pageErrors.join(' | '));`;
  const after = `    await page.locator('#app').screenshot({ path: join(OUT, \`${'${engine}'}-${'${scenario.name}'}-app.png\`), animations: 'disabled', caret: 'hide' });
    record(engine, scenario.name, 'application element screenshot captured', true);

    const feedbackPrivacy = await page.evaluate(() => {
      ARCH_FEEDBACK_PRIVACY.clearErrors(localStorage);
      ARCH_FEEDBACK_PRIVACY.pushError(localStorage, {
        message: 'Synthetic mobile error owner@example.com sk-ant-abcdefghijklmnop123456',
        filename: 'https://example.test/private/app.js?token=secret', lineno: 14,
      });
      openFeedback();
      return {
        redactChecked: !!document.getElementById('fb-redact')?.checked,
        contextChecked: !!document.getElementById('fb-ctx')?.checked,
        errorsChecked: !!document.getElementById('fb-errors')?.checked,
        disclosure: document.getElementById('fb-disclosure')?.textContent || '',
        retention: document.querySelector('#ov-feedback .fb-retention')?.textContent || '',
        clearErrorsVisible: !!document.getElementById('fb-clear-errors')?.offsetParent,
      };
    });
    await page.locator('#ov-feedback.on').waitFor({ state: 'visible', timeout: 5_000 });
    record(engine, scenario.name, 'feedback contact redaction defaults on', feedbackPrivacy.redactChecked);
    record(engine, scenario.name, 'feedback technical context is explicit opt-in control', feedbackPrivacy.contextChecked);
    record(engine, scenario.name, 'feedback error attachment defaults off', !feedbackPrivacy.errorsChecked);
    record(engine, scenario.name, 'feedback disclosure excludes diary and keys', /дневник/i.test(feedbackPrivacy.disclosure) && /ключ/i.test(feedbackPrivacy.disclosure));
    record(engine, scenario.name, 'feedback retention and owner access are visible', /без автоматического удаления/i.test(feedbackPrivacy.retention) && /владелец/i.test(feedbackPrivacy.retention));
    record(engine, scenario.name, 'local diagnostic clear action is reachable', feedbackPrivacy.clearErrorsVisible);
    await page.screenshot({ path: join(OUT, \`${'${engine}'}-${'${scenario.name}'}-feedback.png\`), fullPage: false, animations: 'disabled', caret: 'hide' });
    record(engine, scenario.name, 'feedback consent screenshot captured', true);
    await page.evaluate(() => closeOv('ov-feedback'));

    record(engine, scenario.name, 'no uncaught application page errors', pageErrors.length === 0, pageErrors.join(' | '));`;
  return replaceOnce(source, before, after, 'mobile feedback evidence insertion');
});

console.log('P1C_PRIVACY_WIRING_APPLIED');
