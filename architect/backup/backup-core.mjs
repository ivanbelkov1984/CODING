// ─────────────────────────────────────────────────────────────────────────
//  backup-core.mjs — pure / browser-neutral core зашифрованного backup.
//
//  Slice 1: versioned envelope+payload schema, exact allowed keys, documented
//  limits, strict base64, byte helpers, SHA-256 canonical bytes, PBKDF2-SHA-256
//  (ровно 600 000 iter) + AES-GCM-256, encrypt/decrypt, fail-closed validation.
//
//  Только browser Web Crypto (globalThis.crypto.subtle / getRandomValues).
//  НЕ импортирует Node 'crypto' — тот же модуль работает в браузере и в Node 20+.
//  Никаких localStorage / IndexedDB / DOM / app.js — это чистое ядро.
// ─────────────────────────────────────────────────────────────────────────

'use strict';

const subtle = globalThis.crypto && globalThis.crypto.subtle;
if (!subtle) {
  // Fail-closed: без Web Crypto модуль неработоспособен, тихо деградировать нельзя.
  throw new Error('backup-core: Web Crypto (crypto.subtle) недоступен');
}

// ── Ошибки: типизированный fail-closed, сообщения без секретов ──────────────
export class BackupError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'BackupError';
    this.code = code;
  }
}
const fail = (code, msg) => { throw new BackupError(code, msg); };

// ── Версии и криптопараметры (schema v1 — строго фиксированы) ───────────────
export const SCHEMA = Object.freeze({
  FORMAT: 'arch-backup',
  ENVELOPE_VERSION: 1,
  PAYLOAD_VERSION: 1,
  APP: 'architect',
  KDF: Object.freeze({ name: 'PBKDF2', hash: 'SHA-256', iterations: 600000 }),
  CIPHER: Object.freeze({ name: 'AES-GCM', length: 256 }),
  SALT_BYTES: 16,
  IV_BYTES: 12,
  MODES: Object.freeze(['data-only', 'complete']),
});

// ── Documented limits (проверяются ДО чрезмерного allocation) ───────────────
export const LIMITS = Object.freeze({
  maxFileBytes:        128 * 1024 * 1024, // preflight размера файла до .text()
  minPasswordLength:   1,
  maxPasswordLength:   1024,
  maxCiphertextBytes:  160 * 1024 * 1024, // decoded ciphertext
  maxPlaintextBytes:   128 * 1024 * 1024, // decoded JSON payload
  maxCollections:      64,
  maxObjects:          200000,            // суммарно по всем коллекциям DB
  maxMediaCount:       5000,
  maxPerMediaBytes:    25 * 1024 * 1024,
  maxTotalMediaBytes:  512 * 1024 * 1024,
  maxMediaIdLength:    128,
  mediaIdPattern:      /^[A-Za-z0-9_-]{1,128}$/,
  maxMimeLength:       255,
  mimePattern:         /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,126}\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,126}(;[ -~]{1,180})?$/,
});

// ── UTF-8 helpers ───────────────────────────────────────────────────────────
const _te = new TextEncoder();
const _td = new TextDecoder('utf-8', { fatal: true });
export function utf8Encode(str) {
  if (typeof str !== 'string') fail('UTF8_INPUT', 'utf8Encode: ожидалась строка');
  return _te.encode(str);
}
export function utf8Decode(bytes) {
  if (!(bytes instanceof Uint8Array)) fail('UTF8_INPUT', 'utf8Decode: ожидался Uint8Array');
  try { return _td.decode(bytes); } catch (e) { fail('UTF8_DECODE', 'невалидный UTF-8'); }
}

// ── Строгий base64 (без atob/Buffer — предсказуемо и в браузере, и в Node) ───
const _B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const _B64_LOOKUP = (() => { const t = new Int16Array(256).fill(-1); for (let i = 0; i < _B64.length; i++) t[_B64.charCodeAt(i)] = i; return t; })();
const _B64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

