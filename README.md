# TalentSecure

Plateforme full-stack de recrutement et de distribution d'agents de sécurité pour **XGuard**, avec backoffice (RH/admin), portail client et marketplace de candidats.

> Recrutement : capture de candidatures (formulaire GHL + CV + vidéo), qualification, conversion en candidats, catalogues partagés aux clients, achat de candidats par Stripe, gestion des uniformes, et visualisation géographique du bassin de talents.

---

## Stack technique

**Backend** — `backend/`
- Node.js 20 + TypeScript, Express (API REST)
- Prisma ORM → **Neon PostgreSQL** (serverless, connection pooling)
- Auth : Passport (JWT access 7 j + refresh 30 j) ; portail client séparé
- Stockage fichiers : **Cloudflare R2** (CV, vidéos, PDF) — URLs signées
- Paiements : **Stripe Checkout** (achat de candidats)
- Intégration **GoHighLevel** (GHL) : formulaires, SMS, contacts (PIT token)
- Génération PDF (pdfkit / pdf-lib), géocodage **Nominatim** (OpenStreetMap)
- Cache **Redis** optionnel (`config/cache.ts`)

**Frontend** — `frontend/`
- React 18 + TypeScript, Vite
- Material-UI (MUI), React Query, Zustand (auth store), React Router
- **Leaflet** / react-leaflet (cartes), Notistack (toasts)
- Aperçu CV : `docx-preview` (DOCX) + iframe PDF + `<img>` (images)

**Déploiement** — Google Cloud Run (`northamerica-northeast1`), build auto via Cloud Build sur push `main`.

---

## Architecture du dépôt

```
talentsecure/
├── backend/
│   ├── src/
│   │   ├── config/        # env (fail-fast), database, cache, logger, storage
│   │   ├── controllers/   # endpoints (orchestration)
│   │   ├── services/      # logique métier (candidate, cv, geocode, stripe, sms…)
│   │   ├── routes/        # routes + validation Zod
│   │   ├── middleware/    # auth, validation, upload
│   │   ├── utils/         # cityNormalize, phone, cacheInvalidation, ghlFetch…
│   │   ├── data/          # quebecCities.ts (seed des villes QC)
│   │   └── scripts/       # ops (seeds, admin) + archive/ (jetables)
│   └── prisma/
│       ├── schema.prisma
│       └── migrations/    # SQL appliqués via `prisma db execute` (voir + bas)
└── frontend/
    └── src/
        ├── components/    # CVPreview, map/, video/, client/…
        ├── pages/         # prospects, candidates, catalogues, clients, client/(portail), uniformes…
        ├── services/      # appels API
        └── store/         # authStore / clientAuthStore (init synchrone)
```

---

## Fonctionnalités

### Backoffice (RH / Admin)

