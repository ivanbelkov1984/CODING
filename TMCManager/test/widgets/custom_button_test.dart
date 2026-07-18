import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tmc_manager/widgets/custom_button.dart';

void main() {
  Widget wrap(Widget child) => MaterialApp(home: Scaffold(body: child));

  testWidgets('рендерит переданный текст, без спиннера в обычном состоянии', (
    tester,
  ) async {
    await tester.pumpWidget(
      wrap(CustomButton(text: 'Сохранить', onPressed: () {})),
    );

    expect(find.text('Сохранить'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
  });

  testWidgets('tap по кнопке вызывает onPressed ровно один раз', (
    tester,
  ) async {
    var tapCount = 0;
    await tester.pumpWidget(
      wrap(CustomButton(text: 'Ок', onPressed: () => tapCount++)),
    );

    await tester.tap(find.byType(ElevatedButton));
    await tester.pump();

    expect(tapCount, 1);
  });

  testWidgets('isLoading=true: кнопка disabled (onPressed==null), показывает '
      'спиннер вместо текста, tap не вызывает callback', (tester) async {
    var tapCount = 0;
    await tester.pumpWidget(
      wrap(
        CustomButton(
          text: 'Сохранить',
          isLoading: true,
          onPressed: () => tapCount++,
        ),
      ),
    );

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.text('Сохранить'), findsNothing);

    final button = tester.widget<ElevatedButton>(find.byType(ElevatedButton));
    expect(button.onPressed, isNull);

    await tester.tap(find.byType(ElevatedButton), warnIfMissed: false);
    await tester.pump();

    expect(tapCount, 0);
  });

  testWidgets('isLoading=false (по умолчанию): кнопка активна', (tester) async {
    await tester.pumpWidget(wrap(CustomButton(text: 'Ок', onPressed: () {})));

    final button = tester.widget<ElevatedButton>(find.byType(ElevatedButton));
    expect(button.onPressed, isNotNull);
  });
}
