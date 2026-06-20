/** Règles d'architecture (dependency-cruiser). Voir https://github.com/sverweij/dependency-cruiser */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Pas de dépendances circulaires (couplage fragile, ordre de chargement imprévisible).',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Module jamais importé (mort ?).',
      from: {
        orphan: true,
        pathNot: ['\\.d\\.ts$', '(^|/)src/server\\.ts$', '(^|/)src/scripts/', '(^|/)src/types/'],
      },
      to: {},
    },
    {
      name: 'routes-no-direct-db',
      severity: 'warn',
      comment: 'Les routes ne devraient pas importer config/database directement (passer par un service).',
      from: { path: '^src/routes/' },
      to: { path: '^src/config/database' },
    },
    {
      name: 'services-no-controllers',
      severity: 'warn',
      comment: "Un service ne doit pas dépendre d'un controller (inversion de couche).",
      from: { path: '^src/services/' },
      to: { path: '^src/controllers/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    exclude: { path: '(^|/)__tests__/|\\.test\\.ts$' },
  },
};
