# Import des Contacts GoHighLevel

Ce guide explique comment importer tous les contacts existants de GoHighLevel dans TalentSecure.

## Étape 1: Obtenir les Clés API GoHighLevel

### 1.1 Obtenir l'API Key

1. Connecte-toi à ton compte GoHighLevel
2. Va dans **Settings** (Paramètres) → **API Key** ou **Integrations**
3. Cherche "API Key" ou "API Access"
4. Copie ta clé API (elle ressemble à: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`)

**Alternative si tu ne trouves pas:**
- Va sur https://marketplace.gohighlevel.com/oauth/chooselocation
- Clique sur "Create API Key" ou "Generate New API Key"

### 1.2 Obtenir le Location ID

Le Location ID est l'identifiant unique de ton "location" dans GoHighLevel.

**Méthode 1 - Via l'URL:**
1. Connecte-toi à GoHighLevel
2. Regarde l'URL dans ton navigateur
3. Elle ressemble à: `https://app.gohighlevel.com/v2/location/XXXXXX/dashboard`
4. Le `XXXXXX` est ton Location ID

**Méthode 2 - Via l'API:**
Une fois que tu as ton API Key, tu peux récupérer ton Location ID avec cette commande:

```bash
curl -X GET "https://rest.gohighlevel.com/v1/locations/" \
  -H "Authorization: Bearer TON_API_KEY"
```

Le premier `id` dans la réponse est ton Location ID.

## Étape 2: Configurer les Variables d'Environnement

Édite ton fichier `.env` local:

```bash
# GoHighLevel API (pour import de contacts)
GOHIGHLEVEL_API_KEY=ta-vraie-api-key-ici
GOHIGHLEVEL_LOCATION_ID=ton-location-id-ici
```

## Étape 3: Exécuter l'Import

### Option A: Import Simple (garde les prospects existants)

```bash
cd C:\Recrutement\talentsecure\backend
npx tsx src/scripts/import-gohighlevel-contacts.ts
```

### Option B: Import avec Nettoyage (supprime d'abord les prospects de test)

```bash
cd C:\Recrutement\talentsecure\backend
npx tsx src/scripts/import-gohighlevel-contacts.ts --clean
```

## Ce que Fait le Script

1. **Récupère tous les contacts** depuis GoHighLevel via l'API
2. **Vérifie les doublons** (par email ou téléphone)
3. **Importe chaque contact** comme ProspectCandidate dans TalentSecure
4. **Télécharge les CVs** si disponibles (custom field `svp_joindre_votre_cv`)
5. **Normalise les villes** (Montreal → Montréal, etc.)
6. **Évite les doublons** automatiquement

## Résultat Attendu

Le script va afficher:

```
🚀 Import des contacts GoHighLevel

════════════════════════════════════════

📡 Récupération des contacts depuis GoHighLevel...
  Récupéré 100 contacts...
  Récupéré 200 contacts...
  ...
✅ Total: 700 contacts récupérés

📥 Import des contacts dans TalentSecure...

[1/700] John Doe
  ✅ Importé: John Doe (avec CV)
[2/700] Jane Smith
  ⚠️ Doublon détecté: Jane Smith (jane@example.com)
...

════════════════════════════════════════
📊 RÉSUMÉ DE L'IMPORT

✅ Nouveaux prospects créés: 650
⚠️  Doublons ignorés: 40
❌ Contacts ignorés: 10
📊 Total traité: 700
════════════════════════════════════════
```

## Troubleshooting

### Erreur: "GOHIGHLEVEL_API_KEY non définie"
- Vérifie que ton fichier `.env` contient bien `GOHIGHLEVEL_API_KEY`
- Assure-toi qu'il n'y a pas d'espace avant ou après le `=`

### Erreur: "401 Unauthorized"
- Ton API Key est invalide ou expirée
- Régénère une nouvelle API Key dans GoHighLevel

### Erreur: "Location not found"
- Ton Location ID est incorrect
- Vérifie l'URL de ton dashboard GoHighLevel

### Les CVs ne se téléchargent pas
- Vérifie que le custom field s'appelle bien `svp_joindre_votre_cv`
- Assure-toi que les URLs des CVs sont publiquement accessibles

## Notes Importantes

- ⚠️ **L'import peut prendre du temps** (5-10 minutes pour 700 contacts)
- ✅ **Les doublons sont automatiquement ignorés** (pas de duplicatas)
- 📁 **Les CVs sont téléchargés** dans `backend/uploads/cvs/prospects/`
- 🔄 **Tu peux relancer le script** sans problème (il ignore les doublons)
