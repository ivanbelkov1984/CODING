import 'package:flutter/material.dart';
import 'package:logger/logger.dart';
import '../../services/api_client.dart';
import '../../services/auth_service.dart';
import '../../services/storage_service.dart';
import 'auth_view_model.dart';

final logger = Logger();

class AuthScreen extends StatefulWidget {
  final VoidCallback toggleTheme;

  const AuthScreen({super.key, required this.toggleTheme});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final TextEditingController _clientIdController = TextEditingController();
  final TextEditingController _apiKeyController = TextEditingController();
  late final AuthViewModel _authViewModel;
  bool _isLoading = false;
  String _errorMessage = '';

  @override
  void initState() {
    super.initState();
    final authService = AuthService(
      apiClient: ApiClient(clientId: '', apiKey: ''),
    );
    final storageService = StorageService();
    _authViewModel = AuthViewModel(
      authService: authService,
      storageService: storageService,
    );
    _loadAuthData();
  }

  Future<void> _loadAuthData() async {
    try {
      final authData = await _authViewModel.loadAuthData();
      setState(() {
        _clientIdController.text = authData['clientId'] ?? '';
        _apiKeyController.text = authData['apiKey'] ?? '';
      });
    } catch (e) {
      setState(() {
        _errorMessage = 'Ошибка загрузки данных: $e';
      });
      logger.w('Данные авторизации отсутствуют, переход на /auth');
    }
  }

  Future<void> _authenticate() async {
    setState(() {
      _isLoading = true;
      _errorMessage = '';
    });

    try {
      final clientId = _clientIdController.text.trim();
      final apiKey = _apiKeyController.text.trim();
      final authService = AuthService(
        apiClient: ApiClient(clientId: clientId, apiKey: apiKey),
      );
      _authViewModel.authService = authService;

      final isSuccess = await _authViewModel.authenticate(clientId, apiKey);
      if (isSuccess) {
        if (mounted) {
          logger.i('Переход на экран: /dashboard');
          Navigator.pushReplacementNamed(context, '/dashboard');
        }
      } else {
        setState(() {
          _errorMessage = 'Авторизация не удалась.';
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = e.toString();
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Авторизация'),
        actions: [
          IconButton(
            icon: const Icon(Icons.brightness_6),
            onPressed: widget.toggleTheme,
            tooltip: 'Переключить тему',
          ),
        ],
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