export function bytesToBase64(bytes) {
  if (!(bytes instanceof Uint8Array)) fail('B64_INPUT', 'bytesToBase64: ожидался Uint8Array');
  let out = '';
  const n = bytes.length;
  for (let i = 0; i < n; i += 3) {
    const b0 = bytes[i], b1 = i + 1 < n ? bytes[i + 1] : 0, b2 = i + 2 < n ? bytes[i + 2] : 0;
    out += _B64[b0 >> 2];
    out += _B64[((b0 & 3) << 4) | (b1 >> 4)];
    out += (i + 1 < n) ? _B64[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += (i + 2 < n) ? _B64[b2 & 63] : '=';
  }
  return out;
}

// Строго: только канонический алфавит, длина кратна 4, паддинг только в конце,
// decoded-size проверяется ДО выделения буфера. expectedLen — точная длина.
export function base64ToBytes(str, opts = {}) {
  if (typeof str !== 'string') fail('B64_INPUT', 'base64ToBytes: ожидалась строка');
  if (!_B64_RE.test(str)) fail('B64_MALFORMED', 'недопустимые символы base64');
  if (str.length % 4 !== 0) fail('B64_MALFORMED', 'длина base64 не кратна 4');
  let pad = 0;
  if (str.length >= 1 && str[str.length - 1] === '=') pad++;
  if (str.length >= 2 && str[str.length - 2] === '=') pad++;
  // '=' не может стоять раньше двух последних позиций (гарантируется _B64_RE).
  const decodedLen = str.length === 0 ? 0 : (str.length / 4) * 3 - pad;
  const maxDecoded = opts.maxDecoded;
  if (typeof maxDecoded === 'number' && decodedLen > maxDecoded) fail('B64_TOO_LARGE', 'base64 превышает допустимый размер');
  if (typeof opts.expectedLen === 'number' && decodedLen !== opts.expectedLen) fail('B64_LENGTH', 'неверная длина декодированных байт');
  const out = new Uint8Array(decodedLen);
  let o = 0;
  for (let i = 0; i < str.length; i += 4) {
    const c0 = _B64_LOOKUP[str.charCodeAt(i)];
    const c1 = _B64_LOOKUP[str.charCodeAt(i + 1)];
    const p2 = str[i + 2] === '=', p3 = str[i + 3] === '=';
    const c2 = p2 ? 0 : _B64_LOOKUP[str.charCodeAt(i + 2)];
    const c3 = p3 ? 0 : _B64_LOOKUP[str.charCodeAt(i + 3)];
    if (c0 < 0 || c1 < 0 || (!p2 && c2 < 0) || (!p3 && c3 < 0)) fail('B64_MALFORMED', 'недопустимый символ base64');
    out[o++] = (c0 << 2) | (c1 >> 4);
    if (!p2) out[o++] = ((c1 & 15) << 4) | (c2 >> 2);
    if (!p3) out[o++] = ((c2 & 3) << 6) | c3;
  }
  return out;
}

// ── SHA-256 canonical bytes ─────────────────────────────────────────────────
export async function sha256Hex(bytes) {
  if (!(bytes instanceof Uint8Array)) fail('SHA_INPUT', 'sha256Hex: ожидался Uint8Array');
  const digest = new Uint8Array(await subtle.digest('SHA-256', bytes));
  let hex = '';
  for (let i = 0; i < digest.length; i++) hex += digest[i].toString(16).padStart(2, '0');
  return hex;
}

// Канонические байты media-записи: data URL (реальный формат приложения) →
// { mime, bytes }. MIME может содержать параметры (напр. audio/webm;codecs=opus).
export function canonicalMediaBytes(dataUrl) {
  if (typeof dataUrl !== 'string') fail('MEDIA_INPUT', 'canonicalMediaBytes: ожидалась строка');
  const m = /^data:([^,]*?);base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl);
  if (!m) fail('MEDIA_DATAURL', 'ожидался base64 data URL');
  const mime = m[1];
  if (!mime || mime.length > LIMITS.maxMimeLength || !LIMITS.mimePattern.test(mime)) fail('MEDIA_MIME', 'недопустимый MIME');
  const bytes = base64ToBytes(m[2], { maxDecoded: LIMITS.maxPerMediaBytes });
  return { mime, bytes };
}

