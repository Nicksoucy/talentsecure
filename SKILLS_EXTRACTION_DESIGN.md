# Système d'extraction de compétences des CVs
## Document de design et architecture

**Date:** 2025-01-17
**Version:** 1.0
**Status:** 📋 Design / Planification

---

## 🎯 Vision et objectifs

### Vision
Transformer TalentSecure d'une simple banque d'agents de sécurité en une plateforme riche de talents avec compétences multiples, permettant de servir des clients cherchant des profils variés au-delà de la sécurité.

### Objectifs business
1. **Diversification des services** - Offrir des candidats avec compétences variées
2. **Meilleure valorisation** - Découvrir des compétences cachées dans les CVs
3. **Nouveaux marchés** - Servir des clients cherchant des profils spécialisés
4. **Différenciation** - Se démarquer avec une base de données riche

### Objectifs techniques
1. **Parser automatiquement** tous les CVs existants (PDF, DOCX)
2. **Extraire** compétences, certifications, expériences détaillées
3. **Structurer** les données pour recherche et filtrage avancés
4. **Indexer** pour recherche rapide et pertinente
5. **Enrichir** progressivement avec validation manuelle

---

## 📊 Architecture de données

### Nouveau schéma Prisma

```prisma
// Catégories de compétences
enum SkillCategory {
  TECHNICAL          // Compétences techniques (ex: Charpenterie, Mécanique)
  SOFT_SKILL         // Compétences interpersonnelles (ex: Communication)
  CERTIFICATION      // Certifications officielles (ex: BSP, PDSB)
  LICENSE            // Permis et licences (ex: Permis de conduire classe 1)
  LANGUAGE           // Langues (déjà existant mais peut être lié)
  INDUSTRY           // Expérience sectorielle (ex: Automobile, Construction)
  SOFTWARE           // Logiciels et outils (ex: MS Office, AutoCAD)
  SAFETY             // Sécurité et santé (ex: Premiers soins, RCR)
}

enum SkillLevel {
  BEGINNER           // Débutant / Notions de base
  INTERMEDIATE       // Intermédiaire / Compétent
  ADVANCED           // Avancé / Expert
  MASTER             // Maîtrise / Spécialiste
  NOT_SPECIFIED      // Niveau non spécifié
}

enum SkillSource {
  CV_EXTRACTED       // Extrait automatiquement du CV
  MANUAL_ENTRY       // Ajouté manuellement par admin
  INTERVIEW_NOTED    // Noté durant l'entrevue
  VERIFIED           // Vérifié/validé par admin
  CLIENT_FEEDBACK    // Feedback d'un client
}

// Modèle principal des compétences
model Skill {
  id          String        @id @default(uuid())
  name        String        // Ex: "Service à la clientèle"
  category    SkillCategory
  description String?       // Description détaillée
  aliases     String[]      // Variantes du nom (ex: ["mécanique auto", "réparation automobile"])

  // Relation avec les candidats
  candidates  CandidateSkill[]

  // Métadonnées
  isActive    Boolean       @default(true)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  @@unique([name, category])
  @@index([category])
  @@index([name])
  @@map("skills")
}

// Relation many-to-many entre candidats et compétences
model CandidateSkill {
  id           String      @id @default(uuid())
  candidateId  String
  candidate    Candidate   @relation(fields: [candidateId], references: [id], onDelete: Cascade)

  skillId      String
  skill        Skill       @relation(fields: [skillId], references: [id], onDelete: Cascade)

  level        SkillLevel  @default(NOT_SPECIFIED)
  source       SkillSource @default(CV_EXTRACTED)
  yearsOfExp   Int?        // Années d'expérience avec cette compétence
  lastUsed     DateTime?   // Dernière utilisation (si mentionné)
  notes        String?     // Notes additionnelles

  // Validation
  isVerified   Boolean     @default(false)
  verifiedBy   String?     // ID de l'admin qui a vérifié
  verifiedAt   DateTime?

  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt

  @@unique([candidateId, skillId])
  @@index([candidateId])
  @@index([skillId])
  @@index([level])
  @@map("candidate_skills")
}

// Log d'extraction pour traçabilité
model CvExtractionLog {
  id            String   @id @default(uuid())
  candidateId   String
  candidate     Candidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)

  cvUrl         String   // URL du CV traité
  extractedAt   DateTime @default(now())

  // Résultats
  skillsFound   Int      @default(0)
  certsFound    Int      @default(0)
  status        String   // SUCCESS, PARTIAL, FAILED
  errors        String[] // Erreurs rencontrées

  // Méthode utilisée
  method        String   // GPT4, REGEX, MANUAL, etc.

  // Données brutes extraites (JSON)
  rawData       Json?

  @@index([candidateId])
  @@index([extractedAt])
  @@map("cv_extraction_logs")
}

// Mise à jour du modèle Candidate existant
model Candidate {
  // ... champs existants ...

  // Nouvelles relations
  skills           CandidateSkill[]
  extractionLogs   CvExtractionLog[]

  // Nouveaux champs optionnels
  skillsLastUpdated DateTime?
  cvLastProcessed   DateTime?
}
```

