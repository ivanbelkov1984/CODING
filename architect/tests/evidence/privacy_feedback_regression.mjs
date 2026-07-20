import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { FEEDBACK_PRIVACY as ServerPrivacy, sanitizeFeedbackPayload, publicFeedbackError } from '../../backend/feedback-privacy.js';

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

const storage = new MemoryStorage();
const source = await readFile(new URL('../../privacy-feedback.js', import.meta.url), 'utf8');
const context = { console, localStorage: storage };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'privacy-feedback.js' });
const P = context.ARCH_FEEDBACK_PRIVACY;
const json = value => JSON.parse(JSON.stringify(value));
let passed = 0;

async function test(name, fn) {
  try {
    storage.clear();
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    throw error;
  }
}

function expectError(fn, code) {
  let found = null;
  try { fn(); } catch (error) { found = error; }
  assert.ok(found, `expected ${code}`);
  if (code) assert.equal(found.code, code);
  return found;
}

console.log('Privacy-safe feedback regression');

await test('client privacy API is frozen, versioned and explicit about retention/access', () => {
  assert.equal(P.POLICY_VERSION, 1);
  assert.equal(Object.isFrozen(P), true);
  assert.equal(P.RETENTION, 'no-automatic-expiry');
  assert.equal(P.ACCESS, 'project-owner');
});

await test('contact masking replaces email and phone when enabled', () => {
  const redacted = P.redactText('Пиши test@example.com или +36 30 123 4567', { contacts: true });
  assert.equal(redacted.includes('test@example.com'), false);
  assert.equal(redacted.includes('+36 30 123 4567'), false);
  assert.match(redacted, /\[email\]/);
  assert.match(redacted, /\[phone\]/);
});

await test('contact masking may be disabled while secrets remain redacted', () => {
  const text = P.redactText('test@example.com sk-ant-abcdefghijklmnop123456', { contacts: false });
  assert.match(text, /test@example\.com/);
  assert.equal(text.includes('sk-ant-'), false);
  assert.match(text, /\[secret\]/);
});

await test('API keys, bearer tokens, UUIDs and secret query values are always redacted', () => {
  const input = 'sk-proj-abcdefghijklmnop Bearer abcdefghijklmnopqrst 123e4567-e89b-12d3-a456-426614174000 https://x.test?a=1&token=secret-value';
  const output = P.redactSecrets(input);
  assert.equal(output.includes('sk-proj-'), false);
  assert.equal(output.includes('abcdefghijklmnopqrst'), false);
  assert.equal(output.includes('123e4567-e89b-12d3-a456-426614174000'), false);
  assert.equal(output.includes('secret-value'), false);
});

await test('error sanitizer removes stack, paths and URL query while keeping bounded diagnostics', () => {
  const error = P.sanitizeError({
    message: 'Failed for user@example.com with sk-ant-abcdefghijklmnop123456',
    filename: 'https://example.test/private/path/app.js?token=secret',
    lineno: 42,
    colno: 7,
    stack: 'private diary text',
    ts: '2026-07-20T00:00:00Z',
  });
  assert.deepEqual(json(error), {
    message: 'Failed for [email] with [secret]', source: 'app.js', line: 42, col: 7, ts: '2026-07-20T00:00:00.000Z',
  });
  assert.equal('stack' in error, false);
});

await test('local error buffer is bounded to ten redacted records', () => {
  for (let i = 0; i < 14; i++) P.pushError(storage, { message: `error ${i} user${i}@example.com`, ts: `2026-07-${String(i + 1).padStart(2, '0')}T00:00:00Z` });
  const errors = P.getErrors(storage);
  assert.equal(errors.length, 10);
  assert.match(errors[0].message, /error 4 \[email\]/);
  assert.match(errors.at(-1).message, /error 13 \[email\]/);
});

await test('user can clear local diagnostics immediately', () => {
  P.pushError(storage, { message: 'synthetic' });
  assert.equal(P.getErrors(storage).length, 1);
  P.clearErrors(storage);
  assert.equal(P.getErrors(storage).length, 0);
});

