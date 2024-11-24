import 'package:logger/logger.dart';
import 'api_client.dart';

class AuthService {
  final ApiClient apiClient;
  final Logger logger = Logger(); // Инициализация логгера

  AuthService({required this.apiClient});

  Future<bool> authenticate() async {
    try {
      final response = await apiClient.post('/v4/product/info/limit', {});

      // Обработка успешного ответа
      if (response.statusCode == 200) {
        final data = response.body;
        logger.i('Authentication successful: $data'); // Лог успешного ответа
        return true;
      }

      // Обработка ошибок HTTP
      switch (response.statusCode) {
        case 400:
          throw Exception('Bad Request: Проверьте корректность тела запроса.');
        case 401:
          throw Exception('Unauthorized: Неверные Client-Id или Api-Key.');
        case 403:
          throw Exception('Forbidden: У пользователя нет доступа к методу.');
        case 404:
          throw Exception('Not Found: Метод не найден.');
        case 409:
          throw Exception('Conflict: Конфликт данных.');
        case 500:
          throw Exception('Internal Server Error: Ошибка на стороне сервера.');
        default:
          throw Exception(
              'Unexpected Error: Код ошибки ${response.statusCode}.');
      }
    } catch (error) {
      // Логирование ошибки
      logger.e('Authentication Error', error);
      return false;
    }
  }
}
