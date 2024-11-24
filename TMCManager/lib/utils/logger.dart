// lib/utils/logger.dart

import 'package:logger/logger.dart';

// Настройка логгера для приложения
final Logger logger = Logger(
  printer: PrettyPrinter(
    methodCount: 2, // Количество строк стека вызовов
    errorMethodCount: 8, // Количество строк стека вызовов для ошибок
    lineLength: 80, // Максимальная длина строки в логах
    colors: true, // Использовать цвета
    printEmojis: true, // Показывать эмодзи
    printTime: true, // Показывать время в логах
  ),
);

// Логгер для продакшн-окружения
final Logger productionLogger = Logger(
  level: Level.warning, // Логировать только предупреждения и ошибки
  printer: SimplePrinter(printTime: true), // Простая печать логов с временем
);
