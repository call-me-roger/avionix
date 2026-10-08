const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const eslintPluginPrettierRecommended = require('eslint-plugin-prettier/recommended');

module.exports = defineConfig([
  expoConfig,
  eslintPluginPrettierRecommended,
  {
    // scripts/*.mjs run under plain Node (Buffer, process, top-level await); the expo config's
    // globals are for the app and test code, not build scripts, so lint them separately or not
    // at all rather than papering over it with eslint-disable comments.
    ignores: ['dist/*', 'node_modules/*', '.expo/*', 'coverage/*', 'scripts/*.mjs'],
  },
  {
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['src/infrastructure/logging/**/*.ts', 'tests/**/*.ts', 'tests/**/*.tsx'],
    rules: {
      'no-console': 'off',
    },
  },
]);
