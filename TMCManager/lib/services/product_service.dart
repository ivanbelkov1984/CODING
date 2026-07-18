import 'dart:convert';
import 'package:flutter/foundation.dart';
import '../models/product_model.dart';
import '../utils/logger.dart';
import 'api_client.dart';

class ProductService with ChangeNotifier {
  final ApiClient _apiClient = ApiClient(
    clientId: 'yourClientId',
    apiKey: 'yourApiKey',
  );
  List<ProductModel> products = [];
  Map<String, dynamic> analyticsData = {};

  get totalStock => null;

  get weeklySales => null;

  Future<void> fetchProducts() async {
    try {
      final response = await _apiClient.post('/v2/product/info', {});
      final data = jsonDecode(response.body);
      products = (data['items'] as List)
          .map((item) => ProductModel.fromJson(item))
          .toList();
      notifyListeners();
    } catch (e) {
      logger.e('Ошибка получения товаров: $e');
    }
  }

  Future<void> fetchAnalytics() async {
    try {
      final response = await _apiClient.post('/v1/analytics/data', {
        "date_from": "2024-01-01",
        "date_to": "2024-01-31",
        "metrics": ["sales_amount", "orders_count"],
      });
      analyticsData = jsonDecode(response.body);
      notifyListeners();
    } catch (e) {
      logger.e('Ошибка получения аналитики: $e');
    }
  }
}
