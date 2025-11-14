# 🚀 Guide de déploiement Google Cloud Run - TalentSecure

## ✅ Checklist avant de commencer

- [ ] APIs activées (Cloud Run, Cloud Build, Artifact Registry)
- [ ] Compte Google Cloud avec facturation activée
- [ ] Code poussé sur GitHub: https://github.com/Nicksoucy/talentsecure

---

## 📝 VARIABLES D'ENVIRONNEMENT À COPIER

### BACKEND (talentsecure-backend)

```env
NODE_ENV=production
PORT=8080
DATABASE_URL=postgresql://neondb_owner:npg_LTRz6PqlSpa5@ep-polished-breeze-a8tnezrf-pooler.eastus2.azure.neon.tech/neondb?sslmode=require&channel_binding=require
JWT_SECRET=talentsecure-prod-jwt-2025-changez-moi-super-secure-min-32-chars
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=talentsecure-prod-refresh-2025-changez-moi-super-secure-min-32-chars
JWT_REFRESH_EXPIRES_IN=30d
FRONTEND_URL=https://talentsecure-frontend-XXXXX.run.app
APP_URL=https://talentsecure-backend-XXXXX.run.app
```

**⚠️ IMPORTANT**:
- Remplace `XXXXX` par les vraies URLs après déploiement
- Change `JWT_SECRET` et `JWT_REFRESH_SECRET` par des valeurs aléatoires sécurisées

### FRONTEND (talentsecure-frontend)

```env
VITE_API_URL=https://talentsecure-backend-XXXXX.run.app
```

**⚠️ IMPORTANT**: Remplace `XXXXX` par l'URL du backend après déploiement

---

## 🔧 ÉTAPES DE DÉPLOIEMENT

### 1️⃣ Déployer le BACKEND

1. **Ouvre Cloud Run**: https://console.cloud.google.com/run?project=talentsecure
2. Clique **"CREATE SERVICE"**
3. Choisis **"Continuously deploy from a repository"**
4. Clique **"SET UP WITH CLOUD BUILD"**
5. Configure:
   - Provider: **GitHub**
   - Repository: **Nicksoucy/talentsecure**
   - Branch: **^main$**
   - Build type: **Dockerfile**
   - Source: **/backend/Dockerfile**
6. Service settings:
   - Service name: **talentsecure-backend**
   - Region: **us-east1** (ou northamerica-northeast1)
   - Authentication: **Allow unauthenticated invocations** ✅
7. Container settings:
   - Container port: **8080**
   - Memory: **512 MiB**
   - CPU: **1**
8. Variables d'environnement: Copie-colle les variables BACKEND ci-dessus
9. Clique **"CREATE"**
10. ⏳ Attends 5-10 minutes
11. ✅ Copie l'URL du backend (ex: https://talentsecure-backend-abc123.run.app)

### 2️⃣ Déployer le FRONTEND

1. Retourne sur **Cloud Run**: https://console.cloud.google.com/run?project=talentsecure
2. Clique **"CREATE SERVICE"** (nouveau service)
3. Choisis **"Continuously deploy from a repository"**
4. Clique **"SET UP WITH CLOUD BUILD"**
5. Configure:
   - Provider: **GitHub**
   - Repository: **Nicksoucy/talentsecure**
   - Branch: **^main$**
   - Build type: **Dockerfile**
   - Source: **/frontend/Dockerfile**
6. Service settings:
   - Service name: **talentsecure-frontend**
   - Region: **us-east1** (MÊME région que backend!)
   - Authentication: **Allow unauthenticated invocations** ✅
7. Container settings:
   - Container port: **80**
   - Memory: **256 MiB**
   - CPU: **1**
8. Variables d'environnement:
   ```env
   VITE_API_URL=https://talentsecure-backend-abc123.run.app
   ```
   **Remplace par l'URL du backend de l'étape 1!**
9. Clique **"CREATE"**
10. ⏳ Attends 5-10 minutes
11. ✅ Copie l'URL du frontend (ex: https://talentsecure-frontend-xyz789.run.app)

### 3️⃣ Mettre à jour FRONTEND_URL dans le backend

1. Retourne sur le service **talentsecure-backend**
2. Clique **"EDIT & DEPLOY NEW REVISION"**
3. Trouve la variable `FRONTEND_URL`
4. Remplace par l'URL du frontend (étape 2)
5. Clique **"DEPLOY"**
6. ⏳ Attends 2-3 minutes

---

## ✅ VÉRIFICATION

### Teste le backend:
```
https://talentsecure-backend-XXXXX.run.app/health
```

Devrait retourner:
```json
{
  "status": "OK",
  "message": "TalentSecure API is running",
  "timestamp": "...",
  "environment": "production"
}
```

### Teste le frontend:
```
https://talentsecure-frontend-XXXXX.run.app
```

### Connecte-toi:
```
Email: test@xguard.com
Password: Test123!
```

### Vérifie les prospects:
- Va sur "Candidats Potentiels"
- Tu devrais voir 545 prospects
- Affiche la carte avec clustering

---

## 💰 MONITORING DES COÛTS (Optionnel mais recommandé)

1. Va sur: https://console.cloud.google.com/billing/budgets?project=talentsecure
2. Clique **"CREATE BUDGET"**
3. Configure:
   - Budget amount: **$1 USD**
   - Alert thresholds: 50%, 90%, 100%
4. Tu recevras un email si tu t'approches de $1/mois (tu ne devrais jamais atteindre ça!)

---

## 🔒 SÉCURITÉ IMPORTANTE

### Après le déploiement, change les secrets JWT:

1. Génère des secrets aléatoires sécurisés (au moins 32 caractères)
2. Met à jour les variables dans le backend:
   - `JWT_SECRET`
   - `JWT_REFRESH_SECRET`
3. Redéploie

### Pour générer des secrets sécurisés:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 📊 STATISTIQUES APRÈS DÉPLOIEMENT

- ✅ 545 prospects disponibles
- ✅ 81 villes uniques
- ✅ 98 candidats qualifiés
- ✅ Carte interactive avec clustering
- ✅ 100% GRATUIT pour 2-5 utilisateurs

---

## 🆘 EN CAS DE PROBLÈME

### Si le backend ne démarre pas:
1. Vérifie les logs: Cloud Run > Service > LOGS
2. Vérifie que `DATABASE_URL` est correct
3. Vérifie que `PORT=8080`

### Si le frontend ne charge pas:
1. Vérifie les logs: Cloud Run > Service > LOGS
2. Vérifie que `VITE_API_URL` pointe vers le bon backend
3. Ouvre la console du navigateur (F12) pour voir les erreurs

### Si les prospects n'apparaissent pas:
1. Vérifie que la migration a réussi: `npx prisma migrate deploy`
2. Vérifie les logs du backend
3. Teste l'endpoint: `/api/prospects/stats/summary`

---

## 🎉 FÉLICITATIONS!

Ton application est maintenant en ligne et **100% GRATUITE** pour 2-5 utilisateurs!

URLs finales:
- Frontend: https://talentsecure-frontend-XXXXX.run.app
- Backend: https://talentsecure-backend-XXXXX.run.app
