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
