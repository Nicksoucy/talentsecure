module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  env: {
    node: true,
    es2021: true,
    jest: true,
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    // We allow `any` for now — the existing code has hundreds of usages and
    // an exhaustive cleanup is tracked separately. Keep this OFF, not
    // 'warn', so editors don't drown developers in pre-existing noise.
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    // Use the Winston logger (`logger.info/warn/error`) instead of console.
    // Existing 1000+ console.* in the codebase were accumulated before this
    // rule existed; new code should use logger so output is structured and
    // captured by Cloud Logging + Sentry.
    'no-console': 'warn',
    // Several files dynamically `require()` modules to avoid circular imports
    // or to support jest.resetModules() in tests. Allow them with a warning.
    '@typescript-eslint/no-var-requires': 'warn',
    // Express request augmentation legitimately uses `declare global { namespace Express }`.
    // prefer-const has a few legacy violations not worth blocking on.
    '@typescript-eslint/no-namespace': 'warn',
    'prefer-const': 'warn',
  },
  overrides: [
    {
      // Tests rely on require() for module reset patterns
      files: ['src/__tests__/**/*.ts', 'src/**/*.test.ts'],
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
        'no-console': 'off',
      },
    },
  ],
  ignorePatterns: [
    'dist',
    'node_modules',
    'coverage',
    // Legacy debug/migration scripts intentionally use console for stdout
    'scripts/legacy/',
    'src/scripts/',
    'scripts/',
    // Boot files that run before the logger is initialized
    'src/config/env.ts',
    'src/config/sentry.ts',
  ],
};
