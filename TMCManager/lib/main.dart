import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'services/product_service.dart';
import 'views/authorization/auth_screen.dart';
import 'views/dashboard/dashboard_screen.dart';

void main() {
  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => ProductService()),
      ],
      child: const MyApp(),
    ),
  );
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
      theme: ThemeData(primarySwatch: Colors.blue),
      darkTheme: ThemeData(brightness: Brightness.dark),
      themeMode: _themeMode,
      initialRoute: '/auth',
      routes: {
        '/auth': (context) => AuthScreen(toggleTheme: _toggleTheme),
        '/dashboard': (context) => DashboardScreen(
              onLogout: () {
                Navigator.pushReplacementNamed(context, '/auth');
              },
              toggleTheme: _toggleTheme,
            ),
      },
    );
  }
}