// ── Проверка точного набора ключей (fail-closed на неизвестные поля) ─────────
function exactKeys(obj, allowed, where) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) fail('SHAPE', where + ': ожидался объект');
  const keys = Object.keys(obj);
  const set = new Set(allowed);
  for (const k of keys) if (!set.has(k)) fail('UNEXPECTED_FIELD', where + ': неожиданное поле "' + k + '"');
  for (const k of allowed) if (!Object.prototype.hasOwnProperty.call(obj, k)) fail('MISSING_FIELD', where + ': отсутствует поле "' + k + '"');
}

// ── Валидация envelope (fail-closed) ────────────────────────────────────────
const ENVELOPE_KEYS = ['format', 'envelopeVersion', 'kdf', 'cipher', 'ciphertext'];
const KDF_KEYS = ['name', 'hash', 'iterations', 'salt'];
const CIPHER_KEYS = ['name', 'length', 'iv'];

export function validateEnvelope(env) {
  exactKeys(env, ENVELOPE_KEYS, 'envelope');
  if (env.format !== SCHEMA.FORMAT) fail('BAD_FORMAT', 'неизвестный формат файла');
  if (env.envelopeVersion !== SCHEMA.ENVELOPE_VERSION) fail('BAD_VERSION', 'неподдерживаемая версия envelope');
  exactKeys(env.kdf, KDF_KEYS, 'envelope.kdf');
  if (env.kdf.name !== SCHEMA.KDF.name) fail('BAD_KDF', 'неподдерживаемый KDF');
  if (env.kdf.hash !== SCHEMA.KDF.hash) fail('BAD_KDF', 'неподдерживаемый KDF hash');
  if (env.kdf.iterations !== SCHEMA.KDF.iterations) fail('BAD_KDF_ITER', 'неверное число итераций KDF');
  if (typeof env.kdf.salt !== 'string') fail('BAD_SALT', 'salt должен быть строкой');
  exactKeys(env.cipher, CIPHER_KEYS, 'envelope.cipher');
  if (env.cipher.name !== SCHEMA.CIPHER.name) fail('BAD_CIPHER', 'неподдерживаемый шифр');
  if (env.cipher.length !== SCHEMA.CIPHER.length) fail('BAD_CIPHER', 'неподдерживаемая длина ключа');
  if (typeof env.cipher.iv !== 'string') fail('BAD_IV', 'iv должен быть строкой');
  if (typeof env.ciphertext !== 'string') fail('BAD_CIPHERTEXT', 'ciphertext должен быть строкой');
  return env;
}

// ── Валидация payload (fail-closed) ─────────────────────────────────────────
const PAYLOAD_KEYS = ['payloadVersion', 'app', 'mode', 'createdAt', 'profileName', 'db', 'cfg', 'media'];
const MEDIA_ITEM_KEYS = ['id', 'mime', 'sha256', 'bytes'];

