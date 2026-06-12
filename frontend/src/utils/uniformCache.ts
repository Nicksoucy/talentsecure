import type { QueryClient } from '@tanstack/react-query';

/**
 * Invalide TOUTES les clés React Query du module Uniformes d'un coup, pour que
 * les sous-modules (Catalogue, Inventaire, Remise, Retour, Lavage, Rapports +
 * fiche employé) restent cohérents après n'importe quelle mutation d'inventaire.
 *
 * À appeler dans le `onSuccess` de CHAQUE mutation uniforme. L'invalidation se
 * fait par préfixe : `['uniform-items']` couvre `['uniform-items', division, …]`.
 */
const UNIFORM_QUERY_KEYS = [
  'uniform-items',     // Catalogue + Remise (liste des articles)
  'uniform-stock',     // Inventaire (stock par variante)
  'uniform-movements', // Inventaire (historique des mouvements)
  'emp-issuances',     // Retour + fiche employé (remises actives)
  'wash-batches',      // Lavage
  'rep-stock',         // Rapports — stock
  'rep-overdue',       // Rapports — retards
  'rep-losses',        // Rapports — pertes
];

export function invalidateUniformCaches(qc: QueryClient) {
  for (const key of UNIFORM_QUERY_KEYS) {
    qc.invalidateQueries({ queryKey: [key] });
  }
}
