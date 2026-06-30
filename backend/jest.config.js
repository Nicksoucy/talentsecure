/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/scripts/**',
    '!src/index.ts',
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/__tests__/',
  ],
  // Seuils de couverture = plancher anti-régression (appliqués par
  // `npm run test:coverage`, lancé en CI). Calés à ~3 % sous la couverture
  // réelle mesurée en CI le 2026-06-28 (stmts 48.2 / branch 34.8 / funcs 42.6
  // / lines 48.1). À RELEVER au fur et à mesure que la couverture monte.
  coverageThreshold: {
    global: { statements: 45, branches: 31, functions: 39, lines: 45 },
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  testTimeout: 30000,
  verbose: true,
  // Les suites DB partagent UNE base de test ; cleanDatabase() fait un TRUNCATE
  // global. En parallèle, une suite effacerait les données semées d'une autre.
  // On exécute donc en série (la suite est petite, ~quelques secondes).
  maxWorkers: 1,
};
