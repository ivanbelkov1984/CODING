import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:logger/logger.dart'; // Импорт библиотеки Logger
import '../models/product_model.dart';
import '../utils/logger.dart';
import 'api_client.dart';

class ProductService with ChangeNotifier {
  final ApiClient _apiClient = ApiClient(clientId: 'yourClientId', apiKey: 'yourApiKey');
  List<ProductModel> products = [];
  List<dynamic> analyticsData = [];
  int totalStock = 0;
  int weeklySales = 0;

  Future<void> fetchProducts() async {
    try {
      final response = await _apiClient.post('/v2/product/info', {});
      final data = jsonDecode(response.body);
      products = (data['items'] as List)
          .map((item) => ProductModel.fromJson(item))
          .toList();
      totalStock = products.fold(0, (sum, item) => sum + (item.stock ?? 0));
      notifyListeners();
    } catch (e) {
      logger.e('Ошибка получения товаров: $e');
    }
  }

  Future<void> fetchAnalytics() async {
    try {
      final response = await _apiClient.post('/v1/analytics/data', {
        'date_from': '2024-01-01',
        'date_to': '2024-01-07',
        'metrics': ['revenue', 'sales', 'stock'],
      });
      analyticsData = (jsonDecode(response.body)['data'] as List<dynamic>)
          .cast<Map<String, dynamic>>(); // Преобразование данных
      notifyListeners();
    } catch (e) {
      // Используем Level.error из Logger
      logger.log(Level.error, 'Ошибка получения аналитики: $e');
      analyticsData = [];
    }
  }

  Future<void> updateProduct(String id, Map<String, dynamic> updatedProduct) async {
    try {
      await _apiClient.post('/v3/product/import', {
        'items': [
          {
            'offer_id': id,
            'name': updatedProduct['name'],
            'price': updatedProduct['price'],
            'stock': updatedProduct['stock'],
          },
        ],
      });
      // Обновляем локальные данные
      final index = products.indexWhere((p) => p.id == id);
      if (index != -1) {
        products[index] = ProductModel(
          id: id,
          offerId: id, // Assuming offerId is the same as id
          name: updatedProduct['name'],
          price: updatedProduct['price'],
          stock: updatedProduct['stock'],
        );
      }
      notifyListeners();
    } catch (e) {
      logger.e('Ошибка обновления товара: $e');
    }
  }
}