---

## 🤖 Stratégie d'extraction

### Approche multi-niveaux

#### Niveau 1: Extraction de base (REGEX + Keywords)
**Pour:** Certifications standardisées, permis
**Méthode:** Patterns regex + listes de mots-clés
**Exemples:**
```typescript
const PATTERNS = {
  BSP: /BSP[\s-]?\d{5,}|Bureau des services de protection/i,
  PDSB: /PDSB|permis de conduire sécurité/i,
  RCR: /RCR|réanimation cardio|CPR/i,
  FIRST_AID: /premiers soins|first aid|secourisme/i,
  DRIVER_LICENSE: /permis (de conduire )?classe [1-5A-Z]/i,
};

const SKILL_KEYWORDS = {
  'Service à la clientèle': ['service client', 'relation client', 'customer service'],
  'Mécanique automobile': ['mécanique auto', 'réparation véhicule', 'garage'],
  'Charpenterie': ['charpentier', 'menuisier', 'ébéniste', 'construction bois'],
  'Soudure': ['soudeur', 'soudage', 'welding'],
  // ... etc
};
```

#### Niveau 2: Extraction intelligente (GPT-4 / Claude)
**Pour:** Compétences contextuelles, soft skills, expériences
**Méthode:** Prompt engineering avec AI
**Exemple de prompt:**
```
Analyse ce CV et extrais:
1. Compétences techniques (avec niveau si mentionné)
2. Certifications et formations
3. Expérience par secteur d'activité
4. Soft skills démontrés
5. Logiciels/outils maîtrisés

Format de réponse: JSON structuré
{
  "technical_skills": [
    {"name": "...", "level": "...", "years": ...}
  ],
  "certifications": [...],
  "industries": [...],
  "soft_skills": [...],
  "software": [...]
}
```

#### Niveau 3: Validation humaine
**Pour:** Confirmation et enrichissement
**Interface admin pour:**
- Confirmer les compétences extraites
- Ajouter des compétences manquantes
- Corriger les niveaux
- Ajouter des notes contextuelles

---

## 🔧 Architecture technique

### Backend

#### Services

```typescript
// services/cv-parser.service.ts
class CvParserService {
  // Extraire texte du PDF/DOCX
  async extractTextFromCV(cvUrl: string): Promise<string>

  // Parser avec regex
  async extractBasicSkills(text: string): Promise<BasicSkills>

  // Parser avec AI
  async extractAdvancedSkills(text: string): Promise<AdvancedSkills>

  // Combiner et normaliser
  async normalizeSkills(basic: BasicSkills, advanced: AdvancedSkills): Promise<NormalizedSkills>
}

// services/skills.service.ts
class SkillsService {
  // CRUD compétences
  async createSkill(data: CreateSkillDto): Promise<Skill>
  async findOrCreateSkill(name: string, category: SkillCategory): Promise<Skill>
  async searchSkills(query: string): Promise<Skill[]>

  // Gestion candidat-compétences
  async addSkillToCandidate(candidateId: string, skillData: AddSkillDto): Promise<CandidateSkill>
  async updateCandidateSkill(id: string, data: UpdateSkillDto): Promise<CandidateSkill>
  async verifyCandidateSkill(id: string, verifiedBy: string): Promise<CandidateSkill>
}
```

