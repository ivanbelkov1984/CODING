import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:tmc_manager/services/api_client.dart';
import 'package:tmc_manager/services/auth_service.dart';

/// Тестовый двойник ApiClient для AuthService.
///
/// `get`/`post` в боевом ApiClient — public и не final, поэтому override в
/// подклассе легален. Сама AuthService не меняется и не мокается — тестируем
/// её реальный код, подменяя только транспорт.
class _FakeApiClient extends ApiClient {
  _FakeApiClient(
    this._respond, {
    super.clientId = 'test-client',
    super.apiKey = 'test-key',
  });

  final FutureOr<http.Response> Function(
    String endpoint,
    Map<String, dynamic> body,
  )
  _respond;

  @override
  Future<http.Response> post(String endpoint, Map<String, dynamic> body) =>
      Future.sync(() => _respond(endpoint, body));

  @override
  Future<http.Response> get(String endpoint) =>
      Future.sync(() => _respond(endpoint, const {}));
}

void main() {
  // ПРИМЕЧАНИЕ О РЕАЛЬНОЙ СИГНАТУРЕ (важное отклонение от ТЗ наряда #188):
  // AuthService.authenticate() НЕ принимает login/password — это
  // единственный публичный метод, без аргументов, он всегда бьёт в
  // фиксированный эндпоинт '/v4/product/info/limit'. Учётные данные
  // (clientId/apiKey) передаются не в authenticate(), а заранее — в
  // конструктор ApiClient, который приходит в AuthService через DI.
  // Поэтому сценарии "успех / неверный пароль / пустой логин / таймаут"
  // адаптированы под реальную сигнатуру: "неверный пароль" → сервер вернул
  // 401 на текущих ключах; "пустой логин" протестирован отдельно в
  // test/models/auth_view_model_test.dart, где такая проверка РЕАЛЬНО
  // существует в коде (AuthViewModel.authenticate из lib/models/).
  //
  // ДОПОЛНИТЕЛЬНАЯ НАХОДКА: реальный экран входа (AuthScreen._authenticate в
  // lib/views/authorization/auth_screen.dart) не вызывает ни AuthService, ни
  // AuthViewModel вообще — это заглушка с Future.delayed(2 секунды), которая
  // ВСЕГДА считается успешной независимо от введённых данных. То есть на
  // проде сейчас нет реальной проверки логина/пароля на экране входа. Тесты
  // ниже покрывают AuthService, который для этого предназначен, но пока не
  // подключён к UI — задокументировано отдельно в PR/issue.

  group('AuthService.authenticate() — коды ответа сервера', () {
    test('успех: сервер вернул 200 → authenticate() возвращает true', () async {
      final apiClient = _FakeApiClient((endpoint, body) {
        expect(endpoint, '/v4/product/info/limit');
        return http.Response('{"ok": true}', 200);
      });
      final auth = AuthService(apiClient: apiClient);

      expect(await auth.authenticate(), isTrue);
    });

    test('"неверный пароль" (реальный эквивалент — сервер вернул 401 на '
        'текущих ключах): authenticate() возвращает false, а не бросает '
        'исключение наружу', () async {
      final apiClient = _FakeApiClient(
        (endpoint, body) => http.Response('unauthorized', 401),
      );
      final auth = AuthService(apiClient: apiClient);

      expect(await auth.authenticate(), isFalse);
    });

    test('500 (Internal Server Error) перехвачен → возвращает false', () async {
      final apiClient = _FakeApiClient(
        (endpoint, body) => http.Response('boom', 500),
      );
      final auth = AuthService(apiClient: apiClient);

      expect(await auth.authenticate(), isFalse);
    });

    test('таймаут/обрыв сети: если транспорт бросает исключение (например, '
        'TimeoutException — так ведёт себя http-клиент при недоступности '
        'сети), authenticate() ловит его и возвращает false, не роняя '
        'приложение. ВАЖНО: в самом ApiClient/AuthService нет ни одного '
        'явного .timeout(...) — константа requestTimeout в '
        'lib/utils/constants.dart объявлена, но нигде не используется. Это '
        'значит, что при реальном "зависшем" соединении (сервер принял '
        'коннект, но не отвечает) приложение будет ждать неограниченно долго '
        '— отдельная находка для директора.', () async {
      final apiClient = _FakeApiClient((endpoint, body) {
        throw TimeoutException('network timeout');
      });
      final auth = AuthService(apiClient: apiClient);

      expect(await auth.authenticate(), isFalse);
    });
  });

  group('Adversarial — что может сломать авторизацию', () {
    test('огромный Api-Key (100 000 символов) не мешает AuthService нормально '
        'завершить работу', () async {
      final hugeKey = List.filled(100000, 'x').join();
      final apiClient = _FakeApiClient(
        (endpoint, body) => http.Response('{}', 200),
        apiKey: hugeKey,
      );
      final auth = AuthService(apiClient: apiClient);

      expect(auth.apiClient.apiKey.length, 100000);
      expect(await auth.authenticate(), isTrue);
    });

    test('SQL-подобный Client-Id не вызывает исключений при конструировании '
        'ApiClient/AuthService — значение хранится как обычная строка, без '
        'какой-либо интерполяции/валидации на этом уровне', () {
      const sqlLike = "' OR '1'='1'; DROP TABLE users;--";
      final apiClient = _FakeApiClient(
        (endpoint, body) => http.Response('{}', 200),
        clientId: sqlLike,
      );

      expect(apiClient.clientId, sqlLike);
    });

    test('отсутствующий ожидаемый ключ в теле ответа (пустой объект "{}" без '
        '"ok"/"data"/чего угодно) не роняет authenticate() — тело ответа '
        'вообще не парсится и не проверяется на структуру, проверяется '
        'только HTTP statusCode. Это тоже находка: если контракт ответа '
        'API поменяется, AuthService этого не заметит.', () async {
      final apiClient = _FakeApiClient(
        (endpoint, body) => http.Response('{}', 200),
      );
      final auth = AuthService(apiClient: apiClient);

      expect(await auth.authenticate(), isTrue);
    });
  });
}
