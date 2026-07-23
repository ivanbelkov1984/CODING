# 05 — ENCRYPTED PORTABLE BACKUP SPEC

## Статус

Это новый implementation contract для Claude Code.

Предыдущие реализации GPT/Codex из PR #63/#64 отклонены и закрыты без merge. Их код не переносится. Требования ниже сохраняют полезные выводы аудита, но реализация должна быть заново основана на реальном `MAIN`.

## 1. Пользовательская цель

Иван должен через мобильный интерфейс:

1. создать зашифрованный переносимый backup профиля;
2. выбрать data-only или complete mode;
3. сохранить файл на устройство;
4. восстановить backup как новый профиль по умолчанию;
5. при явном втором подтверждении заменить выбранный профиль;
6. получить понятный статус без developer tools.

## 2. Режимы

### Data-only

- включает переносимые DB и CFG;
- исключает фото/аудио bytes;
- исключает media references из переносимой копии DB, не меняя live DB;
- после restore не может случайно привязаться к чужим глобальным media IDs.

### Complete

- включает переносимые DB и CFG;
- включает все реально referenced media bytes;
- сохраняет MIME/content type;
- проверяет SHA-256 canonical raw bytes.

## 3. Что запрещено экспортировать

- `apiUrl`;
- `spaceKey`;
- `lastSync`;
- sync passphrase;
- recovery key/material;
- AI provider keys;
- feedback outbox/error diagnostics;
- любые токены/секреты подключения;
- прочие device-local connection fields, найденные аудитом.

При replacement локальные connection settings существующего профиля сохраняются. У нового профиля они пустые/default.

## 4. Криптографический envelope

Обязательный минимум:

- browser Web Crypto only;
- PBKDF2-SHA-256;
- ровно 600 000 iterations для schema v1;
- случайный salt 16 bytes;
- AES-GCM-256;
- случайный IV 12 bytes;
- authenticated ciphertext;
- versioned envelope и payload schema;
- fail-closed validation;
- пароль не хранится после операции.

Не использовать Node crypto в production browser module.

## 5. Архитектурное разделение

Минимум два слоя:

### Pure/browser-neutral core

- schema validation;
- limits;
- base64;
- canonical bytes;
- hashes;
- encryption/decryption;
- transactional restore orchestration.

### Production browser adapter

- реальный localStorage;
- реальный IndexedDB;
- production media record formats;
- profile registry;
- activation/hydration;
- exact rollback;
- media collision/reuse;
- connection preservation.

`app.js` вызывает production adapter. Node tests импортируют тот же production adapter через dependency injection. Запрещено копировать его алгоритмы в mock Store.

## 6. Media reality

Перед реализацией Claude обязан подтвердить фактические форматы записей IndexedDB в `MAIN`.

Adapter должен корректно поддерживать реально используемые форматы, включая при наличии:

- durable data URL;
- Blob;
- ArrayBuffer;
- typed arrays;
- MIME с параметрами, например `audio/webm;codecs=opus`.

В IndexedDB нельзя сохранять `URL.createObjectURL()` как постоянное значение.

## 7. Глобальные media IDs и профили

Если IndexedDB media store общий для origin:

- identical canonical bytes + compatible MIME могут быть reused без перезаписи существующей записи;
- при конфликте ID с другими bytes/MIME создаётся новый ID;
- DB references переписываются до persistence;
- replacement не повреждает media другого профиля;
- media GC собирает ссылки всех зарегистрированных профилей и draft state;
- failed restore не оставляет remapped orphan IDs.

## 8. Transactional restore

До первой мутации snapshot должен включать:

- точное значение profile registry;
- active profile;
- точный набор и значения всех relevant DB/CFG keys;
- существование и значения каждого media record, которое может быть изменено;
- список фактически созданных target keys/media IDs.

Порядок:

1. file-size preflight;
2. parse envelope;
3. validate envelope;
4. decrypt/authenticate;
5. validate payload/manifest/limits/hashes;
6. snapshot;
7. prepare collision plan;
8. write staged DB/CFG/media;
9. reread and verify;
10. activate only after successful verification.

При любой ошибке exact rollback. Ошибка rollback не скрывается.

## 9. Limits и hostile input

Должны быть документированы и проверены до чрезмерного allocation:

- maximum input file size до `file.text()`;
- password length;
- ciphertext decoded size;
- plaintext JSON size;
- collections count;
- object count;
- media count;
- per-media bytes;
- total media bytes;
- media ID length/format;
- MIME format;
- duplicate IDs;
- base64 shape/decoded size;
- exact schema keys;
- supported versions/algorithms/KDF parameters.

## 10. UI

- ясный русский интерфейс;
- data-only прямо говорит: фото и аудио не включаются;
- complete прямо говорит о размере/чувствительности;
- два поля нового пароля;
- acknowledgements о потере пароля и чувствительности файла;
- restore password;
- new profile default;
- replace current profile + отдельное destructive confirmation;
- visible progress/status;
- password fields очищаются после success и при закрытии;
- download object URL отзывается.

## 11. Build и offline

Все production modules:

- входят в build output;
- доступны по корректному relative URL;
- входят в service-worker shell/cache;
- импортируются после offline reload.

## 12. Tests

### Focused regression

Обязательные сценарии:

- KDF/algorithm exact parameters;
- wrong password;
- corrupted authenticated envelope;
- unexpected fields;
- malformed/oversized base64;
- zero/non-zero excessive media count;
- data-only stripping;
- production image/audio records;
- MIME parameters;
- identical-media no-op reuse;
- conflict remap and DB reference rewrite;
- replacement connection preservation;
- failures at registry/DB/CFG/media/verify/activate;
- exact rollback including orphan/recovery keys;
- deletion of newly remapped IDs;
- rollback failure surfacing;
- secrets absent from serialized envelope.

### Browser evidence

Chromium mobile + WebKit mobile over localhost HTTP:

- visible UI creation data-only/complete;
- downloaded file read/decrypt;
- wrong password/corruption/no mutation;
- restore through real file input;
- new-profile success;
- replacement confirmation rejection;
- replacement success;
- reload and media rendering;
- service-worker cache and offline import;
- password clearing;
- final visible status.

Synthetic data only.

## 13. Acceptance gate

Нельзя merge, пока:

```text
BUILD=PASS
FOCUSED_BACKUP_TESTS=PASS
EXISTING_E2E=PASS
CHROMIUM_MOBILE=PASS
WEBKIT_MOBILE=PASS
OFFLINE_RELOAD=PASS
INDEPENDENT_DIFF_REVIEW=PASS
```

Если browser executable недоступен локально — GitHub CI должен запустить evidence. До этого статус `BLOCKED`, не `PASS`.

## 14. Non-goals

- redesign sync protocol;
- migrate storage engine;
- cloud backup service;
- automatic scheduled backup;
- native filesystem integration;
- health/AI/astrology changes;
- production-data migration.
