# Stratégie de Sécurité des Données TalentSecure

Ce document décrit les mesures mises en place et les bonnes pratiques pour garantir la sécurité et l'intégrité des données de l'application TalentSecure.

## 1. Sauvegardes (Backups)

### A. Sauvegardes Automatiques (Neon.tech)
Notre base de données est hébergée sur **Neon.tech**.
*   **Point-In-Time Recovery (PITR) :** Neon conserve un historique des modifications permettant de restaurer la base de données à n'importe quelle seconde précise dans le passé (généralement sur une fenêtre de 7 jours ou plus selon le plan).
*   **Action :** En cas de perte de données critique, connectez-vous à la console Neon et utilisez la fonction "Restore" pour revenir à un point antérieur à l'incident.

### B. Sauvegardes Manuelles (Script Local)
Nous avons mis en place un script pour exporter les données au format JSON. Cela permet d'avoir une copie "froide" et portable des données.

**Commande :**
```bash
cd backend
npx ts-node src/scripts/backup-data.ts
```

**Emplacement :** Les fichiers sont sauvegardés dans `backend/backups/YYYY-MM-DD_HH-mm-ss/`.

**Quand l'utiliser ?**
*   Avant chaque mise en production majeure.
*   Avant d'exécuter des migrations de base de données risquées (`prisma migrate`).
*   De manière hebdomadaire pour archivage.

## 2. Gestion des Migrations (Prisma)

Les modifications de la structure de la base de données sont la cause la plus fréquente de perte de données accidentelle.

### Bonnes Pratiques :
1.  **Vérifier les migrations :** Toujours lire le fichier `.sql` généré par `prisma migrate dev` avant de le commiter.
2.  **Backup avant migration :** Toujours lancer le script de backup avant d'appliquer une migration en production.
3.  **Environnements séparés :**
    *   **Développement :** Utilisez une base de données de test. Vous pouvez la casser et la recréer.
    *   **Production :** Ne jamais utiliser `prisma migrate dev` ou `prisma db push` en production. Utilisez uniquement `prisma migrate deploy`.

## 3. Séparation des Environnements

Pour éviter d'écraser la production avec des données de test :
1.  Assurez-vous que le fichier `.env` local pointe vers une base de données de **DEV** (ex: `neondb_dev`).
2.  Le fichier `.env` de production (sur Cloud Run / Vercel) doit pointer vers la base de **PROD**.

## 4. Plan de Reprise d'Activité (Disaster Recovery)

**Scénario : Suppression accidentelle de données (ex: `DELETE FROM candidates`)**
1.  **Arrêter l'application** pour éviter d'écraser l'historique ou de créer des incohérences.
2.  **Vérifier Neon.tech :** Identifier l'heure exacte de l'incident.
3.  **Restaurer un "Branch" :** Créer une nouvelle branche Neon à partir du point de restauration (ex: `recovery-branch`).
4.  **Connecter l'app :** Changer l'URL de base de données pour pointer vers cette branche et vérifier que les données sont là.
5.  **Promouvoir :** Si tout est bon, promouvoir cette branche en production ou copier les données manquantes.

**Scénario : Corruption totale**
1.  Utiliser les fichiers JSON du dernier backup manuel.
2.  Créer un script de "seed" pour réimporter ces JSON (nécessite un script personnalisé selon les besoins).
