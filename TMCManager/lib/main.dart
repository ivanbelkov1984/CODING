import 'package:flutter/material.dart';
import 'services/storage_service.dart';
import 'views/authorization/auth_screen.dart';
import 'views/dashboard/dashboard_screen.dart';
import 'utils/logger.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'TMCManager',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        primarySwatch: Colors.blue,
        useMaterial3: true,
        brightness: Brightness.light,
      ),
      darkTheme: ThemeData(
        primarySwatch: Colors.blue,
        useMaterial3: true,
        brightness: Brightness.dark,
      ),
      themeMode: ThemeMode.system, // Поддержка светлой и темной тем
      initialRoute: '/',
      routes: {
        '/': (context) => const AuthLoader(),
        '/auth': (context) => AuthScreen(toggleTheme: () {
              // Add your theme toggling logic here
            }),
        '/dashboard': (context) => const DashboardScreen(),
      },
    );
  }
}

class AuthLoader extends StatefulWidget {
  const AuthLoader({super.key});

  @override
  State<AuthLoader> createState() => _AuthLoaderState();
}

class _AuthLoaderState extends State<AuthLoader> {
  final StorageService _storageService = StorageService();

  @override
  void initState() {
    super.initState();
    _checkAuthStatus();
  }

  Future<void> _checkAuthStatus() async {
    try {
      final authData = await _storageService.loadAuthData();
      final clientId = authData['clientId'];
      final apiKey = authData['apiKey'];

      if (clientId != null && apiKey != null) {
        logger.i('Автоматическая авторизация успешна: ClientId найден.');
        if (mounted) {
          // Проверяем, существует ли еще контекст
          Navigator.pushReplacementNamed(context, '/dashboard');
        }
      } else {
        logger.w('Данные авторизации отсутствуют.');
        if (mounted) {
          // Проверяем, существует ли еще контекст
          Navigator.pushReplacementNamed(context, '/auth');
        }
      }
    } catch (e) {
      logger.e('Ошибка загрузки данных авторизации: $e');
      if (mounted) {
        // Проверяем, существует ли еще контекст
        Navigator.pushReplacementNamed(context, '/auth');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: CircularProgressIndicator(),
      ),
    );
  }
}
