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

const providerBlock = `const AI_PROVIDERS = {
  anthropic: {
    name: 'Anthropic (Claude)',
    async call({ key, model, system, user, messages, maxTokens, schema, reasoning, signal }) {
      const body = { model, max_tokens: maxTokens, messages: messages || [{ role: 'user', content: user }] };
      if (system) body.system = system;
      if (schema) body.output_config = { format: { type: 'json_schema', schema } };
      // «С рассуждением»: adaptive thinking на моделях 4.6+ (haiku — без параметра)
      if (reasoning != null && /claude-(sonnet-5|opus-4-[6-8]|fable)/.test(model))
        body.thinking = { type: reasoning ? 'adaptive' : 'disabled' };
      let r;
      try {
        r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify(body),
          signal: signal,
        });
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        throw new Error('Нет соединения с Claude');
      }
      const data = await r.json().catch(() => null);
      if (!r.ok) {
        const msg = (data && data.error && data.error.message) || _httpMsg(r.status);
        log('error', 'Claude ' + r.status, msg);
        const e = new Error(msg); e.status = r.status; throw e;
      }
      if (data.stop_reason === 'refusal') throw new Error('Модель отклонила запрос');
      const u = data.usage || {};
      return {
        text: (data.content || []).filter(b => b.type === 'text').map(b => b.text).join(''),
        ti: +u.input_tokens || 0, to: +u.output_tokens || 0,
      };
    },
  },
  openai: {
    name: 'OpenAI (GPT)',
    async call({ key, model, system, user, messages, maxTokens, schema, signal }) {
      const msgs = [];
      if (system) msgs.push({ role: 'system', content: system });
      (messages || [{ role: 'user', content: user }]).forEach(m => msgs.push({ role: m.role, content: m.content }));
      const body = { model, max_completion_tokens: maxTokens, messages: msgs };
      if (schema) body.response_format = { type: 'json_schema', json_schema: { name: 'out', schema, strict: true } };
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
        body: JSON.stringify(body),
        signal: signal,
      }).catch(e => { if (e.name === 'AbortError') throw e; throw new Error('Нет соединения с OpenAI'); });
      const data = await r.json().catch(() => null);
      if (!r.ok) { const e = new Error((data && data.error && data.error.message) || _httpMsg(r.status)); e.status = r.status; throw e; }
      const u = data.usage || {};
      return {
        text: ((data.choices || [])[0] || {}).message?.content || '',
        ti: +u.prompt_tokens || 0, to: +u.completion_tokens || 0,
      };
    },
  },
  gemini: {
    name: 'Google (Gemini)',
    async call({ key, model, system, user, messages, maxTokens, signal }) {
      const contents = (messages || [{ role: 'user', content: user }])
        .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
      const body = { contents, generationConfig: { maxOutputTokens: maxTokens } };
      if (system) body.systemInstruction = { parts: [{ text: system }] };
      const r = await fetch(\`https://generativelanguage.googleapis.com/v1beta/models/\${model}:generateContent?key=\${encodeURIComponent(key)}\`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: signal,
      }).catch(e => { if (e.name === 'AbortError') throw e; throw new Error('Нет соединения с Gemini'); });
      const data = await r.json().catch(() => null);
      if (!r.ok) { const e = new Error((data && data.error && data.error.message) || _httpMsg(r.status)); e.status = r.status; throw e; }
      const u = data.usageMetadata || {};
      return {
        text: (((data.candidates || [])[0] || {}).content?.parts || []).map(p => p.text || '').join(''),
        ti: +u.promptTokenCount || 0, to: +u.candidatesTokenCount || 0,
      };
    },
  },
};
async function callClaude({ system, user, messages = null, maxTokens = 1024, schema = null, task = 'other', provider = null, model = null, reasoning = null }) {
  const provName = provider || CFG.aiProvider || 'anthropic';
  const key = getAiKeyFor(provName);
  if (!key) { const e = new Error('Не задан API-ключ ' + ((AI_PROVIDERS[provName] || {}).name || provName)); e.noKey = true; throw e; }
  const bs = aiBudgetState();
  if (!bs.ok) {
    const e = new Error(\`Бюджет AI на месяц исчерпан ($\${bs.spent.toFixed(2)} из $\${bs.budget}) — увеличь в Настройках\`);
    e.budget = true; throw e;
  }
  if (bs.warn && localStorage.getItem('arch5_ai_budget_warned') !== todayKey()) {
    try { localStorage.setItem('arch5_ai_budget_warned', todayKey()); } catch (e) {}
    setTimeout(() => toast(\`AI: потрачено \${Math.round(bs.spent / bs.budget * 100)}% месячного бюджета\`, 'warn'), 400);
  }
  const policy = typeof globalThis !== 'undefined' ? globalThis.ARCH_AI_POLICY : null;
  if (!policy) throw new Error('AI policy module не загружен');
  const request = policy.prepareRequest({ system, user, messages, maxTokens, schema, task, reasoning });
  const mdl = model || aiModelFor(request.task);
  const prov = AI_PROVIDERS[provName] || AI_PROVIDERS.anthropic;
  const res = await policy.runProvider(signal => prov.call({
    key, model: mdl, system: request.system, user: request.user, messages: request.messages,
    maxTokens: request.maxTokens, schema: request.schema, reasoning: request.reasoning, signal,
  }), { task: request.task });
  const validatedText = policy.validateResponse({ task: request.task, text: res.text, schema: request.schema });
  aiLedgerAdd({ ts: Date.now(), task: request.task, model: mdl, ti: res.ti, to: res.to });
  log('info', \`AI ✓ \${AI_TASKS[request.task] || request.task} · \${String(mdl).replace('claude-', '')} · \${res.to} ток.\`);
  return validatedText;
}`;

