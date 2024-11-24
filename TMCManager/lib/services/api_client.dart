import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:logger/logger.dart';

class ApiClient {
  final String clientId;
  final String apiKey;
  final String baseUrl = 'https://api-seller.ozon.ru';

  final Logger _logger = Logger(); // Инициализация логгера

  ApiClient({required this.clientId, required this.apiKey});

  // Универсальный метод для отправки запросов
  Future<http.Response> _sendRequest(
      String method, String endpoint, [Map<String, dynamic>? body]) async {
    final url = Uri.parse('$baseUrl$endpoint');

    try {
      final headers = {
        'Client-Id': clientId,
        'Api-Key': apiKey,
        'Content-Type': 'application/json',
      };

      http.Response response;

      if (method == 'GET') {
        response = await http.get(url, headers: headers);
      } else if (method == 'POST') {
        response = await http.post(url, headers: headers, body: jsonEncode(body));
      } else {
        throw Exception('Unsupported HTTP method: $method');
      }

      // Проверка кода ответа
      if (response.statusCode >= 200 && response.statusCode < 300) {
        return response;
      } else {
        _handleHttpError(response);
        return response; // Это добавлено для строгого контроля исключений.
      }
    } catch (error) {
      _logger.e('API Error', error); // Используем логгер для ошибок
      rethrow;
    }
  }

  // Обработка ошибок
  void _handleHttpError(http.Response response) {
    switch (response.statusCode) {
      case 400:
        _logger.w('Ошибка 400: Неверный запрос. Проверьте параметры или тело запроса.');
        throw Exception('Ошибка 400: Неверный запрос. Проверьте параметры или тело запроса.');
      case 401:
        _logger.w('Ошибка 401: Неверные ключи авторизации.');
        throw Exception('Ошибка 401: Неверные ключи авторизации.');
      case 403:
        _logger.w('Ошибка 403: Доступ запрещен. Проверьте права доступа.');
        throw Exception('Ошибка 403: Доступ запрещен. Проверьте права доступа.');
      default:
        _logger.e('Ошибка ${response.statusCode}: ${response.body}');
        throw Exception('Ошибка ${response.statusCode}: ${response.body}');
    }
  }

  // GET-запрос
  Future<http.Response> get(String endpoint) async {
    return _sendRequest('GET', endpoint);
  }

  // POST-запрос
  Future<http.Response> post(String endpoint, Map<String, dynamic> body) async {
    return _sendRequest('POST', endpoint, body);
  }
}
