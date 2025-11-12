# TalentSecure MVP

**Plateforme de gestion et vente de candidats agents de sécurité**

Client: XGUARD Security
Version: MVP 1.0
Date: Novembre 2025

---

## Statut du projet

✅ **MVP Fonctionnel !** (Mise à jour: Novembre 2025)

L'application TalentSecure est maintenant opérationnelle avec les fonctionnalités principales:

### Backend (Node.js + TypeScript + Express)
- ✅ Structure du projet créée
- ✅ Configuration TypeScript
- ✅ Serveur Express configuré
- ✅ Schema Prisma complet (14 tables)
- ✅ Configuration d'authentification (Local + Google OAuth)
- ✅ Middleware JWT et RBAC
- ✅ Routes API d'authentification
- ✅ Gestion des erreurs
- ✅ **Import Excel automatique** des 97 candidats
- ✅ **Upload et téléchargement de CVs** (Multer + système de fichiers)
- ✅ **Génération de catalogues PDF** (PDFKit)
- ✅ **Gestion complète des clients** (CRUD)
- ✅ **API de statistiques** (candidats par ville, etc.)
- ✅ **Script d'association automatique des CVs**
- ✅ **Gestion des prospects** (CRUD avec filtres avancés)
- ✅ **Import Google Sheets** automatique des prospects
- ✅ **Intégration GoHighLevel API** (export contacts)
- ✅ **API statistiques prospects** (par ville, statut, tendances)

### Frontend (React + TypeScript + Material-UI)
- ✅ Structure du projet créée
- ✅ Configuration Vite
- ✅ Thème Material-UI personnalisé
- ✅ Routing (React Router)
- ✅ State management (Zustand)
- ✅ Services API (Axios + React Query)
- ✅ Layouts (Auth + Main)
- ✅ Page de login fonctionnelle
- ✅ **Dashboard avec statistiques en temps réel**
- ✅ Navigation principale
- ✅ **CRUD Candidats complet** (liste, détail, création, modification, suppression)
- ✅ **Recherche et filtres avancés** (10+ critères avec debouncing)
- ✅ **Autocomplete intelligent** (ville + noms candidats)
- ✅ **Formulaire d'évaluation d'entretien** (grille de notation détaillée)
- ✅ **Création de catalogues PDF** avec sélection multiple
- ✅ **Gestion des clients** (interface complète)
- ✅ **Map interactive du Québec** (Leaflet) montrant distribution des candidats
- ✅ **Téléchargement de CVs** depuis l'interface
- ✅ **Gestion des prospects** (liste, détail, création, modification)
- ✅ **Map interactive des prospects** (clustering, filtres par ville)
- ✅ **Sélection multi-pages Gmail-style** (sélectionner tous les prospects filtrés)
- ✅ **Export CSV des prospects** (avec sélection multiple)
- ✅ **Marquage en masse** (contacter plusieurs prospects à la fois)
- ✅ **Statistiques prospects** (graphiques, tendances par ville)

---

## Prochaines étapes

### Priorités d'optimisation

**Performance & Scalabilité**
1. **Indexation database** - Ajouter index sur firstName, lastName, city, status pour accélérer les recherches
2. **Cache Redis** - Mettre en cache les résultats de recherche fréquents
3. **Optimiser les requêtes Prisma** - Utiliser `select` au lieu de tout charger
4. **Pagination côté serveur** - Limiter les données transférées

**Fonctionnalités implémentées**
5. ✅ **Upload de vidéos d'entretien** - Intégration Google Cloud Storage (backend + frontend complets)
6. ✅ **Player vidéo intégré** - Afficher vidéos dans la fiche candidat
7. ✅ **Système de gestion des prospects** - CRUD complet avec map interactive
8. ✅ **Import Google Sheets** - Synchronisation automatique des prospects depuis formulaire
9. ✅ **Export CSV prospects** - Export multi-sélection avec filtres
10. ✅ **Intégration GoHighLevel** - Export automatique des contacts vers CRM

**Fonctionnalités manquantes**
11. **Email automatique pour catalogues** - Envoyer catalogues PDF par email
12. **Export Excel candidats** - Exporter résultats de recherche en Excel

