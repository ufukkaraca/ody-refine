/** @type {import('eslint').Linter.Config} */
module.exports = {
    root: true,
    env: {
        node: true,
        es2022: true,
    },
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        tsconfigRootDir: __dirname,
        project: [
            './tsconfig.json',
            './packages/*/tsconfig.json',
            './packages/*/tsconfig.eslint.json',
            './apps/*/tsconfig.json',
            './apps/*/tsconfig.eslint.json'
        ],
    },
    plugins: ['@typescript-eslint', 'import'],
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:import/recommended',
        'plugin:import/typescript',
    ],
    settings: {
        'import/resolver': {
            typescript: {
                project: [
                    './tsconfig.json',
                    './packages/*/tsconfig.json',
                    './packages/*/tsconfig.eslint.json',
                    './apps/*/tsconfig.json',
                    './apps/*/tsconfig.eslint.json'
                ],
            },
        },
    },
    rules: {
        '@typescript-eslint/no-unused-vars': ['error', {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            caughtErrorsIgnorePattern: '^_'
        }],
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/explicit-function-return-type': 'off',
        'import/order': 'off', // Temporarily disabled during migration
        'import/no-unresolved': 'off', // TypeScript handles this
        'import/no-cycle': 'warn',
        'import/no-self-import': 'error',
    },
    overrides: [
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
                        { group: ['@ody/providers', '@ody/providers/*'], message: 'core cannot import providers' },
                        { group: ['@ody/db', '@ody/db/*'], message: 'core cannot import db package' },
                    ],
                }],
            },
        },
        // packages/orchestrator: NO direct vendor SDK imports
        {
            files: ['packages/orchestrator/**/*.ts'],
            rules: {
                'no-restricted-imports': ['error', {
                    patterns: [
                        { group: ['openai', 'openai/*'], message: 'orchestrator cannot import OpenAI SDK directly' },
                        { group: ['@slack/*', '@slack/bolt'], message: 'orchestrator cannot import Slack SDK' },
                        { group: ['elevenlabs', 'deepgram-sdk'], message: 'orchestrator cannot import STT/TTS SDKs' },
                        { group: ['pg', 'postgres'], message: 'orchestrator cannot import DB clients directly' },
                    ],
                }],
            },
        },
    ],
    ignorePatterns: ['node_modules', 'dist', '.next', '*.js', '*.cjs', '*.mjs'],
};
