# TalentSecure — Backend

API REST de la plateforme de recrutement XGuard. **Voir le [README racine](../README.md)** pour la vue d'ensemble, les variables d'environnement complètes et le déploiement.

## Stack

- **Node.js 20** + TypeScript, **Express**
- **Prisma** ORM → **Neon PostgreSQL** (serverless)
- **Passport** (JWT access 7 j + refresh 30 j) ; portail client séparé (`/api/client-auth`)
- **Cloudflare R2** (CV, vidéos, PDF — URLs signées)
- **Stripe** (achat de candidats), **GoHighLevel** (formulaires/SMS/contacts, PIT token)
- **Nominatim** (géocodage QC), **Redis** optionnel (cache)

## Démarrer en local

```bash
npm install
cp .env.example .env          # remplir DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET (≥32c)…
npx prisma generate
npm run dev                   # http://localhost:5000
```

> Variables requises au boot (`src/config/env.ts`, fail-fast) : `JWT_SECRET`, `JWT_REFRESH_SECRET` (≥ 32 caractères), `DATABASE_URL`. Liste complète : README racine.

## Scripts npm

| Script | Rôle |
|---|---|
| `npm run dev` | Serveur en watch (ts-node-dev) sur :5000 |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm start` | Lance `dist/server.js` (production) |
| `npm run lint` | ESLint |
| `npm test` / `test:watch` / `test:coverage` | Jest |
| `npm run test:ci` | Sous-ensemble CI (env, rate-limit, token, skills, AI) |
| `npm run prisma:generate` | Génère le client Prisma |
| `npm run prisma:studio` | Prisma Studio |

⚠️ **`npm run prisma:migrate` (= `prisma migrate dev`) ne convient PAS pour Neon** (historique divergent). Voir « Migrations » ci-dessous.

## Structure

```
src/
├── config/        # env (fail-fast), database, cache, logger, storage
├── controllers/   # endpoints (orchestration)
├── services/      # logique métier
├── routes/        # routes Express + validation Zod
├── middleware/    # auth, validation, upload
├── utils/         # helpers partagés (cityNormalize, phone, ghlFetch, cacheInvalidation…)
├── data/          # quebecCities.ts (seed de coordonnées QC)
├── scripts/       # ops à lancer à la main (+ archive/ = jetables)
└── server.ts      # point d'entrée
prisma/
├── schema.prisma
└── migrations/    # SQL appliqués via `prisma db execute`
```

## Surface API (préfixes)

`/api/auth`, `/api/client-auth`, `/api/users`, `/api/admin`, `/api/dashboard`,
`/api/candidates`, `/api/prospects`, `/api/employees`, `/api/contacts`,
`/api/clients`, `/api/catalogues`, `/api/marketplace`, `/api/wishlist`,
`/api/skills`, `/api/extraction`, `/api/exports`, `/api/uniforms`,
`/api/notifications`, `/api/webhooks`. Santé : `GET /health`.

Routes protégées : header `Authorization: Bearer <token>`. Rôles : `ADMIN`, `RH_RECRUITER`, `SALES`.

## Services / utils notables

- `services/cityGeocode.service.ts` — géocodage Nominatim **QC-only** + cache `city_geocodes` + `classifyProvince`.
- `utils/cityNormalize.ts` — normalisation + **auto-correction** des villes (Levenshtein) ; seed = `data/quebecCities.ts`.
- `services/survey-sync.service.ts` + `utils/ghlFetch.ts` — capture GHL (CV/vidéo/réponses → R2), gère le **soft-redirect** GHL.
- `services/stripe.service.ts` — Checkout + webhook (source de vérité, `amount_total`, idempotent).
- `services/contact-move.service.ts` — unicité de contact (déplacement réversible entre sections).

## Migrations (Neon)

L'historique Prisma est divergent → **ne jamais** utiliser `migrate dev`/`migrate deploy`.

```bash
# 1. Éditer prisma/schema.prisma
# 2. Écrire le SQL idempotent (CREATE TABLE/INDEX IF NOT EXISTS) dans prisma/migrations/<nom>.sql
# 3. Appliquer :
npx prisma db execute --file prisma/migrations/<nom>.sql --schema prisma/schema.prisma
# 4. Régénérer :
npx prisma generate
```

## Scripts d'opération (`src/scripts/`)

Lancés à la main : `npx ts-node src/scripts/<x>.ts`. Ex. : `create-admin.ts`, `seed-common-skills.ts`,
`normalize-prospect-cities-v2.ts` / `normalize-candidate-cities.ts` (nettoyage villes),
`regeocode-cities.ts`, `classify-out-of-quebec.ts`, `remove-approved.ts` (soft-delete hors-QC, `--apply`).

## Déploiement

Google Cloud Run (`talentsecure`) via Cloud Build sur push `main`. Secrets (R2, Stripe, GHL) **uniquement** sur Cloud Run. Détails : [README racine](../README.md).
