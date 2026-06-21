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

## Tests

**437 tests** (43 suites) — **100 % des controllers ont un test d'intégration**. Jest + ts-jest + Supertest sur un Postgres jetable. L'app est montable sans serveur via `createApp()` (`src/app.ts`).

```bash
# 1. Postgres 16 local (LC_ALL obligatoire sur macOS récent)
LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8 \
  /opt/homebrew/opt/postgresql@16/bin/pg_ctl -D /opt/homebrew/var/postgresql@16 -w -l /tmp/pg16.log start
/opt/homebrew/opt/postgresql@16/bin/createdb -h localhost talentsecure_test   # une fois

# 2. Schéma + colonne générée searchText (hors schema.prisma)
export TEST_DB="postgresql://<user>@localhost:5432/talentsecure_test"
DATABASE_URL="$TEST_DB" npx prisma db push --skip-generate --force-reset
DATABASE_URL="$TEST_DB" npx prisma db execute \
  --file prisma/migrations/20260620000000_add_search_text/migration.sql --schema prisma/schema.prisma

# 3. Suite
DATABASE_URL="$TEST_DB" npm test
```

- `cleanDatabase()` (`src/__tests__/setup.ts`) refuse toute `DATABASE_URL` qui ne ressemble pas à une base de test (**garde anti-prod**) et `TRUNCATE … CASCADE` entre suites. `jest.config.js` : `maxWorkers:1` (base partagée → série). JAMAIS `prisma migrate deploy`.
- Services externes (R2, Stripe, email/GHL, SMS, géocodage) mockés → zéro réseau réel.

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
