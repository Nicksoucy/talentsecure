-- Champ dénormalisé : somme des mois d'expérience d'un candidat, pour filtrer
-- par années d'expérience dans la recherche avancée (paramètre minExperience).
-- Rempli par le script `npm run backfill:experience-months` après cette
-- migration, puis maintenu à chaque écriture d'expériences
-- (voir backend/src/utils/experience.ts).
ALTER TABLE "candidates" ADD COLUMN "totalExperienceMonths" INTEGER NOT NULL DEFAULT 0;

-- Index note globale + expérience (intention du plan ; le champ yearsExperience
-- du plan n'existe pas, on indexe le total dénormalisé à la place).
CREATE INDEX "candidates_globalRating_totalExperienceMonths_idx" ON "candidates"("globalRating", "totalExperienceMonths");
