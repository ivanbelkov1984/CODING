# Security-аудит — TMCManager

Наряд студии Белькова #191 (НИКИТА ВОРОН, security). Read-only аудит — код не
менялся, только чтение файлов и построчная проверка. Пересекается с #189
(Артур Лекс, лицензии/GDPR, PR ivanbelkov1984/CODING#6) — там уже отмечена одна
находка по логированию, ниже она подтверждена и расширена.

## 1. `lib/utils/constants.dart` — хардкод base_url/ключей

**Чисто.** Единственная константа — публичный, документированный базовый URL
Ozon Seller API: `const String baseUrl = 'https://api-seller.ozon.ru';`
(constants.dart:4). Это не секрет — тот же адрес указан в официальной
документации Ozon Seller API. Ключи заголовков (`Client-Id`, `Api-Key`,
constants.dart:12-13) — это только НАЗВАНИЯ заголовков, не значения. Реальные
`clientId`/`apiKey` нигде в constants.dart не хранятся — они приходят через
конструктор `ApiClient({required this.clientId, required this.apiKey})`
(api_client.dart:12) и через `StorageService`. Хардкода секретов нет.

## 2. `lib/services/api_client.dart` — TLS-bypass, логирование токенов/тел

**TLS: чисто.** Клиент использует `package:http` без переопределения
`HttpClient`/`SecurityContext` — grep по `badCertificateCallback`,
`allowInvalidCert`, `X509Certificate`, `SecurityContext` по всему `lib/` не
дал ни одного совпадения. Отключения проверки сертификата в коде нет.

**Логирование заголовков: чисто.** Заголовки запроса (`Client-Id`, `Api-Key`,
api_client.dart:20-24) нигде не передаются в логгер — ни в `_sendRequest`, ни
в `_handleHttpError`.

**Риск — логирование тела ответа.** В `_handleHttpError` (api_client.dart:50-65)
для кодов 400/401/403 логируется только статическое сообщение, но в `default`
(любой другой код, включая 404/409/500 и т.д.):
```dart
default:
  _logger.e('Ошибка ${response.statusCode}: ${response.body}');   // api_client.dart:62
  throw Exception('Ошибка ${response.statusCode}: ${response.body}');
```
Полное тело ответа сервера пишется в лог и в текст исключения. Тело ответа
Ozon Seller API может содержать коммерческие данные продавца (остатки,
цены, заказы). Не токен/пароль напрямую, но избыточное логирование бизнес-
данных — тот же класс риска, что и находка ниже по auth_service.dart.

## 3. `lib/services/storage_service.dart` + `lib/services/auth_service.dart` — хранение токенов

**Чисто, подтверждено.** `StorageService` (storage_service.dart:6) использует
`const FlutterSecureStorage()` — зашифрованное платформенное хранилище
(Keychain/iOS, Keystore/Android), НЕ `SharedPreferences` в открытом виде.
`saveAuthData`/`loadAuthData` (storage_service.dart:44-54) читают/пишут
`clientId`/`apiKey` только через `_storage` (secure storage). Это совпадает с
выводом #189/PR CODING#6 («не открытым текстом»). Дополнительно: пакет
`shared_preferences` (`pubspec.yaml:19`) объявлен зависимостью, но нигде в
`lib/` фактически НЕ используется (grep пуст) — то есть на текущий момент
open-text хранения токенов через него нет, но неиспользуемая зависимость
стоит убрать, чтобы не создавать соблазн положить туда что-то чувствительное
позже.

`auth_service.dart` сам токенов не хранит (это делает `StorageService`) — но
см. риск логирования ниже (п.4).

## 4. `lib/utils/logger.dart` — логирование Authorization/паролей/токенов

**Сам `logger.dart` — чисто.** Файл только настраивает два инстанса `Logger`
(консольный pretty-printer и `productionLogger` с уровнем `warning`), никаких
вызовов логирования заголовков/паролей в самом файле нет.

**Риск — в местах вызова (не в logger.dart, но тот же класс проблемы):**
- `auth_service.dart:17` — `logger.i('Authentication successful: $data')`,
  где `data = response.body` (auth_service.dart:16) — полное тело успешного
  ответа API пишется в лог. Подтверждено (это та же находка, что уже отмечена
  в #189/PR CODING#6).
- `api_client.dart:62` (см. п.2) — тело ответа при ошибке.

Заголовок `Authorization`/`Api-Key`/`Client-Id` в лог нигде не попадает —
только ТЕЛО ответа. Пароли в коде отсутствуют (авторизация — по Client-Id +
Api-Key, без пароля/OAuth-потока с паролем).

## 5. `.gitignore` + `TMCManager/.gitignore` — покрытие секретных файлов

**Риск — нет покрытия `.env`/ключей.** Ни корневой `.gitignore`, ни
`TMCManager/.gitignore` не содержат паттернов `*.env`, `.env*`,
`key.properties`, `*.jks`, `*.keystore`, `google-services.json` и т.п.:
- Корневой `.gitignore` (4 строки): `/.vscode`, `architect/dist/`,
  `architect/node_modules`, `node_modules` — про секреты вообще ничего.
- `TMCManager/.gitignore` — стандартный Flutter-шаблон (build/, .dart_tool/,
  .pub-cache/ и т.д.), тоже без `.env`.

Сейчас реального `.env`-файла в `TMCManager/` НЕТ (проверено — не утёк).
Но `pubspec.yaml:15` уже объявляет зависимость `flutter_dotenv: ^5.0.2`,
хотя нигде в `lib/` она не импортируется и не используется (grep пуст) — то
есть инфраструктура под `.env`-конфиг заведена, а обе `.gitignore` её не
прикрывают. Если/когда кто-то добавит `TMCManager/.env` с реальными
`Client-Id`/`Api-Key` для локальной разработки — он попадёт в git по
умолчанию. Это профилактическая находка (пока ничего не утекло), но гэп
реальный и стоит закрыть до того, как `.env` появится.

`TMCManager/.vscode/settings.json` — проверено построчно, единственная
строка: `{"cmake.ignoreCMakeListsMissing": true}` — ничего чувствительного.
`TMCManager/pubspec.lock` — проверено на паттерны `token|secret|password|
api[_-]?key`; все совпадения — это `url: "https://pub.dev"` (стандартные
записи lock-файла), утечки нет.

## 6. `.github/workflows/*.yml` — хардкод токенов в CI

**Чисто.** Прочитаны все 4 workflow-файла:
- `ci.yml` — без секретов вообще, только `npm install`/`playwright`/`npm test`.
- `deploy.yml:39` — `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`, используется
  через переменную окружения в `git push` (deploy.yml:44), значение нигде не
  напечатано в лог явно.
- `feedback-digest.yml:30-31` — `DATABASE_URL`/`GITHUB_TOKEN` через
  `${{ secrets.* }}`.
- `feedback-triage.yml:25-27` — `DATABASE_URL`/`ANTHROPIC_API_KEY` через
  `${{ secrets.* }}`, `TRIAGE_MODEL` через `${{ vars.* }}` (не секрет).

Хардкода значений в yml нет — везде проброс через GitHub Secrets/Vars.
Примечание: все 4 workflow относятся к модулю `architect/` (Node.js), для
Flutter-модуля TMCManager отдельного CI/CD-workflow пока не заведено —
это не риск безопасности, а просто отсутствие покрытия (вне рамок этого
наряда).

## Итог

| # | Пункт | Вердикт |
|---|-------|---------|
| 1 | constants.dart — хардкод секретов | чисто |
| 2 | api_client.dart — TLS-bypass | чисто |
| 2 | api_client.dart — логирование тела ответа при ошибке | риск (api_client.dart:62) |
| 3 | storage_service/auth_service — хранение ключей | чисто (FlutterSecureStorage, подтверждено) |
| 4 | logger.dart — логирование заголовков/паролей в самом файле | чисто |
| 4 | логирование тела успешного ответа | риск (auth_service.dart:17, ранее отмечено в #189) |
| 5 | .gitignore-покрытие .env/ключей | риск (нет паттернов `.env`/keys ни в одном из двух `.gitignore`; факта утечки нет, `flutter_dotenv` объявлен, но не используется) |
| 6 | CI workflows — хардкод креды | чисто |

3 из 6 пунктов — чисто без замечаний, 3 — с конкретными, подтверждёнными
находками (не гипотезами). Находки не блокируют работу модуля (утечки
секретов авторизации не произошло), но требуют отдельного наряда на
исправление: (a) сузить логирование тел ответов в `api_client.dart` и
`auth_service.dart`, (b) добавить `.env`/keys-паттерны в оба `.gitignore` и
убрать неиспользуемые `flutter_dotenv`/`shared_preferences` из
`pubspec.yaml`, либо задействовать их осознанно.
