class ProductModel {
  final String offerId;
  final String name;
  final double price;
  final int stock;

  ProductModel({
    required this.offerId,
    required this.name,
    required this.price,
    required this.stock,
  });

  factory ProductModel.fromJson(Map<String, dynamic> json) {
    return ProductModel(
      offerId: json['offer_id'],
      name: json['name'],
      price: json['price'].toDouble(),
      stock: json['stock'],
    );
  }
}
