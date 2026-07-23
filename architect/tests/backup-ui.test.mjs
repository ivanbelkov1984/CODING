// ─────────────────────────────────────────────────────────────────────────
//  backup-ui.test.mjs — focused regression для UI-контроллера (Slice 4).
//  Гоняет production createBackupUI; adapter/restore/platform инъектируются
//  (fakes только на границе, реальная core-крипта используется при create).
//  Синтетические данные. Запуск: node tests/backup-ui.test.mjs
// ─────────────────────────────────────────────────────────────────────────

import { BackupError } from '../backup/backup-core.mjs';
import { createBackupUI } from '../backup/backup-ui.mjs';

let pass = 0, fail = 0; const out = [];
function ok(c, n) { if (c) { pass++; out.push('  ✓ ' + n); } else { fail++; out.push('  ✗ ' + n); } }

const NOW = '2026-07-23T12:00:00.000Z';
function validPayload(mode) {
  return { payloadVersion: 1, app: 'architect', mode, createdAt: '2026-07-23T00:00:00.000Z', profileName: 'P', db: { insights: [{ id: 1, title: 'x' }] }, cfg: { userName: 'P' }, media: [] };
}
function fakeAdapter(over = {}) {
  const calls = { buildBundle: [] };
  const a = {
    _calls: calls,
    buildBundle: async ({ id, mode }) => { calls.buildBundle.push({ id, mode }); return { payload: validPayload(mode), warnings: [] }; },
    getActiveId: () => 'pActive',
    getProfile: id => (id === 'pX' || id === 'pActive') ? { id, name: 'P', color: '#1056CC' } : null,
    ...over,
  };
  return a;
}
function fakePlatform() {
  const pl = { blobs: [], created: [], triggers: [], revokes: [] };
  pl.makeBlob = (parts, type) => { const b = { parts, type }; pl.blobs.push(b); return b; };
  pl.createObjectURL = blob => { const u = 'blob:' + pl.created.length; pl.created.push({ u, blob }); return u; };
  pl.revokeObjectURL = u => { pl.revokes.push(u); };
  pl.triggerDownload = (u, fn) => { pl.triggers.push({ u, fn }); };
  return pl;
}
function restoreSpy(impl) {
  const calls = [];
  const fn = async args => { calls.push(args); return impl ? impl(args) : { ok: true, profileId: args.mode === 'replace' ? args.targetId : 'pNew', mode: args.mode }; };
  fn.calls = calls; return fn;
}
const fileOf = (text, size = null) => ({ name: 'backup.json', size: size == null ? text.length : size, text: async () => text });
function armCreate(ui) { ui.setPassword('longenough'); ui.setPassword2('longenough'); ui.setAckLoss(true); ui.setAckSensitive(true); }

