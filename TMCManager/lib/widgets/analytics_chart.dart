import 'package:flutter/material.dart';
import 'package:syncfusion_flutter_charts/charts.dart';

class AnalyticsChart extends StatelessWidget {
  final List<Map<String, dynamic>> data;

  const AnalyticsChart({super.key, required this.data});

  @override
  Widget build(BuildContext context) {
    return SfCartesianChart(
      primaryXAxis: CategoryAxis(),
      primaryYAxis: NumericAxis(),
      tooltipBehavior: TooltipBehavior(enable: true),
      series: <CartesianSeries>[
        ColumnSeries<Map<String, dynamic>, String>(
          dataSource: data,
          xValueMapper: (item, _) => item['date'] as String,
          yValueMapper: (item, _) => item['revenue'] as num,
          name: 'Выручка',
          color: Colors.blue,
        ),
        LineSeries<Map<String, dynamic>, String>(
          dataSource: data,
          xValueMapper: (item, _) => item['date'] as String,
          yValueMapper: (item, _) => item['sales'] as num,
          name: 'Продажи',
          color: Colors.green,
        ),
      ],
    );
  }
}
