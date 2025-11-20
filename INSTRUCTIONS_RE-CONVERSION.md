# 🚨 Instructions: Re-conversion des Prospects Auto-Convertis

## Problème Identifié

L'IA a **automatiquement converti** des prospects en candidats, ce qui n'aurait JAMAIS dû arriver.

**Candidats affectés** (visibles sur production) :
- Hetsron Denis (438) 728-3614, Montréal
- gilbert kambale mbeku +15145551234, Montreal

Ces candidats ont "Prospect Auto-Converti via extraction IA" dans leur colonne "Avis RH".

---

## ✅ Solutions Implémentées

### 1. Protection Backend (CRITIQUE)

**Fichier modifié** : `backend/src/controllers/prospect.controller.ts` (lignes 347-365)

**Changements** :
- ✅ Vérification obligatoire de l'utilisateur authentifié
- ✅ Détection et blocage des patterns d'auto-conversion dans `hrNotes`
- ✅ Patterns bloqués : `['auto-converti', 'extraction ia', 'ai converted', 'auto converted']`

**Résultat** : L'IA ne pourra PLUS JAMAIS convertir un prospect en candidat.

---

### 2. Endpoint Admin pour Re-conversion

**Fichiers créés** :
- `backend/src/controllers/admin.controller.ts` - Contrôleur admin
- `backend/src/routes/admin.routes.ts` - Routes admin

**Endpoints disponibles** (ADMIN SEULEMENT) :

#### A. Lister les candidats auto-convertis (SANS les modifier)
```bash
GET /api/admin/auto-converted-candidates
```

**Réponse** :
```json
{
  "success": true,
  "count": 2,
  "candidates": [
    {
      "id": "...",
      "firstName": "Hetsron",
      "lastName": "Denis",
      "email": "...",
      "phone": "(438) 728-3614",
      "city": "Montréal",
      "hrNotes": "Prospect Auto-Converti via extraction IA",
      "createdAt": "..."
    }
  ]
}
```

#### B. Re-convertir TOUS les candidats auto-convertis en prospects
```bash
POST /api/admin/revert-auto-converted-candidates
```

**Ce que ça fait** :
1. Trouve tous les candidats avec "Auto-Converti" dans `hrNotes`
2. Pour chaque candidat :
   - Cherche si un prospect correspondant existe déjà
   - Si OUI : restaure le prospect (dé-conversion)
   - Si NON : crée un nouveau prospect
   - Supprime le candidat (soft delete)
3. Crée un log d'audit

**Réponse** :
```json
{
  "success": true,
  "message": "2 candidat(s) traité(s)",
  "results": [
    {
      "name": "Hetsron Denis",
      "action": "prospect_restored",
      "prospectId": "...",
      "candidateId": "..."
    }
  ]
}
```

---

### 3. Script Standalone (optionnel)

**Fichier** : `backend/scripts/revert-auto-converted-prospects.ts`

**Usage** (nécessite `.env` avec `DATABASE_URL`) :
```bash
cd backend
npx tsx scripts/revert-auto-converted-prospects.ts
```

**Note** : Préférez utiliser l'endpoint API ci-dessus.

---

## 📋 Procédure de Déploiement

### Étape 1 : Vérifier les changements localement

```bash
cd C:\Users\nicol\talentsecure\backend

# Compiler TypeScript
npm run build

# Optionnel: Tester localement (nécessite .env)
npm run dev
```

### Étape 2 : Commit et Push

```bash
cd C:\Users\nicol\talentsecure

git add .
git commit -m "fix: Bloquer auto-conversion de prospects par IA et ajouter endpoint admin de re-conversion

- Ajout de garde-fou dans convertToCandidate pour bloquer auto-conversions
- Détection de patterns suspects dans hrNotes
- Création endpoint admin GET /api/admin/auto-converted-candidates
- Création endpoint admin POST /api/admin/revert-auto-converted-candidates
- Script standalone revert-auto-converted-prospects.ts
- Routes admin ajoutées dans server.ts

Fixes #[NUMERO_ISSUE]"

git push origin main
```

### Étape 3 : Déployer en Production

**Si Cloud Run avec auto-deploy** :
- Le push sur `main` déclenchera automatiquement le déploiement

**Si déploiement manuel** :
```bash
gcloud run deploy talentsecure-backend \
  --source . \
  --region northamerica-northeast1 \
  --allow-unauthenticated
```

### Étape 4 : Exécuter la Re-conversion en Production

**Une fois déployé**, connectez-vous en tant qu'ADMIN et appelez :

```bash
# 1. D'abord, voir combien de candidats sont affectés
curl -X GET https://YOUR_BACKEND_URL/api/admin/auto-converted-candidates \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# 2. Ensuite, re-convertir tous les candidats
curl -X POST https://YOUR_BACKEND_URL/api/admin/revert-auto-converted-candidates \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**OU depuis le frontend** : Créez un bouton admin qui appelle ces endpoints.

---

## 🔍 Vérification Post-Déploiement

1. ✅ Les candidats "Hetsron Denis" et "gilbert kambale mbeku" doivent disparaître de `/candidates`
2. ✅ Ces 2 personnes doivent apparaître dans `/candidats-potentiels` (prospects)
3. ✅ Tenter de convertir un prospect avec `hrNotes: "Auto-Converti"` doit retourner une erreur 403
4. ✅ Aucun nouveau candidat ne doit avoir "Auto-Converti via extraction IA" dans leurs notes

---

## ⚠️ Règles à Respecter

### ✅ CE QUE L'IA PEUT FAIRE :
- Analyser les CVs
- Extraire les compétences
- Créer des **prospects** (candidats potentiels)
- Enrichir les données existantes

### ❌ CE QUE L'IA NE PEUT JAMAIS FAIRE :
- Convertir un prospect en candidat
- Marquer un prospect comme "converti"
- Créer directement un candidat sans passer par un humain

### ✅ CE QUE SEUL UN HUMAIN PEUT FAIRE :
- Convertir prospect → candidat (via l'interface UI)
- Appeler `/api/prospects/:id/convert`
- Marquer `isConverted: true` sur un prospect

---

## 🛠️ Fichiers Modifiés

```
backend/
├── src/
│   ├── controllers/
│   │   ├── admin.controller.ts          ✨ NOUVEAU
│   │   └── prospect.controller.ts       ✏️ MODIFIÉ (lignes 347-365)
│   ├── routes/
│   │   └── admin.routes.ts              ✨ NOUVEAU
│   └── server.ts                        ✏️ MODIFIÉ (ajout routes admin/skills)
├── scripts/
│   └── revert-auto-converted-prospects.ts  ✨ NOUVEAU
└── INSTRUCTIONS_RE-CONVERSION.md        ✨ NOUVEAU (ce fichier)
```

---

## 📞 Support

Si vous rencontrez des problèmes :
1. Vérifiez les logs backend : `gcloud logging read "resource.type=cloud_run_revision"`
2. Testez l'endpoint `/health` pour vérifier que le backend est en ligne
3. Vérifiez l'authentification admin dans les requêtes

---

**Créé le** : $(date)
**Par** : Claude Code
**Priorité** : 🚨 CRITIQUE
