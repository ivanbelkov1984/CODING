// ESLint-гейт CI (задача владельца 2026-07-26): ловим КОРРЕКТНОСТНЫЕ
// проблемы (no-undef, no-dupe-*, no-unreachable…) до браузерных тестов.
// Осознанные отличия от recommended под реальность vanilla-PWA:
//  - no-unused-vars выключен: сотни глобальных функций вызываются из
//    HTML-атрибутов onclick — ESLint эти вызовы не видит;
//  - вендорные минифицированные файлы (astronomy.min.js, lucide.js) и dist/ вне линта.
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'dist/**', 'astronomy.min.js', 'lucide.js', 'backup/**', 'evidence/**'] },
  // Браузерные classic-скрипты приложения.
  {
    files: ['app.js', 'astro_rules.js', 'astro_texts_*.js', 'sw.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'script',
      globals: { ...globals.browser, ...globals.serviceworker, lucide: 'readonly', Astronomy: 'readonly', JSZip: 'readonly' },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
  // Node: сборка, инструменты, backend (всё ESM).
  {
    files: ['build.mjs', 'tools/**/*.mjs', 'eslint.config.mjs', 'backend/**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node } },
    rules: { ...js.configs.recommended.rules, 'no-unused-vars': 'off', 'no-empty': ['warn', { allowEmptyCatch: true }] },
  },
  // Тесты: page.evaluate-колбэки исполняются В БРАУЗЕРЕ — все браузерные
  // и app-глобалы (document, DB, asub…) для ESLint «не определены»,
  // поэтому no-undef здесь осознанно выключен (1600+ ложных срабатываний).
  {
    files: ['tests/**/*.mjs'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
    rules: { ...js.configs.recommended.rules, 'no-unused-vars': 'off', 'no-undef': 'off', 'no-empty': ['warn', { allowEmptyCatch: true }] },
  },
];
