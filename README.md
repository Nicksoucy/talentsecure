# TalentSecure Platform

Plateforme complète de gestion et distribution de candidats agents de sécurité avec portail client intégré.

## Vue d'ensemble

TalentSecure est une solution full-stack qui permet de:
- Gérer une banque de talents (candidats et prospects)
- Créer des catalogues personnalisés pour les clients
- Partager les catalogues via un portail client sécurisé
- Visualiser la distribution géographique des candidats en temps réel
- Gérer les demandes de recrutement

## Stack Technique

### Backend
- **Node.js 18+** avec TypeScript
- **Express.js** pour l'API REST
- **Prisma** comme ORM
- **PostgreSQL** pour la base de données
- **Passport.js** pour l'authentification (JWT + OAuth Google/Microsoft)
- **Cloudflare R2** pour le stockage de fichiers (CVs, vidéos, PDFs)
- **PDFKit** pour la génération de catalogues PDF
- **OpenAI GPT-4** pour l'extraction intelligente de compétences depuis les CVs

### Frontend
- **React 18** avec TypeScript
- **Vite** comme build tool
- **Material-UI (MUI)** pour l'interface utilisateur
- **React Query** pour la gestion des données
- **Zustand** pour le state management
- **React Router** pour le routing
- **Leaflet** pour les cartes interactives
- **Notistack** pour les notifications

## Architecture du Projet

```
talentsecure/
├── backend/                 # API Node.js/Express
│   ├── src/
│   │   ├── config/         # Configuration (database, passport, storage)
│   │   ├── controllers/    # Contrôleurs métier
│   │   ├── routes/         # Définition des routes API
│   │   ├── services/       # Services (PDF, upload, email)
│   │   ├── middleware/     # Middleware (auth, validation)
│   │   ├── utils/          # Utilitaires (jwt, password, etc.)
│   │   └── scripts/        # Scripts de migration et maintenance
│   └── prisma/
│       └── schema.prisma   # Schéma de base de données
│
└── frontend/               # Application React
    ├── src/
    │   ├── components/     # Composants réutilisables
    │   │   ├── admin/     # Composants admin
    │   │   └── client/    # Composants portail client
    │   ├── pages/          # Pages de l'application
    │   │   ├── auth/      # Pages d'authentification
    │   │   ├── candidates/ # Gestion des candidats
    │   │   ├── catalogues/ # Gestion des catalogues
    │   │   ├── clients/    # Gestion des clients
    │   │   └── client/     # Portail client
    │   ├── services/       # Services API
    │   ├── store/          # State management (Zustand)
    │   └── utils/          # Utilitaires
    └── public/             # Assets statiques
```

## Fonctionnalités Principales

### 1. Administration (Backoffice)

#### Gestion des Candidats
- Création et modification de profils candidats
- Upload de CVs (stockage Cloudflare R2)
- Upload de vidéos d'entrevue (stockage Cloudflare R2)
- Gestion des langues, expériences, certifications
- Système de notation globale
- Statuts: NOUVEAU, EN_TRAITEMENT, DISPONIBLE, EN_RECHERCHE, EMBAUCHE, ARCHIVE

#### Gestion des Prospects
- Importation depuis LinkedIn
- Évaluation et qualification
- Migration vers candidats actifs
- Cartes géographiques interactives

#### Gestion des Clients
- Création de profils clients
- Configuration des accès portail
- Génération de mots de passe sécurisés
- Historique des catalogues

#### Gestion des Catalogues
- Création de catalogues personnalisés
- Sélection de candidats avec ordre personnalisable
- Génération automatique de PDF
- Système de paiement et restriction de contenu
- Partage sécurisé via lien unique
- Tracking des vues et interactions

#### Gestion des Compétences et Extraction IA 🆕
- **Extraction automatique de compétences depuis CVs**
  - Intégration OpenAI GPT-4 pour analyse intelligente
  - Extraction de compétences techniques et soft skills
  - Évaluation automatique du niveau d'expérience
  - Support pour formats PDF et TXT

- **Interface "Autres Compétences"**
  - Recherche de candidats par compétences spécifiques
  - Statistiques en temps réel (candidats, compétences uniques, liens)
  - Traitement batch pour plusieurs candidats/prospects
  - Auto-conversion prospect → candidat lors de l'extraction

- **Base de données de compétences**
  - Catalogue de 95+ compétences pré-identifiées
  - Système de liens candidat-compétence
  - Recherche et filtrage avancés

#### Wishlists
- Gestion de listes de souhaits pour les clients
- Association de candidats favoris
- Suivi des préférences clients

### 2. Portail Client

#### Authentification
- Connexion sécurisée (email/password)
- JWT avec refresh tokens
- Authentification séparée du backoffice

#### Dashboard Client
- **Vue d'ensemble des catalogues personnalisés**
  - Liste des catalogues assignés
  - Statut et nombre de candidats
  - Indicateurs de paiement

- **Carte des Candidats Potentiels** 🆕
  - Visualisation en temps réel de tous les candidats disponibles
  - Deux vues: Zones (cercles) et Marqueurs (clusters)
  - Regroupement par ville avec comptage
  - Différenciation visuelle (bleu = potentiels, vert = assignés)
  - Système de demande intégré

#### Détails des Catalogues
- **Informations des candidats**
  - Profils détaillés (langues, expériences, certifications)
  - Notes et évaluations
  - Disponibilités

- **Médias**
  - Lecteur vidéo intégré pour les entrevues
  - Téléchargement de CVs
  - Génération de PDF du catalogue

