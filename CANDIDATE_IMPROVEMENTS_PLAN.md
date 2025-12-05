# 📋 Plan d'Amélioration - Vue Candidat & Filtres Avancés

## 🎯 Objectif Principal
Permettre aux clients de trouver rapidement des candidats selon des critères précis comme :
- **Exemple** : "Agent disponible 24/7 qui habite Montréal avec ASP"

---

## 📊 PARTIE 1 : Amélioration de la Vue Candidat (CandidateDetailPage)

### 🔍 Problèmes Actuels (basé sur la capture d'écran)
1. ❌ Informations éparpillées et peu visuelles
2. ❌ Pas de mise en évidence des critères clés (BSP, disponibilité, etc.)
3. ❌ Section "Extraction de Compétences" vide et peu utile
4. ❌ Évaluation (7/10) sans contexte ni détails
5. ❌ Pas de badges visuels pour les certifications importantes
6. ❌ CV disponible mais pas de preview rapide

### ✅ Solutions Proposées

#### 1.1 Header Amélioré avec Badges Visuels
```tsx
┌─────────────────────────────────────────────────────┐
│ 👤 Gilbert Kambale Mbeku                    [Modifier]│
│ 📍 Montréal, QC                             ⭐ 7/10   │
│                                                       │
│ 🏆 BSP  ✅ Disponible 24/7  🚗 Permis Classe 5       │
│ 💼 5 ans d'expérience  🌐 Français, Anglais          │
└─────────────────────────────────────────────────────┘
```

**Implémentation** :
- Badges colorés pour BSP, RCR, permis
- Indicateur visuel de disponibilité (24/7, jour, nuit, fin de semaine)
- Score d'évaluation avec barre de progression
- Statut du candidat (Disponible, En mission, Inactif)

#### 1.2 Section "Aperçu Rapide" (Quick Overview)
```tsx
┌─────────────────────────────────────────────────────┐
│ 📋 APERÇU RAPIDE                                     │
├─────────────────────────────────────────────────────┤
│ ✅ Critères Essentiels                               │
│   • BSP Valide (expire: 2026-05-15)                 │
│   • Disponible 24/7                                  │
│   • Véhicule personnel                               │
│   • Bilingue (FR/EN)                                 │
│                                                       │
│ 💼 Expérience                                        │
│   • 5 ans en sécurité privée                        │
│   • Spécialités: Patrouille, Contrôle d'accès       │
│                                                       │
│ 📅 Disponibilité                                     │
│   • Immédiate                                        │
│   • Horaires: 24/7 (jour, nuit, fin de semaine)     │
│   • Temps plein ou temps partiel                    │
└─────────────────────────────────────────────────────┘
```

#### 1.3 Section Compétences Visuelles
```tsx
┌─────────────────────────────────────────────────────┐
│ 🎯 COMPÉTENCES & CERTIFICATIONS                      │
├─────────────────────────────────────────────────────┤
│ Sécurité                                             │
│ ████████████████████ BSP (Expert)                   │
│ ████████████░░░░░░░░ Patrouille (Avancé)            │
│ ████████████████░░░░ Contrôle d'accès (Avancé)      │
│                                                       │
│ Certifications                                       │
│ ✅ RCR/DEA (expire: 2025-12-01)                     │
│ ✅ SSIAP (valide)                                    │
│ ✅ Permis de conduire Classe 5                       │
│                                                       │
│ Langues                                              │
│ 🇫🇷 Français (Natif)                                │
│ 🇬🇧 Anglais (Intermédiaire)                         │
└─────────────────────────────────────────────────────┘
```

#### 1.4 Timeline d'Expérience
```tsx
┌─────────────────────────────────────────────────────┐
│ 💼 EXPÉRIENCE PROFESSIONNELLE                        │
├─────────────────────────────────────────────────────┤
│ 2020 - Présent │ Agent de sécurité                   │
│                │ Securitas Canada - Montréal         │
│                │ • Patrouille mobile                  │
│                │ • Contrôle d'accès                   │
│                │ • Rédaction de rapports              │
│                                                       │
│ 2018 - 2020    │ Agent de prévention                  │
│                │ GardaWorld - Laval                   │
│                │ • Surveillance vidéo                 │
│                │ • Intervention d'urgence             │
└─────────────────────────────────────────────────────┘
```

