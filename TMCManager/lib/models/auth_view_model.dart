import 'package:tmc_manager/utils/logger.dart';
import '../services/storage_service.dart';

class AuthViewModel {
  final StorageService storageService;

  AuthViewModel(this.storageService);

  Future<void> saveAuthData(String clientId, String apiKey) async {
    try {
      // Сохранение данных авторизации
      await storageService.saveAuthData(clientId, apiKey);
      logger.i('Auth data saved successfully');
    } catch (e) {
      logger.e('Failed to save auth data', e);
    }
  }

  Future<void> clearAuthData() async {
    try {
      // Убедитесь, что метод clearAuthData существует в StorageService
      await storageService.clearData(); // Исправлено название метода
      logger.i('Auth data cleared successfully');
    } catch (e) {
      logger.e('Failed to clear auth data', e);
    }
  }

  Future<void> authenticate(String clientId, String apiKey) async {
    try {
      if (clientId.isEmpty || apiKey.isEmpty) {
        throw Exception('Client ID or API Key cannot be empty');
      }
      await saveAuthData(clientId, apiKey);
      logger.i('Authentication successful');
    } catch (e) {
      logger.e('Authentication failed', e);
    }
  }
}
