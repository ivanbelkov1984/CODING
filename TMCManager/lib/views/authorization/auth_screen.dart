import 'package:flutter/material.dart';
import 'auth_view_model.dart';
import '../../services/api_client.dart';
import '../../services/auth_service.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _clientIdController = TextEditingController();
  final _apiKeyController = TextEditingController();
  bool _isLoading = false;
  String _errorMessage = '';

  void _authenticate() async {
    setState(() {
      _isLoading = true;
      _errorMessage = '';
    });

    final apiClient = ApiClient(
      clientId: _clientIdController.text,
      apiKey: _apiKeyController.text,
    );
    final authService = AuthService(apiClient: apiClient);
    final authViewModel = AuthViewModel(authService: authService);

    final isSuccess = await authViewModel.authenticate();

    setState(() {
      _isLoading = false;
      if (!isSuccess) {
        _errorMessage =
            'Авторизация не удалась. Проверьте Client ID, API Key и доступы к API.';
      } else {
        // Переход к следующему экрану
        Navigator.pushReplacementNamed(context, '/dashboard');
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Авторизация'),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            TextField(
              controller: _clientIdController,
              decoration: const InputDecoration(
                labelText: 'Client ID',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _apiKeyController,
              decoration: const InputDecoration(
                labelText: 'API Key',
                border: OutlineInputBorder(),
              ),
              obscureText: true,
            ),
            const SizedBox(height: 24),
            if (_isLoading)
              const CircularProgressIndicator()
            else
              ElevatedButton(
                onPressed: _authenticate,
                child: const Text('Войти'),
              ),
            if (_errorMessage.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 16),
                child: Text(
                  _errorMessage,
                  style: const TextStyle(color: Colors.red),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