#### 1.5 Preview CV Intégré
```tsx
┌─────────────────────────────────────────────────────┐
│ 📄 CURRICULUM VITAE                                  │
├─────────────────────────────────────────────────────┤
│ [Preview PDF intégré - 3 premières pages]           │
│                                                       │
│ [Télécharger CV complet] [Voir en plein écran]      │
└─────────────────────────────────────────────────────┘
```

#### 1.6 Section Notes & Historique
```tsx
┌─────────────────────────────────────────────────────┐
│ 📝 NOTES RH & HISTORIQUE                             │
├─────────────────────────────────────────────────────┤
│ 2025-12-04 │ Entrevue réalisée - Excellent candidat │
│ 2025-12-01 │ CV reçu et validé                       │
│ 2025-11-28 │ Candidature spontanée                   │
│                                                       │
│ [+ Ajouter une note]                                 │
└─────────────────────────────────────────────────────┘
```

---

## 🔎 PARTIE 2 : Filtres Avancés (CandidatesListPage)

### 🔍 Problèmes Actuels
1. ❌ Filtres basiques (ville, statut uniquement)
2. ❌ Pas de filtre par certifications (BSP, RCR, etc.)
3. ❌ Pas de filtre par disponibilité (24/7, jour, nuit)
4. ❌ Pas de recherche par compétences
5. ❌ Pas de filtres combinés (ET/OU)

### ✅ Solutions Proposées

#### 2.1 Barre de Recherche Intelligente
```tsx
┌─────────────────────────────────────────────────────┐
│ 🔍 Recherche rapide                                  │
│ [Agent disponible 24/7 Montréal ASP          ] 🔍   │
│                                                       │
│ Suggestions:                                         │
│ • Agents avec BSP à Montréal (12 résultats)         │
│ • Agents disponibles 24/7 (8 résultats)             │
│ • Agents bilingues à Montréal (15 résultats)        │
└─────────────────────────────────────────────────────┘
```

**Fonctionnalités** :
- Recherche en langage naturel
- Auto-complétion intelligente
- Détection de mots-clés (BSP, 24/7, villes, etc.)

#### 2.2 Panneau de Filtres Avancés
```tsx
┌─────────────────────────────────────────────────────┐
│ 🎛️ FILTRES AVANCÉS                    [Réinitialiser]│
├─────────────────────────────────────────────────────┤
│ 📍 Localisation                                      │
│   ☑ Montréal (45)                                   │
│   ☐ Laval (12)                                      │
│   ☐ Québec (8)                                      │
│   [+ Ajouter ville]                                  │
│                                                       │
│ 🏆 Certifications                                    │
│   ☑ BSP (32)                                        │
│   ☐ RCR/DEA (28)                                    │
│   ☐ SSIAP (5)                                       │
│   ☐ Permis de conduire (40)                         │
│                                                       │
│ 📅 Disponibilité                                     │
│   ☑ 24/7 (8)                                        │
│   ☐ Jour uniquement (15)                            │
│   ☐ Nuit uniquement (12)                            │
│   ☐ Fin de semaine (20)                             │
│                                                       │
│ 💼 Expérience                                        │
│   [0] ────●──── [10+] ans                           │
│   Minimum: 2 ans                                     │
│                                                       │
│ 🌐 Langues                                           │
│   ☐ Français                                        │
│   ☐ Anglais                                         │
│   ☐ Espagnol                                        │
│   ☐ Autre                                           │
│                                                       │
│ ⭐ Évaluation                                        │
│   [0] ────●──── [10]                                │
│   Minimum: 7/10                                      │
│                                                       │
│ 🎯 Compétences Spécifiques                           │
│   [Rechercher compétence...]                         │
│   • Patrouille mobile                                │
│   • Contrôle d'accès                                 │
│   • Surveillance vidéo                               │
│                                                       │
│ 📊 Statut                                            │
│   ☐ Disponible immédiatement                        │
│   ☐ En mission                                       │
│   ☐ Inactif                                         │
└─────────────────────────────────────────────────────┘
```

