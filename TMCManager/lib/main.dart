import 'package:flutter/material.dart';
import 'services/storage_service.dart';
import 'views/authorization/auth_screen.dart';
import 'views/dashboard/dashboard_screen.dart';
import 'utils/logger.dart' as log_utils;

void main() {
  runApp(const MyApp());
}

class MyApp extends StatefulWidget {
  const MyApp({super.key});

  @override
  State<MyApp> createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> {
  ThemeMode _themeMode = ThemeMode.system;

  void _toggleTheme() {
    setState(() {
      _themeMode = _themeMode == ThemeMode.light ? ThemeMode.dark : ThemeMode.light;
    });
  }

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
        useMaterial3: true,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF121212),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFFBB86FC),
          secondary: Color(0xFF03DAC6),
          surface: Color(0xFF1E1E1E),
          onSurface: Color(0xFFE0E0E0),
        ),
        cardColor: const Color(0xFF1E1E1E),
        textTheme: const TextTheme(
          bodyLarge: TextStyle(color: Color(0xFFE0E0E0)),
          bodyMedium: TextStyle(color: Color(0xFFCFCFCF)),
        ),
      ),
      themeMode: _themeMode,
      initialRoute: '/',
      routes: {
        '/': (context) => AuthLoader(toggleTheme: _toggleTheme),
        '/auth': (context) => AuthScreen(toggleTheme: _toggleTheme),
        '/dashboard': (context) => DashboardScreen(onLogout: () {
              Navigator.pushReplacementNamed(context, '/auth');
            }, toggleTheme: _toggleTheme),
      },
    );
  }
}

class AuthLoader extends StatefulWidget {
  final VoidCallback toggleTheme;

  const AuthLoader({super.key, required this.toggleTheme});

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
        log_utils.logger.i('Автоматическая авторизация успешна: ClientId найден.');
        if (mounted) {
          Navigator.pushReplacementNamed(context, '/dashboard');
        }
      } else {
        log_utils.logger.w('Данные авторизации отсутствуют.');
        if (mounted) {
          Navigator.pushReplacementNamed(context, '/auth');
        }
      }
    } catch (e) {
      log_utils.logger.e('Ошибка загрузки данных авторизации: $e');
      if (mounted) {
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