- **Carte Géographique des Candidats** 🆕
  - Visualisation des candidats du catalogue par ville
  - Toggle entre vue cercles et clusters
  - Popups interactifs
  - Bouton "Demander ces candidats"

#### Système de Restriction de Contenu
- Catalogues gratuits vs payants
- Masquage des informations sensibles (email, téléphone, CV, vidéo)
- Indicateurs visuels de contenu verrouillé

### 3. Cartes Géographiques Interactives 🆕

#### Technologies
- **Leaflet** pour le rendu de cartes
- **react-leaflet** pour l'intégration React
- **react-leaflet-cluster** pour le regroupement de marqueurs
- Tuiles OpenStreetMap (style CARTO)

#### Types de Cartes

##### Carte Zones (Cercles)
- Cercles proportionnels au nombre de candidats
- Code couleur selon la densité
  - Candidats assignés: Vert (5) → Jaune (10) → Orange (20) → Rouge (20+)
  - Candidats potentiels: Bleu clair → Bleu foncé selon la densité
- Rayon adaptatif

##### Carte Clusters (Marqueurs)
- Marqueurs individuels par ville
- Clustering automatique lors du zoom/dézoom
- Icônes colorées:
  - Vert: Candidats assignés
  - Bleu: Candidats potentiels

#### Interactions
- Popups avec informations détaillées
- Bouton "Demander ces candidats"
- Dialog de demande avec formulaire
- Notifications de confirmation

## Installation et Configuration

### Prérequis
- Node.js 18+
- PostgreSQL 14+
- Compte Cloudflare R2 (ou S3-compatible)

### Backend

```bash
cd backend

# Installer les dépendances
npm install

# Configuration
cp .env.example .env
# Éditer .env avec vos valeurs

# Base de données
npm run prisma:generate
npm run prisma:migrate

# Démarrer en développement
npm run dev
```

### Frontend

```bash
cd frontend

# Installer les dépendances
npm install

# Configuration
cp .env.example .env
# Éditer .env avec l'URL du backend

# Démarrer en développement
npm run dev
```

## Variables d'Environnement

### Backend (.env)
```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/talentsecure"

# JWT
JWT_SECRET="your-super-secret-key"
JWT_REFRESH_SECRET="your-refresh-secret"

# Cloudflare R2
CLOUDFLARE_ACCOUNT_ID="your-account-id"
CLOUDFLARE_ACCESS_KEY_ID="your-access-key"
CLOUDFLARE_SECRET_ACCESS_KEY="your-secret-key"
R2_BUCKET_NAME="talentsecure-files"
R2_PUBLIC_URL="https://files.yourdomain.com"

# OpenAI (pour extraction de compétences)
OPENAI_API_KEY="sk-your-openai-api-key"

# OAuth (optionnel)
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
MICROSOFT_CLIENT_ID="your-microsoft-client-id"
MICROSOFT_CLIENT_SECRET="your-microsoft-client-secret"

# Frontend URL
FRONTEND_URL="http://localhost:5173"

# Server
PORT=5000
NODE_ENV=development
```

### Frontend (.env)
```env
VITE_API_URL=http://localhost:5000
```

## Contributeurs

Développé avec Claude Code (Anthropic)

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

## Mises à jour et instructions

Ces points couvrent les changements livrés en novembre 2025. Merci de les parcourir avant tout nouveau développement :

1. **Gestion d'erreurs & validation** : consultez `backend/src/middleware` et `backend/src/utils` pour les nouveaux helpers (`ApiError`, sanitisation XSS, validation Zod). Toute nouvelle route doit s'appuyer dessus.

2. **Cache Redis optionnel** : la configuration se trouve dans `backend/src/config/cache.ts` et `backend/src/utils/cache.ts`. Activez-le via `CACHE_ENABLED=true` et les variables `REDIS_*` dans `.env`. Sans Redis, l'API fonctionne en mode sans cache.

3. **Optimisation des fichiers** : `backend/src/services/image.service.ts` compresse automatiquement les images uploadées; les vidéos restent gérées par `video.service.ts`.

4. **Frontend lazy loading & validation** : `frontend/src/App.tsx` utilise désormais `React.lazy`/`Suspense` et `frontend/src/validation/candidate.ts` centralise la validation des formulaires candidats. Les composants lourds (Leaflet maps, formulaires d'évaluation) sont chargés à la demande.

5. **Extraction IA de compétences** 🆕 : le système d'extraction automatique de compétences utilise OpenAI GPT-4 via `backend/src/services/cv-extraction.service.ts` et `backend/src/controllers/skills.controller.ts`. L'interface se trouve dans `frontend/src/pages/autres-competances/AutresCompetancesPage.tsx`. **Important** : lors de l'extraction sur un prospect, le système le convertit automatiquement en candidat pour permettre la liaison des compétences.

6. **Conversion prospects → candidats** 🆕 : une page dédiée `frontend/src/pages/prospects/ProspectConvertPage.tsx` permet de convertir un prospect en candidat avec formulaire d'évaluation complet. La route est `/prospects/:id/convert`.

7. **Validation des dates** : les champs de dates utilisent désormais un helper `optionalDateString` dans `candidate.ts` qui transforme les chaînes vides en `null` avant validation pour éviter les erreurs de format.

8. **Sanitization XSS** : temporairement désactivée dans `server.ts` en attendant l'installation du package `xss`. À réactiver après installation de la dépendance manquante.

En cas de doute, revenez à cette section : elle indique où lire le code mis à jour.

## Licence

MIT - XGUARD Security

---

## Contact

**XGUARD Security**
Email: contact@xguard.com
Web: www.xguard.security

---

**Construisons quelque chose d'incroyable ! 💪🚀**
