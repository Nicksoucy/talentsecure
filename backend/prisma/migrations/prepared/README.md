# Migrations PRÉPARÉES (pas encore appliquées)

⚠️ **Aucun de ces fichiers n'a été appliqué à la base.** Ils touchent des **données
réelles** → à appliquer **toi-même**, idéalement sur une **copie de test d'abord**.
Issus de l'audit (`AUDIT_TALENTSECURE.md`, points D5 / D10 / D3).

## Procédure sûre (à suivre pour chaque migration)

1. **Crée une branche Neon** (= copie de ta base, 2 clics dans la console Neon → *Branches → Create branch*). Copie sa **chaîne de connexion pooler**.
2. **Sauvegarde** (filet) : la branche Neon est déjà une copie ; tu peux aussi lancer `npx ts-node src/scripts/backup-data.ts` si tu veux un export.
3. **Pré-vérifications** : lance les requêtes `-- PRÉ-CHECK` en commentaire en haut du fichier (s'il y en a) pour voir si des données bloqueraient la migration.
4. **Applique sur la COPIE** :
   ```bash
   cd backend
   DATABASE_URL="<chaîne-de-la-branche-Neon>" npx prisma db execute --file prisma/migrations/prepared/<fichier>.sql --schema prisma/schema.prisma
   ```
5. **Vérifie** que tout va bien sur la copie (l'app pointée sur la branche démarre, les pages concernées marchent).
6. **Applique sur la PROD** : même commande mais avec le `DATABASE_URL` de prod (ou laisse le `.env`).
7. **Mets le schéma à jour** : applique le bloc « SCHÉMA » indiqué dans le fichier à `prisma/schema.prisma`, puis `npx prisma generate`, commit, et push (déploiement).

> ⚠️ Ne modifie `schema.prisma` **qu'APRÈS** avoir appliqué le SQL à la prod — sinon
> le prochain déploiement générerait un client Prisma qui attend des colonnes/types
> pas encore présents en base.

## Les 3 migrations

| Fichier | Quoi | Risque | Pré-requis |
|---|---|---|---|
| `01_placement_money_decimal.sql` | Salaires/commissions des placements en `Decimal` (au lieu de `Float` imprécis) | 🟢 faible | aucun |
| `02_contacts_unique.sql` | Empêcher 2 fiches actives avec le même téléphone (candidats/prospects/employés) | 🟠 moyen | **dédupliquer d'abord** (requêtes PRÉ-CHECK dans le fichier) |
| Enums (valeurs imposées) | Remplacer des textes libres (`method`, `province`, etc.) par des listes fermées | 🟠 moyen | nettoyer les valeurs existantes colonne par colonne — **phase 2, à faire ensemble** |

**Recommandation** : commence par `01` (sans risque). `02` seulement après avoir
regardé/résolu les doublons. Les enums : on les fera dans une session dédiée car
chaque colonne demande de nettoyer ses valeurs existantes au cas par cas.
