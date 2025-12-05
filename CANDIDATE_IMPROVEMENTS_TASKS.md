# 📋 Task List - Amélioration Vue Candidat & Filtres

## 🎯 PHASE 1 : Backend - Nouveaux Champs (Priorité HAUTE)

### Étape 1.1 : Ajouter champs de disponibilité au schéma Prisma
- [ ] Ouvrir `backend/prisma/schema.prisma`
- [ ] Ajouter champs au modèle `Candidate` :
  - `available24_7` (Boolean)
  - `availableDays` (Boolean)
  - `availableNights` (Boolean)
  - `availableWeekends` (Boolean)
  - `hasVehicle` (Boolean)
  - `vehicleType` (String?)
  - `bspExpiryDate` (DateTime?)
  - `rcrExpiryDate` (DateTime?)
  - `preferredShiftType` (String?)
  - `willingToRelocate` (Boolean)
- [ ] Ajouter index pour performance : `@@index([city, hasBSP, available24_7])`
- [ ] Générer migration : `npx prisma migrate dev --name add_availability_fields`
- [ ] Appliquer migration

### Étape 1.2 : Créer endpoint de recherche avancée
- [ ] Créer `backend/src/controllers/candidate.controller.ts` → fonction `advancedSearch`
- [ ] Accepter paramètres :
  - `cities: string[]`
  - `certifications: string[]` (BSP, RCR, etc.)
  - `availability: string[]` (24/7, days, nights, weekends)
  - `minExperience: number`
  - `minRating: number`
  - `hasVehicle: boolean`
  - `languages: string[]`
- [ ] Construire requête Prisma dynamique avec filtres
- [ ] Tester avec Postman/Thunder Client

### Étape 1.3 : Ajouter route API
- [ ] Ouvrir `backend/src/routes/candidate.routes.ts`
- [ ] Ajouter route : `POST /api/candidates/advanced-search`
- [ ] Ajouter validation Zod pour les paramètres
- [ ] Tester l'endpoint

---

## 🎨 PHASE 2 : Frontend - Composants de Base (Priorité HAUTE)

