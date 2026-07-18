import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:logger/logger.dart';
import '../../services/product_service.dart';
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
    } catch (e) {
      logger.log(Level.error, 'Error fetching data: $e');
      _showSnackBar('Ошибка загрузки данных: $e', isError: true);
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  void _showSnackBar(String message, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? Colors.red : Colors.green,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final analyticsData = _productService.analyticsData;
    final products = _productService.products;

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
                    AnalyticsChart(data: analyticsData),
                    const Divider(),
                    _buildGridOverview(),
                    const Divider(),
                    _buildSectionTitle('Управление товарами'),
                    _buildProductList(products),
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
        style: Theme.of(
          context,
        ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
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
          value: '${_productService.totalStock} шт.',
          icon: Icons.inventory_2,
        ),
        _buildStatCard(
          title: 'Продажи за неделю',
          value: '${_productService.weeklySales} шт.',
          icon: Icons.trending_up,
        ),
      ],
    );
  }

  Widget _buildStatCard({
    required String title,
    required String value,
    required IconData icon,
  }) {
    return Card(
      elevation: 6,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12.0)),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 40, color: Theme.of(context).primaryColor),
            const SizedBox(height: 8),
            Text(title, style: Theme.of(context).textTheme.bodyLarge),
            const SizedBox(height: 8),
            Text(
              value,
              style: Theme.of(
                context,
              ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildProductList(List products) {
    if (products.isEmpty) {
      return const Center(child: Text('Нет доступных товаров.'));
    }
    return ListView.separated(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: products.length,
      separatorBuilder: (context, index) => const Divider(),
      itemBuilder: (context, index) {
        final product = products[index];
        return ListTile(
          leading: CircleAvatar(child: Text(product.name[0].toUpperCase())),
          title: Text(product.name),
          subtitle: Text(
            'Цена: ${product.price} руб. | Остаток: ${product.stock} шт.',
          ),
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

  void _editProduct(dynamic product) {
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: Text('Редактировать товар: ${product.name}'),
          content: Text('Функционал редактирования товара в разработке.'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Закрыть'),
            ),
          ],
        );
      },
    );
  }

  void _generateReport() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Функционал генерации отчетов в разработке.'),
      ),
    );
  }
}
