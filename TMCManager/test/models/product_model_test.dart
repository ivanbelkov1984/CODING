import 'package:flutter_test/flutter_test.dart';
import 'package:tmc_manager/models/product_model.dart';

void main() {
  group('ProductModel.fromJson — инвариант: не падает и не теряет id', () {
    final longName = List.filled(10000, 'A').join();

    final cases = <String, Map<String, dynamic>>{
      'пустая строка в name': {
        'offer_id': 'sku-1',
        'name': '',
        'price': 10,
        'stock': 1,
      },
      'нулевая цена (0)': {
        'offer_id': 'sku-2',
        'name': 'Товар',
        'price': 0,
        'stock': 1,
      },
      'отрицательная цена': {
        'offer_id': 'sku-3',
        'name': 'Товар',
        'price': -500,
        'stock': 1,
      },
      'очень длинное имя (10 000 символов)': {
        'offer_id': 'sku-4',
        'name': longName,
        'price': 10,
        'stock': 1,
      },
      'эмодзи в имени и в id': {
        'offer_id': 'sku-🔑-5',
        'name': '🚀 Товар со смайлами 😀🔥',
        'price': 10,
        'stock': 1,
      },
    };

    for (final entry in cases.entries) {
      test(entry.key, () {
        final json = entry.value;

        // Инвариант 1: парсинг не падает.
        final model = ProductModel.fromJson(json);

        // Инвариант 2: id не теряется и не искажается.
        expect(model.offerId, json['offer_id']);

        // Значения передаются как есть, без скрытой валидации/обрезки.
        expect(model.name, json['name']);
        expect(model.price, (json['price'] as num).toDouble());
        expect(model.stock, json['stock']);
      });
    }
  });

  group(
      'ProductModel.fromJson — где инвариант РЕАЛЬНО ломается (честная '
      'находка, не часть "зелёного" инварианта выше)', () {
    test(
        'name: null бросает исключение — fromJson присваивает json[\'name\'] '
        'напрямую в поле `final String name` без null-проверки', () {
      final json = {
        'offer_id': 'sku-null-name',
        'name': null,
        'price': 10,
        'stock': 1,
      };

      expect(() => ProductModel.fromJson(json), throwsA(anything));
    });

    test(
        'price: null бросает исключение (null.toDouble() недоступен) — та же '
        'причина: отсутствие null-safety проверок в fromJson', () {
      final json = {
        'offer_id': 'sku-null-price',
        'name': 'Товар',
        'price': null,
        'stock': 1,
      };

      expect(() => ProductModel.fromJson(json), throwsA(anything));
    });

    test('offer_id: null бросает исключение — сам id тоже не защищён', () {
      final json = {'offer_id': null, 'name': 'Товар', 'price': 10, 'stock': 1};

      expect(() => ProductModel.fromJson(json), throwsA(anything));
    });
  });
}
