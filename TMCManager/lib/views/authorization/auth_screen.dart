import 'package:flutter/material.dart';
import '../../services/storage_service.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key, required this.toggleTheme});

  final void Function() toggleTheme;

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final TextEditingController _clientIdController = TextEditingController();
  final TextEditingController _apiKeyController = TextEditingController();
  final StorageService _storageService = StorageService();
  List<Map<String, String>> _profiles = [];
  String? _selectedProfile;
  String _errorMessage = '';
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _loadProfiles();
  }

  Future<void> _loadProfiles() async {
    try {
      final profiles = await _storageService.loadProfiles();
      if (mounted) {
        setState(() {
          _profiles = profiles;
          if (profiles.isNotEmpty) {
            _selectedProfile = profiles.first['name'];
            _clientIdController.text = profiles.first['clientId']!;
            _apiKeyController.text = profiles.first['apiKey']!;
          }
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = 'Ошибка загрузки профилей: $e';
        });
      }
    }
  }

  Future<void> _saveProfile(String name, String clientId, String apiKey) async {
    final newProfile = {'name': name, 'clientId': clientId, 'apiKey': apiKey};
    try {
      await _storageService.saveProfile(newProfile);
      await _loadProfiles();
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = 'Ошибка сохранения профиля: $e';
        });
      }
    }
  }

  Future<void> _deleteProfile(String name) async {
    try {
      await _storageService.deleteProfile(name);
      await _loadProfiles();
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = 'Ошибка удаления профиля: $e';
        });
      }
    }
  }

  void _authenticate() async {
    setState(() {
      _isLoading = true;
      _errorMessage = '';
    });

    try {
      // Симуляция авторизации
      await Future.delayed(const Duration(seconds: 2));

      if (mounted) {
        setState(() {
          _isLoading = false;
        });
        Navigator.pushReplacementNamed(context, '/dashboard');
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = 'Ошибка авторизации: $e';
        });
      }
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
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            DropdownButton<String>(
              value: _selectedProfile,
              hint: const Text('Выберите профиль'),
              isExpanded: true,
              items: _profiles.map((profile) {
                return DropdownMenuItem<String>(
                  value: profile['name'],
                  child: Text(profile['name']!),
                );
              }).toList(),
              onChanged: (value) {
                setState(() {
                  _selectedProfile = value;
                  final profile =
                      _profiles.firstWhere((p) => p['name'] == value);
                  _clientIdController.text = profile['clientId']!;
                  _apiKeyController.text = profile['apiKey']!;
                });
              },
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
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                ElevatedButton(
                  onPressed: () async {
                    const name = 'Новый профиль'; // Укажите имя профиля
                    await _saveProfile(
                        name, _clientIdController.text, _apiKeyController.text);
                  },
                  child: const Text('Добавить профиль'),
                ),
                ElevatedButton(
                  onPressed: () async {
                    if (_selectedProfile != null) {
                      await _deleteProfile(_selectedProfile!);
                    }
                  },
                  child: const Text('Удалить профиль'),
                ),
              ],
            ),
            if (_errorMessage.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 16.0),
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
