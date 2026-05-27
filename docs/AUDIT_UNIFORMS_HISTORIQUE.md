# Audit — Import historique des 84 PDFs d'uniforme

> Date : 2026-05-27
> DB : `ep-polished-breeze-a8tnezrf-pooler.eastus2.azure.neon.tech/neondb` (production Neon)
> Sources :
> - [`audit-uniform-pdfs.csv`](../backend/src/scripts/audit-uniform-pdfs.csv) (1 ligne / PDF)
> - [`audit-uniform-pdfs-summary.json`](../backend/src/scripts/audit-uniform-pdfs-summary.json)

---

## TL;DR

**Les données SONT en BD.** Ce que Nick perçoit comme « rien n'a été ajouté » vient de **trois problèmes différents** :

| # | Symptôme | Cause | Impact |
|---|---|---|---|
| **1** | Aucune ceinture n'apparaît dans « Détentions actuelles » | 47 lignes "Ceinture" sont stockées comme `customItemName` (variantId NULL). `computeHoldings()` ignore ces lignes (`uniform-stock.service.ts:119`). Le catalogue a une variante « Unique » mais elle est `isActive=false`. | 47 ceintures invisibles sur ~47 fiches |
| **2** | Le tableau « Historique des remises » ne montre pas les pièces inline | Le composant `UniformFichePanel.tsx:127-176` affiche seulement Date / Division / Statut / Coût / Actions. Il faut cliquer « Modifier les pièces » pour voir le détail. | Impression que les remises sont vides |
| **3** | 15 PDFs n'ont pas du tout été importés | 5 employés `INACTIF` (filtre `status='ACTIF'` dans `findEmployee`), 7 introuvables dans la table employee, 3 PDFs scannés sans AcroForm parsables | 15 employés sans aucune trace dans l'app |

---

## 1. État chiffré de la production

```
84 PDFs source dans OneDrive_1 + OneDrive_2

✓ Fully OK (issuance + PDF en R2 + lines + total)  : 69 / 84
📄 Issuance présent en DB                           : 72 / 84
📁 PDF attaché en R2 (formPdfStoragePath set)       : 72 / 84
📋 Lignes (items) présentes                         : 69 / 84
```

**À l'intérieur des 69 « fully OK »** :
- 236 lignes au total
- 187 avec `variantId` → visibles dans Détentions actuelles
- **49 avec `variantId=null`** → INVISIBLES (47 = Ceintures + 1 ML XS Nahomie + 1 cas isolé)

---

## 2. Les 15 cas problématiques

### 2a. Employés INACTIF (5) — issuance jamais créée

Le script `findEmployee()` filtre `where: { status: 'ACTIF' }`. Ces ex-employés ont quand même reçu un uniforme et signé un papier.

| Date | Employé | Statut DB | PDF |
|---|---|---|---|
| 2025-11-03 | Mamadou Ramadane Barry | INACTIF | `20251103 - Mamadou Ramadane Barry.pdf` |
| 2025-11-04 | Dennis Leon | INACTIF | `20251104 - Dennis Leon.pdf` |
| 2026-04-27 | Joel Lepage | INACTIF | `20260427 Joel Lepage.pdf` |
| 2026-04-29 | Alexander Rybalko | INACTIF | `20260429 Alexander Rybalko.pdf` |
| 2026-05-22 | Fritzger Ismenard | INACTIF | `20260522 Fritzger Ismenard.pdf` |

**Fix recommandé** : modifier `findEmployee()` pour inclure les INACTIF en mode `--include-inactif`, puis relancer `verify-all-historical-pdfs.ts --apply`.

### 2b. Employés introuvables (7) — pas dans la table `employee`

Aucun match (même avec tokens partiels) :

| Date | Nom du PDF | PDF |
|---|---|---|
| 2026-01-13 | Adam Moussa | `20260113 - Adam Moussa.pdf` |
| 2026-02-13 | gilles coté | `20260213 gilles coté.pdf` |
| 2026-05-22 | fouad Moubacher | `20260522 fouad Moubacher.pdf` |
| 2026-05-22 | Nathalan Tekle | `20260522 Nathalan Tekle.pdf` |
| 2025-11-12 | Daniel Gagné | `20251112 - Daniel Gagné.pdf` |
| 2025-12-01 | Farid Yabbou | `20251201 - Farid Yabbou.pdf` |
| 2025-12-03 | Marie Isabelle Hernandez Alas | `20251203 - Marie Isabelle Hernandez Alas.pdf` |

**Fix recommandé** : table de mapping `pdf-name-overrides.json` à construire avec Nick (avec, pour chaque nom du PDF, le `firstName lastName` exact en DB, ou la décision « créer fiche » ou « ignorer »).

### 2c. Parser-fails (3) — issuance vide

Issuance existe + PDF attaché en R2, mais 0 lignes et `totalLoanCost = 0`. Les PDFs sont probablement scannés (pas remplis numériquement), donc ni AcroForm ni OCR n'ont rien extrait.