**Qualité & Sécurité**
9. **Tests unitaires** - Tests pour candidateController, authController
10. **Validation Zod** - Validation backend pour toutes les routes
11. **Rate limiting spécifique** - Limites par endpoint
12. **Logs structurés** - Winston ou Pino pour meilleur monitoring

**UX Improvements**
13. **Navigation directe depuis autocomplete** - Aller à la fiche candidat depuis la recherche
14. **Infinite scroll** - Remplacer pagination par scroll infini
15. **Filtres sauvegardés** - Sauvegarder recherches fréquentes
16. **Notifications en temps réel** - WebSockets pour notifications

---

## Installation rapide

### Prérequis

- **Node.js 18+** installé
- **PostgreSQL 15+** installé (ou compte Google Cloud SQL)
- **npm** ou **yarn**
- Compte Google Cloud (pour OAuth et stockage)

### Installation

```bash
# 1. Cloner/naviguer vers le projet
cd C:\Recrutement\talentsecure

# 2. Installer backend
cd backend
npm install
cp .env.example .env
# Éditer .env avec vos valeurs (DATABASE_URL, JWT_SECRET, etc.)

# 3. Initialiser la base de données
npm run prisma:generate
npm run prisma:migrate

# 4. (Optionnel) Créer un utilisateur de test et associer les CVs
npx tsx src/scripts/create-test-user.ts
# Si vous avez des CVs dans C:\Recrutement\cv candidats
npx tsx src/scripts/link-cvs.ts

# 5. Installer frontend
cd ../frontend
npm install
cp .env.example .env

# 6. Démarrer le backend (terminal 1)
cd ../backend
npm run dev

# 7. Démarrer le frontend (terminal 2)
cd ../frontend
npm run dev
```

### Accès à l'application

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:5000
- **Health check:** http://localhost:5000/health

**Identifiants de test:**
- Email: `test@xguard.com`
- Mot de passe: `Test123!`
- Rôle: ADMIN

---

## 🚀 Déploiement sur Google Cloud Run

### Production URL
- **Application en ligne:** https://talentsecure-frontend-XXXXX.run.app *(à venir)*
- **API Backend:** https://talentsecure-backend-XXXXX.run.app *(à venir)*

### Prérequis
- Compte Google Cloud Platform avec facturation activée
- Projet Google Cloud créé : `talentsecure`
- APIs activées :
  - Cloud Run API
  - Cloud Build API
  - Cloud Storage API
  - Artifact Registry API

### Déploiement via Google Cloud Console

#### 1️⃣ Déployer le Backend

**Aller sur Cloud Run :**
```
https://console.cloud.google.com/run?project=talentsecure
```

**Créer le service :**
- Cliquer sur "CREATE SERVICE"
- Source : "Continuously deploy from a repository (source)"
- Cliquer "SET UP WITH CLOUD BUILD"
- Provider : **GitHub**
- Repository : `Nicksoucy/talentsecure`
- Branch : `main`
- Build Type : **Dockerfile**
- Source location : `/backend/Dockerfile`
- Service name : `talentsecure-backend`
- Region : `us-central1` (ou `northamerica-northeast1` pour Montréal)
- Authentication : ✅ Allow unauthenticated invocations

**Variables d'environnement :**
```
NODE_ENV=production
PORT=8080
DATABASE_URL=<votre_url_neon>
JWT_SECRET=<votre_secret>
JWT_REFRESH_SECRET=<votre_refresh_secret>
FRONTEND_URL=https://talentsecure-frontend-XXXXX.run.app
```

**Container port :** `8080`

#### 2️⃣ Déployer le Frontend

**Créer un nouveau service :**
- Source : "Continuously deploy from a repository (source)"
- Repository : `Nicksoucy/talentsecure`
- Build Type : **Dockerfile**
- Source location : `/frontend/Dockerfile`
- Service name : `talentsecure-frontend`
- Region : `us-central1` (ou `northamerica-northeast1`)
- Authentication : ✅ Allow unauthenticated invocations

