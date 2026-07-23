// ─────────────────────────────────────────────────────────────────────────
//  backup.test.mjs — focused regression для pure core (Slice 1).
//  Импортирует тот же production-модуль backup-core.mjs (без дублирования логики).
//  Запуск: node tests/backup.test.mjs   (Node 20+, есть globalThis.crypto).
//  Синтетические данные, реальных пользовательских данных нет.
// ─────────────────────────────────────────────────────────────────────────

import {
  SCHEMA, LIMITS, BackupError,
  bytesToBase64, base64ToBytes, utf8Encode,
  sha256Hex, canonicalMediaBytes,
  validateEnvelope, validatePayload,
  encryptPayload, decryptEnvelope, serializeEnvelope, parseEnvelopeText,
} from '../backup/backup-core.mjs';

let pass = 0, fail = 0;
const results = [];
function ok(cond, name) { if (cond) { pass++; results.push('  ✓ ' + name); } else { fail++; results.push('  ✗ ' + name); } }
async function throwsCode(fn, code, name) {
  try { await fn(); ok(false, name + ' (не бросил, ожидался ' + code + ')'); }
  catch (e) {
    if (e instanceof BackupError && e.code === code) ok(true, name);
    else ok(false, name + ' (код ' + (e && e.code) + ' / ' + (e && e.message) + ', ожидался ' + code + ')');
  }
}
const clone = o => JSON.parse(JSON.stringify(o));

// ── Синтетические payload ───────────────────────────────────────────────────
function dataOnlyPayload(profileName = 'Synthetic') {
  return {
    payloadVersion: 1, app: 'architect', mode: 'data-only',
    createdAt: '2026-07-23T00:00:00.000Z', profileName,
    db: { insights: [{ id: 1, title: 'привет', body: 'мир' }], dreams: [] },
    cfg: { userName: 'S', domainLabel: 'Книга' },
    media: [],
  };
}
async function completePayload() {
  // Реальный формат приложения: image = JPEG data URL, audio = webm;codecs=opus.
  const imgUrl = 'data:image/jpeg;base64,' + bytesToBase64(new Uint8Array([255, 216, 255, 224, 0, 16]));
  const audUrl = 'data:audio/webm;codecs=opus;base64,' + bytesToBase64(new Uint8Array([26, 69, 223, 163]));
  const media = [];
  for (const [id, url] of [['m1', imgUrl], ['m2', audUrl]]) {
    const { mime, bytes } = canonicalMediaBytes(url);
    media.push({ id, mime, sha256: await sha256Hex(bytes), bytes: bytesToBase64(bytes) });
  }
  return {
    payloadVersion: 1, app: 'architect', mode: 'complete',
    createdAt: '2026-07-23T00:00:00.000Z', profileName: 'Synthetic',
    db: { insights: [{ id: 1, title: 'x', media: ['m1', 'm2'] }] },
    cfg: { userName: 'S' }, media,
  };
}

