---
description: Score les CVs des candidats potentiels (rubrique v1) et sauvegarde dans la DB
argument-hint: "[limit] [--force]"
---

Tu vas noter les CVs de candidats potentiels selon la rubrique de TalentSecure et écrire les résultats dans la base de données. Aucun appel API externe — tu fais l'analyse directement, gratuitement, dans cette session.

# Étape 1 — Récupérer le batch à analyser

Depuis `backend/`, exécute :

```bash
cd backend && npx ts-node scripts/list-unanalyzed-prospects.ts $ARGUMENTS
```

(Sans argument = 20 prospects non encore analysés. `50` = 50 prospects. `50 --force` = re-score les 50 plus récents même s'ils ont déjà une analyse.)

Tu obtiens un tableau JSON. Pour chaque prospect, le champ `cvText` contient le texte extrait du CV (PDF parsé). Si `cvTextError` est présent ou si `cvText` fait moins de 50 caractères, **passe ce prospect** (signale-le dans le résumé final mais ne le score pas).

# Étape 2 — Scorer chaque prospect selon la rubrique ci-dessous

## Rubrique de notation v1 (sur 100)

### Crédentiels durs (max +60)
- BSP valide (Bureau de la sécurité privée) : **+20**
- ≥ 2 ans d'expérience en sécurité privée : **+15**
- Bilingue français/anglais : **+10**
- ASP construction (santé-sécurité au travail) : **+5**
- RCR/RCP/DEA à jour : **+5**
- Permis de conduire + véhicule personnel : **+5**

### Environnements de travail détectés (max +25, somme des bonus)
- **AIRPORT** (Trudeau YUL, Mirabel, Pearson, ADM) : **+10** — clearance Transport Canada
- **MILITARY_POLICE** (FAC, SPVM, SQ, GRC, ex-policier, ex-militaire) : **+10**
- **DIPLOMATIC** (ambassades, consulats, dignitaires) : **+10**
- **GOVERNMENT** (édifices fédéraux/provinciaux, palais de justice) : **+8**
- **CASINO** (Loto-Québec, Mohawk, Kahnawake) : **+6**
- **BANK_VALUES** (Brink's, GardaWorld Cash, transport de valeurs) : **+6**
- **HEALTHCARE** (hôpital, CHSLD, CIUSSS, CISSS) : **+5**
- **EVENT_VENUE** (Centre Bell, festivals, stades) : **+5**
- **CORRECTIONAL** (Bordeaux, Leclerc, centres de détention) : **+5**
- **INDUSTRIAL** (chantiers, raffineries, mines) : **+3**
- **EDUCATION** (universités, cégeps, écoles) : **+2**
- **HOSPITALITY** (hôtels, condos haut de gamme) : **+2**
- **CANNABIS** (SQDC, producteurs licenciés) : **+2**
- **RETAIL** (centres commerciaux, magasins) : **+1**

### Signaux qualitatifs (max +15)
- Employeurs reconnus en sécurité (Garda, GardaWorld, Securitas, BEST, Allied, Commissionaires) : **+5 par employeur, max +10**
- Stabilité (durée moyenne d'emploi > 18 mois) : **+5**

### Pénalités (à soustraire)
- Trou inexpliqué > 6 mois : **−10**
- Multiples emplois courts (< 3 mois consécutifs) : **−10**
- Expérience totale < 1 an : **−15**
- Aucune mention de BSP nulle part : **−20**
- CV incomplet, illisible ou peu structuré : **−5**

### Correspondance tier (score final plafonné 0-100)
- **gold** (≥ 75) → `INTERVIEW_PRIORITY`
- **silver** (50-74) → `INTERVIEW`
- **bronze** (25-49) → `REVIEW`
- **reject** (< 25) → `REJECT`

## Mots-clés pour détecter les environnements

| Type | Mots-clés à reconnaître |
|---|---|
| AIRPORT | Trudeau, YUL, Mirabel, Pearson, ADM, "Aéroports de Montréal", screening passagers, douanes, contrôle bagages, zone réglementée |
| CASINO | Loto-Québec, Casino de Montréal, Mont-Tremblant, Charlevoix, Mohawk, Kahnawake |
| BANK_VALUES | Brink's, GardaWorld Cash, Garda Cash, transport de valeurs, ATM |
| GOVERNMENT | ministère, palais de justice, édifice fédéral/provincial, parlement |
| HEALTHCARE | hôpital, CHSLD, CIUSSS, CISSS, CHUM, MUHC, Maisonneuve-Rosemont, Sacré-Coeur |
| EVENT_VENUE | Centre Bell, Stade Olympique, Stade Saputo, festival, FEQ, Osheaga, Igloofest |
| MILITARY_POLICE | Forces armées canadiennes, FAC, CAF, SPVM, SQ, GRC, RCMP, ex-policier, ex-militaire |
| DIPLOMATIC | ambassade, consulat, dignitaire, protection rapprochée, VIP |
| CORRECTIONAL | détention, prison, Bordeaux, Leclerc, Cowansville, Donnacona |
| CANNABIS | SQDC, Société québécoise du cannabis, producteur licencié |
| INDUSTRIAL | chantier, usine, raffinerie, mine, pétrochimie, papetière |
| EDUCATION | université, cégep, collège, école secondaire, campus |
| HOSPITALITY | hôtel, condos haut de gamme, concierge sécurité, resort |
| RETAIL | centre commercial, magasin, Carrefour, Galeries, Promenades |

## Format de sortie attendu (par prospect)

```json
{
  "score": 0-100,
  "tier": "gold" | "silver" | "bronze" | "reject",
  "recommendation": "INTERVIEW_PRIORITY" | "INTERVIEW" | "REVIEW" | "REJECT",
  "summary": "2-3 phrases en français résumant le profil",
  "strengths": ["force 1", "force 2", ...],
  "redFlags": ["préoccupation 1", ...],
  "workEnvironments": [
    {
      "type": "AIRPORT",
      "label": "YUL Aéroport Trudeau",
      "yearsApprox": 3,
      "employer": "Garda"
    }
  ],
  "reasoning": "2-4 phrases expliquant comment tu es arrivé au score"
}
```

## Règles strictes
- Copie le **nom exact** des employeurs et lieux depuis le CV.
- `yearsApprox` = années à CET environnement spécifique, pas la carrière totale. `null` si pas clair.
- Tous les champs texte **en français**.
- **Ne fabrique JAMAIS** une certification (BSP, ASP, RCR) qui n'est pas écrite dans le CV.
- Si le CV est très court (< 200 caractères de contenu utile), c'est un drapeau rouge "CV incomplet".

# Étape 3 — Sauvegarder chaque analyse

Pour chaque prospect scoré, sauvegarde via :

```bash
cd backend && echo '<le-json-de-analyse>' | npx ts-node scripts/save-prospect-analysis.ts <prospectId>
```

Le script valide la forme du JSON et upsert dans la table `prospect_analyses`. Sortie attendue : `OK <prospectId> <tier> <score>`.

# Étape 4 — Résumé final

Une fois tous les prospects traités, présente un tableau Markdown avec :

| Nom | Ville | Tier | Score | Top force | Top drapeau rouge |
|---|---|---|---|---|---|
| Dorothy Murielle Jean | Brossard | 🥇 gold | 82 | BSP + 5 ans Trudeau | — |
| ... |

Et compte final : `X gold, Y silver, Z bronze, N reject, M sautés (CV indisponible)`.