**Variables d'environnement :**
```
VITE_API_URL=https://talentsecure-backend-XXXXX.run.app
```

**Container port :** `80`

#### 3️⃣ Mettre à jour FRONTEND_URL

Une fois le frontend déployé :
1. Copier l'URL du frontend
2. Retourner dans le service backend
3. Mettre à jour la variable `FRONTEND_URL` avec l'URL du frontend
4. Redéployer le backend

### Configuration de la base de données

L'application utilise **Neon PostgreSQL** (déjà configuré) :
- URL de connexion dans la variable `DATABASE_URL`
- Pas besoin de Cloud SQL pour le MVP
- Migration possible vers Cloud SQL plus tard si nécessaire

### Coût mensuel estimé

| Service | Coût |
|---------|------|
| Cloud Run Backend | $10-20 |
| Cloud Run Frontend | $5-10 |
| Neon PostgreSQL | $0-20 |
| **Total** | **$15-50/mois** |

**Note :** Crédits gratuits de $300 pendant 90 jours pour nouveaux comptes !

### Monitoring

- **Logs Backend :** https://console.cloud.google.com/run/detail/us-central1/talentsecure-backend/logs
- **Logs Frontend :** https://console.cloud.google.com/run/detail/us-central1/talentsecure-frontend/logs
- **Metrics :** https://console.cloud.google.com/run?project=talentsecure

---

## Structure du projet

```
talentsecure/
├── backend/                 # API Node.js + Express
│   ├── src/
│   │   ├── config/         # Configuration (DB, Passport)
│   │   ├── controllers/    # Logique métier
│   │   ├── routes/         # Routes API
│   │   ├── services/       # Services (PDF, upload, etc.)
│   │   ├── middleware/     # Middleware (auth, validation)
│   │   ├── utils/          # Utilitaires
│   │   └── server.ts       # Point d'entrée
│   ├── prisma/
│   │   └── schema.prisma   # Schema DB
│   ├── package.json
│   └── README.md
│
├── frontend/               # Application React
│   ├── src/
│   │   ├── components/    # Composants réutilisables
│   │   ├── pages/         # Pages
│   │   ├── layouts/       # Layouts
│   │   ├── services/      # Services API
│   │   ├── store/         # State management
│   │   ├── types/         # Types TypeScript
│   │   ├── theme/         # Thème MUI
│   │   └── App.tsx
│   ├── package.json
│   └── README.md
│
├── shared/                # Code partagé (à venir)
├── docs/                  # Documentation
└── README.md             # Ce fichier
```

---

## Technologies utilisées

### Backend
- **Node.js 18** + TypeScript
- **Express.js** - Framework API
- **Prisma** - ORM
- **PostgreSQL 15** - Base de données
- **Passport.js** - Authentification (Local + Google OAuth)
- **JWT** - Tokens d'authentification
- **PDFKit** - Génération PDF
- **Google Cloud Storage** - Stockage fichiers

### Frontend
- **React 18** + TypeScript
- **Vite** - Build tool
- **Material-UI (MUI)** - Composants UI
- **React Router** - Navigation
- **React Query** - Gestion données
- **Zustand** - State management
- **React Hook Form + Zod** - Formulaires

### Infrastructure
- **Google Cloud Platform**
  - Cloud Run (hébergement)
  - Cloud SQL (PostgreSQL)
  - Cloud Storage (fichiers)
  - Memorystore (Redis cache)
  - Cloud Build (CI/CD)
- **Azure Blob Storage** (backup)

---

## Configuration minimale requise

### Pour développement local

- **RAM:** 4 GB minimum (8 GB recommandé)
- **Disque:** 2 GB d'espace libre
- **OS:** Windows 10+, macOS 10.15+, Ubuntu 20.04+
- **Internet:** Connexion stable pour OAuth et Cloud Storage

### Pour production (Google Cloud)

- **Cloud Run:** 1 instance (512 MB RAM, 1 vCPU)
- **Cloud SQL:** db-f1-micro (1 vCPU, 0.6 GB RAM)
- **Cloud Storage:** Bucket standard
- **Memorystore Redis:** 1 GB (optionnel)

**Coût estimé:** 65-120$/mois