const rawContext = {
  appVersion: 'arch-v123', screen: 'ov-feedback', ua: 'Synthetic Browser user@example.com', lang: 'ru-RU',
  viewport: '390x844', online: true, ts: '2026-07-20T00:00:00Z',
  lastErrors: [{ message: 'boom +36 30 123 4567', filename: '/private/app.js', lineno: 9 }],
  db: { forbidden: true }, random: 'drop',
};

await test('context opt-in uses an explicit allowlist and excludes errors unless separately enabled', () => {
  const result = P.sanitizeContext(rawContext, { includeContext: true, includeErrors: false });
  assert.deepEqual(Object.keys(result).sort(), ['appVersion', 'lang', 'online', 'screen', 'ts', 'ua', 'viewport'].sort());
  assert.equal('db' in result, false);
  assert.equal('random' in result, false);
  assert.equal('lastErrors' in result, false);
  assert.match(result.ua, /\[email\]/);
});

await test('context opt-out sends only a timestamp', () => {
  const result = P.sanitizeContext(rawContext, { includeContext: false, includeErrors: true });
  assert.deepEqual(Object.keys(result), ['ts']);
});

await test('error attachment requires its own opt-in and is redacted', () => {
  const result = P.sanitizeContext(rawContext, { includeContext: true, includeErrors: true });
  assert.equal(result.lastErrors.length, 1);
  assert.equal(result.lastErrors[0].message.includes('+36'), false);
  assert.equal(result.lastErrors[0].source, 'app.js');
});

await test('prepared payload discloses privacy choices and never includes diary data', () => {
  const payload = P.preparePayload({
    text: 'Проблема у test@example.com', rawContext, includeContext: true, includeErrors: true, redactContacts: true,
  });
  assert.equal(payload.text, 'Проблема у [email]');
  assert.deepEqual(json(payload.privacy), {
    policyVersion: 1, contextIncluded: true, errorsIncluded: true, redaction: 'contacts-and-secrets',
    retention: 'no-automatic-expiry', access: 'project-owner',
  });
  const serialized = JSON.stringify(payload);
  assert.equal(/"(?:db|cfg|insights|checkins|spaceKey|apiKey)"/.test(serialized), false);
});

await test('forbidden diary/config keys fail closed even when nested', () => {
  expectError(() => P.assertNoForbiddenKeys({ context: { insights: [{ body: 'private' }] } }), 'forbidden_feedback_field');
  expectError(() => P.assertNoForbiddenKeys({ privacy: { apiKey: 'x' } }), 'forbidden_feedback_field');
});

await test('outbox is bounded, inspectable and clearable', () => {
  for (let i = 0; i < 13; i++) P.enqueueOutbox(storage, { text: `feedback ${i}`, context: { ts: new Date(2026, 0, i + 1).toISOString() } });
  assert.equal(P.getOutbox(storage).length, 10);
  assert.equal(P.getOutbox(storage)[0].text, 'feedback 3');
  P.clearOutbox(storage);
  assert.equal(P.getOutbox(storage).length, 0);
});

await test('sent IDs are deduplicated and capped', () => {
  for (let i = 1; i <= 24; i++) P.addSentId(storage, i);
  P.addSentId(storage, 24);
  const ids = P.getSentIds(storage);
  assert.equal(ids.length, 20);
  assert.equal(ids[0], 5);
  assert.equal(ids.at(-1), 24);
});

await test('server repeats minimization and strips unknown context fields', () => {
  const result = sanitizeFeedbackPayload({
    text: 'Synthetic bug', context: { ...rawContext, unknown: 'remove' },
    privacy: { contextIncluded: true, errorsIncluded: false, redaction: 'contacts-and-secrets' },
  });
  assert.equal(result.text, 'Synthetic bug');
  assert.equal('unknown' in result.context, false);
  assert.equal('db' in result.context, false);
  assert.equal('lastErrors' in result.context, false);
  assert.equal(result.privacy.retention, ServerPrivacy.RETENTION);
});

await test('server always redacts secrets and follows explicit contact-masking choice', () => {
  const contactsOn = sanitizeFeedbackPayload({ text: 'test@example.com sk-ant-abcdefghijklmnop123456', privacy: { redaction: 'contacts-and-secrets' } });
  assert.equal(contactsOn.text, '[email] [secret]');
  const contactsOff = sanitizeFeedbackPayload({ text: 'test@example.com sk-ant-abcdefghijklmnop123456', privacy: { redaction: 'secrets-only' } });
  assert.equal(contactsOff.text, 'test@example.com [secret]');
});

