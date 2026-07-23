// ─────────────────────────────────────────────────────────────────────────
//  backup-ui.mjs — UI-контроллер зашифрованного backup (Slice 4).
//
//  Отвечает ТОЛЬКО за: пользовательский выбор, пароли, file input,
//  confirmations, progress/status, вызов production API и очистку временного
//  UI-state. Вся валидация/криптография/мутация — в backup-core/adapter/restore
//  (импортируются, НЕ копируются). Контроллер browser-neutral и инъектирует
//  зависимости, поэтому тестируется в Node без DOM.
//
//  Вне слайса: build.mjs, sw.js, service-worker cache, offline/browser evidence.
// ─────────────────────────────────────────────────────────────────────────

'use strict';

import { LIMITS, BackupError, encryptPayload, serializeEnvelope } from './backup-core.mjs';
import { restoreBackup as prodRestore, preflightFileSize } from './backup-restore.mjs';

// Человеческие RU-сообщения по коду ошибки. Без секретов/ciphertext/stack.
const SAFE_MESSAGES = {
  DECRYPT_FAILED: 'Неверный пароль или файл повреждён.',
  FILE_TOO_LARGE: 'Файл слишком большой.',
  BAD_FILE_JSON: 'Это не похоже на файл резервной копии.',
  BAD_FILE_JSON2: 'Файл резервной копии повреждён.',
  BAD_FORMAT: 'Это не файл резервной копии «Архитектора».',
  BAD_VERSION: 'Версия файла не поддерживается.',
  MANIFEST_MISMATCH: 'Файл резервной копии неполный или повреждён.',
  MEDIA_HASH_MISMATCH: 'Медиа в файле повреждено.',
  ROLLBACK_FAILED: 'Ошибка восстановления. Данные возвращены в прежнее состояние не полностью — не активируйте профиль и обратитесь к резервной копии.',
  NO_TARGET: 'Выбранный профиль не найден.',
  NO_DB: 'Нет данных для резервной копии.',
};
// Любая незнакомая/внутренняя ошибка → нейтральное сообщение (без раскрытия).
function safeError(e) {
  const code = (e && e.code) ? e.code : 'INTERNAL';
  const message = SAFE_MESSAGES[code] || 'Не удалось выполнить операцию. Попробуйте ещё раз.';
  return { code, message };
}

function two(n) { return String(n).padStart(2, '0'); }
function dateStamp(iso) { const d = new Date(iso); return d.getUTCFullYear() + '-' + two(d.getUTCMonth() + 1) + '-' + two(d.getUTCDate()); }

// Дефолтная браузерная платформа (обращения к DOM/URL — лениво, внутри методов).
const browserPlatform = {
  makeBlob: (parts, type) => new Blob(parts, { type }),
  createObjectURL: blob => URL.createObjectURL(blob),
  // Отзыв откладываем: синхронный revoke сразу после click отменяет скачивание
  // blob: в реальном браузере. Память всё равно освобождается (через таймаут).
  revokeObjectURL: url => { try { setTimeout(() => URL.revokeObjectURL(url), 10000); } catch (_) { URL.revokeObjectURL(url); } },
  triggerDownload: (url, filename) => {
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  },
};

/**
 * @param {object} deps
 * @param {object} deps.adapter   — createBackupAdapter(...) (production)
 * @param {function} [deps.restore]  — restoreBackup (production; инъекция для тестов)
 * @param {object} [deps.platform]   — { makeBlob, createObjectURL, revokeObjectURL, triggerDownload }
 * @param {function} [deps.now]      — () => ISO
 */
