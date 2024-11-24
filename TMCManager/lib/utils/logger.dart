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
    dateTimeFormat: DateTimeFormat.onlyTimeAndSinceStart, // Показывать время в логах
  ),
);

// Логгер для продакшн-окружения
final Logger productionLogger = Logger(
  level: Level.warning, // Логировать только предупреждения и ошибки
  printer: SimplePrinter(), // Простая печать логов
);
