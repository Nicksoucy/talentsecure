# Changelog - TalentSecure

## [2026-05-26] - Module de gestion des uniformes

### Nouveau module complet
- ✅ **Gestion des uniformes & équipements** pour les agents (divisions Sécurité / Signalisation), accessible aux rôles `ADMIN` + `RH_RECRUITER`.
- **Catalogue** par grandeur avec code-barres Code128/QR + étiquettes imprimables (bwip-js).
- **Inventaire** auditable via registre des mouvements (IN/OUT/ADJUST), réapprovisionnement, ajustement.
- **Remise (prêt)** :
  - Grille type formulaire XGuard (sections Uniforme / Équipement par division).
  - **Signature de l'employeur obligatoire avant l'agent**.
  - Agent signe par **SMS via GHL** (lien public tokenisé) ou au comptoir.
  - PDF du formulaire généré et archivé ; **3 photos de référence** (port de l'uniforme) intégrées pour la division Sécurité.
  - L'agent peut **télécharger son PDF** signé.
- **Retour** : qté + état (Bon → réintègre le stock ; Endommagé / Perdu → montant dû).
- **Profil employé** (`/employees/:id`) : infos de base + détentions actuelles, historique des transactions, montant dû, règlements, clôture fin d'emploi.
- **Rapports** : niveaux de stock (alertes bas), retours en retard, pertes/dommages.

### Architecture
- 8 tables Prisma + 7 enums (`uniform_items`, `uniform_variants`, `uniform_stock_movements`, `uniform_issuances`/`_lines`, `uniform_returns`/`_lines`, `uniform_debt_settlements`).
- Migration manuelle additive (`prisma db execute`) — n'altère pas les tables existantes.
- Lien aux employés via `employeeId String` sans FK (n'altère pas la table `employees`).
- Backend : routes sous `/api/uniforms` (ADMIN + RH) + signature publique sans auth, rate-limitée.
- Frontend : **un seul onglet « Uniformes »** dans le menu, avec sous-onglets (Catalogue · Inventaire · Remise · Retour · Rapports) + accès depuis le profil employé.

### Intégrations
- **GHL** : envoi SMS via `POST /conversations/messages`. Correction : la résolution de contact utilise le param `number` (et non `phone`).
- **Cloudflare R2** : stockage des signatures (PNG) et des PDF des formulaires.

### Fichiers principaux ajoutés
- Backend : `backend/src/{routes,controllers,services,scripts,constants,utils}/uniform*` (+ `signature.ts`, `sms.service.ts`, `uniform-photos.ts`).
- Migration : `backend/prisma/migrations/20260525000000_add_uniform_management/migration.sql`.
- Frontend : `frontend/src/pages/uniformes/*` (hub + composants), `frontend/src/pages/employees/EmployeeDetailPage.tsx`, `frontend/src/pages/public/UniformSignPage.tsx`.

### Dépendances ajoutées
- Backend : `bwip-js`.
- Frontend : `react-signature-canvas`, `@zxing/browser`.

## [2025-01-21] - Corrections d'encodage Frontend

### Corrections majeures
- ✅ **Correction complète des problèmes d'encodage de caractères** dans le frontend
  - `MainLayout.tsx`: Menu de navigation et menu utilisateur
  - `AutresCompetancesPage.tsx`: Tous les textes français (labels, messages, dialogues)
  
### Fichiers modifiés

#### `frontend/src/layouts/MainLayout.tsx`
- Corrigé "Autre Compétence" (était "Autre Compétance")
- Corrigé "Paramètres" et "Déconnexion" dans le menu utilisateur

#### `frontend/src/pages/autres-competances/AutresCompetancesPage.tsx`
**Corrections d'encodage:**
- Labels de niveaux: Débutant, Intermédiaire, Avancé, Expert
- Statuts de contact: Contacté, Non contacté
- Messages de succès et d'erreur
- Titres de dialogues: "Résultats de l'extraction", "Résultats de l'Extraction Batch"
- Statistiques: Traités, Ignorés, Échecs, Compétences Totales Extraites
- Onglets: "Extraction de CVs", "Recherche de Compétences"
- Filtres: "Filtrer les Compétences", "Compétences extraites"
- Messages d'état: "Chargement des compétences...", "Aucun résultat trouvé"

**Restauration de code:**
- Reconstruction de la fonction `handleBatchExtract` avec confirmation et estimation de coûts
- Restauration des fonctions: `getConfidenceColor`, `loadAllSkills`, `handleSkillSearch`
- Reconstruction complète de l'onglet "Search Tab" avec:
  - Bouton d'export
  - Cartes de statistiques
  - Graphiques (Répartition par catégorie, Niveaux d'expérience)
  - Filtre de recherche
- Restauration du tableau des candidats dans l'onglet "Extraction"
  - Colonnes: Candidat Potentiel, Ville, CV, Date de soumission, Contacté, Actions
  - Boutons d'action: Voir le profil, Extraire les compétences

**Corrections techniques:**
- Ajout des imports manquants: `SettingsIcon`, `AutoAwesomeIcon`, `CloseIcon`, `DownloadIcon`
- Correction du type de mutation batch (mapping vers IDs)
- Suppression du bouton "Paramètres" non implémenté
- Correction de la structure JSX (fermeture correcte des balises)

### Statut de compilation
- ✅ `AutresCompetancesPage.tsx`: 0 erreurs ESLint
- ✅ `MainLayout.tsx`: Aucune erreur
- ✅ Application frontend: Compile sans erreurs

### Tests recommandés
1. Vérifier l'affichage correct de tous les textes français
2. Tester l'extraction de compétences (simple et batch)
3. Vérifier la recherche de compétences
4. Tester les dialogues et notifications

## Prochaines étapes

### Pour le déploiement en production
1. ✅ Dockerfiles prêts (backend et frontend)
2. ✅ Variables d'environnement documentées
3. ⚠️ À vérifier:
   - Configuration Cloudflare R2 (stockage de fichiers)
   - Clé API OpenAI (extraction de compétences)
   - Base de données PostgreSQL (Neon DB configurée)
   - Secrets JWT (à régénérer pour production)

### Documentation disponible
- `DEPLOYMENT_GUIDE.md`: Guide complet de déploiement sur Google Cloud Run
- `README.md`: Documentation générale du projet
- `CLOUDFLARE_R2_SETUP.md`: Configuration du stockage de fichiers
- `GOOGLE_DRIVE_SETUP.md`: Alternative de stockage

### Commandes de déploiement
```bash
# Backend
cd backend
docker build -t talentsecure-backend .
docker run -p 8080:8080 --env-file .env talentsecure-backend

# Frontend
cd frontend
docker build -t talentsecure-frontend --build-arg VITE_API_URL=https://your-backend-url .
docker run -p 80:80 talentsecure-frontend
```

### Checklist pré-déploiement
- [ ] Tester l'application localement avec les corrections
- [ ] Vérifier toutes les fonctionnalités critiques
- [ ] Régénérer les secrets JWT pour production
- [ ] Configurer les variables d'environnement de production
- [ ] Tester la connexion à la base de données de production
- [ ] Vérifier la configuration Cloudflare R2
- [ ] Tester l'API OpenAI avec la clé de production
- [ ] Configurer les CORS pour les URLs de production
- [ ] Activer HTTPS/SSL
- [ ] Configurer les sauvegardes de base de données
