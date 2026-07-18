import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tmc_manager/widgets/error_snackbar.dart';

void main() {
  testWidgets('показывает SnackBar с переданным сообщением по вызову',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (context) => ElevatedButton(
            onPressed: () => showErrorSnackBar(context, 'Ошибка сети 🔌'),
            child: const Text('trigger'),
          ),
        ),
      ),
    ));

    expect(find.byType(SnackBar), findsNothing);

    await tester.tap(find.text('trigger'));
    await tester.pump(); // старт анимации показа SnackBar

    expect(find.byType(SnackBar), findsOneWidget);
    expect(find.text('Ошибка сети 🔌'), findsOneWidget);
  });

  testWidgets('SnackBar использует нейтральный стиль (floating, без тени)',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (context) => ElevatedButton(
            onPressed: () => showErrorSnackBar(context, 'Стилевая проверка'),
            child: const Text('trigger'),
          ),
        ),
      ),
    ));

    await tester.tap(find.text('trigger'));
    await tester.pump();

    final snackBar = tester.widget<SnackBar>(find.byType(SnackBar));
    expect(snackBar.behavior, SnackBarBehavior.floating);
    expect(snackBar.elevation, 0);
    expect(snackBar.backgroundColor, Colors.grey.shade300);
  });

  testWidgets('пустое сообщение тоже рендерится без исключений (edge case)',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (context) => ElevatedButton(
            onPressed: () => showErrorSnackBar(context, ''),
            child: const Text('trigger'),
          ),
        ),
      ),
    ));

    await tester.tap(find.text('trigger'));
    await tester.pump();

    expect(find.byType(SnackBar), findsOneWidget);
  });
}