---

## Commandes utiles

### Backend

```bash
cd backend

# Développement
npm run dev                    # Démarre avec rechargement auto

# Prisma
npm run prisma:generate        # Génère le client Prisma
npm run prisma:migrate         # Crée/applique migrations
npm run prisma:studio          # Interface visuelle DB

# Build & Production
npm run build                  # Compile TypeScript
npm start                      # Démarre en production

# Tests
npm test                       # Lance les tests
npm run test:coverage          # Tests avec couverture

# Scripts utiles
npx tsx src/scripts/create-test-user.ts              # Créer utilisateur de test
npx tsx src/scripts/link-cvs.ts                      # Associer les CVs aux candidats
npx tsx src/scripts/import-from-google-sheet.ts      # Importer prospects depuis Google Sheet
npx tsx src/scripts/check-recent-prospects.ts        # Voir les 5 derniers prospects créés
npx tsx src/scripts/normalize-prospect-cities.ts     # Normaliser les noms de villes
```

### Frontend

```bash
cd frontend

# Développement
npm run dev                    # Démarre sur localhost:5173

# Build & Production
npm run build                  # Build optimisé
npm run preview                # Preview du build

# Qualité code
npm run lint                   # ESLint
npm run type-check             # Vérification types
```

---

## Documentation complète

📚 **Consultez les documents détaillés:**

1. **README_TALENTSECURE.md** - Guide de navigation
2. **ARCHITECTURE_TALENTSECURE_MVP.md** - Architecture technique complète
3. **PLAN_DEVELOPPEMENT_MVP.md** - Plan semaine par semaine avec code
4. **PROMPT_DEVELOPPEUR_COUTS_ROADMAP.md** - Coûts, roadmap, mega prompt
5. **INDEX_TOUS_LES_FICHIERS.md** - Index de tous les fichiers

**Emplacement:** `C:\Recrutement\talentsecure\` (à la racine du projet)

---

## Authentification

### Créer le premier utilisateur Admin

Une fois la base de données initialisée, créez un utilisateur admin:

```bash
# Option 1: Via API (avec Postman ou curl)
POST http://localhost:5000/api/auth/register
Content-Type: application/json

{
  "email": "admin@xguard.com",
  "password": "VotreMotDePasseSécurisé123!",
  "firstName": "Admin",
  "lastName": "XGUARD",
  "role": "ADMIN"
}

# Option 2: Via Prisma Studio
npm run prisma:studio
# Créer manuellement dans la table users
```

### Se connecter

1. Ouvrir http://localhost:5173/login
2. Entrer email et mot de passe
3. Ou cliquer "Se connecter avec Google"

---

## Gestion des Prospects

### Fonctionnalités

Le système de gestion des prospects permet de :
- **Importer automatiquement** des prospects depuis Google Sheets
- **Visualiser sur une carte** interactive avec clustering
- **Filtrer** par ville, statut de contact, statut de conversion
- **Sélectionner en masse** (style Gmail - sélection multi-pages)
- **Exporter en CSV** les prospects sélectionnés
- **Marquer comme contactés** en masse
- **Exporter vers GoHighLevel** (CRM)

### Import depuis Google Sheets

Configuration requise dans `backend/.env` :
```bash
GOOGLE_SHEETS_API_KEY=votre-clé-api
```

Pour importer les prospects :
```bash
cd backend
npx tsx src/scripts/import-from-google-sheet.ts
```

Le script :
- ✅ Récupère les données du Google Sheet public
- ✅ Normalise les noms de villes (Montréal, Québec, etc.)
- ✅ Détecte et ignore les doublons (email ou téléphone)
- ✅ Parse les dates de soumission
- ✅ Associe automatiquement les CVs si disponibles

### Export vers GoHighLevel

Configuration requise dans `backend/.env` :
```bash
GOHIGHLEVEL_API_KEY=votre-clé-api
GOHIGHLEVEL_LOCATION_ID=votre-location-id
```

L'export se fait via l'interface web (bouton "Exporter vers GoHighLevel") ou via API :
```bash
POST /api/prospects/export-to-gohighlevel
Content-Type: application/json

