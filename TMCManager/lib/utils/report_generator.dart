import 'package:pdf/widgets.dart' as pw;
import 'dart:io';

class ReportGenerator {
  static Future<void> generateReport(List products) async {
    final pdf = pw.Document();
    pdf.addPage(pw.Page(
      build: (context) => pw.ListView.builder(
        itemCount: products.length,
        itemBuilder: (context, index) {
          final product = products[index];
          return pw.Text('${product.name}: ${product.stock} шт. - ${product.price} руб.');
        },
      ),
    ));
    final file = File('report.pdf');
    await file.writeAsBytes(await pdf.save());
  }
}
