# Import des Contacts GoHighLevel

Ce guide explique comment importer tous les contacts existants de GoHighLevel dans TalentSecure.

## Étape 1: Obtenir les identifiants GoHighLevel (API v2)

> ⚠️ L'API v1 (« API Key » JWT) est **dépréciée** par GHL et cesse de fonctionner.
> On utilise désormais un **Private Integration Token (PIT)** de l'API v2.

### 1.1 Créer un Private Integration Token

1. Connecte-toi au **sous-compte « Xguard »** dans GoHighLevel
2. Va dans **Settings** → **Private Integrations**
3. Clique **Create new Integration**, nomme-la (ex. `TalentSecure Import`)
4. Sélectionne les scopes : `contacts.readonly`, `contacts.write`
5. Copie le token généré (il commence par `pit-…`) — **il ne s'affiche qu'une seule fois**

### 1.2 Obtenir le Location ID

Le Location ID est l'identifiant unique de ton "location" dans GoHighLevel.

**Méthode 1 - Via l'URL:**
1. Connecte-toi à GoHighLevel
2. Regarde l'URL dans ton navigateur
3. Elle ressemble à: `https://app.gohighlevel.com/v2/location/XXXXXX/dashboard`
4. Le `XXXXXX` est ton Location ID

**Méthode 2 - Vérifier le token (API v2):**
Une fois le PIT et le Location ID en main, valide-les avec cette commande
(doit renvoyer `200` et un contact) :

```bash
curl -X GET "https://services.leadconnectorhq.com/contacts/?locationId=TON_LOCATION_ID&limit=1" \
  -H "Authorization: Bearer TON_PIT_TOKEN" \
  -H "Version: 2021-07-28"
```

Un `401`/`403` signifie un token invalide/révoqué ou un scope manquant.

## Étape 2: Configurer les Variables d'Environnement

Édite ton fichier `.env` local:

```bash
# GoHighLevel API v2 (Private Integration Token)
GHL_PIT_TOKEN=pit-ton-token-ici
GHL_LOCATION_ID=ton-location-id-ici
```

## Étape 3: Exécuter l'Import

### Option A: Import Simple (garde les prospects existants)

```bash
cd C:\Recrutement\talentsecure\backend
npx tsx src/scripts/archive/import-gohighlevel-contacts.ts
```

### Option B: Import avec Nettoyage (supprime d'abord les prospects de test)

```bash
cd C:\Recrutement\talentsecure\backend
npx tsx src/scripts/archive/import-gohighlevel-contacts.ts --clean
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

### Erreur: "GHL_PIT_TOKEN est requis" au démarrage
- Vérifie que ton fichier `.env` contient bien `GHL_PIT_TOKEN`
- Assure-toi qu'il n'y a pas d'espace avant ou après le `=`

### Erreur: "401 Unauthorized" / "403 Forbidden"
- Le PIT est invalide/révoqué, ou il manque un scope (`contacts.readonly`)
- Régénère un Private Integration Token dans GHL (Settings → Private Integrations)

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
