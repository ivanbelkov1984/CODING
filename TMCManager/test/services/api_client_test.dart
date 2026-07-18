import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:tmc_manager/services/api_client.dart';

/// Тестовый двойник [ApiClient].
///
/// Меняем ТОЛЬКО [baseUrl] (переопределяя геттер, сгенерированный из
/// `final String baseUrl = 'https://api-seller.ozon.ru'` в боевом классе —
/// это легальный override в Dart), чтобы направить реальные HTTP-запросы на
/// локальный сервер вместо продового Ozon API. Вся остальная логика —
/// `_sendRequest`/`_handleHttpError`/`get`/`post` — выполняется НАСТОЯЩАЯ,
/// без единого мока: тест реально ходит по HTTP на localhost.
class _LocalApiClient extends ApiClient {
  _LocalApiClient(
    this._localBaseUrl, {
    required super.clientId,
    required super.apiKey,
  });

  final String _localBaseUrl;

  @override
  String get baseUrl => _localBaseUrl;
}

typedef _Handler = Future<void> Function(HttpRequest request);

void main() {
  late HttpServer server;
  late String baseUrl;
  _Handler? handler;

  setUp(() async {
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    baseUrl = 'http://${server.address.address}:${server.port}';
    handler = null;
    server.listen((request) async {
      final h = handler;
      if (h == null) {
        request.response.statusCode = 500;
        await request.response.close();
        return;
      }
      await h(request);
    });
  });

  tearDown(() async {
    await server.close(force: true);
  });

  Future<String> readBody(HttpRequest request) =>
      utf8.decoder.bind(request).join();

  ApiClient client({String clientId = 'client-1', String apiKey = 'key-1'}) =>
      _LocalApiClient(baseUrl, clientId: clientId, apiKey: apiKey);

  group('ApiClient.post — коды HTTP-ответа', () {
    test('200: возвращает http.Response как есть, исключений нет', () async {
      handler = (request) async {
        await readBody(request);
        request.response
          ..statusCode = 200
          ..headers.contentType = ContentType.json
          ..write('{"ok": true}');
        await request.response.close();
      };

      final response = await client().post('/v2/product/info', {});

      expect(response.statusCode, 200);
      expect(response.body, '{"ok": true}');
    });

    test('401: бросает Exception с сообщением, упоминающим 401', () async {
      handler = (request) async {
        request.response
          ..statusCode = 401
          ..write('unauthorized');
        await request.response.close();
      };

      expect(
        () => client().post('/v2/product/info', {}),
        throwsA(
          isA<Exception>().having(
            (e) => e.toString(),
            'message',
            contains('401'),
          ),
        ),
      );
    });

    test(
      '500: бросает Exception, код и тело ошибки не проглатываются',
      () async {
        handler = (request) async {
          request.response
            ..statusCode = 500
            ..write('boom');
          await request.response.close();
        };

        expect(
          () => client().post('/v2/product/info', {}),
          throwsA(
            isA<Exception>().having(
              (e) => e.toString(),
              'message',
              contains('500'),
            ),
          ),
        );
      },
    );

    test('невалидный JSON в теле 200-ответа: ApiClient сам JSON не парсит — '
        'отдаёт сырой body без исключений (парсинг — забота вызывающего кода, '
        'см. product_service_test.dart)', () async {
      handler = (request) async {
        request.response
          ..statusCode = 200
          ..write('{not valid json,,,');
        await request.response.close();
      };

      final response = await client().post('/v2/product/info', {});

      expect(response.statusCode, 200);
      expect(response.body, '{not valid json,,,');
      expect(() => jsonDecode(response.body), throwsFormatException);
    });

    test(
      'юникод (кириллица + эмодзи) в теле запроса и ответа не искажается',
      () async {
        const requestUnicode = 'Товар «Ключ 🔑» — тест юникода 🚀';
        String? receivedBody;
        handler = (request) async {
          receivedBody = await readBody(request);
          request.response
            ..statusCode = 200
            ..headers.contentType = ContentType(
              'application',
              'json',
              charset: 'utf-8',
            )
            ..write(jsonEncode({'echo': 'Ответ на 🔑 — готово ✅'}));
          await request.response.close();
        };

        final response = await client().post('/v2/product/info', {
          'name': requestUnicode,
        });

        expect(receivedBody, contains(requestUnicode));
        expect(jsonDecode(response.body)['echo'], 'Ответ на 🔑 — готово ✅');
      },
    );
  });

  group('ApiClient.get', () {
    test('200: успешный GET возвращает тело ответа без изменений', () async {
      handler = (request) async {
        request.response
          ..statusCode = 200
          ..write('pong');
        await request.response.close();
      };

      final response = await client().get('/ping');

      expect(response.statusCode, 200);
      expect(response.body, 'pong');
    });
  });

  group('ApiClient — adversarial значения в заголовках авторизации', () {
    test('SQL-подобный Client-Id уходит как обычная строка в заголовке, '
        'клиент не падает и не пытается её интерпретировать', () async {
      const sqlLike = "' OR '1'='1'; DROP TABLE users;--";
      String? receivedClientId;
      handler = (request) async {
        receivedClientId = request.headers.value('client-id');
        request.response
          ..statusCode = 200
          ..write('ok');
        await request.response.close();
      };

      final response = await client(
        clientId: sqlLike,
      ).post('/v2/product/info', {});

      expect(response.statusCode, 200);
      expect(receivedClientId, sqlLike);
    });

    test('огромный Api-Key (100 000 символов) не роняет клиент', () async {
      final hugeKey = List.filled(100000, 'k').join();
      int? receivedLength;
      handler = (request) async {
        receivedLength = request.headers.value('api-key')?.length;
        request.response
          ..statusCode = 200
          ..write('ok');
        await request.response.close();
      };

      final response = await client(
        apiKey: hugeKey,
      ).post('/v2/product/info', {});

      expect(response.statusCode, 200);
      expect(receivedLength, hugeKey.length);
    });
  });
}
