import 'package:shared_preferences/shared_preferences.dart';

class StorageService {
  Future<void> saveAuthData(String clientId, String apiKey) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('clientId', clientId);
    await prefs.setString('apiKey', apiKey);
  }

  Future<Map<String, String>> loadAuthData() async {
    final prefs = await SharedPreferences.getInstance();
    final clientId = prefs.getString('clientId') ?? '';
    final apiKey = prefs.getString('apiKey') ?? '';
    return {'clientId': clientId, 'apiKey': apiKey};
  }

  clearData() {}
}
