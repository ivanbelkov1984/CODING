'use strict';

(function initFeedbackPrivacy(root) {
  const POLICY_VERSION = 1;
  const ERRBUF_KEY = 'arch5_errbuf';
  const OUTBOX_KEY = 'arch5_fb_outbox';
  const SENT_KEY = 'arch5_fb_sent';
  const MAX_ERRORS = 10;
  const MAX_OUTBOX = 10;
  const MAX_SENT = 20;
  const MAX_TEXT = 4000;
  const RETENTION = 'no-automatic-expiry';
  const ACCESS = 'project-owner';
  const REDACTION_ON = 'contacts-and-secrets';
  const REDACTION_SECRETS = 'secrets-only';
  const CONTEXT_KEYS = Object.freeze(['appVersion', 'screen', 'ua', 'lang', 'viewport', 'online', 'ts', 'lastErrors']);
  const FORBIDDEN_KEYS = Object.freeze([
    'db', 'cfg', 'insights', 'checkins', 'dreams', 'patterns', 'spiritual', 'chats',
    'cravings', 'spaceKey', 'apiKey', 'aiKey', 'passphrase', 'recoveryKey', 'password',
  ]);

  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const plainObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const iso = value => {
    const d = new Date(value || Date.now());
    return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
  };
  const cleanStorage = storage => storage || root.localStorage || null;

  function readArray(storage, key) {
    try {
      const value = JSON.parse(cleanStorage(storage)?.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (_) { return []; }
  }

  function writeArray(storage, key, value) {
    try { cleanStorage(storage)?.setItem(key, JSON.stringify(value)); } catch (_) {}
    return value;
  }

  function redactSecrets(value) {
    let text = String(value == null ? '' : value);
    text = text.replace(/\bsk-(?:ant|proj|live)-[A-Za-z0-9_-]{8,}\b/g, '[secret]');
    text = text.replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, '[secret]');
    text = text.replace(/\bBearer\s+[A-Za-z0-9._~+\/-]{12,}\b/gi, 'Bearer [secret]');
    text = text.replace(/([?&#](?:key|token|api[_-]?key|access[_-]?token|space[_-]?key)=)[^&#\s]+/gi, '$1[secret]');
    text = text.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[identifier]');
    return text;
  }

  function redactContacts(value) {
    let text = String(value == null ? '' : value);
    text = text.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]');
    text = text.replace(/(?<!\w)(?:\+?\d[\d\s().-]{7,}\d)(?!\w)/g, '[phone]');
    return text;
  }

  function redactText(value, { contacts = true, maxLength = MAX_TEXT } = {}) {
    let text = redactSecrets(value);
    if (contacts) text = redactContacts(text);
    return text.slice(0, maxLength);
  }

  function basename(value) {
    const withoutQuery = String(value || '').split(/[?#]/)[0];
    return withoutQuery.split(/[\\/]/).filter(Boolean).pop() || '';
  }

  function sanitizeError(input = {}) {
    const error = plainObject(input) ? input : { message: input };
    const message = redactText(error.message ?? error.m ?? 'error', { contacts: true, maxLength: 300 });
    const source = redactText(basename(error.source ?? error.filename ?? ''), { contacts: true, maxLength: 80 });
    const line = Math.max(0, Math.min(1_000_000, Number(error.line ?? error.lineno ?? 0) || 0));
    const col = Math.max(0, Math.min(1_000_000, Number(error.col ?? error.colno ?? 0) || 0));
    const out = { message, ts: iso(error.ts) };
    if (source) out.source = source;
    if (line) out.line = line;
    if (col) out.col = col;
    return out;
  }

  function getErrors(storage) {
    return readArray(storage, ERRBUF_KEY).map(sanitizeError).slice(-MAX_ERRORS);
  }

  function pushError(storage, input) {
    const items = getErrors(storage);
    items.push(sanitizeError(input));
    return writeArray(storage, ERRBUF_KEY, items.slice(-MAX_ERRORS));
  }

  function clearErrors(storage) {
    try { cleanStorage(storage)?.removeItem(ERRBUF_KEY); } catch (_) {}
    return [];
  }

  function getOutbox(storage) {
    return readArray(storage, OUTBOX_KEY).filter(plainObject).slice(-MAX_OUTBOX);
  }

  function setOutbox(storage, items) {
    const safe = Array.isArray(items) ? items.filter(plainObject).slice(-MAX_OUTBOX) : [];
    return writeArray(storage, OUTBOX_KEY, safe);
  }

  function enqueueOutbox(storage, payload) {
    const items = getOutbox(storage);
    items.push(payload);
    return setOutbox(storage, items);
  }

  function clearOutbox(storage) {
    try { cleanStorage(storage)?.removeItem(OUTBOX_KEY); } catch (_) {}
    return [];
  }

  function getSentIds(storage) {
    return readArray(storage, SENT_KEY)
      .map(value => Number(value))
      .filter(value => Number.isInteger(value) && value > 0)
      .filter((value, index, array) => array.indexOf(value) === index)
      .slice(-MAX_SENT);
  }

  function setSentIds(storage, ids) {
    const safe = (Array.isArray(ids) ? ids : [])
      .map(value => Number(value))
      .filter(value => Number.isInteger(value) && value > 0)
      .filter((value, index, array) => array.indexOf(value) === index)
      .slice(-MAX_SENT);
    return writeArray(storage, SENT_KEY, safe);
  }

  function addSentId(storage, id) {
    return setSentIds(storage, [...getSentIds(storage), id]);
  }

  function sanitizeContext(input, { includeContext = true, includeErrors = false } = {}) {
    const source = plainObject(input) ? input : {};
    const out = { ts: iso(source.ts) };
    if (!includeContext) return out;
    if (source.appVersion) out.appVersion = redactText(source.appVersion, { contacts: false, maxLength: 80 });
    if (source.screen) out.screen = redactText(source.screen, { contacts: false, maxLength: 80 });
    if (source.ua) out.ua = redactText(source.ua, { contacts: true, maxLength: 200 });
    if (source.lang) out.lang = redactText(source.lang, { contacts: false, maxLength: 32 });
    if (source.viewport) out.viewport = redactText(source.viewport, { contacts: false, maxLength: 32 });
    if (typeof source.online === 'boolean') out.online = source.online;
    if (includeErrors && Array.isArray(source.lastErrors)) out.lastErrors = source.lastErrors.slice(-3).map(sanitizeError);
    return out;
  }

  function assertNoForbiddenKeys(value, path = '$') {
    if (Array.isArray(value)) {
      value.forEach((item, index) => assertNoForbiddenKeys(item, `${path}[${index}]`));
      return true;
    }
    if (!plainObject(value)) return true;
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.some(forbidden => forbidden.toLowerCase() === key.toLowerCase())) {
        const error = new Error(`Feedback payload contains forbidden key at ${path}.${key}`);
        error.code = 'forbidden_feedback_field';
        throw error;
      }
      assertNoForbiddenKeys(item, `${path}.${key}`);
    }
    return true;
  }

  function preparePayload({ text, rawContext = {}, includeContext = true, includeErrors = false, redactContacts: shouldRedactContacts = true } = {}) {
    const cleanText = redactText(text, { contacts: shouldRedactContacts, maxLength: MAX_TEXT }).trim();
    if (cleanText.length < 3) {
      const error = new Error('Feedback text must be 3–4000 characters after redaction');
      error.code = 'invalid_feedback_text';
      throw error;
    }
    const context = sanitizeContext(rawContext, { includeContext, includeErrors });
    const payload = {
      text: cleanText,
      context,
      privacy: {
        policyVersion: POLICY_VERSION,
        contextIncluded: !!includeContext,
        errorsIncluded: !!(includeContext && includeErrors),
        redaction: shouldRedactContacts ? REDACTION_ON : REDACTION_SECRETS,
        retention: RETENTION,
        access: ACCESS,
      },
    };
    assertNoForbiddenKeys(payload);
    return payload;
  }

  function localState(storage) {
    return Object.freeze({
      errors: getErrors(storage).length,
      queued: getOutbox(storage).length,
      sent: getSentIds(storage).length,
    });
  }

  const api = Object.freeze({
    POLICY_VERSION,
    ERRBUF_KEY,
    OUTBOX_KEY,
    SENT_KEY,
    MAX_ERRORS,
    MAX_OUTBOX,
    MAX_SENT,
    MAX_TEXT,
    RETENTION,
    ACCESS,
    CONTEXT_KEYS,
    FORBIDDEN_KEYS,
    redactSecrets,
    redactContacts,
    redactText,
    sanitizeError,
    sanitizeContext,
    assertNoForbiddenKeys,
    preparePayload,
    getErrors,
    pushError,
    clearErrors,
    getOutbox,
    setOutbox,
    enqueueOutbox,
    clearOutbox,
    getSentIds,
    setSentIds,
    addSentId,
    localState,
  });

  Object.defineProperty(root, 'ARCH_FEEDBACK_PRIVACY', {
    value: api,
    configurable: false,
    enumerable: true,
    writable: false,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