#### Endpoints API

```typescript
// GET /api/skills - Liste toutes les compétences
// GET /api/skills/search?q=mécanique - Recherche compétences
// POST /api/skills - Créer nouvelle compétence (admin)
// PUT /api/skills/:id - Modifier compétence (admin)
// DELETE /api/skills/:id - Supprimer compétence (admin)

// GET /api/candidates/:id/skills - Compétences d'un candidat
// POST /api/candidates/:id/skills - Ajouter compétence à candidat
// PUT /api/candidate-skills/:id - Modifier compétence candidat
// DELETE /api/candidate-skills/:id - Retirer compétence
// POST /api/candidate-skills/:id/verify - Vérifier une compétence

// POST /api/cv-extraction/process/:candidateId - Lancer extraction pour un candidat
// POST /api/cv-extraction/batch - Lancer extraction par lot
// GET /api/cv-extraction/logs/:candidateId - Logs d'extraction d'un candidat
// GET /api/cv-extraction/stats - Statistiques d'extraction globales
```

#### Scripts de traitement

```typescript
// scripts/extract-all-cvs.ts
// Traiter tous les CVs existants en batch
// Avec rate limiting pour ne pas surcharger l'API AI

// scripts/extract-single-cv.ts
// Traiter un seul CV (pour test)

// scripts/seed-common-skills.ts
// Pré-remplir la DB avec compétences communes
```

---

## 🎨 Interface utilisateur

### Pages admin

#### 1. Page "Compétences" (`/skills`)

**Vue principale:**
```
┌─────────────────────────────────────────────────────────┐
│  Compétences                                    [+ Nouvelle] │
├─────────────────────────────────────────────────────────┤
│  📊 Statistiques                                          │
│  ┌──────────┬──────────┬──────────┬──────────┐        │
│  │   250    │    45    │   180    │    32    │        │
│  │ Total    │ Certifs  │ Tech     │ Soft     │        │
│  └──────────┴──────────┴──────────┴──────────┘        │
│                                                          │
│  🔍 Recherche & Filtres                                  │
│  [Rechercher compétence...]  [Catégorie ▼]  [Actives ▼] │
│                                                          │
│  📋 Liste des compétences                                │
│  ┌────────────────────────────────────────────────┐    │
│  │ Service à la clientèle    | Soft Skill | 45👤 │    │
│  │ BSP - Agent de sécurité   | Certif     | 230👤│    │
│  │ Mécanique automobile      | Technique  | 12👤 │    │
│  │ Charpenterie              | Technique  | 8👤  │    │
│  │ Permis classe 1           | License    | 15👤 │    │
│  └────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

#### 2. Page candidat enrichie

**Section compétences dans fiche candidat:**
```
┌─────────────────────────────────────────────────────────┐
│  Compétences et qualifications          [+ Ajouter]      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  🏆 Certifications                                       │
│  • BSP #12345 ✓ Vérifié                                │
│  • RCR - Premiers soins ✓ Vérifié                      │
│  • SIMDUT ⚠ À vérifier                                  │
│                                                          │
│  🔧 Compétences techniques                               │
│  • Mécanique automobile [Expert] (8 ans)                │
│  • Charpenterie [Intermédiaire] (3 ans)                │
│  • Électricité [Débutant]                              │
│                                                          │
│  💼 Compétences transférables                            │
│  • Service à la clientèle [Avancé]                      │
│  • Gestion d'équipe [Intermédiaire]                    │
│  • Communication [Avancé]                               │
│                                                          │
│  📜 Permis et licences                                   │
│  • Permis de conduire classe 5 ✓                       │
│  • Permis de conduire classe 1 ✓                       │
│                                                          │
│  🎓 Secteurs d'expérience                                │
│  • Automobile (5 ans)                                   │
│  • Construction (3 ans)                                 │
│  • Sécurité (2 ans)                                     │
│                                                          │
│  ℹ️ Dernière extraction: 15 jan 2025 | Source: CV      │
│     [Ré-extraire du CV]  [Valider tout]                │
└─────────────────────────────────────────────────────────┘
```

#### 3. Page "Extraction CVs" (`/cv-extraction`)

**Tableau de bord extraction:**
```
┌─────────────────────────────────────────────────────────┐
│  Extraction de compétences                              │
├─────────────────────────────────────────────────────────┤
│  📊 Progression                                          │
│  ┌──────────────────────────────────────────────┐      │
│  │ CVs traités: 45/200 (22.5%)                  │      │
│  │ ████████░░░░░░░░░░░░░░░░░░░░░░░░░            │      │
│  │ Compétences extraites: 1,250                  │      │
│  │ Certifications trouvées: 180                  │      │
│  └──────────────────────────────────────────────┘      │
│                                                          │
│  🎛️ Actions                                              │
│  [▶ Lancer extraction batch]  [⏸ Pause]  [📊 Stats]   │
│                                                          │
│  📝 Logs récents                                         │
│  ┌────────────────────────────────────────────────┐    │
│  │ ✅ Jean Tremblay    - 12 compétences trouvées  │    │
│  │ ✅ Marie Dubois     - 8 compétences trouvées   │    │
│  │ ⚠️  Paul Martin     - Erreur parsing PDF       │    │
│  │ ✅ Sophie Gagnon    - 15 compétences trouvées  │    │
│  └────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

