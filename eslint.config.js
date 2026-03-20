import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/*.js', '**/*.cjs', '**/*.mjs'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        URL: 'readonly',
        AbortSignal: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },
  // packages/core: NO vendor imports allowed
  {
    files: ['packages/core/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['openai', 'openai/*'], message: 'core package cannot import OpenAI SDK' },
          { group: ['@slack/*', '@slack/bolt'], message: 'core package cannot import Slack SDK' },
          { group: ['elevenlabs', 'deepgram-sdk'], message: 'core package cannot import STT/TTS SDKs' },
          { group: ['drizzle-orm', 'drizzle-orm/*'], message: 'core package cannot import Drizzle' },
          { group: ['pg', 'postgres'], message: 'core package cannot import DB clients' },
        ],
      }],
    },
  },
];