### Étape 2.1 : Créer composant CandidateBadges
- [ ] Créer `frontend/src/components/candidates/CandidateBadges.tsx`
- [ ] Props : `hasBSP`, `hasRCR`, `available24_7`, `languages`, `hasVehicle`
- [ ] Badges colorés :
  - BSP = vert (#4CAF50)
  - RCR = bleu (#2196F3)
  - 24/7 = orange (#FF9800)
  - Véhicule = gris (#9E9E9E)
  - Langues = violet (#9C27B0)
- [ ] Tester le composant isolément

### Étape 2.2 : Améliorer CandidateCard (liste)
- [ ] Ouvrir `frontend/src/pages/candidates/components/CandidatesTable.tsx`
- [ ] Ajouter colonne "Badges" avec `CandidateBadges`
- [ ] Ajouter icône de statut (🟢 disponible, 🟡 en mission, 🔴 inactif)
- [ ] Améliorer affichage de la note (barre de progression)
- [ ] Tester visuellement

### Étape 2.3 : Créer section "Aperçu Rapide"
- [ ] Créer `frontend/src/components/candidates/QuickOverview.tsx`
- [ ] Sections :
  - ✅ Critères Essentiels (BSP, 24/7, véhicule, langues)
  - 💼 Expérience (années, spécialités)
  - 📅 Disponibilité (immédiate, horaires, temps plein/partiel)
- [ ] Intégrer dans `CandidateDetailPage.tsx`
- [ ] Tester avec données réelles

---

## 🔎 PHASE 3 : Frontend - Filtres Avancés (Priorité HAUTE)

### Étape 3.1 : Créer composant AdvancedFiltersPanel
- [ ] Créer `frontend/src/components/candidates/AdvancedFiltersPanel.tsx`
- [ ] Sections de filtres :
  - 📍 Localisation (multi-select villes)
  - 🏆 Certifications (checkboxes : BSP, RCR, SSIAP, Permis)
  - 📅 Disponibilité (checkboxes : 24/7, Jour, Nuit, Fin de semaine)
  - 💼 Expérience (slider 0-10+ ans)
  - 🌐 Langues (checkboxes)
  - ⭐ Évaluation (slider 0-10)
  - 🚗 Véhicule (checkbox)
- [ ] État local pour gérer les filtres
- [ ] Bouton "Réinitialiser"
- [ ] Tester interactions

### Étape 3.2 : Créer composant QuickFilters
- [ ] Créer `frontend/src/components/candidates/QuickFilters.tsx`
- [ ] Boutons rapides :
  - "🏆 Avec BSP"
  - "📅 Dispo 24/7"
  - "🚗 Avec véhicule"
  - "⭐ Top rated (8+)"
  - "🌐 Bilingue"
  - "💼 5+ ans exp"
- [ ] Au clic, applique le filtre correspondant
- [ ] Tester comportement

### Étape 3.3 : Intégrer filtres dans CandidatesListPage
- [ ] Ouvrir `frontend/src/pages/candidates/CandidatesListPage.tsx`
- [ ] Ajouter `AdvancedFiltersPanel` dans un Drawer (Material-UI)
- [ ] Ajouter `QuickFilters` en haut de la liste
- [ ] Connecter filtres à l'API `advancedSearch`
- [ ] Afficher nombre de résultats
- [ ] Tester recherche complète

---

## 🎨 PHASE 4 : Frontend - Amélioration Vue Détail (Priorité MOYENNE)

### Étape 4.1 : Améliorer Header de CandidateDetailPage
- [ ] Ouvrir `frontend/src/pages/candidates/CandidateDetailPage.tsx`
- [ ] Header avec :
  - Nom + Photo
  - Ville + Province
  - Note avec barre de progression
  - Badges (BSP, 24/7, langues, etc.)
  - Statut (Disponible/En mission/Inactif)
- [ ] Bouton "Modifier" (si admin)
- [ ] Tester responsive

### Étape 4.2 : Créer composant SkillsVisualization
- [ ] Créer `frontend/src/components/candidates/SkillsVisualization.tsx`
- [ ] Afficher compétences avec barres de progression
- [ ] Grouper par catégorie (Sécurité, Langues, Certifications)
- [ ] Indicateur de niveau (Débutant, Intermédiaire, Avancé, Expert)
- [ ] Tester avec vraies données

### Étape 4.3 : Créer composant ExperienceTimeline
- [ ] Créer `frontend/src/components/candidates/ExperienceTimeline.tsx`
- [ ] Timeline verticale avec :
  - Dates (début - fin)
  - Poste
  - Entreprise + Ville
  - Responsabilités (liste)
- [ ] Utiliser Material-UI Timeline
- [ ] Tester affichage

### Étape 4.4 : Intégrer Preview CV
- [ ] Ajouter section "Curriculum Vitae" dans `CandidateDetailPage`
- [ ] Si PDF : utiliser `react-pdf` pour preview
- [ ] Boutons : "Télécharger" et "Voir plein écran"
- [ ] Fallback si pas de CV
- [ ] Tester avec différents formats

---

## 🎁 PHASE 5 : Fonctionnalités Bonus (Priorité BASSE)

### Étape 5.1 : Recherche en langage naturel
- [ ] Créer fonction `parseNaturalLanguageQuery` dans `frontend/src/utils/searchParser.ts`
- [ ] Détecter :
  - Villes (Montréal, Québec, Laval, etc.)
  - Certifications (BSP, ASP, RCR, etc.)
  - Disponibilité (24/7, jour, nuit, etc.)
  - Expérience (5 ans, 10+ ans, etc.)
- [ ] Intégrer dans barre de recherche
- [ ] Tester avec exemples réels

### Étape 5.2 : Filtres sauvegardés
- [ ] Créer modèle `SavedSearch` dans Prisma
- [ ] Backend : endpoints CRUD pour recherches sauvegardées
- [ ] Frontend : composant `SavedSearches.tsx`
- [ ] Bouton "Sauvegarder cette recherche"
- [ ] Liste des recherches sauvegardées
- [ ] Tester sauvegarde/chargement

### Étape 5.3 : Comparaison de candidats
- [ ] Créer composant `CandidateComparison.tsx`
- [ ] Sélection multiple dans liste (max 4 candidats)
- [ ] Tableau comparatif :
  - Note, BSP, Expérience, Disponibilité, Langues, Véhicule
- [ ] Bouton "Comparer" dans toolbar
- [ ] Tester avec 2-4 candidats

---

## 🧪 PHASE 6 : Tests & Optimisation

### Étape 6.1 : Tests de performance
- [ ] Tester recherche avec 1000+ candidats
- [ ] Optimiser requêtes Prisma (indexes)
- [ ] Pagination efficace (cursor-based)
- [ ] Lazy loading des images
- [ ] Mesurer temps de réponse

### Étape 6.2 : Tests UX
- [ ] Tester sur mobile (responsive)
- [ ] Tester avec utilisateurs réels
- [ ] Collecter feedback
- [ ] Ajuster selon retours

### Étape 6.3 : Documentation
- [ ] Documenter nouveaux endpoints API
- [ ] Documenter composants React
- [ ] Guide utilisateur pour filtres avancés
- [ ] Vidéo démo (optionnel)

---

## 📊 Progression Globale

### ✅ Complété : 0/30 tâches (0%)
### 🔄 En cours : 0/30 tâches (0%)
### ⏳ À faire : 30/30 tâches (100%)

---

## 🎯 Ordre d'Exécution Recommandé

1. **Semaine 1** : Phase 1 (Backend) + Phase 2 (Composants de base)
2. **Semaine 2** : Phase 3 (Filtres avancés) + Phase 4 (Vue détail)
3. **Semaine 3** : Phase 5 (Bonus) + Phase 6 (Tests)

---

## 🚀 Prochaine Étape

**Commencer par : Étape 1.1 - Ajouter champs de disponibilité au schéma Prisma**

Prêt à commencer ? 🎨
