# TalentSecure — Frontend

Interface web (backoffice RH/admin + portail client) de la plateforme XGuard. **Voir le [README racine](../README.md)** pour la vue d'ensemble et le déploiement.

## Stack

- **React 18** + TypeScript, **Vite**
- **Material-UI (MUI)**, **React Query**, **Zustand**, **React Router**
- **Leaflet** / react-leaflet (cartes), **Notistack** (toasts)
- Aperçu CV : **docx-preview** (DOCX) + iframe (PDF) + `<img>` (images)

## Démarrer en local

```bash
npm install
cp .env.example .env          # VITE_API_URL=http://localhost:5000
npm run dev                   # http://localhost:5173
```

## Scripts npm

| Script | Rôle |
|---|---|
| `npm run dev` | Serveur Vite + HMR sur :5173 |
| `npm run build` | Build de production → `dist/` |
| `npm run build:check` | `tsc` (vérif types) **puis** build |
| `npm run preview` | Sert le build localement |
| `npm run type-check` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` / `test:watch` / `test:coverage` | Vitest |

> `npm run build` ne bloque pas sur les types ; `type-check` remonte ~23 erreurs **préexistantes** dans des fichiers hérités (tolérées). Ne pas en introduire de nouvelles.

## Structure

```
src/
├── components/     # CVPreview (aperçu universel), map/ (cartes), video/, client/…
├── pages/
│   ├── auth/           # connexion admin
│   ├── prospects/      # Candidats Potentiels (liste, fiche éditable, carte + rayon)
│   ├── candidates/     # candidats actifs
│   ├── catalogues/     # catalogues PDF
│   ├── clients/        # gestion clients
│   ├── client/         # portail client + marketplace (achat Stripe)
│   ├── uniformes/      # gestion des uniformes
│   └── autres-competances/  # recherche par compétence
├── services/       # appels API (axios)
├── store/          # authStore / clientAuthStore (init synchrone)
├── types/ • utils/ • theme/
├── App.tsx         # routes (lazy/Suspense)
└── main.tsx
```

## Routing & auth

- **Backoffice** (protégé) : `/dashboard`, `/prospects`, `/candidates`, `/catalogues`, `/clients`, `/uniformes`, `/autres-competances`… JWT admin.
- **Portail client** (auth séparée) : connexion client + marketplace + détail catalogue.
- L'état d'auth est **initialisé de façon synchrone** (`store/authStore.ts`, `clientAuthStore.ts`) → un **rafraîchissement de page ne déconnecte plus** l'utilisateur.

## Composants clés

- **`components/CVPreview.tsx`** — détecte le type par **octets magiques** (pas l'extension) via le proxy `/api/prospects/cv-proxy` : PDF (iframe), DOCX (docx-preview), images PNG/JPEG/GIF/WEBP/BMP (`<img>`), `.doc` (message + téléchargement).
- **`components/map/ProspectsMapClustered.tsx` / `CandidatesMap.tsx`** — **1 marqueur par ville** (coords du backend) + **sélection par rayon** (popup → 10/25/50/100 km → coche les prospects de la zone → actions groupées).
- **Marketplace client** — candidats anonymisés + vidéo ; coordonnées révélées **après achat Stripe**.

## Configuration Vite

`vite.config.ts` : plugin React, alias `@/*` → `src/*`, proxy `/api` → `http://localhost:5000`, port 5173. Composants lourds (cartes, libs) en **lazy loading**.

## Variables d'environnement

`VITE_API_URL` (URL du backend). Toute variable exposée au code doit être préfixée `VITE_`.

## Déploiement

Google Cloud Run (`talentsecure-frontend`) via Cloud Build sur push `main`. Détails : [README racine](../README.md).