export function validatePayload(p) {
  exactKeys(p, PAYLOAD_KEYS, 'payload');
  if (p.payloadVersion !== SCHEMA.PAYLOAD_VERSION) fail('BAD_PAYLOAD_VERSION', 'неподдерживаемая версия payload');
  if (p.app !== SCHEMA.APP) fail('BAD_APP', 'чужой формат приложения');
  if (!SCHEMA.MODES.includes(p.mode)) fail('BAD_MODE', 'неизвестный режим backup');
  if (typeof p.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(p.createdAt)) fail('BAD_CREATEDAT', 'некорректная дата');
  if (typeof p.profileName !== 'string' || p.profileName.length > 200) fail('BAD_PROFILENAME', 'некорректное имя профиля');
  if (p.db === null || typeof p.db !== 'object' || Array.isArray(p.db)) fail('BAD_DB', 'db должен быть объектом');
  if (p.cfg === null || typeof p.cfg !== 'object' || Array.isArray(p.cfg)) fail('BAD_CFG', 'cfg должен быть объектом');

  const collections = Object.keys(p.db);
  if (collections.length > LIMITS.maxCollections) fail('TOO_MANY_COLLECTIONS', 'слишком много коллекций');
  let objectCount = 0;
  for (const c of collections) {
    const arr = p.db[c];
    if (!Array.isArray(arr)) fail('BAD_COLLECTION', 'коллекция "' + c + '" не массив');
    objectCount += arr.length;
    if (objectCount > LIMITS.maxObjects) fail('TOO_MANY_OBJECTS', 'слишком много объектов');
  }

  if (!Array.isArray(p.media)) fail('BAD_MEDIA', 'media должен быть массивом');
  if (p.mode === 'data-only' && p.media.length !== 0) fail('DATAONLY_MEDIA', 'data-only не может нести media');
  if (p.media.length > LIMITS.maxMediaCount) fail('TOO_MANY_MEDIA', 'слишком много media');
  let totalMedia = 0;
  const seenIds = new Set();
  for (const item of p.media) {
    exactKeys(item, MEDIA_ITEM_KEYS, 'media[]');
    if (typeof item.id !== 'string' || item.id.length > LIMITS.maxMediaIdLength || !LIMITS.mediaIdPattern.test(item.id)) fail('BAD_MEDIA_ID', 'некорректный media id');
    if (seenIds.has(item.id)) fail('DUPLICATE_MEDIA_ID', 'дубликат media id');
    seenIds.add(item.id);
    if (typeof item.mime !== 'string' || item.mime.length > LIMITS.maxMimeLength || !LIMITS.mimePattern.test(item.mime)) fail('BAD_MEDIA_MIME', 'некорректный MIME');
    if (typeof item.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(item.sha256)) fail('BAD_MEDIA_SHA', 'некорректный sha256');
    if (typeof item.bytes !== 'string') fail('BAD_MEDIA_BYTES', 'bytes должен быть строкой base64');
    // Размер считаем по base64-форме без полного декодирования (fail-closed до allocation).
    const approxBytes = (item.bytes.length / 4) * 3;
    if (approxBytes > LIMITS.maxPerMediaBytes) fail('MEDIA_TOO_LARGE', 'media превышает лимит');
    totalMedia += approxBytes;
    if (totalMedia > LIMITS.maxTotalMediaBytes) fail('MEDIA_TOTAL_TOO_LARGE', 'суммарный размер media превышает лимит');
  }
  return p;
}

// Полная проверка целостности media (sha256 по канонич. байтам) — для restore.
export async function verifyMediaHashes(media) {
  for (const item of media) {
    const bytes = base64ToBytes(item.bytes, { maxDecoded: LIMITS.maxPerMediaBytes });
    const hex = await sha256Hex(bytes);
    if (hex !== item.sha256) fail('MEDIA_HASH_MISMATCH', 'sha256 media не совпадает');
  }
  return true;
}

// ── Ключ: PBKDF2-SHA-256 (ровно 600 000) → AES-GCM-256 ──────────────────────
function checkPassword(password) {
  if (typeof password !== 'string') fail('BAD_PASSWORD', 'пароль должен быть строкой');
  if (password.length < LIMITS.minPasswordLength) fail('PASSWORD_SHORT', 'пароль слишком короткий');
  if (password.length > LIMITS.maxPasswordLength) fail('PASSWORD_LONG', 'пароль слишком длинный');
}
async function deriveKey(password, saltBytes) {
  const baseKey = await subtle.importKey('raw', utf8Encode(password), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: SCHEMA.KDF.name, salt: saltBytes, iterations: SCHEMA.KDF.iterations, hash: SCHEMA.KDF.hash },
    baseKey,
    { name: SCHEMA.CIPHER.name, length: SCHEMA.CIPHER.length },
    false,
    ['encrypt', 'decrypt'],
  );
}
function randomBytes(n) { return globalThis.crypto.getRandomValues(new Uint8Array(n)); }