#### 4. Recherche avancée par compétences

**Nouvelle page "Recherche Talents" (`/talents/search`):**
```
┌─────────────────────────────────────────────────────────┐
│  Recherche de talents                                    │
├─────────────────────────────────────────────────────────┤
│  🔍 Critères de recherche                                │
│                                                          │
│  Compétences requises:                                  │
│  ┌────────────────────────────────────────────────┐    │
│  │ [Service à la clientèle ×]  [BSP ×]  [+ Ajouter]│    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  Niveau minimum: [Intermédiaire ▼]                      │
│  Ville: [Toutes ▼]  [Montréal] [Québec] [Gatineau]     │
│  Disponibilité: [Tous ▼]  Langues: [Français ▼]        │
│                                                          │
│  [🔍 Rechercher]                                         │
│                                                          │
│  📊 Résultats: 15 candidats trouvés                      │
│  ┌────────────────────────────────────────────────┐    │
│  │ Jean Tremblay        Montréal                   │    │
│  │ • Service clientèle ⭐⭐⭐⭐ Expert             │    │
│  │ • BSP ✓  • Bilingue                            │    │
│  │ [Voir profil]  [Ajouter au catalogue]          │    │
│  ├────────────────────────────────────────────────┤    │
│  │ Marie Dubois         Laval                      │    │
│  │ • Service clientèle ⭐⭐⭐ Avancé              │    │
│  │ • BSP ✓  • Français                            │    │
│  │ [Voir profil]  [Ajouter au catalogue]          │    │
│  └────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

---

## 📦 Librairies et outils nécessaires

### Backend
```json
{
  "dependencies": {
    // Parsing PDF
    "pdf-parse": "^1.1.1",
    "pdf2json": "^3.0.5",

    // Parsing DOCX
    "mammoth": "^1.6.0",
    "docx": "^8.5.0",

    // AI pour extraction
    "openai": "^4.24.0",
    "@anthropic-ai/sdk": "^0.9.1",

    // NLP basique
    "natural": "^6.9.0",
    "compromise": "^14.11.0",

    // Utilitaires texte
    "string-similarity": "^4.0.4",
    "leven": "^3.1.0"
  }
}
```

### Frontend
```json
{
  "dependencies": {
    // Déjà installés, rien de nouveau nécessaire
    "@mui/material": "...",
    "@tanstack/react-query": "...",
    "react-router-dom": "..."
  }
}
```

---

## 🚀 Plan d'implémentation par phases

### Phase 1: Fondations (Semaine 1)
**Objectif:** Infrastructure de base

**Tâches:**
- [ ] Créer migration Prisma pour nouvelles tables
- [ ] Seed compétences communes (200-300 skills de base)
- [ ] Endpoints CRUD pour Skills
- [ ] Page admin `/skills` (liste et gestion)
- [ ] Tests manuels ajout de compétences

**Livrables:**
- ✅ DB avec tables Skills, CandidateSkill, CvExtractionLog
- ✅ Admin peut créer/modifier des compétences
- ✅ Admin peut ajouter compétences à un candidat manuellement

### Phase 2: Extraction basique (Semaine 2)
**Objectif:** Parser CVs avec regex

**Tâches:**
- [ ] Service de parsing PDF/DOCX
- [ ] Patterns regex pour certifications (BSP, RCR, etc.)
- [ ] Keywords pour compétences communes
- [ ] Script pour traiter 1 CV test
- [ ] Logs d'extraction
- [ ] Interface pour voir résultats extraction

**Livrables:**
- ✅ Script peut extraire BSP, permis, certifications courantes
- ✅ Extraction basique de 20-30 compétences communes
- ✅ Logs visibles dans l'interface admin

### Phase 3: AI Integration (Semaine 3)
**Objectif:** Extraction intelligente avec GPT/Claude

**Tâches:**
- [ ] Intégration OpenAI/Anthropic API
- [ ] Prompts engineering pour extraction
- [ ] Normalisation des résultats AI
- [ ] Batch processing avec rate limiting
- [ ] Tests sur 10-20 CVs réels

**Livrables:**
- ✅ AI extrait compétences contextuelles
- ✅ Détecte niveaux de compétence
- ✅ Identifie soft skills
- ✅ Extrait années d'expérience par compétence

### Phase 4: Traitement en masse (Semaine 4)
**Objectif:** Traiter tous les CVs existants

**Tâches:**
- [ ] Script batch pour tous les candidats
- [ ] Queue system (optionnel)
- [ ] Monitoring et progress tracking
- [ ] Page admin pour suivre progression
- [ ] Gestion des erreurs et retry logic

**Livrables:**
- ✅ Tous les CVs de la DB sont traités
- ✅ Dashboard montre progression
- ✅ Logs d'erreurs pour CVs problématiques

### Phase 5: Recherche et filtres (Semaine 5)
**Objectif:** Exploiter les données

**Tâches:**
- [ ] Page "Recherche talents" avec filtres
- [ ] Recherche multi-critères (compétences + ville + etc.)
- [ ] Export de listes filtrées
- [ ] Intégration dans création de catalogues
- [ ] Stats et analytics sur compétences

**Livrables:**
- ✅ Admin peut chercher par compétences
- ✅ Filtres combinés fonctionnels
- ✅ Export CSV/Excel des résultats
- ✅ Catalogues peuvent cibler par compétences

### Phase 6: Raffinement et validation (Semaine 6)
**Objectif:** Qualité et précision

**Tâches:**
- [ ] Interface validation en batch
- [ ] Suggestions AI pour compétences manquantes
- [ ] Détection doublons et normalisation
- [ ] Documentation utilisateur
- [ ] Formation de l'équipe

**Livrables:**
- ✅ Process de validation établi
- ✅ Data quality > 90%
- ✅ Équipe formée à l'utilisation
- ✅ Documentation complète

---

## 💰 Estimation des coûts

### Coûts AI (OpenAI GPT-4 ou Claude)

**Hypothèses:**
- 200 CVs à traiter
- ~2000 tokens par CV en moyenne
- Prix GPT-4: $0.03 / 1K tokens input

**Calcul:**
```
200 CVs × 2000 tokens = 400,000 tokens
400,000 tokens × $0.03 / 1000 = $12 USD

