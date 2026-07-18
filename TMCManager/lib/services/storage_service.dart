import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:logger/logger.dart';

class StorageService {
  final FlutterSecureStorage _storage = const FlutterSecureStorage();
  final Logger logger = Logger();

  static const String _profilesKey = 'profiles';

  // Метод для загрузки списка профилей
  Future<List<Map<String, String>>> loadProfiles() async {
    try {
      final profilesJson = await _storage.read(key: _profilesKey);
      if (profilesJson != null) {
        final List<dynamic> decoded = jsonDecode(profilesJson);
        // Преобразуем каждый элемент списка в Map<String, String>
        return decoded.map<Map<String, String>>((profile) {
          return Map<String, String>.from(profile);
        }).toList();
      }
    } catch (e) {
      logger.e('Ошибка загрузки профилей: $e'); // Логируем ошибку
    }
    return [];
  }

  // Метод для сохранения нового профиля
  Future<void> saveProfile(Map<String, String> profile) async {
    final profiles = await loadProfiles();
    profiles.removeWhere(
      (p) => p['name'] == profile['name'],
    ); // Удалить дубликаты
    profiles.add(profile);
    await _storage.write(key: _profilesKey, value: jsonEncode(profiles));
  }

  // Метод для удаления профиля
  Future<void> deleteProfile(String name) async {
    final profiles = await loadProfiles();
    profiles.removeWhere((profile) => profile['name'] == name);
    await _storage.write(key: _profilesKey, value: jsonEncode(profiles));
  }

  // Сохранение данных авторизации
  Future<void> saveAuthData(String clientId, String apiKey) async {
    await _storage.write(key: 'clientId', value: clientId);
    await _storage.write(key: 'apiKey', value: apiKey);
  }

  // Загрузка данных авторизации
  Future<Map<String, String?>> loadAuthData() async {
    final clientId = await _storage.read(key: 'clientId');
    final apiKey = await _storage.read(key: 'apiKey');
    return {'clientId': clientId, 'apiKey': apiKey};
  }

  // Очистка всех данных
  Future<void> clearData() async {
    await _storage.deleteAll();
  }
}