- **Candidats** : profils complets (langues, expériences, certifications, BSP, véhicule…), notation, CV + vidéo (R2), édition, archivage, conversion depuis un prospect.
- **Candidats Potentiels (prospects)** : capture via formulaire GHL (CV + vidéo 30s + réponses), liste filtrable (ville, vidéo, contacté, dates), **fiche éditable** (corriger ville/adresse/contact d'après le CV), aperçu CV + vidéo inline, marquer contacté, export CSV, **export ZIP avec les CV**, transfert vers un client.
- **Unicité de contact** : une personne ne vit que dans **une** section (Employé / Candidat / Prospect). À la création, détection de doublon (email/téléphone, 6 sens) + dialogue pour **déplacer** le contact (soft-delete réversible, `contact-move.service`).
- **Catalogues** : sélection ordonnée de candidats, génération PDF (CV fusionnés, téléchargés en parallèle), partage par lien, restriction de contenu.
- **Compétences (Autre Compétence)** : extraction depuis CV + recherche par compétence, batch. *(NB : voir « Limitations connues » — l'extraction PDF est à réparer.)*
- **Uniformes** : inventaire, remise avec signature, retours, lavage, rapports.

### Portail client + Marketplace

- Auth client séparée (JWT). Dashboard des catalogues assignés.
- **Marketplace** anonymisé (prénom, ville, note client, certifs, **vidéo**) — jamais de CV ni d'adresse complète avant achat.
- **Achat par Stripe Checkout** → webhook (source de vérité, idempotent) crée `ClientPurchase` ; après achat, les **coordonnées** (nom complet + téléphone/email) sont révélées.

### Système de villes & cartes géographiques (récent, important)

La saisie de ville est libre et incohérente (accents, casse, tirets, fautes, suffixes « , QC », villes étrangères). Tout un système la fiabilise :

- **Normalisation + auto-correction** — `backend/src/utils/cityNormalize.ts` :
  - `normalizeCityKey` : minuscules, sans accents, unifie séparateurs (`- ' .`), `St/Ste → Saint/Sainte`, retire suffixes (`, QC`, `Québec`, `Canada`, `City`), répare le mojibake.
  - `resolveCanonical` / `canonicalCity` : correspondance exacte (seed/alias) **puis approximative (Levenshtein)** contre le seed des villes QC (gardes : longueur ≥ 5, même 1ʳᵉ lettre, distance ≤ 1–2, match unique). Ex. `Longueuill → Longueuil`, `Monreal → Montréal`. Appliquée **à la saisie** (createProspect/updateProspect, webhook GHL, survey-sync, contact-move) et au **regroupement carte**.
- **Géocodage automatique** — `backend/src/services/cityGeocode.service.ts` + table `city_geocodes` :
  - Résolution `seed (src/data/quebecCities.ts) → cache DB → Nominatim` en arrière-plan (throttle 1 req/s).
  - Requête **structurée limitée au Québec** (state=Québec) + filtre lieu + bornes QC → les villes hors-QC/étrangères ne sont **pas** placées.
  - `classifyProvince(city)` : QC / ON / autre-CA / étranger (pour le tri des dossiers).
- **Cartes** (`components/map/ProspectsMapClustered.tsx`, `CandidatesMap.tsx`) : **1 marqueur par ville** (coords venant du backend `*/stats/by-city` qui renvoie `{city,count,lat,lng}`), légende des villes en cours de géolocalisation.
- **Sélection par rayon** : dans le popup d'une ville, boutons 10/25/50/100 km → sélectionne toutes les villes dans le rayon (haversine) → filtre la liste (`cities` IN) + coche les prospects → actions groupées (export, transfert, contacté).

### Aperçu CV universel — `frontend/src/components/CVPreview.tsx`

Détection par **octets magiques** (pas l'extension) via le proxy `/api/prospects/cv-proxy` (contourne le CORS + le « soft-redirect » GHL) :
- **PDF** → iframe ; **DOCX** → `docx-preview` ; **Images** (PNG/JPEG/GIF/WEBP/BMP) → `<img>` ; **.doc** (Word 97-2003) → message + bouton Télécharger.

### Capture GHL (formulaire vidéo)

`survey-sync.service.ts` + webhook : récupère CV + vidéo + réponses depuis GHL, télécharge dans R2 (gestion du **soft-redirect** GHL : 200 + `text/plain` « Redirecting to… »), upsert le prospect (avec normalisation de ville).

---

## Sécurité & performance (mises en place)

**Sécurité**
- `config/env.ts` : **fail-fast** au boot si `JWT_SECRET` / `JWT_REFRESH_SECRET` (≥ 32 c) / `DATABASE_URL` manquent.
- CORS : **liste blanche** d'origines exactes (plus de joker `localhost:*`).
- Stripe : le prix enregistré = **`session.amount_total`** (montant réellement encaissé).
- Logs : plus de **PII** (nom/email/tél/adresse) dans les logs du webhook.
- Pas de mass-assignment : `updateProspect` whiteliste les champs.

> À faire (non implémentés) : retirer les **tokens GHL en dur** dans 4 services + rotation (S1), durcir le **webhook GHL** qui peut « fail-open » si le secret n'est pas configuré (S2), validation upload par magic-bytes (S3), URLs signées plus courtes (S4), rate-limit login (S6).

**Performance**
- Cloud Run : `--memory=1Gi --cpu=1 --concurrency=40 --max-instances=10 --timeout=600 --min-instances=1`.
- Cache (Redis si activé) sur les stats lourdes ; invalidation mutualisée (`utils/cacheInvalidation.ts`).
- Index composites (`prospect_candidates`) ; exports plafonnés ; téléchargements CV de catalogue en parallèle.

---

## Installation (développement local)

**Prérequis** : Node.js **20+**, accès à une base PostgreSQL (Neon), compte R2 (les creds R2/Stripe/GHL sont surtout côté Cloud Run).

```bash
# Backend
cd backend
npm install
cp .env.example .env        # éditer (voir variables ci-dessous)
npx prisma generate
npm run dev                 # http://localhost:5000

# Frontend
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

### Variables d'environnement

**Backend** (`backend/.env`)
```env
# Requis (sinon l'app refuse de démarrer)
DATABASE_URL="postgresql://…@…neon.tech/…?sslmode=require"
JWT_SECRET="… (≥ 32 caractères)"
JWT_REFRESH_SECRET="… (≥ 32 caractères)"

# Stockage R2 (sur Cloud Run en prod)
USE_R2=true
R2_ACCOUNT_ID="…"
R2_ACCESS_KEY_ID="…"
R2_SECRET_ACCESS_KEY="…"
R2_BUCKET_NAME="talentsecure-videos"

# GoHighLevel
GHL_PIT_TOKEN="pit-…"
GHL_LOCATION_ID="…"
GOHIGHLEVEL_WEBHOOK_SECRET="…"      # secret du webhook formulaire

# Stripe (marketplace)
STRIPE_SECRET_KEY="sk_…"
STRIPE_WEBHOOK_SECRET="whsec_…"
CLIENT_APP_URL="https://…"          # portail client (success/cancel)

# Optionnels
CACHE_ENABLED=true                  # + REDIS_URL ou REDIS_HOST/REDIS_PORT
OPENAI_API_KEY="sk-…"               # extraction de compétences (cf. limitations)
FRONTEND_URL="http://localhost:5173"
PORT=5000
NODE_ENV=development
```

**Frontend** (`frontend/.env`)
```env
VITE_API_URL=http://localhost:5000
```

---

## Base de données & migrations

⚠️ **L'historique de migration Neon est divergent.** On n'utilise **jamais** `prisma migrate deploy`.
Pour appliquer un changement de schéma :

```bash
# 1. Éditer prisma/schema.prisma
# 2. Écrire le SQL (idempotent) dans prisma/migrations/<nom>.sql
#    ex. CREATE TABLE IF NOT EXISTS …  /  CREATE INDEX IF NOT EXISTS …
# 3. Appliquer sur Neon :
npx prisma db execute --file prisma/migrations/<nom>.sql --schema prisma/schema.prisma
# 4. Régénérer le client :
npx prisma generate
```

Tables notables récentes : `city_geocodes` (cache géocodage), index composites `prospect_candidates`.

---

## Scripts utiles (`backend/src/scripts/`)

Lancés à la main via `npx ts-node src/scripts/<x>.ts` (exclus du build). Les scripts jetables sont rangés dans `scripts/archive/`.

| Script | Rôle |
|---|---|
| `seed-common-skills.ts`, `seed-city-pricing.ts`, `seed-uniforms.ts` | Seeds |
| `create-admin.ts`, `reset-admin.ts`, `set-client-password.ts` | Comptes |
| `normalize-prospect-cities-v2.ts` / `normalize-candidate-cities.ts` | Nettoyage des villes (auto-correction → canonique) |
| `regeocode-cities.ts` | Re-géocode le cache `city_geocodes` (logique stricte QC) |
| `classify-out-of-quebec.ts` | Classe prospects+candidats par province + scan CV PDF → **CSV de révision** (lecture seule) |
| `remove-approved.ts` | Soft-delete **réversible** des dossiers hors-QC marqués RETIRER (dry-run par défaut, `--apply`) |

**Nettoyage hors-Québec** : on garde **QC + Ontario**, on retire (soft-delete) les autres provinces + l'étranger, avec un **filet CV** (un code postal QC/ON trouvé dans le CV PDF « sauve » le dossier). Réversible (`isDeleted`).

---

## Déploiement & production

- **Backend** : Cloud Run `talentsecure` → `https://talentsecure-572017163659.northamerica-northeast1.run.app`
- **Frontend** : Cloud Run `talentsecure-frontend` → `https://talentsecure-frontend-572017163659.northamerica-northeast1.run.app`
- **DB** : Neon PostgreSQL · **Fichiers** : Cloudflare R2

**Workflow** : `git push origin main` → Cloud Build (back + front), build Docker Node 20, `npm ci && npm run build`, deploy Cloud Run (~3-5 min). Les secrets (R2, Stripe, GHL) vivent **uniquement sur Cloud Run**, jamais dans le `.env` local.

**Vérifier / déboguer**
```bash
# Logs : https://console.cloud.google.com/logs/query?project=talentsecure
#   resource.labels.service_name="talentsecure"  severity>=ERROR
```

**Rollback** : Cloud Run → service → Revisions → router 100 % du trafic vers une révision saine.

---

## Limitations connues / TODO

- **`cv-extraction.service.ts` cassé** : utilise l'ancienne API `pdf-parse` (`pdfParse(buffer)`) ; or `pdf-parse` v2 exporte une **classe `PDFParse`** (`new PDFParse({data}).getText()`). → l'extraction de compétences des CV PDF échoue. À corriger.
- Sécurité : items S1 (secrets GHL en dur + rotation), S2 (webhook fail-open), S3/S4/S6 (cf. section Sécurité) non faits.
- Auto-correction de villes : ne corrige que les fautes de villes **présentes dans le seed** (les grandes villes QC) ; une faute sur une petite ville hors-seed reste non corrigée (à ajouter au seed/alias).
- Sélection carte : par **ville** (les prospects n'ont pas de coordonnées individuelles).

---

## Conventions

- Commits : `feat:`, `fix:`, `refactor:`, `perf:`, `sec:`, `docs:`, `chore:`.
- Travailler sur `main` puis push (Cloud Build déploie). Vérifier `npx tsc --noEmit` (back + front) avant de pousser.

---

**XGuard Security** — plateforme TalentSecure.