Coût total initial: ~15-20$ USD
Coût mensuel (nouveaux CVs): ~5$ USD
```

### Temps de développement

**Total estimé: 4-6 semaines** (1 développeur full-time)

---

## 🎯 Métriques de succès

### KPIs techniques
- ✅ 95%+ des CVs traités avec succès
- ✅ Moyenne 10+ compétences par candidat
- ✅ 80%+ des certifications détectées automatiquement
- ✅ Temps de traitement < 30 secondes par CV

### KPIs business
- ✅ 50%+ des candidats ont des compétences hors sécurité
- ✅ 3+ nouveaux types de contrats (hors sécurité) dans 3 mois
- ✅ Augmentation de 20% des catalogues envoyés
- ✅ Feedback client positif sur diversité des profils

---

## 🔒 Considérations de sécurité et confidentialité

### Protection des données
- ✅ CVs ne sont jamais stockés sur serveurs externes (AI APIs)
- ✅ Seulement le texte extrait est envoyé à l'API
- ✅ Logs d'extraction ne contiennent pas de PII sensible
- ✅ Conformité RGPD/PIPEDA

### Accès et permissions
- ✅ Seuls admins peuvent lancer extractions
- ✅ Logs d'audit pour toute modification de compétences
- ✅ Vérification requise pour compétences sensibles (certifications)

---

## 📚 Exemples de compétences pré-configurées

### Certifications (50+)
```
BSP - Agent de sécurité
PDSB - Permis de port d'arme
RCR - Réanimation cardio-respiratoire
Premiers soins
SIMDUT / WHMIS
Chariot élévateur
Nacelle/plateforme élévatrice
Travail en hauteur
Espaces clos
HACCP
Salubrité alimentaire
Carte ASP construction
```

### Compétences techniques (100+)
```
Mécanique automobile
Électricité résidentielle
Plomberie
Charpenterie-menuiserie
Soudure (MIG, TIG, arc)
Peinture en bâtiment
Maçonnerie
Réfrigération/climatisation
Informatique/dépannage
Réseautique
Programmation (langages divers)
CAD/DAO (AutoCAD, SolidWorks)
Couture industrielle
Cuisine professionnelle
Pâtisserie
```

### Soft skills (50+)
```
Service à la clientèle
Communication
Leadership
Travail d'équipe
Résolution de problèmes
Gestion du temps
Pensée critique
Adaptabilité
Gestion du stress
Négociation
```

### Secteurs d'expérience (30+)
```
Automobile
Construction
Manufacturier
Restauration/hôtellerie
Santé
Éducation
Commerce de détail
Transport/logistique
Événementiel
Télécommunications
```

---

## 🔮 Évolutions futures

### Court terme (3-6 mois)
- Auto-suggestion de compétences lors de l'ajout de candidat
- Matching automatique candidat-client basé sur compétences
- Notifications quand nouveau candidat a compétence rare

### Moyen terme (6-12 mois)
- Marketplace de compétences (clients cherchent, système propose)
- Scoring de compatibilité candidat-poste
- Prédictions de salaire selon compétences
- Recommandations de formations pour candidats

### Long terme (12+ mois)
- API publique pour partenaires
- Intégration jobboards externes
- AI pour création automatique de descriptions de poste
- Système de badges/gamification pour candidats

---

## ✅ Checklist avant implémentation

### Validation business
- [ ] Accord direction sur le budget
- [ ] Validation du ROI attendu
- [ ] Exemples de clients potentiels identifiés
- [ ] Plan marketing pour nouvelles offres

### Validation technique
- [ ] Environnement de test configuré
- [ ] Accès aux APIs AI configuré (clés, limites)
- [ ] Backup DB avant modifications
- [ ] Plan de rollback en cas de problème

### Ressources
- [ ] Temps développeur alloué (4-6 semaines)
- [ ] Budget API AI approuvé (~$50/mois)
- [ ] QA disponible pour tests
- [ ] Documentation des CVs existants (formats, qualité)

---

## 📞 Prochaines étapes

1. **Review de ce document** - Valider l'approche avec l'équipe
2. **Décision Go/No-Go** - Approuver le projet
3. **Priorisation** - Confirmer les phases à implémenter
4. **Kick-off** - Commencer Phase 1 (Fondations)

---

**Document maintenu par:** Claude (AI Assistant)
**Dernière mise à jour:** 2025-01-17
**Contact:** [Votre équipe technique]