| Date | Employé | Issuance ID | PDF |
|---|---|---|---|
| 2026-02-16 | Calixte Ludger | (en DB) | `20260216 Calixte ludger.pdf` |
| 2026-05-01 | René Decharte Ngouloure | (en DB) | `20260501 Rene Descharte Ngoulour.pdf` |
| 2026-05-07 | Emmanuel Nanguep Chetcho | (en DB) | `20260507 Emmanuel Nanguep Chetcho.pdf` |

**Fix recommandé** : saisie manuelle des pièces via l'UI (le bouton « Modifier les pièces » est disponible parce que `signatureMethod=COUNTER`).

---

## 3. Le problème caché — Ceinture invisible

### Catalogue actuel

Item `Ceinture` (SECURITE, $25, **isOneSize=false**) avec 10 variants :
- ✅ Actifs : S, M, L (60-61 en stock)
- ❌ Inactifs : XS, XL, 2XL, 3XL, 4XL, 5XL, **Unique**

### Problème

Quand le parser lit « Ceinture » dans un PDF :
- `isOneSize=false` → ne devine pas la taille = « Unique »
- Aucune taille n'est inscrite dans le PDF (juste qty + coût)
- `resolveVariant()` essaie size=null → echec, puis fallback variant `Unique` → mais `isActive=false`, filtré out
- Résultat : `variantId=null`, ligne stockée comme `customItemName="Ceinture"`

### Cas concrets (47 lignes affectées)

Pratiquement toutes les remises avec une ceinture ont ce problème. Exemples :
- Frandy Saint Jean (3 chemises + pantalon ✓, ceinture ✗)
- Saoussen Fathalli, Marc Bedard, Lydia Haddad, Lennox Hounnoukpe, etc.

### Fix recommandé

**Option A (simple, recommandée)** : Activer la variante `Unique` de Ceinture, puis migrer les 47 lignes :
```sql
UPDATE uniform_variants SET "isActive" = true WHERE id = 'b0de2dc3-7933-4b06-bb37-9970d876ea70';
UPDATE uniform_issuance_lines
   SET "variantId" = 'b0de2dc3-7933-4b06-bb37-9970d876ea70',
       "customItemName" = NULL
 WHERE "customItemName" = 'Ceinture' AND "variantId" IS NULL;
```
Effet : les 47 ceintures réapparaissent dans `Détentions actuelles` immédiatement.

**Option B** : Faire en sorte que `computeHoldings()` inclue aussi les lignes `customItemName` (changement de comportement plus large). Plus risqué.

**Anomalie secondaire** : ligne « Chemise grise (ML) XS » pour Nahomie Célestin (2026-01-15). Le variant XS de Chemise grise (ML) existe mais est probablement inactif → vérifier.

---

## 4. Problème UI — items invisibles dans la liste

Le composant [`UniformFichePanel.tsx:127-176`](../frontend/src/pages/uniformes/components/UniformFichePanel.tsx) affiche la liste des remises ainsi :

```
Date         Division    Statut    Coût      Actions (PDF + Téléverser + Modifier + Clôturer)
2026-02-13   Sécurité    Remis     235,00$   [boutons]
2026-02-24   Sécurité    Remis     170,00$   [boutons]
```

→ Aucune colonne « pièces ». Pour voir le détail, il faut cliquer « Modifier les pièces » qui ouvre `IssuanceLinesEditor` en dialog.

**Fix recommandé** : ajouter une colonne « Pièces (n) » ou une rangée détaillée extensible montrant un sommaire `2× Chemise grise ML L • 1× Pantalon militaire L • 1× Ceinture` directement. Améliore drastiquement la perception « est-ce que les items sont là ? ».

---

## 5. Décisions à prendre avec Nick

Avant Phase B (corrections), valider :

1. **Inclure les 5 INACTIF dans l'import ?** → recommandé OUI (historique d'agents qui ont eu un uniforme = donnée légitime même s'ils sont partis).
2. **Les 7 employés introuvables** : ce sont des employés actifs jamais enregistrés ? Mal-orthographiés ? À fusionner avec un employé existant ? On a besoin du mapping de Nick.
3. **Les 3 parser-fails** (Calixte, René, Emmanuel) : OK pour saisir les pièces à la main via l'UI ?
4. **Ceinture variant `Unique`** : activer + migrer les 47 lignes ?
5. **UI** : ajouter le détail des pièces dans le tableau Historique ?

---

## Annexes

- [`audit-uniform-pdfs.csv`](../backend/src/scripts/audit-uniform-pdfs.csv) — détail ligne par ligne des 84 PDFs
- [`audit-uniform-pdfs-summary.json`](../backend/src/scripts/audit-uniform-pdfs-summary.json) — compteurs JSON
- [`audit-uniform-pdfs.ts`](../backend/src/scripts/audit-uniform-pdfs.ts) — script d'audit (réutilisable, read-only)
- [`inspect-historical-lines.ts`](../backend/src/scripts/inspect-historical-lines.ts) — script de diagnostic variant vs customItemName
- [`inspect-ceinture.ts`](../backend/src/scripts/inspect-ceinture.ts) — état du catalogue Ceinture
