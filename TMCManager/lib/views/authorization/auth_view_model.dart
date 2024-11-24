import '../../services/auth_service.dart';

class AuthViewModel {
  final AuthService authService;

  AuthViewModel({required this.authService});

  Future<bool> authenticate() async {
    return await authService.authenticate();
  }
}
