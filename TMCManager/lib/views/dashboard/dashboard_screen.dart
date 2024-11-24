import 'package:flutter/material.dart';

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Главная Панель'),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Добро пожаловать в TMCManager!',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
            Expanded(
              child: GridView.count(
                crossAxisCount: 2,
                crossAxisSpacing: 16,
                mainAxisSpacing: 16,
                children: [
                  _buildDashboardCard(
                    context: context,
                    title: 'Управление товарами',
                    icon: Icons.inventory,
                    onTap: () {
                      Navigator.pushNamed(context, '/products');
                    },
                  ),
                  _buildDashboardCard(
                    context: context,
                    title: 'Остатки',
                    icon: Icons.storage,
                    onTap: () {
                      Navigator.pushNamed(context, '/stocks');
                    },
                  ),
                  _buildDashboardCard(
                    context: context,
                    title: 'Возвраты',
                    icon: Icons.assignment_return,
                    onTap: () {
                      Navigator.pushNamed(context, '/returns');
                    },
                  ),
                  _buildDashboardCard(
                    context: context,
                    title: 'Аналитика',
                    icon: Icons.analytics,
                    onTap: () {
                      Navigator.pushNamed(context, '/analytics');
                    },
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDashboardCard({
    required BuildContext context,
    required String title,
    required IconData icon,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Card(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
        ),
        elevation: 4,
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 48, color: Theme.of(context).primaryColor),
              const SizedBox(height: 16),
              Text(
                title,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