export function createBackupUI(deps) {
  const adapter = deps && deps.adapter;
  if (!adapter || typeof adapter.buildBundle !== 'function') throw new BackupError('UI_DEPS', 'нужен production adapter');
  const restore = (deps && deps.restore) || prodRestore;
  const platform = (deps && deps.platform) || browserPlatform;
  const now = (deps && deps.now) || (() => new Date().toISOString());

  // ── UI-state ──
  const st = {
    open: false,
    // создание
    mode: 'data-only',           // 'data-only' | 'complete'
    password: '', password2: '',
    ackLoss: false, ackSensitive: false,
    // восстановление
    file: null,                  // { name, size, text() }
    restorePassword: '',
    restoreMode: 'new',          // 'new' | 'replace'
    destructiveArmed: false,     // явное включение replace
    targetProfileId: null,
    // общее
    busy: false,
    status: { phase: 'idle' },   // idle | working | done | error
  };

  const snapshot = () => JSON.parse(JSON.stringify({ ...st, file: st.file ? { name: st.file.name, size: st.file.size } : null }));

  // ── Сеттеры (UI-виджеты) ──
  function openSheet() { st.open = true; st.status = { phase: 'idle' }; return snapshot(); }
  function setMode(m) { if (m === 'data-only' || m === 'complete') st.mode = m; return snapshot(); }
  function setPassword(p) { st.password = String(p == null ? '' : p); return snapshot(); }
  function setPassword2(p) { st.password2 = String(p == null ? '' : p); return snapshot(); }
  function setAckLoss(v) { st.ackLoss = !!v; return snapshot(); }
  function setAckSensitive(v) { st.ackSensitive = !!v; return snapshot(); }

  // ── Валидация создания ──
  function createValidation() {
    if (st.busy) return { ok: false, reason: 'busy' };
    if (!st.password || !st.password2) return { ok: false, reason: 'empty' };
    if (st.password !== st.password2) return { ok: false, reason: 'mismatch' };
    if (st.password.length < LIMITS.minPasswordLength) return { ok: false, reason: 'too_short' };
    if (st.password.length > LIMITS.maxPasswordLength) return { ok: false, reason: 'too_long' };
    if (!st.ackLoss || !st.ackSensitive) return { ok: false, reason: 'ack' };
    return { ok: true };
  }
  const canCreate = () => createValidation().ok;

  // ── Создание backup ──
  async function create({ profileId } = {}) {
    if (st.busy) return { started: false, reason: 'busy', state: snapshot() };
    const v = createValidation();
    if (!v.ok) { st.status = { phase: 'error', message: 'Проверьте пароль и подтверждения.', code: 'VALIDATION_' + v.reason }; return { started: false, reason: v.reason, state: snapshot() }; }
    const pid = profileId || adapter.getActiveId();
    const mode = st.mode;
    st.busy = true; st.status = { phase: 'working', message: mode === 'complete' ? 'Собираю данные и медиа…' : 'Собираю данные…' };
    let url = null;
    try {
      const { payload } = await adapter.buildBundle({ id: pid, mode });
      const env = await encryptPayload(payload, st.password);        // production crypto
      const text = serializeEnvelope(env);
      const blob = platform.makeBlob([text], 'application/json');
      const filename = 'architect-backup-' + mode + '-' + dateStamp(now()) + '.json';
      url = platform.createObjectURL(blob);
      platform.triggerDownload(url, filename);
      platform.revokeObjectURL(url); url = null;                     // отзыв object URL
      clearPasswords();                                              // пароль не остаётся в UI
      st.status = { phase: 'done', message: 'Резервная копия сохранена: ' + filename, filename };
      return { started: true, ok: true, filename, state: snapshot() };
    } catch (e) {
      if (url) { try { platform.revokeObjectURL(url); } catch (_) {} }
      const se = safeError(e);
      st.status = { phase: 'error', message: se.message, code: se.code };
      return { started: true, ok: false, code: se.code, state: snapshot() };
    } finally {
      st.busy = false;                                              // UI снова доступен
    }
  }

  function clearPasswords() { st.password = ''; st.password2 = ''; }

  // ── Восстановление ──
  function selectFile(file) {
    if (!file || typeof file.text !== 'function') { st.file = null; return snapshot(); }
    st.file = file; st.status = { phase: 'idle' };
    return snapshot();
  }
  function clearFile() { st.file = null; return snapshot(); }
  function setRestorePassword(p) { st.restorePassword = String(p == null ? '' : p); return snapshot(); }
  function setRestoreModeNew() { st.restoreMode = 'new'; st.destructiveArmed = false; st.targetProfileId = null; return snapshot(); }
  // Явное включение destructive replace (первое переключение + выбор профиля).
  function armReplace(targetProfileId) {
    if (!adapter.getProfile(targetProfileId)) { st.status = { phase: 'error', message: 'Профиль для замены не найден.', code: 'NO_TARGET' }; return snapshot(); }
    st.restoreMode = 'replace'; st.destructiveArmed = true; st.targetProfileId = targetProfileId;
    return snapshot();
  }
  function disarmReplace() { return setRestoreModeNew(); }

  // Восстановление. Для replace ОБЯЗАТЕЛЕН явный secondConfirm===true, иначе
  // вызова production restore НЕ происходит (никаких мутаций).
  async function doRestore({ secondConfirm } = {}) {
    if (st.busy) return { started: false, reason: 'busy', state: snapshot() };
    if (!st.file) { st.status = { phase: 'error', message: 'Выберите файл резервной копии.', code: 'NO_FILE' }; return { started: false, reason: 'no_file', state: snapshot() }; }
    if (st.restoreMode === 'replace') {
      if (!st.destructiveArmed) return { started: false, reason: 'not_armed', state: snapshot() };
      if (secondConfirm !== true) return { started: false, reason: 'need_second_confirm', state: snapshot() };
    }
    st.busy = true; st.status = { phase: 'working', message: 'Проверяю и восстанавливаю…' };
    try {
      preflightFileSize(typeof st.file.size === 'number' ? st.file.size : 0); // до .text()
      const fileText = await st.file.text();
      const result = await restore({
        adapter, fileText, password: st.restorePassword,
        mode: st.restoreMode,
        targetId: st.restoreMode === 'replace' ? st.targetProfileId : undefined,
        now,
      });
      st.restorePassword = '';
      st.status = { phase: 'done', message: st.restoreMode === 'replace' ? 'Профиль заменён из резервной копии.' : 'Создан и активирован новый профиль из резервной копии.', profileId: result.profileId };
      return { started: true, ok: true, result, state: snapshot() };
    } catch (e) {
      const se = safeError(e);
      st.status = { phase: 'error', message: se.message, code: se.code };
      return { started: true, ok: false, code: se.code, state: snapshot() };
    } finally {
      st.busy = false;
    }
  }

  // Закрытие sheet: чистим пароли, выбранный файл, destructive-состояние.
  function close() {
    clearPasswords();
    st.restorePassword = '';
    st.file = null;
    st.restoreMode = 'new'; st.destructiveArmed = false; st.targetProfileId = null;
    st.ackLoss = false; st.ackSensitive = false;
    st.open = false; st.status = { phase: 'idle' };
    return snapshot();
  }

  return {
    getState: snapshot,
    // виджеты создания
    openSheet, setMode, setPassword, setPassword2, setAckLoss, setAckSensitive,
    createValidation, canCreate, create,
    // виджеты восстановления
    selectFile, clearFile, setRestorePassword, setRestoreModeNew, armReplace, disarmReplace, doRestore,
    // общее
    close, _safeError: safeError,
  };
}
