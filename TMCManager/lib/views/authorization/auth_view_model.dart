import '../../services/auth_service.dart';
import '../../services/storage_service.dart';

class AuthViewModel {
  AuthService authService;
  final StorageService storageService;

  AuthViewModel({required this.authService, required this.storageService});

  Future<bool> authenticate(String clientId, String apiKey) async {
    try {
      final isAuthenticated = await authService.authenticate();
      if (isAuthenticated) {
        await storageService.saveAuthData(clientId, apiKey);
      }
      return isAuthenticated;
    } catch (e) {
      throw Exception('Authentication failed: $e');
    }
  }

  Future<Map<String, String>> loadAuthData() async {
    return await storageService.loadAuthData();
  }
}