{
  "prospectIds": ["id1", "id2", "id3"]
}
```

### Carte Interactive

La carte des prospects (`/prospects`) affiche :
- 🗺️ Clustering automatique par densité
- 📍 Marqueurs bleus pour les prospects
- 🔢 Badges avec nombre de prospects par ville
- 🖱️ Clic sur ville → filtre la liste automatiquement
- 🔍 Zoom pour voir détails individuels

### Sélection Multi-Pages (Gmail-style)

1. **Cocher les prospects** sur la page actuelle
2. Quand toute la page est sélectionnée, voir le message :
   *"20 prospects sélectionnés sur cette page. Sélectionner tous les 50 prospects de Québec?"*
3. **Cliquer "Sélectionner tout"** pour sélectionner ALL prospects matching les filtres
4. **Exporter CSV** ou **Marquer comme contactés** en masse

### Export CSV

Format du CSV :
- Prénom, Nom
- Email, Téléphone
- Ville, Province, Code Postal, Adresse
- CV (Oui/Non)
- Date de soumission
- Contacté (Oui/Non)
- Converti (Oui/Non)
- Notes

Encodage : UTF-8 avec BOM (support accents français)

---

## Dépannage

### Erreur: "Cannot connect to database"

**Solution:**
- Vérifier que PostgreSQL est démarré
- Vérifier `DATABASE_URL` dans backend/.env
- Tester la connexion: `psql -U user -d talentsecure`

### Erreur: "Module not found"

**Solution:**
```bash
# Backend
cd backend && npm install

# Frontend
cd frontend && npm install
```

### Port déjà utilisé

**Solution:**
```bash
# Changer le port dans backend/.env
PORT=5001

# Ou dans frontend/vite.config.ts
server: { port: 5174 }
```

### Erreur Google OAuth

**Solution:**
- Vérifier `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` dans backend/.env
- Vérifier que le callback URL est autorisé dans Google Cloud Console
- Callback URL: `http://localhost:5000/api/auth/google/callback`

---

## Roadmap

### Phase 1 - MVP (10 semaines) ✅ En cours
- Setup & Architecture
- CRUD Candidats
- Import Excel
- Recherche avancée
- Génération PDF
- Déploiement

### Phase 2 - Portal Client (8 semaines)
- Login clients
- Visualisation catalogues
- Vidéos streamées
- Demande placement
- Urgency button
- E-signature contrats

### Phase 3 - Features Avancées (12 semaines)
- Background checks (Checkr API)
- Video interviews (Twilio)
- AI Matching
- Analytics avancées
- Shift management
- Multi-language

### Phase 4 - Mobile + Marketplace (15 semaines)
- Apps iOS + Android
- Guard Pools
- Urgency button like Uber
- API publique
- Payroll integration

### Phase 5+ - SaaS Multi-Tenant
- Autres agences peuvent s'inscrire
- Marketplace inter-agences
- Revenus: 500K-1M$/an

---

## Support

### Questions techniques
- Consulter les README dans `backend/` et `frontend/`
- Consulter la documentation complète
- Stack Overflow pour questions générales

### Bugs
- GitHub Issues (si repo créé)
- Documentation d'erreurs dans `docs/`

### Questions business
- Équipe XGUARD Security

---

## Contribuer

### Git Workflow

```bash
# 1. Créer une branche pour la feature
git checkout -b feature/nom-de-la-feature

# 2. Faire vos modifications
# ... coder ...

# 3. Commit
git add .
git commit -m "feat: description de la feature"

# 4. Push
git push origin feature/nom-de-la-feature

# 5. Créer une Pull Request
```

### Convention de commits

- `feat:` - Nouvelle fonctionnalité
- `fix:` - Correction de bug
- `docs:` - Documentation
- `style:` - Formatage
- `refactor:` - Refactoring
- `test:` - Tests
- `chore:` - Tâches diverses

---

## Licence

MIT - XGUARD Security

---

## Contact

**XGUARD Security**
Email: contact@xguard.com
Web: www.xguard.security

---

**Construisons quelque chose d'incroyable ! 💪🚀**