await edit('app.js', source => {
  const start = source.indexOf('const AI_PROVIDERS = {');
  const endMarker = '\n\n// Контекст недели для AI';
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error('AI provider/call boundary not found');
  if (source.indexOf('const AI_PROVIDERS = {', start + 1) >= 0) throw new Error('AI provider boundary is not unique');
  return source.slice(0, start) + providerBlock + source.slice(end);
});

await edit('index.html', source => replaceOnce(
  source,
  '<script src="data-metadata.js"></script>\n<script src="app.js"></script>',
  '<script src="data-metadata.js"></script>\n<script src="ai-policy.js"></script>\n<script src="app.js"></script>',
  'runtime script order',
));

await edit('build.mjs', source => {
  source = replaceOnce(
    source,
    "for (const f of ['index.html', 'styles.css', 'data-metadata.js', 'app.js', 'sw.js', 'lucide.js', 'inter-latin.woff2', 'inter-cyrillic.woff2'])",
    "for (const f of ['index.html', 'styles.css', 'data-metadata.js', 'ai-policy.js', 'app.js', 'sw.js', 'lucide.js', 'inter-latin.woff2', 'inter-cyrillic.woff2'])",
    'content hash inputs',
  );
  source = replaceOnce(
    source,
    "  const metadata = await readFile(join(DIR, 'data-metadata.js'), 'utf8');\n  const js  = await readFile(join(DIR, 'app.js'), 'utf8');",
    "  const metadata = await readFile(join(DIR, 'data-metadata.js'), 'utf8');\n  const aiPolicy = await readFile(join(DIR, 'ai-policy.js'), 'utf8');\n  const js  = await readFile(join(DIR, 'app.js'), 'utf8');",
    'policy build read',
  );
  source = replaceOnce(
    source,
    "  html = html.replace('<script src=\"data-metadata.js\"></script>', () => '<script>\\n' + metadata + '\\n</script>');\n  html = html.replace('<script src=\"app.js\"></script>', () => '<script>\\n' + js + '\\n</script>');\n  if (/href=\"styles\\.css\"|src=\"data-metadata\\.js\"|src=\"app\\.js\"/.test(html)) throw new Error('не удалось заинлайнить (осталась ссылка)');\n  if (!html.includes(metadata.slice(0, 80)) || !html.includes(js.slice(0, 80))) throw new Error('JS не вставился дословно');",
    "  html = html.replace('<script src=\"data-metadata.js\"></script>', () => '<script>\\n' + metadata + '\\n</script>');\n  html = html.replace('<script src=\"ai-policy.js\"></script>', () => '<script>\\n' + aiPolicy + '\\n</script>');\n  html = html.replace('<script src=\"app.js\"></script>', () => '<script>\\n' + js + '\\n</script>');\n  if (/href=\"styles\\.css\"|src=\"data-metadata\\.js\"|src=\"ai-policy\\.js\"|src=\"app\\.js\"/.test(html)) throw new Error('не удалось заинлайнить (осталась ссылка)');\n  if (!html.includes(metadata.slice(0, 80)) || !html.includes(aiPolicy.slice(0, 80)) || !html.includes(js.slice(0, 80))) throw new Error('JS не вставился дословно');",
    'policy build inline order',
  );
  return source;
});

await edit('package.json', source => {
  const pkg = JSON.parse(source);
  const focused = 'node tests/evidence/ai_policy_validators_regression.mjs';
  if (String(pkg.scripts?.['test:data'] || '').includes(focused)) throw new Error('AI policy regression command already present');
  pkg.scripts['test:data'] = `${pkg.scripts['test:data']} && ${focused}`;
  return JSON.stringify(pkg, null, 2) + '\n';
});

await edit('tests/evidence/ai_policy_validators_regression.mjs', source => replaceOnce(
  source,
  "  assert.equal((providerBlock.match(/signal,/g) || []).length >= 3, true);\n  assert.equal((providerBlock.match(/signal:\\s*signal/g) || []).length >= 3, true);",
  "  assert.equal((providerBlock.match(/async call\\(\\{[^}]*\\bsignal\\b[^}]*\\}\\)/g) || []).length, 3);\n  assert.equal((providerBlock.match(/signal:\\s*signal/g) || []).length, 3);",
  'provider signal assertions',
));

console.log('P1B_AI_POLICY_WIRING_APPLIED');
