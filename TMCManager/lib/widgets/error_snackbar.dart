import 'package:flutter/material.dart';

void showErrorSnackBar(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(
        message,
        style: const TextStyle(
          color: Colors.black, // Чёрный текст для нейтрального отображения
          fontWeight: FontWeight.w400,
        ),
        textAlign: TextAlign.center,
      ),
      backgroundColor: Colors.grey.shade300, // Нейтральный серый фон
      behavior: SnackBarBehavior.floating, // "Всплывающее" поведение
      margin: const EdgeInsets.symmetric(
        horizontal: 16,
        vertical: 12,
      ), // Отступы
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8), // Закруглённые углы
      ),
      elevation: 0, // Без тени для минимализма
    ),
  );
}