async function main() {
  const PW = 'correct horse battery staple';

  // 1. round-trip data-only
  {
    const env = await encryptPayload(dataOnlyPayload(), PW);
    const back = await decryptEnvelope(env, PW);
    ok(JSON.stringify(back) === JSON.stringify(dataOnlyPayload()), 'round-trip data-only совпадает');
  }
  // 2. round-trip complete + media hashes
  {
    const p = await completePayload();
    const env = await encryptPayload(p, PW);
    const back = await decryptEnvelope(env, PW);
    ok(JSON.stringify(back) === JSON.stringify(p), 'round-trip complete (с media) совпадает');
  }
  // 3. exact KDF/cipher параметры в envelope
  {
    const env = await encryptPayload(dataOnlyPayload(), PW);
    ok(env.kdf.name === 'PBKDF2' && env.kdf.hash === 'SHA-256', 'KDF = PBKDF2-SHA-256');
    ok(env.kdf.iterations === 600000, 'ровно 600 000 iterations');
    ok(env.cipher.name === 'AES-GCM' && env.cipher.length === 256, 'шифр = AES-GCM-256');
    ok(base64ToBytes(env.kdf.salt).length === 16, 'salt = 16 байт');
    ok(base64ToBytes(env.cipher.iv).length === 12, 'iv = 12 байт');
    // Разные вызовы — разные salt/iv (не детерминированы).
    const env2 = await encryptPayload(dataOnlyPayload(), PW);
    ok(env.kdf.salt !== env2.kdf.salt && env.cipher.iv !== env2.cipher.iv, 'salt и iv случайны');
  }
  // 4. wrong password
  {
    const env = await encryptPayload(dataOnlyPayload(), PW);
    await throwsCode(() => decryptEnvelope(env, 'wrong password'), 'DECRYPT_FAILED', 'wrong password → DECRYPT_FAILED');
  }
  // 5. corrupted ciphertext (валидный base64, но изменённые байты → GCM auth fail)
  {
    const env = await encryptPayload(dataOnlyPayload(), PW);
    const bad = clone(env);
    const c = bad.ciphertext;
    const i = 5, ch = c[i];
    bad.ciphertext = c.slice(0, i) + (ch === 'A' ? 'B' : 'A') + c.slice(i + 1);
    await throwsCode(() => decryptEnvelope(bad, PW), 'DECRYPT_FAILED', 'corrupted ciphertext → DECRYPT_FAILED');
  }
  // 6. неожиданное поле
  {
    const env = await encryptPayload(dataOnlyPayload(), PW);
    const bad = clone(env); bad.extra = 1;
    await throwsCode(() => decryptEnvelope(bad, PW), 'UNEXPECTED_FIELD', 'неожиданное поле envelope → UNEXPECTED_FIELD');
  }
  // 7. неподдерживаемая версия
  {
    const env = await encryptPayload(dataOnlyPayload(), PW);
    const bad = clone(env); bad.envelopeVersion = 2;
    await throwsCode(() => decryptEnvelope(bad, PW), 'BAD_VERSION', 'чужая версия envelope → BAD_VERSION');
  }
  // 8. неправильный algorithm / KDF
  {
    const env = await encryptPayload(dataOnlyPayload(), PW);
    const b1 = clone(env); b1.cipher.name = 'AES-CBC';
    await throwsCode(() => decryptEnvelope(b1, PW), 'BAD_CIPHER', 'чужой шифр → BAD_CIPHER');
    const b2 = clone(env); b2.kdf.name = 'scrypt';
    await throwsCode(() => decryptEnvelope(b2, PW), 'BAD_KDF', 'чужой KDF → BAD_KDF');
  }
  // 9. неправильное число iterations
  {
    const env = await encryptPayload(dataOnlyPayload(), PW);
    const bad = clone(env); bad.kdf.iterations = 100000;
    await throwsCode(() => decryptEnvelope(bad, PW), 'BAD_KDF_ITER', 'iterations ≠ 600000 → BAD_KDF_ITER');
  }
  // 10. malformed base64
  {
    const env = await encryptPayload(dataOnlyPayload(), PW);
    const bad = clone(env); bad.kdf.salt = '!!!!not-base64!!!!';
    await throwsCode(() => decryptEnvelope(bad, PW), 'B64_MALFORMED', 'malformed base64 salt → B64_MALFORMED');
    ok((() => { try { base64ToBytes('AB'); return false; } catch (e) { return e.code === 'B64_MALFORMED'; } })(), 'base64 длина не кратна 4 → B64_MALFORMED');
  }
  // 11. oversized decode guard (тот же путь, что и для ciphertext) + плейнтекст-гвард формой
  {
    await throwsCode(() => { base64ToBytes(bytesToBase64(new Uint8Array(6)), { maxDecoded: 3 }); }, 'B64_TOO_LARGE', 'decoded > maxDecoded → B64_TOO_LARGE');
    ok(LIMITS.maxCiphertextBytes > 0 && LIMITS.maxPlaintextBytes > 0, 'лимиты ciphertext/plaintext документированы');
  }
  // 12. duplicate / запрещённые schema fields
  {
    const p = dataOnlyPayload(); p.nope = 1;
    throwsCodeSync(() => validatePayload(p), 'UNEXPECTED_FIELD', 'запрещённое поле payload → UNEXPECTED_FIELD');
    const pm = await completePayload(); pm.media.push({ ...pm.media[0] }); // дубликат id 'm1'
    throwsCodeSync(() => validatePayload(pm), 'DUPLICATE_MEDIA_ID', 'дубликат media id → DUPLICATE_MEDIA_ID');
    const pd = dataOnlyPayload(); pd.media = [{ id: 'm1', mime: 'image/jpeg', sha256: 'a'.repeat(64), bytes: '' }];
    throwsCodeSync(() => validatePayload(pd), 'DATAONLY_MEDIA', 'data-only с media → DATAONLY_MEDIA');
    const pc = dataOnlyPayload(); const many = []; for (let i = 0; i <= LIMITS.maxMediaCount; i++) many.push({}); pc.mode = 'complete'; pc.media = many;
    throwsCodeSync(() => validatePayload(pc), 'TOO_MANY_MEDIA', 'media count > лимита → TOO_MANY_MEDIA');
  }
  // 13. пароль и секреты отсутствуют в сериализованном envelope
  {
    const p = dataOnlyPayload('SECRET_MARKER_PROFILE');
    p.cfg.userName = 'SECRET_MARKER_USER';
    const env = await encryptPayload(p, 'SECRET_MARKER_PASSWORD');
    const text = serializeEnvelope(env);
    ok(!text.includes('SECRET_MARKER_PASSWORD'), 'пароль отсутствует в serialized envelope');
    ok(!text.includes('SECRET_MARKER_PROFILE') && !text.includes('SECRET_MARKER_USER'), 'plaintext payload отсутствует в serialized envelope');
    ok(Object.keys(JSON.parse(text)).sort().join(',') === 'cipher,ciphertext,envelopeVersion,format,kdf', 'envelope содержит только разрешённые поля');
    // round-trip из сериализованного файла
    const reParsed = parseEnvelopeText(text);
    const back = await decryptEnvelope(reParsed, 'SECRET_MARKER_PASSWORD');
    ok(back.profileName === 'SECRET_MARKER_PROFILE', 'parseEnvelopeText → decrypt восстанавливает payload');
  }

  function throwsCodeSync(fn, code, name) {
    try { fn(); ok(false, name + ' (не бросил, ожидался ' + code + ')'); }
    catch (e) { ok(e instanceof BackupError && e.code === code, name + (e && e.code !== code ? ' (код ' + (e && e.code) + ')' : '')); }
  }

  console.log(results.join('\n'));
  console.log('\nBackup core (Slice 1): ' + pass + '/' + (pass + fail) + ' passed');
  if (fail > 0) process.exit(1);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