// ── Encrypt: payload object → envelope object ───────────────────────────────
export async function encryptPayload(payload, password) {
  checkPassword(password);
  validatePayload(payload);                       // fail-closed до шифрования
  const plaintext = utf8Encode(JSON.stringify(payload));
  if (plaintext.length > LIMITS.maxPlaintextBytes) fail('PLAINTEXT_TOO_LARGE', 'payload превышает лимит');
  const salt = randomBytes(SCHEMA.SALT_BYTES);
  const iv = randomBytes(SCHEMA.IV_BYTES);
  const key = await deriveKey(password, salt);
  const ct = new Uint8Array(await subtle.encrypt({ name: SCHEMA.CIPHER.name, iv }, key, plaintext));
  if (ct.length > LIMITS.maxCiphertextBytes) fail('CIPHERTEXT_TOO_LARGE', 'ciphertext превышает лимит');
  const env = {
    format: SCHEMA.FORMAT,
    envelopeVersion: SCHEMA.ENVELOPE_VERSION,
    kdf: { name: SCHEMA.KDF.name, hash: SCHEMA.KDF.hash, iterations: SCHEMA.KDF.iterations, salt: bytesToBase64(salt) },
    cipher: { name: SCHEMA.CIPHER.name, length: SCHEMA.CIPHER.length, iv: bytesToBase64(iv) },
    ciphertext: bytesToBase64(ct),
  };
  return validateEnvelope(env);
}

// ── Decrypt: envelope object → payload object (fail-closed на каждом шаге) ───
export async function decryptEnvelope(env, password) {
  checkPassword(password);
  validateEnvelope(env);
  const salt = base64ToBytes(env.kdf.salt, { expectedLen: SCHEMA.SALT_BYTES });
  const iv = base64ToBytes(env.cipher.iv, { expectedLen: SCHEMA.IV_BYTES });
  const ct = base64ToBytes(env.ciphertext, { maxDecoded: LIMITS.maxCiphertextBytes });
  const key = await deriveKey(password, salt);
  let ptBuf;
  try {
    ptBuf = await subtle.decrypt({ name: SCHEMA.CIPHER.name, iv }, key, ct);
  } catch (e) {
    // Неверный пароль ИЛИ повреждённый authenticated ciphertext — неразличимы (GCM auth).
    fail('DECRYPT_FAILED', 'не удалось расшифровать (неверный пароль или повреждённый файл)');
  }
  const pt = new Uint8Array(ptBuf);
  if (pt.length > LIMITS.maxPlaintextBytes) fail('PLAINTEXT_TOO_LARGE', 'payload превышает лимит');
  let obj;
  try { obj = JSON.parse(utf8Decode(pt)); } catch (e) { fail('BAD_JSON', 'payload не является валидным JSON'); }
  return validatePayload(obj);
}

// ── Сериализация файла ──────────────────────────────────────────────────────
export function serializeEnvelope(env) {
  validateEnvelope(env);
  return JSON.stringify(env);
}
// Preflight размера ДО парсинга (защита от чрезмерного allocation).
export function parseEnvelopeText(text, opts = {}) {
  if (typeof text !== 'string') fail('FILE_INPUT', 'ожидалась строка файла');
  const maxBytes = typeof opts.maxBytes === 'number' ? opts.maxBytes : LIMITS.maxFileBytes;
  if (text.length > maxBytes) fail('FILE_TOO_LARGE', 'файл превышает допустимый размер');
  let obj;
  try { obj = JSON.parse(text); } catch (e) { fail('BAD_FILE_JSON', 'файл не является валидным JSON'); }
  return validateEnvelope(obj);
}
