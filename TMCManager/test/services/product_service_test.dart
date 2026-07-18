import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:tmc_manager/models/product_model.dart';
import 'package:tmc_manager/services/product_service.dart';

// ВАЖНАЯ НАХОДКА (честно, не проходной комментарий): ProductService
// объявляет свой ApiClient как приватное поле с фиксированной
// инициализацией прямо в классе —
//
//   final ApiClient _apiClient = ApiClient(clientId: 'yourClientId', ...);
//
// без единого конструкторного параметра. Внедрить тестовый двойник ApiClient
// в ProductService НЕВОЗМОЖНО без изменения lib/ (наряд #188 разрешает
// трогать только test/). Поэтому fetchProducts()/fetchAnalytics() напрямую
// unit-тестами не покрыты: единственная альтернатива — реально стучаться в
// https://api-seller.ozon.ru фейковыми ключами, что нестабильно, небезопасно
// и бесполезно для CI (сеть может быть недоступна за прокси, тест был бы
// недетерминированным).
//
// Вместо этого ниже проверяется РЕАЛЬНАЯ логика парсинга, которую
// fetchProducts() использует внутри (jsonDecode + .map(ProductModel.fromJson)
// по data['items']) — это единственная тестируемая без DI часть сервиса.
// Отдельная рекомендация для директора: вынести ApiClient как параметр
// конструктора ProductService (DI), чтобы сервис стало можно тестировать
// целиком — сейчас это архитектурный блокер для тестирования.
void main() {
  test('ProductService конструируется без сети и без исключений (smoke)', () {
    final service = ProductService();
    expect(service.products, isEmpty);
    expect(service.analyticsData, isEmpty);
  });

  group(
    'Парсинг items — та же логика, что выполняется внутри fetchProducts',
    () {
      List<ProductModel> parseItems(String rawJsonBody) {
        final data = jsonDecode(rawJsonBody);
        return (data['items'] as List)
            .map((item) => ProductModel.fromJson(item))
            .toList();
      }

      test('пустой список items → пустой результат, без исключений', () {
        final result = parseItems(jsonEncode({'items': <dynamic>[]}));

        expect(result, isEmpty);
      });

      test('дубликаты offer_id сохраняются как есть — сервис их никак не '
          'схлопывает и не предупреждает о дубликате', () {
        final result = parseItems(
          jsonEncode({
            'items': [
              {'offer_id': 'dup', 'name': 'A', 'price': 1, 'stock': 1},
              {'offer_id': 'dup', 'name': 'B', 'price': 2, 'stock': 2},
            ],
          }),
        );

        expect(result.length, 2);
        expect(result.map((p) => p.offerId).toSet(), {'dup'});
        expect(result[0].name, 'A');
        expect(result[1].name, 'B');
      });

      test('null-поле у ОДНОГО элемента ломает парсинг ВСЕГО списка (не только '
          'этого элемента). Реальное поведение fetchProducts() в этом случае: '
          'внешний try/catch ловит исключение, логирует его через logger.e(...) '
          'и молча возвращает управление — products остаётся НЕ обновлённым '
          '(старое значение), notifyListeners() не вызывается, а вызывающий '
          'код (fetchProducts()) не получает никакого сигнала об ошибке '
          '(Future завершается успешно). Для UI это выглядит как "ничего не '
          'произошло" без объяснения причины — отдельная находка.', () {
        expect(
          () => parseItems(
            jsonEncode({
              'items': [
                {'offer_id': 'ok', 'name': 'Товар', 'price': 1, 'stock': 1},
                {'offer_id': 'bad', 'name': null, 'price': 1, 'stock': 1},
              ],
            }),
          ),
          throwsA(anything),
        );
      });
    },
  );
}
