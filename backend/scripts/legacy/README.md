# Scripts legacy

Anciens scripts de debug et de migration accumulés à la racine du backend.
Aucun n'est référencé dans le code applicatif. Conservés ici pour historique
au cas où l'on aurait besoin de re-jouer un audit ou de comprendre une
ancienne migration.

## Catégories

- **`migrate-*.ts`** : migrations de données ponctuelles déjà exécutées en prod
  (`migrate-cv-paths.ts`). Ne pas re-exécuter.
- **`check-*.ts`** : audits ad hoc (intégrité des CV, prospects, état
  d'extraction). Utiles si l'on doit ré-investiguer un incident similaire.
- **`find-*.ts`** : requêtes ponctuelles (matching prospects).
- **`temp-*.ts`** : scripts marqués comme temporaires par leur nom — souvent
  écrits pour debug une seule fois.
- **`test-*.ts`** : tests d'intégration manuels écrits avant que Jest ne soit
  pleinement en place. **Ne pas confondre avec les vrais tests** dans
  `src/__tests__/` ou `src/services/__tests__/`. Ils ne sont pas exécutés par
  `npm test`.

## Si tu veux les ré-exécuter

```bash
cd /path/to/backend
DATABASE_URL=... npx tsx scripts/legacy/<le-script>.ts
```

Les scripts s'attendent à un `DATABASE_URL` valide dans l'environnement.
Vérifie d'abord ce qu'ils font en lisant le code — certains modifient des
données.

## Plan de purge

À supprimer définitivement quand :
- Le repo a une couverture de tests automatisés suffisante pour couvrir les
  besoins d'investigation que ces scripts adressaient.
- L'équipe est confiante qu'il n'y a plus de raison de re-jouer ces audits.

Suivi : ticket dédié dans le backlog.
