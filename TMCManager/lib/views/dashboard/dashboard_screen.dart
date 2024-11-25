import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:logger/logger.dart';
import '../../services/product_service.dart';
import '../../models/product_model.dart';
import '../../widgets/analytics_chart.dart';

final Logger logger = Logger();

class DashboardScreen extends StatefulWidget {
  final VoidCallback onLogout;
  final VoidCallback toggleTheme;

  const DashboardScreen({
    super.key,
    required this.onLogout,
    required this.toggleTheme,
  });

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  late ProductService _productService;
  bool _isLoading = true;
  TextEditingController searchController = TextEditingController();
  bool isAscending = true;

  @override
  void initState() {
    super.initState();
    _productService = context.read<ProductService>();
    _initializeData();
  }

  Future<void> _initializeData() async {
    try {
      logger.log(Level.info, 'Fetching analytics and products data...');
      await Future.wait([
        _productService.fetchAnalytics(),
        _productService.fetchProducts(),
      ]);
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    } catch (e) {
      logger.log(Level.error, 'Error fetching data: $e');
      if (mounted) {
        _showSnackBar('Ошибка загрузки данных: $e', isError: true);
      }
    }
  }

  void _showSnackBar(String message, {bool isError = false}) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: isError ? Colors.red : Colors.green,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Панель управления'),
        centerTitle: true,
        actions: [
          IconButton(
            icon: const Icon(Icons.brightness_6),
            onPressed: widget.toggleTheme,
            tooltip: 'Переключить тему',
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: widget.onLogout,
            tooltip: 'Выйти',
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _initializeData,
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildSectionTitle('Аналитика продаж'),
                    _buildAnalyticsChart(),
                    const Divider(),
                    _buildGridOverview(),
                    const Divider(),
                    _buildSectionTitle('Управление товарами'),
                    _buildFilters(),
                    _buildProductList(_productService.products),
                    const SizedBox(height: 16),
                    _buildGenerateReportButton(),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16.0),
      child: Text(
        title,
        style: Theme.of(context)
            .textTheme
            .titleLarge
            ?.copyWith(fontWeight: FontWeight.bold),
      ),
    );
  }

  Widget _buildGridOverview() {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 16,
      mainAxisSpacing: 16,
      children: [
        _buildStatCard(
          title: 'Общий остаток',
          value: _productService.totalStock,
          icon: Icons.inventory_2,
        ),
        _buildStatCard(
          title: 'Продажи за неделю',
          value: _productService.weeklySales,
          icon: Icons.trending_up,
        ),
      ],
    );
  }

  Widget _buildStatCard({
    required String title,
    required dynamic value,
    required IconData icon,
  }) {
    return Card(
      elevation: 6,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12.0),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 40, color: Theme.of(context).primaryColor),
            const SizedBox(height: 8),
            Text(
              title,
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const SizedBox(height: 8),
            Text(
              value?.toString() ?? 'Нет данных',
              style: Theme.of(context)
                  .textTheme
                  .headlineSmall
                  ?.copyWith(fontWeight: FontWeight.bold),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAnalyticsChart() {
    return AnalyticsChart(
      data: _productService.analyticsData.isNotEmpty
          ? _productService.analyticsData.cast<Map<String, dynamic>>()
          : [],
    );
  }

  Widget _buildFilters() {
    return Column(
      children: [
        TextField(
          controller: searchController,
          decoration: const InputDecoration(
            labelText: 'Поиск по названию',
            prefixIcon: Icon(Icons.search),
          ),
          onChanged: (value) => setState(() {}),
        ),
        const SizedBox(height: 8),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('Сортировать по:'),
            DropdownButton<bool>(
              value: isAscending,
              onChanged: (value) {
                setState(() {
                  isAscending = value!;
                  _productService.products.sort((a, b) {
                    final priceA = a.price ?? 0;
                    final priceB = b.price ?? 0;
                    return isAscending
                        ? priceA.compareTo(priceB)
                        : priceB.compareTo(priceA);
                  });
                });
              },
              items: const [
                DropdownMenuItem(value: true, child: Text('По возрастанию')),
                DropdownMenuItem(value: false, child: Text('По убыванию')),
              ],
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildProductList(List<ProductModel> products) {
    final filteredProducts = products.where((product) {
      final query = searchController.text.toLowerCase();
      return product.name?.toLowerCase().contains(query) ?? false;
    }).toList();

    if (filteredProducts.isEmpty) {
      return const Center(
        child: Text('Нет доступных товаров.'),
      );
    }
    return ListView.separated(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: filteredProducts.length,
      separatorBuilder: (context, index) => const Divider(),
      itemBuilder: (context, index) {
        final product = filteredProducts[index];
        return ListTile(
          leading: CircleAvatar(
            child: Text(product.name?.substring(0, 1).toUpperCase() ?? '?'),
          ),
          title: Text(product.name ?? 'Не указано'),
          subtitle: Text(
              'Цена: ${product.price?.toStringAsFixed(2) ?? '0.00'} руб. | Остаток: ${product.stock ?? '0'} шт.'),
          trailing: IconButton(
            icon: const Icon(Icons.edit),
            onPressed: () => _editProduct(product),
          ),
        );
      },
    );
  }

  Widget _buildGenerateReportButton() {
    return ElevatedButton.icon(
      onPressed: _generateReport,
      icon: const Icon(Icons.picture_as_pdf),
      label: const Text('Создать отчет'),
    );
  }

  void _editProduct(ProductModel product) {
  final TextEditingController nameController =
      TextEditingController(text: product.name ?? '');
  final TextEditingController priceController =
      TextEditingController(text: product.price?.toString() ?? '');
  final TextEditingController stockController =
      TextEditingController(text: product.stock?.toString() ?? '');

  showDialog(
    context: context,
    builder: (context) {
      return AlertDialog(
        title: Text('Редактировать товар: ${product.name}'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                decoration: const InputDecoration(labelText: 'Название товара'),
              ),
              TextField(
                controller: priceController,
                decoration: const InputDecoration(labelText: 'Цена'),
                keyboardType: TextInputType.number,
              ),
              TextField(
                controller: stockController,
                decoration: const InputDecoration(labelText: 'Остаток'),
                keyboardType: TextInputType.number,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Отмена'),
          ),
          ElevatedButton(
            onPressed: () async {
              // Закрываем диалог перед началом асинхронной операции
              Navigator.pop(context);

              try {
                // Создаём обновлённый объект ProductModel
                final updatedProduct = {
                  'offer_id': product.id, // Передаём идентификатор товара
                  'name': nameController.text,
                  'price': double.tryParse(priceController.text) ?? 0.0,
                  'stock': int.tryParse(stockController.text) ?? 0,
                };

                // Обновляем товар через ProductService
                await context
                    .read<ProductService>()
                    .updateProduct(product.id, updatedProduct);

                // Показываем уведомление об успешном обновлении
                if (mounted) {
                  _showSnackBar('Товар успешно обновлён!');
                }
              } catch (e) {
                if (mounted) {
                  _showSnackBar('Ошибка обновления товара: $e', isError: true);
                }
              }
            },
            child: const Text('Сохранить'),
          ),
        ],
      );
    },
  );
}


  void _generateReport() {
    _showSnackBar('Функционал генерации отчетов в разработке.');
  }
}
