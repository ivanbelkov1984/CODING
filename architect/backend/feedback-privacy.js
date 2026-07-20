const POLICY_VERSION = 1;
const MAX_TEXT = 4000;
const RETENTION = 'no-automatic-expiry';
const ACCESS = 'project-owner';
const CONTEXT_KEYS = Object.freeze(['appVersion', 'screen', 'ua', 'lang', 'viewport', 'online', 'ts', 'lastErrors']);

const plainObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const iso = value => {
  const date = new Date(value || Date.now());
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
};

export class FeedbackPrivacyError extends Error {
  constructor(code, publicMessage, status = 400) {
    super(publicMessage);
    this.name = 'FeedbackPrivacyError';
    this.code = code;
    this.publicMessage = publicMessage;
    this.status = status;
  }
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
  const out = {
    message: redactText(error.message ?? error.m ?? 'error', { contacts: true, maxLength: 300 }),
    ts: iso(error.ts),
  };
  const source = redactText(basename(error.source ?? error.filename ?? ''), { contacts: true, maxLength: 80 });
  const line = Math.max(0, Math.min(1_000_000, Number(error.line ?? error.lineno ?? 0) || 0));
  const col = Math.max(0, Math.min(1_000_000, Number(error.col ?? error.colno ?? 0) || 0));
  if (source) out.source = source;
  if (line) out.line = line;
  if (col) out.col = col;
  return out;
}

function sanitizeContext(input = {}, { includeContext = true, includeErrors = false } = {}) {
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

export function sanitizeFeedbackPayload(body = {}) {
  if (!plainObject(body)) throw new FeedbackPrivacyError('invalid_payload', 'Некорректный формат обратной связи');
  if (body.screenshot != null || body.spaceHint != null || body.space_hint != null) {
    throw new FeedbackPrivacyError('unsupported_attachment', 'Вложения и идентификаторы пространства не принимаются');
  }
  const privacy = plainObject(body.privacy) ? body.privacy : {};
  const contextIncluded = privacy.contextIncluded !== false;
  const errorsIncluded = !!privacy.errorsIncluded && contextIncluded;
  const contacts = privacy.redaction !== 'secrets-only';
  const text = redactText(body.text, { contacts, maxLength: MAX_TEXT }).trim();
  if (text.length < 3 || text.length > MAX_TEXT) {
    throw new FeedbackPrivacyError('invalid_text', 'Текст: 3–4000 символов');
  }
  const context = sanitizeContext(body.context, { includeContext: contextIncluded, includeErrors: errorsIncluded });
  return Object.freeze({
    text,
    context,
    privacy: Object.freeze({
      policyVersion: POLICY_VERSION,
      contextIncluded,
      errorsIncluded,
      redaction: contacts ? 'contacts-and-secrets' : 'secrets-only',
      retention: RETENTION,
      access: ACCESS,
    }),
  });
}

export function publicFeedbackError(error) {
  if (error instanceof FeedbackPrivacyError) {
    return { status: error.status, body: { error: error.publicMessage, code: error.code } };
  }
  return { status: 500, body: { error: 'Не удалось обработать обратную связь', code: 'feedback_internal_error' } };
}

export const FEEDBACK_PRIVACY = Object.freeze({
  POLICY_VERSION,
  MAX_TEXT,
  RETENTION,
  ACCESS,
  CONTEXT_KEYS,
  redactSecrets,
  redactContacts,
  redactText,
  sanitizeError,
  sanitizeContext,
  sanitizeFeedbackPayload,
  publicFeedbackError,
});
