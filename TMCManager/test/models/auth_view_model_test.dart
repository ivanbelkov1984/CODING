import 'package:flutter_test/flutter_test.dart';
import 'package:tmc_manager/models/auth_view_model.dart';
import 'package:tmc_manager/services/storage_service.dart';

// ВАЖНАЯ НАХОДКА: в проекте ДВА разных класса с одинаковым именем
// `AuthViewModel`:
//   - lib/models/auth_view_model.dart          (тестируется здесь)
//   - lib/views/authorization/auth_view_model.dart
// У них разные конструкторы и разная логика, и ни один из них НИГДЕ не
// используется в реальном приложении (main.dart/AuthScreen до них не
// достаёт — см. примечание в test/services/auth_service_test.dart про
// AuthScreen._authenticate(), который вообще не проверяет введённые данные).
// Тестируем именно lib/models/ версию — это единственная реализация, где
// РЕАЛЬНО есть проверка на пустой логин/ключ, о которой просит наряд #188.

/// Тестовый двойник StorageService.
///
/// StorageService.saveAuthData/clearData используют
/// package:flutter_secure_storage, который на платформенном канале падает
/// без реального устройства/платформы. saveAuthData/clearData — public и
/// не final в боевом классе, override легален и не трогает приватное поле
/// `_storage` (оно просто не используется в переопределённых методах).
class _FakeStorageService extends StorageService {
  final List<String> calls = [];

  @override
  Future<void> saveAuthData(String clientId, String apiKey) async {
    calls.add('saveAuthData($clientId, $apiKey)');
  }

  @override
  Future<void> clearData() async {
    calls.add('clearData()');
  }
}

void main() {
  group('AuthViewModel.authenticate — пустой логин/ключ', () {
    test(
        'пустой clientId → не бросает исключение наружу (перехвачено внутри), '
        'и НЕ обращается к storage (валидация срабатывает раньше)', () async {
      final storage = _FakeStorageService();
      final viewModel = AuthViewModel(storage);

      await expectLater(viewModel.authenticate('', 'some-api-key'), completes);
      expect(storage.calls, isEmpty);
    });

    test(
      'пустой apiKey → аналогично: не падает и не сохраняет данные',
      () async {
        final storage = _FakeStorageService();
        final viewModel = AuthViewModel(storage);

        await expectLater(
          viewModel.authenticate('some-client-id', ''),
          completes,
        );
        expect(storage.calls, isEmpty);
      },
    );

    test('оба поля пустые → тоже не падает и не сохраняет данные', () async {
      final storage = _FakeStorageService();
      final viewModel = AuthViewModel(storage);

      await expectLater(viewModel.authenticate('', ''), completes);
      expect(storage.calls, isEmpty);
    });
  });

  group('AuthViewModel.authenticate — успешный путь', () {
    test(
      'непустые clientId и apiKey → данные сохраняются через storage',
      () async {
        final storage = _FakeStorageService();
        final viewModel = AuthViewModel(storage);

        await viewModel.authenticate('client-42', 'key-42');

        expect(storage.calls, ['saveAuthData(client-42, key-42)']);
      },
    );
  });

  group('AuthViewModel.clearAuthData', () {
    test('вызывает storage.clearData() и не падает', () async {
      final storage = _FakeStorageService();
      final viewModel = AuthViewModel(storage);

      await viewModel.clearAuthData();

      expect(storage.calls, ['clearData()']);
    });
  });
}