#### 2.3 Filtres Rapides (Quick Filters)
```tsx
┌─────────────────────────────────────────────────────┐
│ ⚡ FILTRES RAPIDES                                    │
├─────────────────────────────────────────────────────┤
│ [🏆 Avec BSP] [📅 Dispo 24/7] [🚗 Avec véhicule]    │
│ [⭐ Top rated] [🌐 Bilingue] [💼 5+ ans exp]        │
└─────────────────────────────────────────────────────┘
```

#### 2.4 Filtres Sauvegardés
```tsx
┌─────────────────────────────────────────────────────┐
│ 💾 MES RECHERCHES SAUVEGARDÉES                       │
├─────────────────────────────────────────────────────┤
│ • Agents 24/7 Montréal BSP (8 résultats)            │
│ • Agents bilingues Québec (12 résultats)            │
│ • Agents expérimentés Laval (5 résultats)           │
│                                                       │
│ [+ Sauvegarder cette recherche]                     │
└─────────────────────────────────────────────────────┘
```

#### 2.5 Résultats avec Indicateurs Visuels
```tsx
┌─────────────────────────────────────────────────────┐
│ 📊 RÉSULTATS (8 candidats)          [Export CSV]    │
├─────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────┐ │
│ │ 👤 Gilbert Kambale Mbeku          ⭐ 7/10  🟢   │ │
│ │ 📍 Montréal, QC                                 │ │
│ │ 🏆 BSP  ✅ 24/7  🚗 Véhicule  🌐 FR/EN         │ │
│ │ 💼 5 ans d'expérience                           │ │
│ │ [Voir profil] [Ajouter au panier]              │ │
│ └─────────────────────────────────────────────────┘ │
│                                                       │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 👤 Marie Tremblay                 ⭐ 8/10  🟢   │ │
│ │ 📍 Montréal, QC                                 │ │
│ │ 🏆 BSP  ✅ 24/7  🌐 FR/EN/ES                   │ │
│ │ 💼 8 ans d'expérience                           │ │
│ │ [Voir profil] [Ajouter au panier]              │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

---

## 🛠️ PARTIE 3 : Implémentation Technique

### Phase 1 : Backend (1-2 jours)
1. **Ajouter champs manquants au modèle Candidate**
   ```prisma
   model Candidate {
     // ... champs existants
     
     // Disponibilité
     available24_7       Boolean @default(false)
     availableDays       Boolean @default(false)
     availableNights     Boolean @default(false)
     availableWeekends   Boolean @default(false)
     
     // Véhicule
     hasVehicle          Boolean @default(false)
     vehicleType         String?
     
     // Certifications avec dates
     bspExpiryDate       DateTime?
     rcrExpiryDate       DateTime?
     ssiapExpiryDate     DateTime?
     
     // Préférences
     preferredShiftType  String? // "full-time", "part-time", "both"
     willingToRelocate   Boolean @default(false)
   }
   ```

2. **Créer endpoint de recherche avancée**
   ```typescript
   POST /api/candidates/advanced-search
   {
     cities: ["Montréal", "Laval"],
     certifications: ["BSP", "RCR"],
     availability: ["24/7"],
     minExperience: 2,
     minRating: 7,
     languages: ["Français", "Anglais"],
     hasVehicle: true,
     skills: ["Patrouille", "Contrôle d'accès"]
   }
   ```

3. **Ajouter indexation pour performance**
   ```prisma
   @@index([city, hasBSP, available24_7])
   @@index([globalRating, yearsExperience])
   ```

### Phase 2 : Frontend (2-3 jours)
1. **Créer composants réutilisables**
   - `AdvancedFiltersPanel.tsx`
   - `QuickFilters.tsx`
   - `CandidateCard.tsx` (amélioré)
   - `CandidateBadges.tsx`
   - `SkillsVisualization.tsx`

2. **Améliorer CandidateDetailPage.tsx**
   - Section "Aperçu Rapide"
   - Badges visuels
   - Timeline d'expérience
   - Preview CV

3. **Améliorer CandidatesListPage.tsx**
   - Panneau de filtres avancés
   - Recherche intelligente
   - Filtres rapides
   - Résultats avec badges

### Phase 3 : UX/UI (1 jour)
1. **Design System**
   - Couleurs pour badges (BSP = vert, RCR = bleu, etc.)
   - Icônes cohérentes
   - Animations subtiles

2. **Responsive Design**
   - Mobile-first pour filtres
   - Drawer pour filtres sur mobile

### Phase 4 : Tests & Optimisation (1 jour)
1. Tests de performance avec 1000+ candidats
2. Tests de recherche avec combinaisons complexes
3. Validation UX avec utilisateurs

---

## 📈 PARTIE 4 : Fonctionnalités Bonus

### 4.1 Recherche en Langage Naturel (AI)
```typescript
// Exemple: "agent disponible 24/7 qui habite montréal avec asp"
const parseNaturalLanguageQuery = (query: string) => {
  return {
    cities: extractCities(query), // ["Montréal"]
    certifications: extractCertifications(query), // ["BSP"]
    availability: extractAvailability(query), // ["24/7"]
  };
};
```

### 4.2 Recommandations Intelligentes
```tsx
┌─────────────────────────────────────────────────────┐
│ 💡 SUGGESTIONS                                       │
├─────────────────────────────────────────────────────┤
│ Basé sur votre recherche, vous pourriez aussi       │
│ être intéressé par:                                  │
│                                                       │
│ • 3 candidats à Laval (ville voisine)               │
│ • 5 candidats avec 4 ans d'exp (proche de 5 ans)    │
│ • 2 candidats disponibles jour uniquement           │
└─────────────────────────────────────────────────────┘
```

### 4.3 Comparaison de Candidats
```tsx
┌─────────────────────────────────────────────────────┐
│ ⚖️ COMPARER LES CANDIDATS (2/4 sélectionnés)        │
├─────────────────────────────────────────────────────┤
│               │ Gilbert K.  │ Marie T.    │         │
│ ──────────────┼─────────────┼─────────────┤         │
│ Note          │ 7/10        │ 8/10        │         │
│ BSP           │ ✅          │ ✅          │         │
│ Expérience    │ 5 ans       │ 8 ans       │         │
│ Disponibilité │ 24/7        │ 24/7        │         │
│ Langues       │ FR/EN       │ FR/EN/ES    │         │
│ Véhicule      │ ✅          │ ❌          │         │
└─────────────────────────────────────────────────────┘
```

---

## 🎯 PARTIE 5 : Priorisation

### 🔴 Priorité HAUTE (Semaine 1)
1. ✅ Ajouter champs disponibilité au modèle
2. ✅ Créer filtres BSP, disponibilité 24/7, ville
3. ✅ Améliorer badges visuels dans la liste
4. ✅ Section "Aperçu Rapide" dans détail candidat

### 🟡 Priorité MOYENNE (Semaine 2)
1. ✅ Filtres avancés complets
2. ✅ Recherche par compétences
3. ✅ Timeline d'expérience
4. ✅ Preview CV intégré

### 🟢 Priorité BASSE (Semaine 3+)
1. ✅ Recherche en langage naturel (AI)
2. ✅ Recommandations intelligentes
3. ✅ Comparaison de candidats
4. ✅ Filtres sauvegardés

---

## 📊 Métriques de Succès
- ✅ Temps de recherche réduit de 70%
- ✅ Taux de conversion candidat → mission +40%
- ✅ Satisfaction client +50%
- ✅ Nombre de clics réduit de 60%

---

## 🚀 Prochaines Étapes
1. Valider ce plan avec toi
2. Créer les maquettes UI/UX
3. Commencer l'implémentation Phase 1
4. Tests utilisateurs après chaque phase

**Qu'en penses-tu ? Par quelle partie veux-tu commencer ?**