async function main() {
  // 1. entry opens sheet
  { const ui = createBackupUI({ adapter: fakeAdapter(), platform: fakePlatform(), now: () => NOW }); ok(ui.openSheet().open === true, 'entry: sheet открывается'); }

  // 2-3. mode select
  { const ui = createBackupUI({ adapter: fakeAdapter(), platform: fakePlatform(), now: () => NOW }); ok(ui.setMode('data-only').mode === 'data-only', 'выбор data-only'); ok(ui.setMode('complete').mode === 'complete', 'выбор complete'); }

  // 4. mismatched passwords block create
  {
    const a = fakeAdapter(); const ui = createBackupUI({ adapter: a, platform: fakePlatform(), now: () => NOW });
    ui.setPassword('aaaa'); ui.setPassword2('bbbb'); ui.setAckLoss(true); ui.setAckSensitive(true);
    ok(!ui.canCreate(), 'несовпадающие пароли: canCreate=false');
    const r = await ui.create(); ok(r.started === false && r.reason === 'mismatch' && a._calls.buildBundle.length === 0, 'несовпадающие пароли блокируют create (API не вызван)');
  }
  // 5. acknowledgements required
  {
    const a = fakeAdapter(); const ui = createBackupUI({ adapter: a, platform: fakePlatform(), now: () => NOW });
    ui.setPassword('longenough'); ui.setPassword2('longenough');
    const r = await ui.create(); ok(r.started === false && r.reason === 'ack' && a._calls.buildBundle.length === 0, 'без acknowledgements create заблокирован');
  }
  // 6. double-run blocked
  {
    let release; const gate = new Promise(r => release = r);
    const a = fakeAdapter({ buildBundle: async ({ id, mode }) => { await gate; return { payload: validPayload(mode) }; } });
    const ui = createBackupUI({ adapter: a, platform: fakePlatform(), now: () => NOW });
    armCreate(ui);
    const p1 = ui.create();
    const during = ui.getState();
    const r2 = await ui.create();
    ok(during.status.phase === 'working', 'во время операции статус working (progress)');
    ok(r2.started === false && r2.reason === 'busy', 'повторный запуск во время операции блокируется');
    release(); await p1;
  }
  // 7. create calls production API with correct mode; restore не вызывается
  {
    const a = fakeAdapter(); const pl = fakePlatform(); const rs = restoreSpy();
    const ui = createBackupUI({ adapter: a, restore: rs, platform: pl, now: () => NOW });
    ui.setMode('complete'); armCreate(ui);
    const r = await ui.create({ profileId: 'pActive' });
    ok(r.ok && a._calls.buildBundle[0].mode === 'complete' && a._calls.buildBundle[0].id === 'pActive', 'create → adapter.buildBundle с правильным mode/профилем');
    ok(rs.calls.length === 0, 'create не вызывает restore');
    // 8. download получает ожидаемый Blob (реальный зашифрованный envelope)
    ok(pl.triggers.length === 1, 'download инициирован один раз');
    const text = pl.blobs[0].parts[0];
    const env = JSON.parse(text);
    ok(env.format === 'arch-backup' && typeof env.ciphertext === 'string' && env.kdf.iterations === 600000, 'download: реальный зашифрованный envelope (core, не копия)');
    ok(pl.blobs[0].type === 'application/json', 'download: тип application/json');
    ok(pl.triggers[0].fn === 'architect-backup-complete-2026-07-23.json', 'download: имя файла с режимом и датой');
    // 9. object URL revoked
    ok(pl.revokes.length === 1 && pl.revokes[0] === pl.triggers[0].u, 'object URL отозван после скачивания');
    // 10. passwords cleared after success
    const s = ui.getState(); ok(s.password === '' && s.password2 === '', 'пароли очищены после успешного создания');
    ok(s.status.phase === 'done', 'финальный статус done');
  }
  // 11. close clears passwords + file selection
  {
    const ui = createBackupUI({ adapter: fakeAdapter(), platform: fakePlatform(), now: () => NOW });
    armCreate(ui); ui.setRestorePassword('rp'); ui.selectFile(fileOf('{}'));
    const s = ui.close();
    ok(s.password === '' && s.password2 === '' && s.restorePassword === '' && s.file === null && s.restoreMode === 'new' && s.destructiveArmed === false, 'close очищает пароли, файл и destructive-состояние');
  }
  // 12. restore-new is default
  { const ui = createBackupUI({ adapter: fakeAdapter(), platform: fakePlatform(), now: () => NOW }); ok(ui.getState().restoreMode === 'new', 'restore-new — режим по умолчанию'); }

  // 13. replacement нельзя вызвать без destructive mode
  {
    const rs = restoreSpy(); const ui = createBackupUI({ adapter: fakeAdapter(), restore: rs, platform: fakePlatform(), now: () => NOW });
    ui.selectFile(fileOf('{"format":"arch-backup"}'));
    await ui.doRestore({});                      // restoreMode='new' по умолчанию
    ok(rs.calls.length === 1 && rs.calls[0].mode === 'new', 'по умолчанию restore идёт в режиме new (не replace)');
  }
  // 14. replacement требует второго confirmation
  {
    const rs = restoreSpy(); const a = fakeAdapter(); const ui = createBackupUI({ adapter: a, restore: rs, platform: fakePlatform(), now: () => NOW });
    ui.selectFile(fileOf('{}')); ui.armReplace('pX');
    const r0 = await ui.doRestore({});           // без второго подтверждения
    ok(r0.started === false && r0.reason === 'need_second_confirm' && rs.calls.length === 0, 'replace без второго confirmation → restore НЕ вызван');
    const r1 = await ui.doRestore({ secondConfirm: false }); // явный отказ
    ok(r1.started === false && rs.calls.length === 0, 'отказ во втором confirmation → restore НЕ вызван');
  }
  // 15. подтверждённый replacement вызывает production API с правильным target
  {
    const rs = restoreSpy(); const ui = createBackupUI({ adapter: fakeAdapter(), restore: rs, platform: fakePlatform(), now: () => NOW });
    ui.selectFile(fileOf('{}')); ui.armReplace('pX');
    const r = await ui.doRestore({ secondConfirm: true });
    ok(r.ok && rs.calls.length === 1 && rs.calls[0].mode === 'replace' && rs.calls[0].targetId === 'pX', 'подтверждённый replace → restore(mode=replace, targetId=pX)');
  }
  // 15b. armReplace на несуществующий профиль не включает destructive
  {
    const ui = createBackupUI({ adapter: fakeAdapter(), platform: fakePlatform(), now: () => NOW });
    ui.armReplace('ghost');
    ok(ui.getState().restoreMode === 'new' && ui.getState().destructiveArmed === false, 'armReplace несуществующего профиля не включает replace');
  }
  // 16. wrong password → безопасная ошибка (без секрета)
  {
    const rs = restoreSpy(() => { throw new BackupError('DECRYPT_FAILED', 'internal detail'); });
    const ui = createBackupUI({ adapter: fakeAdapter(), restore: rs, platform: fakePlatform(), now: () => NOW });
    ui.selectFile(fileOf('{}')); ui.setRestorePassword('SECRETPW');
    const r = await ui.doRestore({});
    const s = ui.getState();
    ok(r.ok === false && r.code === 'DECRYPT_FAILED' && /Неверный пароль/.test(s.status.message), 'wrong password → безопасное сообщение');
    ok(!s.status.message.includes('SECRETPW'), 'ошибка не раскрывает пароль в сообщении');
    ok(ui.close().restorePassword === '', 'пароль восстановления очищается при закрытии sheet');
  }
  // 17. corrupted backup → безопасная ошибка
  {
    const rs = restoreSpy(() => { throw new BackupError('MANIFEST_MISMATCH', 'x'); });
    const ui = createBackupUI({ adapter: fakeAdapter(), restore: rs, platform: fakePlatform(), now: () => NOW });
    ui.selectFile(fileOf('{}'));
    const r = await ui.doRestore({});
    ok(r.ok === false && /повреждён|неполн/i.test(ui.getState().status.message), 'corrupted backup → безопасное сообщение');
  }
  // 18. internal error не раскрывает секреты
  {
    const rs = restoreSpy(() => { throw new Error('stack trace with TOKEN=abc123 and ciphertext'); });
    const ui = createBackupUI({ adapter: fakeAdapter(), restore: rs, platform: fakePlatform(), now: () => NOW });
    ui.selectFile(fileOf('{}'));
    const r = await ui.doRestore({});
    const m = ui.getState().status.message;
    ok(r.code === 'INTERNAL' && !m.includes('TOKEN=abc123') && !m.includes('ciphertext'), 'внутренняя ошибка → нейтральное сообщение без секретов/stack');
  }
  // 19-20. after failure UI снова доступен
  {
    const rs = restoreSpy(() => { throw new BackupError('DECRYPT_FAILED', 'x'); });
    const ui = createBackupUI({ adapter: fakeAdapter(), restore: rs, platform: fakePlatform(), now: () => NOW });
    ui.selectFile(fileOf('{}')); await ui.doRestore({});
    ok(ui.getState().busy === false, 'после ошибки UI снова доступен (busy=false)');
    // и повтор возможен
    rs.calls.length = 0; rs._impl = null;
    const rs2 = restoreSpy(); const ui2 = createBackupUI({ adapter: fakeAdapter(), restore: rs2, platform: fakePlatform(), now: () => NOW });
    ui2.selectFile(fileOf('{}')); const r2 = await ui2.doRestore({});
    ok(r2.ok === true, 'после failure повторная операция проходит');
  }

  console.log(out.join('\n'));
  console.log('\nBackup UI (Slice 4): ' + pass + '/' + (pass + fail) + ' passed');
  if (fail > 0) process.exit(1);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
