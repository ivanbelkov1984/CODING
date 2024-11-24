import 'package:tmc_manager/utils/logger.dart';
import '../services/storage_service.dart';

class AuthViewModel {
  final StorageService storageService;

  AuthViewModel(this.storageService);

  /// Сохраняет данные авторизации
  Future<void> saveAuthData(String clientId, String apiKey) async {
    try {
      await storageService.saveAuthData(clientId, apiKey);
      logger.i('Auth data saved successfully');
    } catch (e) {
      logger.e('Failed to save auth data', error: e);
    }
  }

  /// Очищает данные авторизации
  Future<void> clearAuthData() async {
    try {
      await storageService.clearData();
      logger.i('Auth data cleared successfully');
    } catch (e) {
      logger.e('Failed to clear auth data', error: e);
    }
  }

  /// Выполняет авторизацию
  Future<void> authenticate(String clientId, String apiKey) async {
    try {
      if (clientId.isEmpty || apiKey.isEmpty) {
        throw Exception('Client ID or API Key cannot be empty');
      }
      await saveAuthData(clientId, apiKey);
      logger.i('Authentication successful');
    } catch (e) {
      logger.e('Authentication failed', error: e);
    }
  }
}
