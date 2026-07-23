// ─────────────────────────────────────────────────────────────────────────
//  backup-boot.mjs — привязка DOM к UI-контроллеру (Slice 4).
//
//  Строит production adapter (localStorage + IndexedDB через window.__archMedia,
//  экспонированный app.js) и createBackupUI, связывает элементы sheet
//  #ov-backup-enc с методами контроллера. Вся логика — в контроллере/adapter/
//  core/restore; здесь только DOM-ввод/вывод. Не подключается в combined-билд
//  до Slice 5 (там модули войдут в build output и service-worker cache).
// ─────────────────────────────────────────────────────────────────────────

'use strict';

import { createBackupAdapter } from './backup-adapter.mjs';
import { createBackupUI } from './backup-ui.mjs';

const MODE_NOTES = {
  'data-only': 'Будут включены записи и настройки. Фотографии и аудио НЕ войдут. Живые данные приложения при этом не меняются.',
  'complete': 'Будут включены записи, настройки, фотографии и аудио. Файл может быть большим. Он содержит ваши личные данные (файл зашифрован — храните его в безопасном месте).',
};

export function mount() {
  const $ = id => document.getElementById(id);
  if (!$('ov-backup-enc')) return;                 // sheet отсутствует — нечего монтировать
  let ui = null, adapter = null, bound = false;

  function ensure() {
    if (ui) return ui;
    const media = window.__archMedia;
    if (!media) throw new Error('backup: media store недоступен');
    adapter = createBackupAdapter({ storage: window.localStorage, media });
    ui = createBackupUI({ adapter });
    if (!bound) { bind(); bound = true; }
    return ui;
  }

  function setStatus(el, status) {
    if (!el) return;
    const s = status || { phase: 'idle' };
    el.textContent = s.message || '';
    el.className = 'be-status' + (s.phase === 'error' ? ' be-err' : s.phase === 'done' ? ' be-ok' : s.phase === 'working' ? ' be-work' : '');
  }

  function renderCreate() {
    const st = ui.getState();
    $('be-mode-note').textContent = MODE_NOTES[st.mode] || '';
    document.querySelectorAll('#be-mode .tp').forEach(b => b.classList.toggle('on', b.dataset.beMode === st.mode));
    $('be-create-btn').disabled = !ui.canCreate();
    setStatus($('be-create-status'), st.status.phase === 'idle' ? null : st.status);
  }
  function renderRestore() {
    const st = ui.getState();
    setStatus($('be-restore-status'), st.status.phase === 'idle' ? null : st.status);
  }

  function showTab(tab) {
    $('be-create').style.display = tab === 'create' ? '' : 'none';
    $('be-restore').style.display = tab === 'restore' ? '' : 'none';
    $('be-tab-create').classList.toggle('on', tab === 'create');
    $('be-tab-restore').classList.toggle('on', tab === 'restore');
  }

  function fillTargets() {
    const sel = $('be-target'); if (!sel || !adapter) return;
    const profiles = adapter.listProfiles();
    sel.innerHTML = profiles.map(p => '<option value="' + p.id + '">' + (p.name || p.id) + '</option>').join('');
  }

  function bind() {
    // Вкладки
    $('be-tab-create').onclick = () => showTab('create');
    $('be-tab-restore').onclick = () => showTab('restore');
    // Режим создания
    document.querySelectorAll('#be-mode .tp').forEach(b => { b.onclick = () => { ui.setMode(b.dataset.beMode); renderCreate(); }; });
    // Пароли/подтверждения создания
    $('be-pw1').oninput = e => { ui.setPassword(e.target.value); renderCreate(); };
    $('be-pw2').oninput = e => { ui.setPassword2(e.target.value); renderCreate(); };
    $('be-ack-loss').onchange = e => { ui.setAckLoss(e.target.checked); renderCreate(); };
    $('be-ack-sens').onchange = e => { ui.setAckSensitive(e.target.checked); renderCreate(); };
    // Создать
    $('be-create-btn').onclick = async () => {
      const r = await ui.create();
      renderCreate();
      if (r && r.ok) { $('be-pw1').value = ''; $('be-pw2').value = ''; }
    };
    // Восстановление: выбор файла
    $('be-file').onchange = e => {
      const f = e.target.files && e.target.files[0];
      if (!f) { ui.clearFile(); $('be-file-name').textContent = 'Выбрать файл…'; $('be-file-info').textContent = ''; return; }
      ui.selectFile(f);
      $('be-file-name').textContent = f.name;
      $('be-file-info').textContent = 'Размер: ' + Math.max(1, Math.round(f.size / 1024)) + ' КБ';
    };
    $('be-rpw').oninput = e => ui.setRestorePassword(e.target.value);
    // Восстановить как новый профиль
    $('be-restore-new-btn').onclick = async () => {
      ui.setRestoreModeNew();
      const r = await ui.doRestore({});
      renderRestore();
      if (r && r.ok) { $('be-rpw').value = ''; }
    };
    // Включение destructive replace (первый шаг)
    $('be-replace-arm').onclick = () => { fillTargets(); $('be-replace-panel').style.display = ''; $('be-confirm2').style.display = 'none'; };
    // Первое предупреждение → показать второе подтверждение
    $('be-replace-btn').onclick = () => {
      const sel = $('be-target'); const id = sel && sel.value;
      const s = ui.armReplace(id);
      if (!s.destructiveArmed) { renderRestore(); return; }
      const opt = sel.options[sel.selectedIndex];
      $('be-confirm2-name').textContent = opt ? opt.textContent : id;
      $('be-confirm2').style.display = '';
    };
    // Отмена второго подтверждения — без мутаций
    $('be-confirm2-cancel').onclick = () => { $('be-confirm2').style.display = 'none'; };
    // Явный результат второго подтверждения → вызов production restore(replace)
    $('be-confirm2-yes').onclick = async () => {
      $('be-confirm2').style.display = 'none';
      const r = await ui.doRestore({ secondConfirm: true });
      renderRestore();
      if (r && r.ok) { $('be-rpw').value = ''; $('be-replace-panel').style.display = 'none'; }
    };
    // Закрытие
    $('be-close').onclick = requestClose;
  }

  function resetDom() {
    ['be-pw1', 'be-pw2', 'be-rpw'].forEach(id => { const el = $(id); if (el) el.value = ''; });
    const ackL = $('be-ack-loss'), ackS = $('be-ack-sens'); if (ackL) ackL.checked = false; if (ackS) ackS.checked = false;
    const f = $('be-file'); if (f) f.value = '';
    $('be-file-name').textContent = 'Выбрать файл…'; $('be-file-info').textContent = '';
    $('be-replace-panel').style.display = 'none'; $('be-confirm2').style.display = 'none';
    setStatus($('be-create-status'), null); setStatus($('be-restore-status'), null);
  }

  function open() {
    ensure();
    ui.openSheet();
    showTab('create');
    resetDom();
    renderCreate();
    if (typeof window.openOv === 'function') window.openOv('ov-backup-enc');
  }
  function requestClose() {
    if (ui && ui.getState().busy) { setStatus($('be-create-status'), { phase: 'working', message: 'Дождитесь завершения операции…' }); return; }
    if (ui) ui.close();
    resetDom();
    if (typeof window.closeOv === 'function') window.closeOv('ov-backup-enc');
  }

  window.ArchBackup = { open, requestClose };
}
