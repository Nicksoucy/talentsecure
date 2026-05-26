-- Ajout du champ "emplacement" sur les variantes d'uniforme (localisation physique
-- en magasin : ex. "B4", "A1-A2", "Étagère"). Migration MANUELLE additive.
ALTER TABLE "uniform_variants" ADD COLUMN "emplacement" TEXT;
