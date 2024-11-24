// lib/utils/constants.dart

// Базовый URL для API Ozon Seller
const String baseUrl = 'https://api-seller.ozon.ru';

// Заголовки для запросов
const Map<String, String> defaultHeaders = {
  'Content-Type': 'application/json',
};

// Константы для авторизации
const String clientIdKey = 'Client-Id'; // Ключ заголовка для Client ID
const String apiKeyKey = 'Api-Key'; // Ключ заголовка для API Key

// Тайм-аут для HTTP-запросов (в миллисекундах)
const Duration requestTimeout = Duration(seconds: 10);

// Маршруты API
const String warehouseListEndpoint = '/v1/warehouse/list';
const String descriptionCategoryTreeEndpoint = '/v1/description-category/tree';
const String productImportEndpoint = '/v1/product/import';

// Общие сообщения
const String errorMessageNetwork = 'Ошибка сети. Проверьте подключение.';
const String errorMessageUnauthorized = 'Неверные Client ID или API Key.';
const String errorMessageForbidden = 'Доступ запрещён. Проверьте права.';
const String errorMessageServer = 'Ошибка сервера. Повторите попытку позже.';
const String errorMessageUnexpected = 'Неизвестная ошибка. Попробуйте снова.';
