class ProductModel {
  final String id;
  final String? name; // Допускаем null
  final double? price; // Допускаем null
  final int? stock; // Допускаем null
  final String offerId; // Обязательное поле

  ProductModel({
    required this.id,
    this.name,
    this.price,
    this.stock,
    required this.offerId, // Убедитесь, что offerId передается
  });

  factory ProductModel.fromJson(Map<String, dynamic> json) {
    return ProductModel(
      id: json['id'] ?? '', // Если id отсутствует, задаётся пустая строка
      name: json['name'], // Оставляем null, если поле отсутствует
      price: json['price'] != null ? (json['price'] as num).toDouble() : null,
      stock: json['stock'], // Оставляем null, если поле отсутствует
      offerId: json['offer_id'] ?? '', // Обработка offerId с пустым значением
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name ?? 'Не указано',
      'price': price ?? 0,
      'stock': stock ?? 0,
      'offer_id': offerId, // Добавляем offerId в сериализацию
    };
  }
}
