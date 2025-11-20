# FAQ

## Extraction & Recherche

**Q: Pourquoi aucun résultat dans "Autres Compétences" alors que des CVs existent ?**
- Vérifiez que le CV est bien téléversé.
- Les filtres avancés peuvent masquer certaines compétences (catégorie, niveau, expérience).
- Relancez une extraction individuelle si le CV vient d'être mis à jour.

**Q: Comment exporter la vue « Autres Compétences » ?**
- Utilisez le bouton « Exporter » ou la page `/exports` pour générer un CSV/Excel/PDF aligné avec les filtres actifs.
- Côté API, appelez `/api/exports/skills/csv` (ou `/excel`, `/pdf`) en passant les paramètres `q`, `category`, `minConfidence`, `limit`.
**Q: Comment réduire le coût d'une extraction batch ?**
- Choisissez un lot limité (10/50/100) et ne lancez "Tous" que lorsque nécessaire.
- Les candidats déjà traités sont ignorés, mais on paie tout de même la requête si on sélectionne un grand lot.

## Interface & Notifications

**Q: Les toasts affichent maintenant des noms, comment est-ce calculé ?**
- Les mutations envoient le libellé du candidat/catalogue pour permettre des messages du type "CV ajouté pour Alice".
- Aucun identifiant sensible n'est logué côté client.

**Q: Où trouver de l'aide dans l'application ?**
- Chaque page clé possède un bouton "Guide & FAQ" (Autres Compétences, Prospects, Candidats, formulaires, catalogues).
- Les dialogues résument les étapes critiques et donnent des astuces rapides.

## Backend & API

**Q: Puis-je re-lancer l'extraction AI sur un candidat depuis l'API ?**
- Oui, via `POST /api/skills/extract/{candidateId}`. Mentionnez le modèle (`gpt-3.5-turbo`, `gpt-4`, `claude-3-sonnet`, etc.).

**Q: Comment fonctionnent les nouveaux patterns (BSP/RCR, licences, outils) ?**
- Ils sont définis dans `cv-extraction.service.ts` et ajoutent des compétences synthétiques quand un texte correspond.
- Ils sont fusionnés avec les résultats standard et dédupliqués.

## Tests & Monitoring

**Q: Où sont les tests Jest ?**
- `backend/src/services/__tests__`. On y trouve des tests pour `cv-extraction`, `ai-extraction`, et `sanitizePayload`.
- Utilisez `npm run test` depuis `backend/`.

**Q: Comment surveiller les coûts AI ?**
- Les logs `cvExtractionLog` enregistrent tokens et coût estimé (basé sur la table PRICING dans `ai-extraction.service.ts`).
- Surveillez les champs `success` et `errorMessage` pour détecter les relances nécessaires.

