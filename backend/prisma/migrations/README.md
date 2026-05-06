# Prisma migrations baseline — TalentSecure

## Contexte

Avant ce commit, le projet utilisait `prisma db push` pour appliquer les
changements de schéma à la base — sans historique de migration versionné.
C'était un risque sérieux pour la production : pas de rollback possible,
pas de revue de schéma en PR, et risque de drift entre environnements.

Ce dossier contient maintenant **un seul fichier** de migration `0_init`
qui représente l'état actuel du schéma. Il a été généré avec :

```bash
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/0_init/migration.sql
```

**Important** : ce fichier ne doit pas être appliqué tel quel en production —
les tables existent déjà. Il sert uniquement de point de référence pour
l'historique de migration.

---

## Procédure de baselining en production (à faire UNE SEULE FOIS)

⚠️ Sauvegarde la base **avant** d'exécuter quoi que ce soit.

```bash
# 1. Backup Neon (en plus du PITR automatique)
pg_dump "$DATABASE_URL" > backups/before_baseline_$(date +%Y%m%d_%H%M%S).sql

# 2. Marquer la migration baseline comme déjà appliquée — PAS de DDL exécuté
DATABASE_URL="$PROD_DATABASE_URL" \
  npx prisma migrate resolve --applied 0_init

# 3. Vérifier que la table _prisma_migrations a été créée et contient 0_init
DATABASE_URL="$PROD_DATABASE_URL" \
  psql -c "SELECT migration_name, finished_at FROM _prisma_migrations;"
# Attendu :
# migration_name | finished_at
# 0_init         | <timestamp>

# 4. Vérifier que le schéma est en sync (rien à appliquer)
DATABASE_URL="$PROD_DATABASE_URL" \
  npx prisma migrate status
# Attendu : "Database schema is up to date!"
```

Une fois cela fait en prod, **plus jamais utiliser `prisma db push`**. Toutes
les futures évolutions de schéma passent par :

```bash
# En local (dev) :
npx prisma migrate dev --name <nom_descriptif>
# Cela crée prisma/migrations/<timestamp>_<nom>/migration.sql et l'applique
# à la DB de dev.

# En production (Cloud Run) — automatique via cloudbuild ou manuel :
DATABASE_URL="$PROD_DATABASE_URL" npx prisma migrate deploy
```

---

## Procédure de baselining sur une nouvelle installation (dev / staging)

Si tu mets en place un nouveau dev/staging à partir de zéro :

```bash
# La base est vide → Prisma applique 0_init normalement
DATABASE_URL="$NEW_DATABASE_URL" npx prisma migrate deploy
```

Le SQL de `0_init/migration.sql` créera tout le schéma en partant de zéro.

---

## Que faire si quelque chose tourne mal en prod

- **Le baselining a échoué** : `migrate resolve` est idempotent. Réessayer ne
  casse rien. Vérifier avec `migrate status`.
- **Une nouvelle migration `migrate deploy` échoue à mi-chemin** : restaurer
  depuis le dump `pg_dump` créé à l'étape 1, ou via Neon PITR (7 jours).
- **Le schéma a drifté de ce que Prisma attend** : `npx prisma migrate diff
  --from-schema-datasource $PROD_DATABASE_URL --to-schema-datamodel
  prisma/schema.prisma --script` montre la différence. À analyser avant
  d'appliquer.

---

## Comment ce baseline a été conçu

Le fichier `0_init/migration.sql` reflète **exactement** l'état actuel
de `schema.prisma` au moment du commit. Aucune modification de schéma
n'est introduite par cette migration — c'est un snapshot.

Vérification effectuée : la commande `prisma migrate diff --from-empty
--to-schema-datamodel prisma/schema.prisma` produit le même SQL que
`prisma db push` aurait appliqué sur une DB vide. Donc tous les
environnements (dev, prod, staging) qui ont été créés via `db push`
ont déjà ce schéma — il suffit de marquer 0_init comme `applied`
sans le ré-exécuter.
