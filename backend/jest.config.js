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
  // `npm run test:coverage`, lancé en CI). Valeurs de DÉPART volontairement
  // basses : à RELEVER ~3 % sous la couverture réelle qu'affichera le 1er run
  // `test:coverage` en CI (la base de test locale est trop lente pour mesurer
  // ici). But premier : empêcher l'effondrement silencieux de la couverture.
  coverageThreshold: {
    global: { statements: 35, branches: 25, functions: 30, lines: 35 },
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
