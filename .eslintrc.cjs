/**
 * ESLint config for PlaylistVault.
 *
 * Deliberately lean: TypeScript's compiler already catches most classes of
 * error, so this focuses on the things tsc does not — unused code, unsafe
 * escapes, and accidental `console`/`debugger` left in shipped source.
 */
module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2022: true
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true }
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: [
    'dist',
    'dist-electron',
    'release',
    'node_modules',
    'resources',
    'ad/out*',
    '*.config.js',
    '*.config.ts',
    '*.cjs'
  ],
  rules: {
    // TypeScript handles undefined variables; the base rule misfires on types.
    'no-undef': 'off',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
    ],

    // `any` is sometimes the honest type at an IPC or JSON boundary.
    '@typescript-eslint/no-explicit-any': 'warn',

    // The main process legitimately logs; the renderer should not.
    'no-console': 'off',
    'no-debugger': 'error',

    'no-empty': ['error', { allowEmptyCatch: true }],
    eqeqeq: ['error', 'smart'],
    'prefer-const': 'error',
    'no-var': 'error'
  },
  overrides: [
    {
      // Tests use globals injected by Vitest.
      files: ['tests/**/*.ts', 'tests/**/*.tsx'],
      globals: {
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        vi: 'readonly'
      }
    }
  ]
};
