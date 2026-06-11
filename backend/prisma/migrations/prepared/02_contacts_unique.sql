-- ============================================================================
-- D3 (audit) — Empêcher au niveau BASE DE DONNÉES deux fiches ACTIVES avec le
-- même numéro de téléphone (candidats / prospects / employés). Aujourd'hui la
-- règle « une personne = une section » ne tient que par du code applicatif qui
-- peut se faire doubler (ex. 2 webhooks GHL simultanés → 2 prospects).
--
-- Approche : INDEX UNIQUE FONCTIONNEL sur le téléphone normalisé (10 derniers
-- chiffres), restreint aux fiches actives. Pas de nouvelle colonne, donc PAS de
-- changement de schema.prisma nécessaire (c'est une garde côté DB).
--
-- 🔴 CONDITION OBLIGATOIRE : il ne doit exister AUCUN doublon actif AVANT de
--    créer l'index, sinon la création ÉCHOUE. Lance d'abord les PRÉ-CHECKS,
--    résous les doublons (fusion / soft-delete), puis crée les index.
--
-- ⚠️ Effet de bord côté app : après ça, une tentative d'insertion en double
--    lèvera une erreur Prisma P2002 (au lieu d'un doublon silencieux). C'est le
--    but. Idéalement, faire ensuite catcher P2002 dans webhook/create pour
--    renvoyer un 409 propre plutôt qu'un 500 (changement de code, plus tard).
-- ============================================================================


-- ###########################################################################
-- ÉTAPE 1 — PRÉ-CHECKS (lecture seule). Chacune doit renvoyer 0 ligne.
--           Si une renvoie des lignes → ce sont les doublons à résoudre.
-- ###########################################################################

-- Prospects (non supprimés, non convertis) en double par téléphone :
-- SELECT RIGHT(REGEXP_REPLACE(phone,'\D','','g'),10) AS tel, COUNT(*), array_agg(id)
-- FROM prospect_candidates
-- WHERE "isDeleted"=false AND "isConverted"=false AND phone IS NOT NULL
-- GROUP BY 1 HAVING COUNT(*) > 1;

-- Candidats (non supprimés) en double par téléphone :
-- SELECT RIGHT(REGEXP_REPLACE(phone,'\D','','g'),10) AS tel, COUNT(*), array_agg(id)
-- FROM candidates
-- WHERE "isDeleted"=false AND phone IS NOT NULL
-- GROUP BY 1 HAVING COUNT(*) > 1;

-- Employés (non supprimés) en double par téléphone :
-- SELECT RIGHT(REGEXP_REPLACE(phone,'\D','','g'),10) AS tel, COUNT(*), array_agg(id)
-- FROM employees
-- WHERE "isDeleted"=false AND phone IS NOT NULL
-- GROUP BY 1 HAVING COUNT(*) > 1;


-- ###########################################################################
-- ÉTAPE 2 — CRÉATION DES INDEX (seulement une fois les PRÉ-CHECKS à 0 ligne)
-- ###########################################################################

CREATE UNIQUE INDEX IF NOT EXISTS prospect_phone_active_uniq
  ON prospect_candidates (RIGHT(REGEXP_REPLACE(phone,'\D','','g'),10))
  WHERE "isDeleted" = false AND "isConverted" = false AND phone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS candidate_phone_active_uniq
  ON candidates (RIGHT(REGEXP_REPLACE(phone,'\D','','g'),10))
  WHERE "isDeleted" = false AND phone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS employee_phone_active_uniq
  ON employees (RIGHT(REGEXP_REPLACE(phone,'\D','','g'),10))
  WHERE "isDeleted" = false AND phone IS NOT NULL;

-- NB : ces index sont propres à chaque table. L'unicité INTER-table (une même
-- personne ne doit pas être à la fois Candidat ET Prospect) reste gérée par le
-- code (candidateMatch / contact-move) — la DB ne peut pas l'exprimer seule.