await test('server rejects screenshots and space identifiers in this contract', () => {
  assert.equal(expectError(() => sanitizeFeedbackPayload({ text: 'valid text', screenshot: 'data:image/jpeg;base64,x' }), 'unsupported_attachment').status, 400);
  expectError(() => sanitizeFeedbackPayload({ text: 'valid text', spaceHint: '123e4567-e89b-12d3-a456-426614174000' }), 'unsupported_attachment');
});

await test('server returns generic internal failures without leaking exception text', () => {
  const result = publicFeedbackError(new Error('DATABASE_URL with private detail'));
  assert.equal(result.status, 500);
  assert.deepEqual(result.body, { error: 'Не удалось обработать обратную связь', code: 'feedback_internal_error' });
  assert.equal(JSON.stringify(result).includes('DATABASE_URL'), false);
});

const appSource = await readFile(new URL('../../app.js', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
const buildSource = await readFile(new URL('../../build.mjs', import.meta.url), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
const backendSource = await readFile(new URL('../../backend/feedback.js', import.meta.url), 'utf8');

await test('privacy module loads before app and is inlined by deterministic build', () => {
  const tag = '<script src="privacy-feedback.js"></script>';
  assert.ok(indexSource.indexOf(tag) >= 0 && indexSource.indexOf(tag) < indexSource.indexOf('<script src="app.js"></script>'));
  assert.match(buildSource, /readFile\(join\(DIR, 'privacy-feedback\.js'\)/);
  assert.match(buildSource, /src="privacy-feedback\\.js"/);
});

await test('runtime feedback flow uses the privacy adapter and separate context/error choices', () => {
  assert.match(appSource, /globalThis\.ARCH_FEEDBACK_PRIVACY/);
  assert.match(appSource, /function openFeedback\s*\(/);
  assert.match(appSource, /privacy\.preparePayload/);
  assert.match(appSource, /fb-errors/);
  assert.match(appSource, /clearFeedbackDiagnostics/);
  assert.match(appSource, /clearFeedbackOutbox/);
});

await test('portable export source remains limited to DB and safe CFG, excluding feedback local keys', () => {
  const start = appSource.indexOf('function exportData');
  const end = appSource.indexOf('\n}', start) + 2;
  const block = appSource.slice(start, end);
  assert.match(block, /db:\s*DB/);
  assert.match(block, /cfg:\s*exportSafeCfg\(CFG\)/);
  assert.equal(/arch5_fb_|arch5_errbuf|ARCH_FEEDBACK_PRIVACY/.test(block), false);
});

await test('UI explains consent, no automatic deletion, owner access and no diary attachment', () => {
  assert.match(indexSource, /id="fb-redact"[^>]*checked/);
  assert.match(indexSource, /id="fb-ctx"[^>]*checked/);
  assert.match(indexSource, /id="fb-errors"/);
  assert.match(indexSource, /дневник[^<]{0,120}не прикреп/i);
  assert.match(indexSource, /без автоматического удаления/i);
  assert.match(indexSource, /доступ[^<]{0,100}владелец/i);
  assert.match(indexSource, /clearFeedbackDiagnostics/);
  assert.match(indexSource, /clearFeedbackOutbox/);
});

await test('backend uses the strict sanitizer, feedback limiter and public errors', () => {
  assert.match(backendSource, /sanitizeFeedbackPayload/);
  assert.match(backendSource, /feedbackWriteLimit/);
  assert.match(backendSource, /max:\s*5/);
  assert.match(backendSource, /publicFeedbackError/);
  assert.match(backendSource, /screenshot, context, space_hint/);
});

await test('focused privacy regression is part of ordinary data CI', () => {
  assert.match(packageJson.scripts['test:data'], /privacy_feedback_regression\.mjs/);
});

console.log(`PRIVACY_FEEDBACK_TESTS=${passed}`);
console.log('PHASE_1_PRIVACY_FEEDBACK_REGRESSION_PASS');
