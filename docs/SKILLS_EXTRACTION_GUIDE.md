# Skills Extraction Guide

This document explains how we extract, normalize, and surface competences inside TalentSecure.

## Pipelines

1. **AI extraction (OpenAI/Claude)**
   - `ai-extraction.service.ts` builds a contextual prompt listing known categories.
   - The LLM responds with JSON (name/level/experience/confidence/reason/context/isSecurityRelated).
   - We normalize skill names (see `src/utils/skill-normalization.ts`) before persisting to avoid duplicates.
   - Statistics (tokens, cost, processing time) are logged in `cvExtractionLog` for monitoring.

2. **Regex/Keyword extraction**
   - `cv-extraction.service.ts` handles rule-based extraction for offline/batch scenarios.
   - Each CV is normalized (lowercase/no accents). We now add pattern packs for:
     - QC certifications (BSP, RCR, premiers soins)
     - Driver licenses (4A/4B/4C)
     - Office/ERP suites (Excel, Office, SAP, Oracle, Project)
     - Security tools (CCTV, contrôle d'accès, alarmes, rondes électroniques)
   - Pattern hits are merged with skill keywords via `dedupeSkillsByName`.

3. **UI surfacing**
   - `AutresCompetancesPage` + `SkillsExtractionPanel` show rich stats, advanced filters, and contextual toasts.
   - Each extraction/save now references the candidate and number of skills, so operators know what happened.

## Normalization rules

File: `backend/src/utils/skill-normalization.ts`

- Lowercases + removes accents, fixes common typos (e.g., `javascrpit` -> `javascript`).
- Uses synonym table (Excel/MS Excel, BSP variations, etc.).
- `dedupeSkillsByName` keeps the highest-confidence entry per normalized key.

## Workflow tips

1. Prefer AI extraction for long-form CVs; fallback to regex when offline or when AI quota is hit.
2. Always log candidate IDs when triggering batch jobs: the snackbar now reports success/fail counts.
3. When you edit the pattern lists, update this guide and add a Jest test under `backend/src/services/__tests__`.
4. Use the new docs/FAQ/Troubleshooting for onboarding analysts.

## Optimisation des appels OpenAI

- Les extractions OpenAI sont désormais indexées avec un checksum SHA-256 basé sur le texte du CV.
- Lorsque le même fichier est retraité, l'API réutilise automatiquement la dernière réponse OpenAI et évite un nouvel appel payant.
- Les journaux cv_extraction_logs conservent le checksum ainsi que la provenance OPENAI_CACHE pour analyser les économies réalisées.
- Les statistiques d'usage continuent d'inclure les jetons et les coûts réels (0 $ pour les hits cache).

## Export des résultats

- La recherche de compétences (/api/skills/search) partage maintenant sa logique avec une route d'export CSV (/api/skills/search/export).
- Le fichier CSV contient les informations de la compétence, le nombre de candidats et des détails pour chaque profil (ville, statut, niveau, confiance, source, vérification).
- Les filtres q, category, minConfidence et limit sont respectés par l'export pour refléter exactement la vue affichée.
- L'encodage est UTF-8 avec BOM afin de préserver les accents lors de l'ouverture dans Excel.
