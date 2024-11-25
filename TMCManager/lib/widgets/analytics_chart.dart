import 'package:flutter/material.dart';
import 'package:syncfusion_flutter_charts/charts.dart';

class AnalyticsChart extends StatelessWidget {
  final Map<String, dynamic> data;

  const AnalyticsChart({super.key, required this.data});

  @override
  Widget build(BuildContext context) {
    return SfCartesianChart(
      primaryXAxis: CategoryAxis(),
      series: <CartesianSeries<MapEntry<String, dynamic>, String>>[
        ColumnSeries<MapEntry<String, dynamic>, String>(
          dataSource: data.entries.toList(),
          xValueMapper: (entry, _) => entry.key,
          yValueMapper: (entry, _) => entry.value as num,
        ),
      ],
    );
  }
}
