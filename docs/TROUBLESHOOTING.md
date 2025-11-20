# Troubleshooting

## Lint/Test

- **npm run lint (frontend)** échoue immédiatement : assurez-vous qu'un fichier `.eslintrc.cjs` existe (ajouté dans cette itération).
- **npm run test (backend)** requiert `jest.config.js` + `ts-jest`. Si les tests plantent à cause de Prisma, vérifiez que `DATABASE_URL` est défini ou mockez les appels Prisma dans vos tests.

## Extraction IA

- **Erreur "OPENAI_API_KEY non configurée"** : exportez la variable dans `.env` ou dans l'environnement de déploiement.
- **Coûts inattendus** : vérifiez `cvExtractionLog` pour voir quels modèles sont appelés; privilégiez `gpt-3.5-turbo` ou `claude-3-haiku` quand c'est suffisant.
- **Résultats dupliqués** : la normalisation (`skill-normalization.ts`) dédoublonne par clé. Vérifiez que vos nouveaux synonymes sont bien ajoutés.
- **Cache/OPENAI_CACHE** : l'extraction AI mémorise désormais les hash SHA-256 des CVs. Si rien ne se passe, vérifiez que `cvChecksum` est rempli dans `cv_extraction_logs`.
- **429 / quotas dépassés** : `AIExtractionService` applique maintenant un throttling et un retry exponentiel. Ajustez `AI_MAX_PARALLEL_REQUESTS` ou réduisez la taille des lots.

## Exports CSV/Excel/PDF

- **404 sur /api/exports/skills/...** : assurez-vous que `export.routes.ts` est bien monté (`app.use('/api/exports', exportRoutes);`).
- **Fichier vide** : les filtres `q`, `category`, `minConfidence`, `limit` s'appliquent aussi aux exports. Vérifiez d'abord la recherche dans la page « Autres Compétences ».
- **Accents illisibles** : les exports CSV sont encodés en UTF-8 avec BOM. Importez le fichier via l'assistant Excel si l'ouverture directe affiche des caractères étranges.

## Extraction Regex

- **BSP/RCR non détecté** : assurez-vous que le CV a été normalisé (pas d'accents) et que les mots-clés correspondent (`bsp`, `rcr`, `premiers soins`).
- **Permis classe 4* non détecté** : le pattern attend "classe 4A/4B/4C". Les variantes (classe IV) peuvent être ajoutées dans `DRIVER_LICENSE_PATTERNS`.

## UI & Notifications

- **Toasts « Impossible de ... » sans détails** : nous injectons désormais le nom du candidat/catalogue dans le message. Si ce n'est pas le cas, vérifiez que la mutation reçoit `label` ou `candidateName`.
- **HelpDialog absent** : importez `HelpDialog` depuis `@/components/HelpDialog` et passez `sections`/`faq`. Évitez de rendre le bouton dans des modales critiques (pensez accessibilité).

## Tests Jest

- Si vous voyez `Cannot find module '@/...'` dans vos tests backend, vérifiez que `moduleNameMapper` dans `jest.config.js` pointe sur `<rootDir>/src/$1` et lancez `npm run test` depuis `backend/`.
- Ajoutez un fichier `src/__tests__/setup.ts` pour stubber Prisma/Redis si besoin (actuellement vide).

