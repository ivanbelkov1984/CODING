// ─────────────────────────────────────────────────────────────────────────
//  backup-restore.mjs — единый production restore orchestrator (Slice 3).
//
//  Поверх backup-core.mjs (parse/validate/decrypt/verify) и backup-adapter.mjs
//  (snapshot/plan/staged write/verify/activate/rollback). Один production-путь,
//  без альтернативного mock-алгоритма. Fault injection в тестах — через подмену
//  методов реального adapter, а не через копию логики.
//
//  Порядок (строго):
//   1 file-size preflight (до file.text())      9  snapshot до первой мутации
//   2 чтение файла                             10  collision/reuse/remap plan (read-only)
//   3 parse envelope                           11  staged media writes    ← первая мутация
//   4 strict envelope validation               12  staged DB/CFG writes
//   5 decrypt / authenticate                   13  profile registry write
//   6 strict payload validation                14  reread + verification
//   7 manifest verification                    15  activation (только после verify)
//   8 media hashes verification                16  success result
//
//  Любая ошибка ПОСЛЕ первой мутации → exact rollback. Ошибка rollback
//  возвращается явно и не скрывается исходной ошибкой.
//
//  Вне слайса: UI, app.js, index.html/styles.css, download/file picker,
//  второе destructive confirmation, build.mjs, sw.js, browser evidence.
// ─────────────────────────────────────────────────────────────────────────

'use strict';

import {
  LIMITS, BackupError,
  parseEnvelopeText, decryptEnvelope, verifyMediaHashes,
} from './backup-core.mjs';
import { KEYS, CONNECTION_FIELDS } from './backup-adapter.mjs';

const fail = (code, msg) => { throw new BackupError(code, msg); };

const PROFILE_COLORS = ['#1056CC', '#1A7F3C', '#6B21A8', '#B45309', '#0E7490', '#92400E'];

// Preflight размера файла ДО .text() (для Slice 4 UI). Возвращает true или бросает.
export function preflightFileSize(sizeBytes, maxBytes = LIMITS.maxFileBytes) {
  if (typeof sizeBytes !== 'number' || sizeBytes < 0) fail('FILE_INPUT', 'некорректный размер файла');
  if (sizeBytes > maxBytes) fail('FILE_TOO_LARGE', 'файл превышает допустимый размер');
  return true;
}

// Собрать все media-ссылки из db (для manifest verification).
function refsOf(db) {
  const ids = new Set();
  for (const c of Object.keys(db || {})) {
    const arr = db[c]; if (!Array.isArray(arr)) continue;
    for (const rec of arr) if (rec && Array.isArray(rec.media)) for (const m of rec.media) if (typeof m === 'string') ids.add(m);
  }
  return ids;
}

// Проверка внутренней согласованности payload (manifest).
function verifyManifest(payload) {
  const refs = refsOf(payload.db);
  const provided = new Set(payload.media.map(m => m.id));
  if (provided.size !== payload.media.length) fail('MANIFEST_MISMATCH', 'дубликаты media id в backup');
  if (payload.mode === 'data-only') {
    if (refs.size > 0) fail('MANIFEST_MISMATCH', 'data-only не должен ссылаться на media');
    if (provided.size > 0) fail('MANIFEST_MISMATCH', 'data-only не должен нести media');
  } else {
    // complete: ТОЧНОЕ равенство множеств. Каждая ссылка присутствует в payload
    // и НЕТ ни одной лишней (непривязанной) media — иначе backup отвергается.
    for (const r of refs) if (!provided.has(r)) fail('MANIFEST_MISMATCH', 'ссылка на отсутствующее в backup media: ' + r);
    for (const m of provided) if (!refs.has(m)) fail('MANIFEST_MISMATCH', 'лишнее media без ссылки в DB: ' + m);
  }
}

/**
 * Восстановление backup.
 * @param {object} p
 * @param {object} p.adapter    — экземпляр createBackupAdapter (production)
 * @param {string} [p.fileText] — уже прочитанный текст файла
 * @param {object} [p.file]     — File-подобный { size, text() } (тогда делается preflight+read)
 * @param {string} p.password
 * @param {'new'|'replace'} [p.mode='new']  — replacement НИКОГДА не по умолчанию
 * @param {string} [p.targetId] — обязателен для 'replace'
 * @param {function} [p.genProfileId]
 * @param {function} [p.now]
 * @param {function} [p.onActivated] — async ({profileId, mode}) => гидратация в app.js
 * @returns {Promise<object>} success result
 */
