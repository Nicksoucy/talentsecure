# TalentSecure Frontend

Frontend de la plateforme TalentSecure - Interface web pour la gestion de candidats agents de sécurité.

## Stack Technique

- **React 18** avec TypeScript
- **Vite** comme build tool
- **Material-UI (MUI)** pour les composants UI
- **React Router** pour la navigation
- **React Query** pour la gestion de données
- **Zustand** pour le state management
- **React Hook Form** + Zod pour les formulaires

## Installation

```bash
# Installer les dépendances
npm install

# Copier le fichier d'environnement
cp .env.example .env

# Éditer .env si nécessaire
# VITE_API_URL=http://localhost:5000
```

## Démarrage

### Mode développement
```bash
npm run dev
```

L'application démarre sur `http://localhost:5173`

### Mode production
```bash
# Build
npm run build

# Preview du build
npm run preview
```

## Scripts disponibles

- `npm run dev` - Démarre le serveur de développement avec Hot Module Replacement
- `npm run build` - Compile l'application pour la production
- `npm run preview` - Preview du build de production
- `npm run lint` - Vérifie le code avec ESLint
- `npm run type-check` - Vérifie les types TypeScript

## Structure du projet

```
frontend/
├── public/              # Fichiers statiques
├── src/
│   ├── components/      # Composants réutilisables
│   ├── pages/           # Pages de l'application
│   │   ├── auth/        # Pages d'authentification
│   │   ├── candidates/  # Pages candidats
│   │   └── catalogues/  # Pages catalogues
│   ├── layouts/         # Layouts (Auth, Main)
│   ├── services/        # Services API
│   ├── hooks/           # Custom hooks
│   ├── store/           # Zustand stores
│   ├── types/           # Types TypeScript
│   ├── utils/           # Utilitaires
│   ├── theme/           # Configuration MUI theme
│   ├── App.tsx          # Composant principal
│   └── main.tsx         # Point d'entrée
├── index.html
├── vite.config.ts
└── package.json
```

## Routes de l'application

### Routes publiques
- `/login` - Page de connexion

### Routes protégées
- `/dashboard` - Tableau de bord
- `/candidates` - Liste des candidats
- `/candidates/:id` - Détails d'un candidat
- `/catalogues` - Liste des catalogues
- `/clients` - Liste des clients (à venir)
- `/settings` - Paramètres (à venir)

## Authentification

L'application supporte plusieurs méthodes d'authentification:

1. **Email/Password** - Connexion classique
2. **Google OAuth** - "Se connecter avec Google"
3. **Microsoft OAuth** - "Se connecter avec Microsoft" (à venir)

Les tokens JWT sont stockés dans localStorage et automatiquement ajoutés aux requêtes API.

## State Management

L'application utilise **Zustand** pour la gestion d'état:

- `authStore` - Gestion de l'authentification (utilisateur, tokens)
- Autres stores à venir selon les besoins

## Gestion des données

**React Query** est utilisé pour:
- Requêtes API
- Cache des données
- Synchronisation
- Rechargement automatique

## Composants Material-UI

L'application utilise Material-UI v5 avec:
- Thème personnalisé XGUARD
- Composants responsive
- Mode dark (à venir)
- Localisation française

## Développement

### Ajouter une nouvelle page

1. Créer le fichier dans `src/pages/`
2. Créer le composant
3. Ajouter la route dans `App.tsx`
4. Ajouter l'item dans le menu (si nécessaire) dans `MainLayout.tsx`

### Ajouter un nouveau service API

1. Créer le fichier dans `src/services/`
2. Utiliser l'instance `api` from `services/api.ts`
3. Définir les types dans `src/types/`

### Ajouter un custom hook

1. Créer le fichier dans `src/hooks/`
2. Suivre la convention `use[NomDuHook]`

## Configuration Vite

Le fichier `vite.config.ts` configure:
- Plugin React
- Alias de chemin (`@/*` → `src/*`)
- Proxy API (`/api` → `http://localhost:5000`)
- Port de développement (5173)

## Variables d'environnement

Voir `.env.example` pour la liste des variables.

Variables disponibles:
- `VITE_API_URL` - URL de l'API backend
- `VITE_APP_NAME` - Nom de l'application
- `VITE_APP_VERSION` - Version

**Note:** Toutes les variables doivent commencer par `VITE_` pour être accessibles dans le code.

## Build de production

```bash
npm run build
```

Génère un build optimisé dans le dossier `dist/`:
- HTML, CSS, JS minifiés
- Code splitting automatique
- Optimisation des assets
- Source maps générés

## Déploiement

Le frontend peut être déployé sur:
- **Google Cloud Storage** + Cloud CDN
- **Vercel** (recommandé pour Vite)
- **Netlify**
- **Firebase Hosting**

Voir la documentation de déploiement dans le dossier `docs/`.

## Support

Pour toute question, consultez:
- `ARCHITECTURE_TALENTSECURE_MVP.md`
- `PLAN_DEVELOPPEMENT_MVP.md`
- Documentation MUI: https://mui.com
- Documentation Vite: https://vitejs.dev
