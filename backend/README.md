# TalentSecure Backend

Backend API pour la plateforme TalentSecure - Gestion de candidats agents de sécurité.

## Stack Technique

- **Node.js 18+** avec TypeScript
- **Express.js** pour l'API REST
- **Prisma** comme ORM
- **PostgreSQL** pour la base de données
- **Passport.js** pour l'authentification (Local + Google OAuth + Microsoft OAuth)
- **JWT** pour les tokens
- **Google Cloud Storage** pour le stockage de fichiers

## Installation

```bash
# Installer les dépendances
npm install

# Copier le fichier d'environnement
cp .env.example .env

# Éditer .env avec vos valeurs
# DATABASE_URL, JWT_SECRET, GOOGLE_CLIENT_ID, etc.
```

## Configuration de la base de données

```bash
# Générer le client Prisma
npm run prisma:generate

# Créer la base de données et appliquer les migrations
npm run prisma:migrate

# (Optionnel) Ouvrir Prisma Studio pour voir les données
npm run prisma:studio
```

## Démarrage

### Mode développement
```bash
npm run dev
```

Le serveur démarre sur `http://localhost:5000`

### Mode production
```bash
# Build
npm run build

# Démarrer
npm start
```

## Scripts disponibles

- `npm run dev` - Démarre le serveur en mode développement avec rechargement automatique
- `npm run build` - Compile TypeScript vers JavaScript
- `npm start` - Démarre le serveur en production
- `npm run prisma:generate` - Génère le client Prisma
- `npm run prisma:migrate` - Crée et applique les migrations
- `npm run prisma:studio` - Ouvre l'interface Prisma Studio
- `npm test` - Lance les tests
- `npm run test:watch` - Lance les tests en mode watch
- `npm run test:coverage` - Lance les tests avec couverture

## Structure du projet

```
backend/
├── src/
│   ├── config/          # Configuration (database, passport)
│   ├── controllers/     # Contrôleurs (logique métier)
│   ├── routes/          # Définition des routes
│   ├── services/        # Services (PDF, upload, etc.)
│   ├── middleware/      # Middleware (auth, validation, etc.)
│   ├── utils/           # Utilitaires (jwt, password, etc.)
│   ├── validators/      # Schemas de validation
│   ├── jobs/            # Jobs asynchrones
│   └── server.ts        # Point d'entrée
├── prisma/
│   └── schema.prisma    # Schéma de base de données
├── tests/               # Tests
├── uploads/             # Fichiers uploadés localement
└── package.json
```

## Endpoints API

### Authentication
- `POST /api/auth/register` - Créer un utilisateur
- `POST /api/auth/login` - Se connecter
- `POST /api/auth/refresh` - Rafraîchir le token
- `GET /api/auth/profile` - Profil utilisateur
- `POST /api/auth/logout` - Se déconnecter
- `GET /api/auth/google` - OAuth Google
- `GET /api/auth/google/callback` - Callback Google

### Candidates (à venir)
- `GET /api/candidates` - Liste des candidats
- `GET /api/candidates/:id` - Détails d'un candidat
- `POST /api/candidates` - Créer un candidat
- `PUT /api/candidates/:id` - Modifier un candidat
- `DELETE /api/candidates/:id` - Supprimer un candidat

### Catalogues (à venir)
- `GET /api/catalogues` - Liste des catalogues
- `POST /api/catalogues` - Créer un catalogue
- `POST /api/catalogues/:id/generate` - Générer le PDF

## Variables d'environnement

Voir `.env.example` pour la liste complète.

Variables essentielles:
- `DATABASE_URL` - URL de connexion PostgreSQL
- `JWT_SECRET` - Clé secrète pour les JWT
- `GOOGLE_CLIENT_ID` - ID client Google OAuth
- `GOOGLE_CLIENT_SECRET` - Secret client Google OAuth
- `GCS_PROJECT_ID` - ID du projet Google Cloud
- `GCS_BUCKET_NAME` - Nom du bucket Cloud Storage

## Authentification

L'API supporte 3 méthodes d'authentification:

1. **Email/Password** - Connexion classique
2. **Google OAuth** - "Se connecter avec Google"
3. **Microsoft OAuth** - "Se connecter avec Microsoft" (à configurer)

Toutes les routes protégées nécessitent un JWT dans le header:
```
Authorization: Bearer <token>
```

## Rôles et permissions

- **ADMIN** - Accès complet
- **RH_RECRUITER** - Peut créer/modifier des candidats
- **SALES** - Peut voir les candidats et créer des catalogues

## Tests

```bash
# Lancer tous les tests
npm test

# Tests avec couverture
npm run test:coverage

# Mode watch pour développement
npm run test:watch
```

## Déploiement

Voir la documentation de déploiement sur Google Cloud Run dans le dossier `docs/`.

## Support

Pour toute question, consultez la documentation complète dans:
- `ARCHITECTURE_TALENTSECURE_MVP.md`
- `PLAN_DEVELOPPEMENT_MVP.md`
- `PROMPT_DEVELOPPEUR_COUTS_ROADMAP.md`
