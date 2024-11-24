import 'package:flutter/material.dart';
import '../../services/api_client.dart';
import '../../services/auth_service.dart';

class AuthView extends StatefulWidget {
  const AuthView({super.key});

  @override
  State<AuthView> createState() => _AuthViewState();
}

class _AuthViewState extends State<AuthView> {
  final _clientIdController = TextEditingController();
  final _apiKeyController = TextEditingController();
  bool _isLoading = false;
  String _errorMessage = '';

  void _authenticate() async {
    setState(() {
      _isLoading = true;
      _errorMessage = '';
    });

    final clientId = _clientIdController.text.trim();
    final apiKey = _apiKeyController.text.trim();

    if (clientId.isEmpty || apiKey.isEmpty) {
      setState(() {
        _isLoading = false;
        _errorMessage = 'Client ID и API Key не могут быть пустыми.';
      });
      return;
    }

    final apiClient = ApiClient(clientId: clientId, apiKey: apiKey);
    final authService = AuthService(apiClient: apiClient);

    final isSuccess = await authService.authenticate();

    setState(() {
      _isLoading = false;
      if (isSuccess) {
        Navigator.pushReplacementNamed(context, '/dashboard');
      } else {
        _errorMessage = 'Ошибка авторизации. Проверьте данные и повторите попытку.';
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Авторизация'),
        centerTitle: true,
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text(
              'Введите данные для подключения к Ozon API',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w500),
            ),
            const SizedBox(height: 16),
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
                padding: const EdgeInsets.only(top: 16.0),
                child: Text(
                  _errorMessage,
                  style: const TextStyle(color: Colors.red),
                  textAlign: TextAlign.center,
                ),
              ),
          ],
        ),
      ),
    );
  }
}