export async function restoreBackup(p) {
  const adapter = p && p.adapter;
  if (!adapter || typeof adapter.snapshot !== 'function') fail('RESTORE_DEPS', 'нужен production adapter');
  const password = p.password;
  const mode = p.mode === undefined ? 'new' : p.mode;
  if (mode !== 'new' && mode !== 'replace') fail('BAD_MODE', 'режим должен быть "new" или "replace"');
  const now = p.now || (() => new Date().toISOString());
  const genProfileId = p.genProfileId || (() => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));

  // ── 1–2. file-size preflight + чтение ──
  let fileText = p.fileText;
  if (fileText === undefined) {
    if (!p.file || typeof p.file.text !== 'function') fail('FILE_INPUT', 'нужен fileText или file');
    preflightFileSize(typeof p.file.size === 'number' ? p.file.size : 0);
    fileText = await p.file.text();
  }

  // ── 3–4. parse + strict envelope validation ──
  const env = parseEnvelopeText(fileText, { maxBytes: LIMITS.maxFileBytes });

  // ── 5–6. decrypt/authenticate + strict payload validation ──
  //   (wrong password / corrupted / invalid payload бросят ЗДЕСЬ — до любой мутации)
  const payload = await decryptEnvelope(env, password);

  // ── 7. manifest verification ──
  verifyManifest(payload);

  // ── 8. media hashes verification ──
  await verifyMediaHashes(payload.media);

  // ── resolve target ──
  let targetId, profileEntry;
  if (mode === 'replace') {
    if (typeof p.targetId !== 'string' || !p.targetId) fail('BAD_TARGET', 'для replace нужен targetId');
    const existing = adapter.getProfile(p.targetId);
    if (!existing) fail('NO_TARGET', 'заменяемый профиль не найден');
    targetId = p.targetId;
    profileEntry = { ...existing };                 // сохраняем идентичность слота (id/name/color)
  } else {
    do { targetId = genProfileId(); } while (adapter.getProfile(targetId));
    const color = PROFILE_COLORS[adapter.listProfiles().length % PROFILE_COLORS.length];
    profileEntry = { id: targetId, name: (payload.profileName || 'Восстановленный').slice(0, 200), color };
  }

  // ── CFG: connection preservation (replace) / пусто (new) ──
  const cfgFinal = adapter.buildRestoreCfg({ bundleCfg: payload.cfg, targetId, replace: mode === 'replace' });

  // ── 10. collision/reuse/remap plan (read-only) — до snapshot, без мутаций ──
  const plan = await adapter.planMedia(payload.media);
  const dbFinal = adapter.rewriteRefs(payload.db, plan.remaps);

  // ── 9. snapshot до первой мутации ──
  const snap = await adapter.snapshot({
    storageKeys: [KEYS.PKEY, KEYS.AKEY, KEYS.db(targetId), KEYS.cfg(targetId), KEYS.bak(targetId)],
    mediaIds: plan.writes.map(w => w.id),
  });

  let mutated = false;
  try {
    // ── 11. staged media writes (первая мутация) ──
    mutated = true;
    await adapter.writeStagedMedia(plan.writes);
    // ── 12–13. staged DB/CFG + registry write ──
    adapter.writeStagedProfile({ id: targetId, profile: profileEntry, db: dbFinal, cfg: cfgFinal });
    // ── 14. reread + verification (DB/CFG/bak/registry/profile + media) ──
    adapter.verifyProfile({ id: targetId, db: dbFinal, cfg: cfgFinal, profile: profileEntry });
    for (const w of plan.writes) {
      const r = await adapter.readMedia(w.id);
      // Точная проверка перечитанной записи: data + type + createdAt.
      if (!r || r.data !== w.record.data || r.type !== w.record.type || r.createdAt !== w.record.createdAt) {
        fail('VERIFY_MEDIA', 'проверка media не прошла: ' + w.id);
      }
    }
    // ── 15. activation только после успешной verification ──
    adapter.activate(targetId);
  } catch (origErr) {
    if (mutated) {
      try {
        await adapter.rollback(snap);
      } catch (rbErr) {
        // Ошибка rollback surfaced ЯВНО и не скрывается исходной ошибкой.
        const e = new BackupError('ROLLBACK_FAILED', 'откат не удался после ошибки восстановления');
        e.originalError = origErr;
        e.rollbackError = rbErr;
        throw e;
      }
      if (origErr && typeof origErr === 'object') { try { origErr.rolledBack = true; } catch (e) { /* frozen */ } }
    }
    throw origErr;
  }

  // ── 15b. Немедленная гидратация активированного профиля через callback из
  //   app.js (сброс sync-состояния, hydrate, обновление in-memory DB/CFG,
  //   initAll/render). ТОЛЬКО после успешной активации транзакции, чтобы старое
  //   in-memory состояние не перезаписало восстановленный профиль при следующем
  //   persist(). Ошибка гидратации не откатывает уже зафиксированные данные —
  //   транзакция хранилища завершена, профиль активирован и корректен.
  if (typeof p.onActivated === 'function') {
    await p.onActivated({ profileId: targetId, mode });
  }

  // ── 16. success result ──
  return {
    ok: true,
    mode,
    profileId: targetId,
    profileName: profileEntry.name,
    activated: true,
    mediaWritten: plan.writes.length,
    mediaReused: plan.reuses.length,
    remaps: plan.remaps,
  };
}
